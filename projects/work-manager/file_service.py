import os
import subprocess
import shutil
import re
import threading
import hashlib
import unicodedata
import tempfile
import fcntl
import errno
import time
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime
import config
from project_path_policy import resolve_project_root, ProjectPathPolicyError
from config import TAB_TO_FOLDER, FOLDER_TO_TAB, STANDARD_SUBFOLDERS, AI_PLAN_ALLOWED_EXTENSIONS, AI_PLAN_MAX_FILE_BYTES, AI_PLAN_MAX_FILES, AI_PLAN_MAX_TOTAL_BYTES

_THREEMF_REPLACE_LOCK = threading.RLock()
PROJECT_BATCH_LOCK_TIMEOUT = 5.0
MAX_3MF_ENTRIES = 10000
MAX_3MF_ENTRY_UNCOMPRESSED = 512 * 1024 * 1024
MAX_3MF_TOTAL_UNCOMPRESSED = 2 * 1024 * 1024 * 1024
MAX_3MF_COMPRESSION_RATIO = 1000


class ProjectBatchLockTimeout(TimeoutError):
    """프로젝트 파일 batch lock을 제한 시간 안에 얻지 못한 경우."""


@contextmanager
def project_batch_lock(project_no, lock_root=None, timeout=PROJECT_BATCH_LOCK_TIMEOUT):
    """프로세스 간 3MF/upload batch lock. 사용자 프로젝트 폴더에는 만들지 않는다."""
    if not isinstance(project_no, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", project_no):
        raise ProjectFileAccessError("프로젝트 번호가 올바르지 않습니다.", 400)
    root = Path(lock_root or config.DATA_DIR) / "locks"
    root.mkdir(parents=True, exist_ok=True)
    lock_path = root / f"project_{project_no}.lock"
    handle = open(lock_path, "a+", encoding="utf-8")
    deadline = time.monotonic() + max(0.0, float(timeout))
    acquired = False
    try:
        while True:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
                break
            except OSError as exc:
                if exc.errno not in (errno.EACCES, errno.EAGAIN):
                    raise
                if time.monotonic() >= deadline:
                    raise ProjectBatchLockTimeout("project_batch_lock_timeout")
                time.sleep(0.05)
        yield
    finally:
        if acquired:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


class ThreeMFReplaceError(Exception):
    """교체 후 롤백/정리가 완전하지 않은 안전한 내부 오류 계약."""

    def __init__(self, message, *, rollback_failures=None, cleanup_failures=None, original_error=None):
        super().__init__(message)
        self.rollback_failures = list(rollback_failures or [])
        self.cleanup_failures = list(cleanup_failures or [])
        self.original_error = original_error
        self.user_message = message
        self.status_code = 500


def _safe_receipt_name(value):
    name = os.fspath(value)
    if not name or name in {".", ".."} or os.path.basename(name) != name or "\x00" in name:
        raise ValueError("invalid rollback receipt filename")
    if any(ord(char) < 32 for char in name):
        raise ValueError("invalid rollback receipt filename")
    return name


def _sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _copy_source_no_follow(source, destination):
    """Open the validated source without following a replacement symlink."""
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(str(source), os.O_RDONLY | nofollow)
    try:
        with os.fdopen(fd, "rb") as src, open(destination, "wb") as dst:
            shutil.copyfileobj(src, dst)
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        raise


class ProjectFileAccessError(Exception):
    """프로젝트 폴더 밖의 파일 접근 또는 파일 부재를 나타낸다."""

    def __init__(self, message, status_code=403):
        super().__init__(message)
        self.user_message = message
        self.status_code = status_code


def resolve_project_file(project_path, requested_path):
    """요청 경로를 프로젝트 루트 내부의 실제 파일로 정규화한다.

    프론트엔드의 기존 절대경로와 내부 상대경로를 모두 지원하지만,
    canonical path가 프로젝트 루트 밖이면 접근을 거부한다.
    """
    if not project_path:
        raise ProjectFileAccessError("프로젝트를 찾을 수 없습니다.", 404)

    try:
        project_root = resolve_project_root(project_path)
    except ProjectPathPolicyError as exc:
        raise ProjectFileAccessError(exc.user_message, exc.status_code)

    if not project_root.is_dir() or requested_path is None or not str(requested_path).strip():
        raise ProjectFileAccessError("파일을 찾을 수 없습니다.", 404)

    requested = Path(str(requested_path).strip()).expanduser()
    candidate = requested if requested.is_absolute() else project_root / requested
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError:
        raise ProjectFileAccessError("파일을 찾을 수 없습니다.", 404)
    except (OSError, RuntimeError):
        raise ProjectFileAccessError("파일에 접근할 수 없습니다.", 403)

    try:
        resolved.relative_to(project_root)
    except ValueError:
        raise ProjectFileAccessError("프로젝트 폴더 밖의 파일에는 접근할 수 없습니다.", 403)

    if not resolved.is_file():
        raise ProjectFileAccessError("파일을 찾을 수 없습니다.", 404)
    return str(resolved)

def format_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"

def get_file_category(ext):
    ext = ext.lower()
    if ext in [".stl", ".3mf", ".step", ".stp", ".obj", ".f3d"]:
        return "3d"
    elif ext in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]:
        return "image"
    elif ext in [".pdf", ".xlsx", ".xls", ".docx", ".doc", ".hwp", ".txt", ".md"]:
        return "document"
    elif ext in [".zip", ".7z", ".tar", ".gz", ".rar"]:
        return "archive"
    else:
        return "other"

def list_project_tabs_and_files(project_path):
    """
    프로젝트 폴더 내 6개 표준 하위 폴더의 파일 목록 반환
    """
    result = {}
    try:
        project_root = resolve_project_root(project_path)
    except ProjectPathPolicyError as exc:
        raise ProjectFileAccessError(exc.user_message, exc.status_code)

    for tab_key, folder_name in TAB_TO_FOLDER.items():
        folder_path = os.path.join(str(project_root), folder_name)
        if os.path.lexists(folder_path) and os.path.islink(folder_path):
            result[tab_key] = {"tab_key": tab_key, "folder_name": folder_name, "count": 0, "files": []}
            continue
        if not os.path.exists(folder_path):
            os.makedirs(folder_path, exist_ok=True)
        try:
            tab_root = Path(folder_path).resolve(strict=True)
            tab_root.relative_to(project_root)
        except (OSError, RuntimeError, ValueError):
            result[tab_key] = {"tab_key": tab_key, "folder_name": folder_name, "count": 0, "files": []}
            continue

        files = []
        try:
            for fname in sorted(os.listdir(folder_path)):
                if fname.startswith(".") or fname.lower().startswith("_backup") or fname.lower().startswith("backup"):
                    continue
                fpath = os.path.join(folder_path, fname)
                if not os.path.isfile(fpath):
                    continue
                if os.path.islink(fpath):
                    continue
                stat = os.stat(fpath)
                ext = os.path.splitext(fname)[1]
                files.append({
                    "name": fname,
                    "size": stat.st_size,
                    "formatted_size": format_size(stat.st_size),
                    "mtime": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                    "ext": ext,
                    "category": get_file_category(ext),
                    "relative_path": f"{folder_name}/{fname}",
                    "folder": folder_name,
                    "tab": tab_key
                })
        except Exception as e:
            print(f"Error listing files in {folder_path}: {e}")

        result[tab_key] = {
            "tab_key": tab_key,
            "folder_name": folder_name,
            "count": len(files),
            "files": files
        }

    return result

def open_in_finder(path):
    """macOS Finder에서 폴더 열기 또는 파일 선택"""
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external app services disabled")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Path does not exist: {path}")
    
    if os.path.isfile(path):
        subprocess.Popen(["open", "-R", path])
    else:
        subprocess.Popen(["open", path])
    return True

import zipfile
import uuid

def create_initial_3mf_file(project_path, p_no, client_name, job_name, material="", color="", quantity="1"):
    """
    03_슬라이싱_3MF 폴더에 프로젝트 명칭 기반의 초기 3MF Bambu Studio 프로젝트 파일 생성.
    사용자가 제공한 '샘플 빈 3MF.3mf'(베드에 3D 형상 모델 포함) 템플릿을 기반으로 복사/생성하여
    Bambu Studio에서 열었을 때 베드에 형상이 배치된 완전한 정식 프로젝트 파일로 인식됩니다.
    따라서 슬라이싱 작업 후 Cmd+S(저장)를 누르면 다른 이름으로 저장 팝업 없이
    해당 프로젝트 폴더(03_슬라이싱_3MF)로 즉시 덮어쓰기 저장됩니다.
    """
    try:
        project_path = str(resolve_project_root(project_path))
    except ProjectPathPolicyError as exc:
        raise ProjectFileAccessError(exc.user_message, exc.status_code) from exc
    slicing_dir = os.path.join(project_path, "03_슬라이싱_3MF")
    os.makedirs(slicing_dir, exist_ok=True)

    safe_job = re.sub(r'[^\w\-가-힣]', '_', job_name).strip('_') or "작업"
    safe_mat = re.sub(r'[^\w\-가-힣]', '_', material).strip('_') if material else "소재미정"
    safe_col = re.sub(r'[^\w\-가-힣]', '_', color).strip('_') if color else "색상미정"
    safe_qty = re.sub(r'[^\w\-가-힣]', '', str(quantity)) if quantity else "1"

    # 표준 권장 파일명: P01_제품명_소재_색상_Q수량_v01.3mf
    filename = f"P01_{safe_job}_{safe_mat}_{safe_col}_Q{safe_qty}_v01.3mf"
    file_path = os.path.join(slicing_dir, filename)

    # 이미 동일한 이름의 파일이 존재하면 덮어쓰지 않고 기존 파일 반환
    if os.path.exists(file_path):
        return filename, file_path

    # 1. 원본 템플릿 탐색 (data/templates/bambu_base_template.3mf 또는 ~/사업/대행/샘플 빈 3MF.3mf)
    template_paths = [
        os.path.join(os.path.dirname(__file__), "data", "templates", "bambu_base_template.3mf"),
    ]
    if not config.E2E_MODE:
        template_paths.append(os.path.expanduser("~/사업/대행/샘플 빈 3MF.3mf"))
    template_src = None
    for tp in template_paths:
        if os.path.exists(tp):
            template_src = tp
            break

    if template_src:
        # 템플릿 파일 복사
        shutil.copy2(template_src, file_path)
        
        # 템플릿 복사본 내 3D/3dmodel.model Title 메타데이터 업데이트 (선택적)
        try:
            temp_zip = file_path + ".tmp"
            with zipfile.ZipFile(file_path, 'r') as zin, zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    content = zin.read(item.filename)
                    if item.filename == '3D/3dmodel.model':
                        try:
                            xml_str = content.decode('utf-8')
                            xml_str = re.sub(r'<metadata name="Title">.*?</metadata>', f'<metadata name="Title">{p_no} {client_name} - {job_name}</metadata>', xml_str)
                            xml_str = re.sub(r'<metadata name="CreationDate">.*?</metadata>', f'<metadata name="CreationDate">{datetime.now().strftime("%Y-%m-%d")}</metadata>', xml_str)
                            content = xml_str.encode('utf-8')
                        except Exception:
                            pass
                    zout.writestr(item, content)
            os.replace(temp_zip, file_path)
        except Exception as e:
            print(f"Error customizing 3MF metadata: {e}")
            if os.path.exists(temp_zip):
                try: os.remove(temp_zip)
                except Exception: pass
    else:
        # Fallback XML generation
        content_types_xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n <Default Extension="png" ContentType="image/png"/>\n <Default Extension="gcode" ContentType="text/x.gcode"/>\n <Default Extension="json" ContentType="application/json"/>\n <Default Extension="config" ContentType="application/xml"/>\n</Types>'
        rels_xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>'
        model_xml = f'''<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n <metadata name="Application">BambuStudio-02.08.02.60</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n <metadata name="Title">{p_no} {client_name} - {job_name}</metadata>\n <metadata name="Designer">Kim Myeong-gyu Creative</metadata>\n <resources>\n </resources>\n <build p:UUID="{uuid.uuid4()}">\n </build>\n</model>'''
        with zipfile.ZipFile(file_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('[Content_Types].xml', content_types_xml)
            zf.writestr('_rels/.rels', rels_xml)
            zf.writestr('3D/3dmodel.model', model_xml)

    return filename, file_path

def get_or_create_project_3mf(project):
    """
    프로젝트의 03_슬라이싱_3MF 폴더에서 가장 최근에 수정/저장된 3MF 파일을 찾거나,
    3MF 파일이 없을 때만 초기 3MF 파일을 생성하여 반환.
    (사용자가 Bambu Studio에서 수정한 슬라이싱 작업 내용이 절대 덮어씌워지거나 초기화되지 않도록 철저히 보존)
    """
    project_path = project.get("project_path") or project.get("folder_path")
    try:
        project_path = str(resolve_project_root(project_path))
    except ProjectPathPolicyError as exc:
        raise FileNotFoundError("Project path is not available") from exc

    slicing_dir = os.path.join(project_path, "03_슬라이싱_3MF")
    os.makedirs(slicing_dir, exist_ok=True)

    # 1. 기존 3MF 파일 탐색 (_backup 폴더 제외하고 루트의 실제 파일만 대상)
    existing_3mfs = [
        f for f in os.listdir(slicing_dir)
        if f.lower().endswith(".3mf") and not f.startswith(".") and not f.lower().startswith("_backup") and os.path.isfile(os.path.join(slicing_dir, f))
    ]
    if existing_3mfs:
        target_file = max(existing_3mfs, key=lambda f: os.path.getmtime(os.path.join(slicing_dir, f)))
        fpath = os.path.join(slicing_dir, target_file)
        return target_file, fpath

    # 2. 3MF 파일이 전혀 없을 때만 초기 파일 신규 생성
    return create_initial_3mf_file(
        project_path,
        project.get("project_no", ""),
        project.get("client_name", ""),
        project.get("job_name", ""),
        project.get("material", ""),
        project.get("color", ""),
        project.get("quantity", "1")
    )

def open_3mf_in_bambu_studio(file_path):
    """Bambu Studio 또는 기본 앱으로 3MF 파일 실행"""
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external app services disabled")
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"3MF 파일을 찾을 수 없습니다: {file_path}")
    
    bambu_app = "/Applications/BambuStudio.app"
    if os.path.exists(bambu_app):
        subprocess.Popen(["open", "-a", "BambuStudio", file_path])
    else:
        subprocess.Popen(["open", file_path])
    return True

def open_with_default_app(file_path):
    """macOS 기본 애플리케이션으로 파일 실행 (3MF, STL, Excel, PDF 등)"""
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external app services disabled")
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    subprocess.Popen(["open", file_path])
    return True

def save_uploaded_file(project_path, tab_key, file_obj, filename=None):
    """지정된 탭 폴더에 파일 저장"""
    folder_name = _validate_project_tab_key(tab_key)
    target_dir = _resolve_tab_folder(project_path, tab_key)
    safe_filename = _validate_file_basename(filename or file_obj.filename)
    extension = Path(safe_filename).suffix.lower()
    if extension not in AI_PLAN_ALLOWED_EXTENSIONS:
        raise ProjectFileAccessError("허용되지 않은 파일 형식입니다.", 400)
    stem, suffix = Path(safe_filename).stem, Path(safe_filename).suffix
    fd, temp_path = tempfile.mkstemp(prefix=f".{stem}.", suffix=f"{suffix}.uploading", dir=str(target_dir))
    os.fchmod(fd, 0o600)
    try:
        with os.fdopen(fd, "wb") as destination:
            shutil.copyfileobj(file_obj.stream, destination, length=1024 * 1024)
            destination.flush()
            os.fsync(destination.fileno())
        if os.path.getsize(temp_path) > AI_PLAN_MAX_FILE_BYTES:
            raise ProjectFileAccessError("파일 크기 제한을 초과했습니다.", 400)
        version = 1
        while True:
            candidate = target_dir / (safe_filename if version == 1 else f"{stem}_v{version:02d}{suffix}")
            try:
                os.link(temp_path, candidate)
                break
            except FileExistsError:
                version += 1
                continue
            except OSError as exc:
                raise ProjectFileAccessError("파일을 저장할 수 없습니다.", 500) from exc
        dest_path = str(candidate)
        try:
            dir_fd = os.open(str(target_dir), os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            pass
    except Exception:
        try:
            if "dest_path" in locals() and os.path.lexists(dest_path):
                os.remove(dest_path)
        except OSError:
            pass
        raise
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
    size = os.path.getsize(dest_path)
    return {
        "filename": Path(dest_path).name,
        "relative_path": f"{folder_name}/{Path(dest_path).name}",
        "size": size,
        "formatted_size": format_size(size)
    }


def save_project_source_files(project_path, files):
    """신규 프로젝트 원본 첨부를 공통 allowlist/크기/version 정책으로 저장한다."""
    target_dir = _resolve_tab_folder(project_path, "received")
    if len(files or []) > AI_PLAN_MAX_FILES:
        raise ProjectFileAccessError("첨부 파일은 최대 20개까지 가능합니다.", 400)
    created = []
    total = 0
    try:
        for file_obj in files or []:
            if not file_obj.filename:
                continue
            safe_name = _validate_file_basename(file_obj.filename)
            if Path(safe_name).suffix.lower() not in AI_PLAN_ALLOWED_EXTENSIONS:
                raise ProjectFileAccessError("허용되지 않은 파일 형식입니다.", 400)
            saved = save_uploaded_file(project_path, "received", file_obj, safe_name)
            size = int(saved["size"])
            if total + size > AI_PLAN_MAX_TOTAL_BYTES:
                saved_path = str(target_dir / saved["filename"])
                try:
                    os.remove(saved_path)
                except OSError:
                    pass
                raise ProjectFileAccessError("첨부 파일 크기 제한을 초과했습니다.", 400)
            created.append(str(target_dir / saved["filename"]))
            total += size
    except Exception:
        for path in created:
            try:
                os.remove(path)
            except OSError:
                pass
        raise
    return [Path(path).name for path in created]


def _validate_project_tab_key(tab_key):
    if tab_key not in TAB_TO_FOLDER:
        raise ProjectFileAccessError("유효하지 않은 파일 탭입니다.", 400)
    return TAB_TO_FOLDER[tab_key]


def _validate_file_basename(filename):
    if not isinstance(filename, str):
        raise ProjectFileAccessError("유효하지 않은 파일명입니다.", 400)
    if filename != filename.strip() or filename.endswith((".", " ")):
        raise ProjectFileAccessError("유효하지 않은 파일명입니다.", 400)
    name = unicodedata.normalize("NFC", unicodedata.normalize("NFKC", filename))
    reserved = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}
    stem = name.rsplit(".", 1)[0].casefold()
    if (not name or name in {".", ".."} or "/" in name or "\\" in name or "\x00" in name
            or any(ord(char) < 32 or 0x7F <= ord(char) <= 0x9F for char in name)
            or name.endswith((".", " ")) or stem in reserved):
        raise ProjectFileAccessError("유효하지 않은 파일명입니다.", 400)
    if Path(name).name != name:
        raise ProjectFileAccessError("유효하지 않은 파일명입니다.", 400)
    return name


def normalize_upload_filename(filename):
    """Normalize a display-preserving upload basename and reject portable hazards."""
    return _validate_file_basename(filename)


def _resolve_tab_folder(project_path, tab_key):
    folder_name = _validate_project_tab_key(tab_key)
    try:
        project_root = resolve_project_root(project_path)
        tab_folder = (project_root / folder_name).resolve(strict=True)
    except ProjectPathPolicyError as exc:
        raise ProjectFileAccessError(exc.user_message, exc.status_code)
    except (OSError, RuntimeError, FileNotFoundError):
        raise ProjectFileAccessError("파일 탭을 찾을 수 없습니다.", 404)
    try:
        tab_folder.relative_to(project_root)
    except ValueError:
        raise ProjectFileAccessError("프로젝트 폴더 밖의 파일에는 접근할 수 없습니다.", 403)
    if not tab_folder.is_dir():
        raise ProjectFileAccessError("파일 탭을 찾을 수 없습니다.", 404)
    return tab_folder


def resolve_project_tab_file(project_path, tab_key, filename):
    """지정 프로젝트의 지정 탭 바로 아래에 있는 실제 파일만 반환한다."""
    tab_folder = _resolve_tab_folder(project_path, tab_key)
    name = _validate_file_basename(filename)
    candidate = tab_folder / name
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError:
        raise ProjectFileAccessError("파일을 찾을 수 없습니다.", 404)
    except (OSError, RuntimeError):
        raise ProjectFileAccessError("파일에 접근할 수 없습니다.", 403)
    try:
        resolved.relative_to(tab_folder)
    except ValueError:
        raise ProjectFileAccessError("프로젝트 폴더 밖의 파일에는 접근할 수 없습니다.", 403)
    if not resolved.is_file():
        raise ProjectFileAccessError("파일을 찾을 수 없습니다.", 404)
    return str(resolved)


def _new_project_tab_file(project_path, tab_key, filename):
    """새 파일명 경로를 검증하며 기존 외부 symlink를 거부한다."""
    tab_folder = _resolve_tab_folder(project_path, tab_key)
    name = _validate_file_basename(filename)
    candidate = tab_folder / name
    if os.path.lexists(candidate):
        try:
            resolved = candidate.resolve(strict=True)
            resolved.relative_to(tab_folder)
        except ValueError:
            raise ProjectFileAccessError("프로젝트 폴더 밖의 파일에는 접근할 수 없습니다.", 403)
        except (OSError, RuntimeError, FileNotFoundError):
            raise ProjectFileAccessError("파일에 접근할 수 없습니다.", 403)
    return str(candidate)


def rename_project_file(project_path, tab_key, old_name, new_name):
    """파일명 변경"""
    old_path = resolve_project_tab_file(project_path, tab_key, old_name)
    new_path = _new_project_tab_file(project_path, tab_key, new_name)
    if os.path.lexists(new_path):
        raise ProjectFileAccessError("같은 이름의 파일이 이미 존재합니다.", 409)
    os.rename(old_path, new_path)
    return _validate_file_basename(new_name)

def bump_file_version(project_path, tab_key, filename):
    """
    버전 자동 증가 (예: sample_v01.stl -> sample_v02.stl)
    """
    src_path = resolve_project_tab_file(project_path, tab_key, filename)
    safe_filename = _validate_file_basename(filename)
    name, ext = os.path.splitext(safe_filename)
    
    # Check if name ends with _vNN or vNN
    m = re.search(r"(_?v)(\d+)$", name, re.IGNORECASE)
    if m:
        prefix = name[:m.start()]
        v_tag = m.group(1)
        curr_ver = int(m.group(2))
        next_ver = curr_ver + 1
        new_name = f"{prefix}{v_tag}{next_ver:02d}{ext}"
    else:
        new_name = f"{name}_v02{ext}"
        
    dest_path = _new_project_tab_file(project_path, tab_key, new_name)
    shutil.copy2(src_path, dest_path)
    return new_name

def delete_project_file(project_path, tab_key, filename):
    """파일 삭제"""
    file_path = resolve_project_tab_file(project_path, tab_key, filename)
    os.remove(file_path)
    return True

def generate_standard_3mf_filename(project_or_data, version=1):
    """
    김명규크리에이티브 3MF 표준 파일명 생성 규칙:
    P01_제품명_소재_색상_Q수량_v01.3mf
    """
    job_name = project_or_data.get("job_name") or "작업"
    material = project_or_data.get("material") or ""
    color = project_or_data.get("color") or ""
    quantity = project_or_data.get("quantity") or "1"

    safe_job = re.sub(r'[^\w\-가-힣]', '_', job_name).strip('_') or "작업"
    safe_mat = re.sub(r'[^\w\-가-힣]', '_', material).strip('_') if material else "소재미정"
    safe_col = re.sub(r'[^\w\-가-힣]', '_', color).strip('_') if color else "색상미정"
    safe_qty = re.sub(r'[^\w\-가-힣]', '', str(quantity)) if quantity else "1"

    return f"P01_{safe_job}_{safe_mat}_{safe_col}_Q{safe_qty}_v{version:02d}.3mf"

def _replace_or_save_project_3mf_unlocked(project_path, source_file_path, original_filename=None, project_data=None, include_rollback_receipt=False, created_by_request=False):
    """
    프로젝트의 03_슬라이싱_3MF 폴더에 첨부된 3MF 파일을 표준 명명 규칙(P01_제품명_소재_색상_Q수량_vNN.3mf)에 맞춰 교체/저장.
    기존 3MF 파일이 존재하면 _backup/ 폴더를 생성하여 기존 파일을 이동/보관하고,
    새 파일에 다음 버전 번호(_v02.3mf 등)를 부여하여 표준 파일명으로 단일 배치.
    (웹 UI에는 _backup 폴더 및 이전 파일이 노출되지 않음)
    원본 수신 파일은 01_수신원본에도 보존.
    """
    if project_path and Path(project_path).is_symlink():
        raise FileNotFoundError("프로젝트 경로를 찾을 수 없습니다.")
    try:
        project = resolve_project_root(project_path)
    except ProjectPathPolicyError as exc:
        raise ProjectFileAccessError(exc.user_message, exc.status_code) from exc
    source = Path(source_file_path)
    if not project_path or not project.exists() or project.is_symlink() or not project.is_dir():
        raise FileNotFoundError("프로젝트 경로를 찾을 수 없습니다.")
    if not source.exists() or source.is_symlink() or not source.is_file() or source.suffix.lower() != ".3mf":
        raise ValueError("유효한 3MF 원본 파일이 필요합니다.")
    try:
        if source.stat().st_size > AI_PLAN_MAX_FILE_BYTES:
            raise ProjectFileAccessError("파일 크기 제한을 초과했습니다.", 400)
    except OSError as exc:
        raise ProjectFileAccessError("원본 파일을 확인할 수 없습니다.", 400) from exc
    def validate_container(path):
        with zipfile.ZipFile(path, "r") as archive:
            infos = archive.infolist()
            if len(infos) > MAX_3MF_ENTRIES:
                raise ValueError("3MF 컨테이너의 파일 수가 허용 한도를 초과했습니다.")
            total_size = 0
            for info in infos:
                size = int(info.file_size or 0)
                compressed = int(info.compress_size or 0)
                if size > MAX_3MF_ENTRY_UNCOMPRESSED:
                    raise ValueError("3MF 컨테이너의 개별 파일 크기가 허용 한도를 초과했습니다.")
                total_size += size
                if total_size > MAX_3MF_TOTAL_UNCOMPRESSED:
                    raise ValueError("3MF 컨테이너의 전체 압축 해제 크기가 허용 한도를 초과했습니다.")
                if size and (compressed == 0 or size / compressed > MAX_3MF_COMPRESSION_RATIO):
                    raise ValueError("3MF 컨테이너의 압축비가 허용 한도를 초과했습니다.")
            if archive.testzip() is not None:
                raise ValueError("3MF 컨테이너를 읽을 수 없습니다.")
            entries = {name.lower().lstrip("/") for name in archive.namelist()}
            if "3d/3dmodel.model" not in entries:
                raise ValueError("3MF 모델 엔트리가 없습니다.")
    try:
        validate_container(source)
    except (OSError, zipfile.BadZipFile) as exc:
        raise ValueError("유효한 3MF 컨테이너가 아닙니다.") from exc

    slicing = project / "03_슬라이싱_3MF"
    if slicing.exists() and slicing.is_symlink():
        raise ValueError("슬라이싱 폴더 심볼릭 링크는 사용할 수 없습니다.")
    slicing.mkdir(parents=True, exist_ok=True)
    if slicing.is_symlink() or not slicing.is_dir():
        raise ValueError("슬라이싱 폴더가 유효하지 않습니다.")
    try:
        slicing.resolve(strict=True).relative_to(project.resolve(strict=True))
    except ValueError as exc:
        raise ValueError("슬라이싱 폴더가 프로젝트 밖을 가리킵니다.") from exc
    backup = slicing / "_backup"
    if backup.exists() and backup.is_symlink():
        raise ValueError("백업 폴더 심볼릭 링크는 사용할 수 없습니다.")
    if backup.exists() and not backup.is_dir():
        raise ValueError("백업 경로가 폴더가 아닙니다.")
    if backup.exists():
        try:
            backup.resolve(strict=True).relative_to(slicing.resolve(strict=True))
        except ValueError as exc:
            raise ValueError("백업 폴더가 프로젝트 밖을 가리킵니다.") from exc
    root_entries = list(slicing.iterdir())
    if any(p.is_symlink() and p.suffix.lower() == ".3mf" for p in root_entries):
        raise ValueError("슬라이싱 폴더의 3MF 심볼릭 링크는 사용할 수 없습니다.")
    root_files = [p for p in root_entries if p.is_file() and not p.is_symlink() and p.suffix.lower() == ".3mf" and not p.name.startswith(".")]
    if backup.exists() and not backup.is_dir():
        raise ValueError("백업 경로가 폴더가 아닙니다.")
    backup_entries = list(backup.iterdir()) if backup.exists() else []
    if any(p.is_symlink() and p.suffix.lower() == ".3mf" for p in backup_entries):
        raise ValueError("백업 폴더의 3MF 심볼릭 링크는 사용할 수 없습니다.")
    backup_files_existing = [p for p in backup_entries if p.is_file() and not p.is_symlink() and p.suffix.lower() == ".3mf"]
    all_files = root_files + backup_files_existing
    max_ver = 0
    base_prefix = None
    for item in all_files:
        match = re.search(r"(.*?_v)(\d+)", item.name, re.IGNORECASE)
        if match and int(match.group(2)) > max_ver:
            max_ver = int(match.group(2))
            base_prefix = match.group(1)
    next_ver = max_ver + 1 if max_ver else 1
    if base_prefix:
        target_filename = f"{base_prefix}{next_ver:02d}.3mf"
    elif project_data:
        target_filename = generate_standard_3mf_filename(project_data, version=next_ver)
    else:
        target_filename = f"P01_작업_v{next_ver:02d}.3mf"
    target = slicing / target_filename
    temp = slicing / f".{target_filename}.{uuid.uuid4().hex}.tmp"
    moved = []
    rollback_failures = []
    cleanup_failures = []
    backup_files = []
    warnings = []
    try:
        _copy_source_no_follow(source, temp)
        validate_container(temp)
        if root_files:
            backup.mkdir(exist_ok=True)
            if backup.is_symlink() or not backup.is_dir():
                raise ValueError("백업 경로가 폴더가 아닙니다.")
            backup.resolve(strict=True).relative_to(slicing.resolve(strict=True))
        for old in root_files:
            name_no_ext, ext = old.stem, old.suffix
            backup_name = f"{name_no_ext}_backup_{datetime.now().strftime('%y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
            dest = backup / backup_name
            os.replace(old, dest)
            moved.append((dest, old))
            backup_files.append(backup_name)
        os.replace(temp, target)
    except Exception as original_error:
        for dest, old in reversed(moved):
            try:
                os.replace(dest, old)
            except OSError:
                rollback_failures.append(old.name)
        if temp.exists():
            try:
                temp.unlink()
            except OSError:
                cleanup_failures.append(temp.name)
        if rollback_failures or cleanup_failures:
            raise ThreeMFReplaceError(
                "3MF 교체 롤백 또는 임시 파일 정리가 완료되지 않았습니다.",
                rollback_failures=rollback_failures,
                cleanup_failures=cleanup_failures,
                original_error=original_error,
            ) from original_error
        raise

    raw_saved = None
    raw_created = False
    raw_digest = None
    safe_name = None
    if original_filename:
        raw_dir = project / "01_수신원본"
        try:
            raw_value = str(original_filename)
            if "\x00" in raw_value:
                raise ValueError("invalid original filename")
            raw_dir.mkdir(exist_ok=True)
            if raw_dir.is_symlink() or not raw_dir.is_dir() or raw_dir.resolve(strict=True).parent != project.resolve(strict=True):
                raise ValueError("raw directory is not contained by project")
            safe_name = _validate_file_basename(os.path.basename(raw_value))
            raw_target = raw_dir / safe_name
            if os.path.lexists(raw_target):
                stem, suffix = raw_target.stem, raw_target.suffix
                version = 2
                while os.path.lexists(raw_target):
                    raw_target = raw_dir / f"{stem}_v{version:02d}{suffix}"
                    version += 1
            raw_temp = raw_dir / f".{raw_target.name}.{uuid.uuid4().hex}.uploading"
            _copy_source_no_follow(source, raw_temp)
            with open(raw_temp, "rb") as staged_raw:
                os.fsync(staged_raw.fileno())
            try:
                os.link(raw_temp, raw_target)
            except FileExistsError:
                raise ValueError("raw destination collision")
            finally:
                try:
                    raw_temp.unlink()
                except OSError:
                    pass
            raw_saved = raw_target.name
            raw_created = True
            raw_digest = _sha256_file(raw_target)
        except Exception:
            if 'raw_temp' in locals():
                try:
                    raw_temp.unlink()
                except OSError:
                    pass
            if 'raw_target' in locals() and raw_target.exists() and not raw_saved:
                try:
                    raw_target.unlink()
                except OSError:
                    pass
            warnings.append("수신 원본 보존에 실패했습니다.")
    result = {
        "success": True, "filename": target_filename,
        "backup_dir": "_backup", "backup_files": backup_files,
        "folder": "03_슬라이싱_3MF",
        "original_uploaded_name": safe_name or "",
        "raw_saved": raw_saved, "warnings": warnings, "rollback": False,
    }
    if include_rollback_receipt:
        target_stat = target.stat()
        result["_rollback_receipt"] = {
            "version": 1,
            "nonce": uuid.uuid4().hex,
            "target_filename": _safe_receipt_name(target_filename),
            "backup_files": {
                _safe_receipt_name(backup_name): _safe_receipt_name(old.name)
                for backup_name, (_, old) in zip(backup_files, moved)
            },
            "raw_saved": _safe_receipt_name(raw_saved) if raw_saved else None,
            "raw_created": raw_created,
            "raw_sha256": raw_digest,
            "raw_retained": True,
            "target_existed": False,
            "created_by_request": bool(created_by_request),
            "target_identity": {
                "path": f"03_슬라이싱_3MF/{target_filename}",
                "inode": int(target_stat.st_ino), "size": int(target_stat.st_size),
                "sha256": _sha256_file(target),
            },
            "raw_identity": ({
                "path": f"01_수신원본/{raw_saved}",
                "inode": int((project / "01_수신원본" / raw_saved).stat().st_ino),
                "size": int((project / "01_수신원본" / raw_saved).stat().st_size),
                "sha256": raw_digest,
            } if raw_saved and raw_created else None),
            "backup_sha256": {
                _safe_receipt_name(backup_name): _sha256_file(old_path)
                for backup_name, (old_path, _) in zip(backup_files, moved)
            },
        }
    return result


def replace_or_save_project_3mf(project_path, source_file_path, original_filename=None, project_data=None, include_rollback_receipt=False, created_by_request=False):
    with _THREEMF_REPLACE_LOCK:
        return _replace_or_save_project_3mf_unlocked(project_path, source_file_path, original_filename, project_data, include_rollback_receipt, created_by_request)


def rollback_project_3mf_replacement(project_path, receipt):
    """Restore a replacement, deleting only identity-verified request artifacts."""
    with _THREEMF_REPLACE_LOCK:
        if not isinstance(receipt, dict) or receipt.get("version") != 1:
            raise ThreeMFReplaceError("3MF 복구 영수증이 유효하지 않습니다.")
        try:
            project = resolve_project_root(project_path)
        except ProjectPathPolicyError as exc:
            raise ThreeMFReplaceError(exc.user_message) from exc
        if not project.is_dir() or project.is_symlink():
            raise ThreeMFReplaceError("프로젝트 경로가 안전하지 않습니다.")
        slicing = project / "03_슬라이싱_3MF"
        backup = slicing / "_backup"
        try:
            slicing.resolve(strict=True).relative_to(project.resolve(strict=True))
            if backup.exists():
                backup.resolve(strict=True).relative_to(slicing.resolve(strict=True))
            elif not receipt.get("created_by_request") or receipt.get("backup_files"):
                raise FileNotFoundError(str(backup))
        except (FileNotFoundError, ValueError) as exc:
            raise ThreeMFReplaceError("3MF 복구 경로가 안전하지 않습니다.") from exc
        created_by_request = bool(receipt.get("created_by_request"))
        try:
            target_name = _safe_receipt_name(receipt.get("target_filename"))
            mapping = receipt.get("backup_files")
            if not isinstance(mapping, dict) or (not mapping and not created_by_request):
                raise ValueError("missing mapping")
            for backup_name, old_name in mapping.items():
                _safe_receipt_name(backup_name)
                _safe_receipt_name(old_name)
        except (TypeError, ValueError) as exc:
            raise ThreeMFReplaceError("3MF 복구 정보가 유효하지 않습니다.") from exc
        target = slicing / target_name
        def verify_identity(identity, relative_root):
            if not isinstance(identity, dict):
                raise ThreeMFReplaceError("rollback_identity_mismatch", cleanup_failures=["rollback_identity_mismatch"])
            relative = identity.get("path")
            if not isinstance(relative, str) or relative.startswith(("/", "\\")) or ".." in Path(relative).parts:
                raise ThreeMFReplaceError("rollback_identity_mismatch", cleanup_failures=["rollback_identity_mismatch"])
            candidate = project / Path(relative)
            try:
                candidate.resolve(strict=True).relative_to(relative_root.resolve(strict=True))
            except (FileNotFoundError, ValueError, OSError, RuntimeError) as exc:
                raise ThreeMFReplaceError("rollback_identity_mismatch", cleanup_failures=["rollback_identity_mismatch"]) from exc
            if candidate.is_symlink() or not candidate.is_file():
                raise ThreeMFReplaceError("rollback_identity_mismatch", cleanup_failures=["rollback_identity_mismatch"])
            stat = candidate.stat()
            if (int(identity.get("inode", -1)) != int(stat.st_ino)
                    or int(identity.get("size", -1)) != int(stat.st_size)
                    or identity.get("sha256") != _sha256_file(candidate)):
                raise ThreeMFReplaceError("rollback_identity_mismatch", cleanup_failures=["rollback_identity_mismatch"])
            return candidate

        if created_by_request:
            if receipt.get("target_existed", True) is not False:
                raise ThreeMFReplaceError("rollback_identity_mismatch", cleanup_failures=["rollback_identity_mismatch"])
            target = verify_identity(receipt.get("target_identity"), project)
            try:
                target.unlink()
            except OSError as exc:
                raise ThreeMFReplaceError("rollback_cleanup_failed", cleanup_failures=["rollback_cleanup_failed"]) from exc
            raw_identity = receipt.get("raw_identity")
            deleted = [target_name]
            if raw_identity:
                raw = verify_identity(raw_identity, project)
                try:
                    raw.unlink()
                except OSError as exc:
                    raise ThreeMFReplaceError("rollback_cleanup_failed", cleanup_failures=["rollback_cleanup_failed"]) from exc
                deleted.append(str(raw_identity["path"]))
        else:
            if not target.is_file() or target.is_symlink():
                raise ThreeMFReplaceError("교체된 3MF 파일을 확인할 수 없습니다.")
        backup.mkdir(exist_ok=True)
        if backup.is_symlink() or not backup.is_dir():
            raise ThreeMFReplaceError("백업 경로가 안전하지 않습니다.")
        if created_by_request:
            restored = []
            backup_hashes = receipt.get("backup_sha256") or {}
            for backup_name, old_name in mapping.items():
                source = backup / backup_name
                if source.is_symlink() or not source.is_file() or backup_hashes.get(backup_name) != _sha256_file(source):
                    raise ThreeMFReplaceError("rollback_identity_mismatch", cleanup_failures=["rollback_identity_mismatch"])
                destination = slicing / old_name
                os.replace(source, destination)
                restored.append(old_name)
            return {"success": True, "restored": restored, "deleted": deleted, "recovery_backup": None}

        recovery_name = f"rolled_back_{uuid.uuid4().hex}.3mf"
        recovery = backup / recovery_name
        try:
            os.replace(target, recovery)
            for backup_name, old_name in mapping.items():
                source = backup / backup_name
                if not source.is_file() or source.is_symlink():
                    raise ThreeMFReplaceError("백업 파일을 확인할 수 없습니다.")
                destination = slicing / old_name
                temp = slicing / f".{old_name}.{uuid.uuid4().hex}.tmp"
                shutil.copy2(source, temp)
                os.replace(temp, destination)
            return {"success": True, "restored": list(mapping.values()), "recovery_backup": recovery_name}
        except ThreeMFReplaceError:
            raise
        except Exception as exc:
            raise ThreeMFReplaceError("3MF 복구가 완료되지 않았습니다.", original_error=exc) from exc
