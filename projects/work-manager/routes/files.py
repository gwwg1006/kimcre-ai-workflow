import mimetypes
import os
import tempfile

from flask import Blueprint, jsonify, request, send_file
from werkzeug.datastructures import FileStorage

import config
from config import DATA_DIR, TAB_TO_FOLDER
from project_path_policy import resolve_project_root, ProjectPathPolicyError
from repositories.projects import get_project_by_no
from db import get_db_connection
from project_service import update_project_in_db
from file_service import (
    ProjectFileAccessError,
    ProjectBatchLockTimeout,
    ThreeMFReplaceError,
    bump_file_version,
    delete_project_file,
    format_size,
    get_or_create_project_3mf,
    list_project_tabs_and_files,
    open_3mf_in_bambu_studio,
    open_in_finder,
    open_with_default_app,
    rename_project_file,
    replace_or_save_project_3mf,
    rollback_project_3mf_replacement,
    project_batch_lock,
    resolve_project_file,
    resolve_project_tab_file,
    save_uploaded_file,
    normalize_upload_filename,
    _sha256_file,
)


files_bp = Blueprint("files", __name__)


def _file_identifiers(data):
    """Return safe tab/name identifiers; legacy relative paths only."""
    tab_key = data.get("tab_key")
    filename = data.get("filename")
    if tab_key and filename:
        return tab_key, filename
    legacy = data.get("file_path") or data.get("path")
    if not isinstance(legacy, str):
        raise ProjectFileAccessError("파일 식별자가 안전하지 않습니다.", 400)
    if legacy.startswith(("/", "\\")) or "\\" in legacy or legacy.startswith("../") or "/../" in legacy:
        raise ProjectFileAccessError("프로젝트 폴더 밖의 파일에는 접근할 수 없습니다.", 403)
    parts = legacy.split("/")
    if len(parts) == 1:
        return "received", parts[0]
    if len(parts) != 2:
        raise ProjectFileAccessError("파일 식별자가 안전하지 않습니다.", 400)
    folder, filename = parts
    tab_key = next((key for key, value in TAB_TO_FOLDER.items() if value == folder), None)
    if not tab_key:
        raise ProjectFileAccessError("유효하지 않은 파일 탭입니다.", 400)
    return tab_key, filename


@files_bp.route("/api/projects/<project_no>/open-folder", methods=["POST"])
def api_open_project_folder(project_no):
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 앱 열기를 사용할 수 없습니다."}), 503
    try:
        project = get_project_by_no(project_no)
        if not project or not project.get("project_path"):
            return jsonify({"success": False, "error": "프로젝트 경로를 찾을 수 없습니다."}), 404
        open_in_finder(str(resolve_project_root(project["project_path"])))
        return jsonify({"success": True, "message": "Finder에서 폴더를 열었습니다."})
    except ProjectPathPolicyError as exc:
        return jsonify({"success": False, "error": exc.user_message}), exc.status_code
    except Exception:
        return jsonify({"success": False, "error": "프로젝트 폴더를 열 수 없습니다."}), 500


@files_bp.route("/api/projects/<project_no>/open-3mf", methods=["POST"])
def api_open_project_3mf(project_no):
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 앱 열기를 사용할 수 없습니다."}), 503
    try:
        project = get_project_by_no(project_no)
        if not project or not project.get("project_path"):
            return jsonify({"success": False, "error": "프로젝트 경로를 찾을 수 없습니다."}), 404
        project["project_path"] = str(resolve_project_root(project["project_path"]))
        filename, file_path = get_or_create_project_3mf(project)
        open_3mf_in_bambu_studio(file_path)
        return jsonify({
            "success": True,
            "filename": filename,
            "message": f"Bambu Studio에서 3MF 파일({filename})을 열었습니다.",
        })
    except ProjectPathPolicyError as exc:
        return jsonify({"success": False, "error": exc.user_message}), exc.status_code
    except Exception:
        return jsonify({"success": False, "error": "3MF 파일을 열 수 없습니다."}), 500


@files_bp.route("/api/projects/<project_no>/files", methods=["GET"])
def api_get_project_files(project_no):
    project = get_project_by_no(project_no)
    if not project or not project.get("project_path"):
        return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404
    try:
        tabs = list_project_tabs_and_files(project["project_path"])
        return jsonify({"success": True, "data": tabs})
    except ProjectFileAccessError as exc:
        return jsonify({"success": False, "error": exc.user_message}), exc.status_code


@files_bp.route("/api/projects/<project_no>/files/upload", methods=["POST"])
def api_upload_file(project_no):
    receipts = []
    created_paths = []
    db_previous = []
    cleanup_errors = []
    batch_lock = None
    projection_snapshot = None
    sync_job_ids_before = set()

    def rollback_batch(project_dir):
        rollback_ok = True
        for receipt in reversed(receipts):
            try:
                rollback_project_3mf_replacement(project_dir, receipt)
            except Exception:
                rollback_ok = False
                cleanup_errors.append("3mf_rollback_failed")
        if rollback_ok:
            for receipt in receipts:
                for backup_name, expected_sha in (receipt.get("backup_sha256") or {}).items():
                    backup_path = os.path.join(project_dir, "03_슬라이싱_3MF", "_backup", backup_name)
                    try:
                        if os.path.isfile(backup_path) and not os.path.islink(backup_path):
                            if _sha256_file(backup_path) == expected_sha:
                                os.remove(backup_path)
                            else:
                                cleanup_errors.append("backup_identity_mismatch")
                    except OSError:
                        cleanup_errors.append("backup_cleanup_failed")
        if db_previous:
            try:
                update_project_in_db(project_no, {"slicing_file": db_previous[0]})
            except Exception:
                cleanup_errors.append("database_rollback_failed")
        for path in reversed(created_paths):
            try:
                if os.path.lexists(path):
                    os.remove(path)
            except OSError:
                cleanup_errors.append("file_cleanup_failed")
        if project_dir and projection_snapshot:
            projection_path = os.path.join(project_dir, "00_작업정보", "작업정보.md")
            try:
                existed, content, mode = projection_snapshot
                if existed:
                    temp_path = f"{projection_path}.rollback.tmp"
                    with open(temp_path, "wb") as handle:
                        handle.write(content)
                        handle.flush()
                        os.fsync(handle.fileno())
                    os.chmod(temp_path, mode)
                    os.replace(temp_path, projection_path)
                elif os.path.isfile(projection_path) and not os.path.islink(projection_path):
                    os.remove(projection_path)
            except OSError:
                cleanup_errors.append("projection_restore_failed")
        conn = None
        try:
            conn = get_db_connection()
            rows = conn.execute("SELECT id FROM sync_jobs WHERE project_no=?", (project_no,)).fetchall()
            for row in rows:
                if row[0] not in sync_job_ids_before:
                    conn.execute("DELETE FROM sync_jobs WHERE id=?", (row[0],))
            conn.commit()
        except Exception:
            if conn is not None:
                try:
                    conn.rollback()
                except Exception:
                    pass
            cleanup_errors.append("sync_job_cleanup_failed")
        finally:
            if conn is not None:
                conn.close()

    try:
        project = get_project_by_no(project_no)
        proj_dir = project.get("folder_path") or project.get("project_path") if project else None
        if not project or not proj_dir:
            return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404
        proj_dir = str(resolve_project_root(proj_dir))
        lock_context = project_batch_lock(project_no, lock_root=DATA_DIR)
        lock_context.__enter__()
        batch_lock = lock_context
        projection_path = os.path.join(proj_dir, "00_작업정보", "작업정보.md")
        if os.path.isfile(projection_path) and not os.path.islink(projection_path):
            with open(projection_path, "rb") as handle:
                projection_snapshot = (True, handle.read(), os.stat(projection_path).st_mode & 0o777)
        else:
            projection_snapshot = (False, b"", None)
        db_conn = None
        try:
            db_conn = get_db_connection()
            sync_job_ids_before = {row[0] for row in db_conn.execute(
                "SELECT id FROM sync_jobs WHERE project_no=?", (project_no,)
            ).fetchall()}
        finally:
            if db_conn is not None:
                db_conn.close()

        tab_key = request.form.get("tab_key", "received")
        uploaded_files = request.files.getlist("files")
        if len(uploaded_files) > config.AI_PLAN_MAX_FILES:
            return jsonify({"success": False, "error": "첨부 파일은 최대 20개까지 가능합니다."}), 400
        saved_list = []
        total_size = 0
        replaced_3mf_names = []
        temp_upload_dir = os.path.join(DATA_DIR, "temp_uploads")
        os.makedirs(temp_upload_dir, exist_ok=True)
        staged = []
        try:
            for file_obj in uploaded_files:
                if not file_obj.filename:
                    continue
                original_name = normalize_upload_filename(os.path.basename(file_obj.filename))
                suffix = os.path.splitext(original_name)[1].lower()
                if suffix not in config.AI_PLAN_ALLOWED_EXTENSIONS:
                    raise ProjectFileAccessError("허용되지 않은 파일 형식입니다.", 400)
                fd, temp_path = tempfile.mkstemp(prefix="upload_", suffix=suffix, dir=temp_upload_dir)
                os.close(fd)
                with open(temp_path, "wb") as destination:
                    import shutil
                    shutil.copyfileobj(file_obj.stream, destination, length=1024 * 1024)
                    destination.flush()
                    os.fsync(destination.fileno())
                size = os.path.getsize(temp_path)
                staged.append((original_name, temp_path, size))
                total_size += size
                if size > config.AI_PLAN_MAX_FILE_BYTES or total_size > config.AI_PLAN_MAX_TOTAL_BYTES:
                    raise ProjectFileAccessError("첨부 파일 크기 제한을 초과했습니다.", 400)

            # Stage/measure every input before any project file is mutated.
            for original_name, temp_path, size in staged:
                if tab_key == "slicing" and original_name.lower().endswith(".3mf"):
                    result = replace_or_save_project_3mf(
                        proj_dir, temp_path, original_name, project_data=project,
                        include_rollback_receipt=True, created_by_request=True,
                    )
                    if result.get("filename"):
                        if result.get("_rollback_receipt"):
                            receipts.append(result["_rollback_receipt"])
                        replaced_3mf_names.append(result["filename"])
                    internal_path = result.get("path") or os.path.join(proj_dir, "03_슬라이싱_3MF", result["filename"])
                    stat = os.stat(internal_path) if internal_path else None
                    saved_list.append({"name": result["filename"], "filename": result["filename"],
                                       "size": stat.st_size if stat else 0,
                                       "formatted_size": format_size(stat.st_size) if stat else "0 B",
                                       "folder": "03_슬라이싱_3MF", "tab": "slicing"})
                else:
                    with open(temp_path, "rb") as source:
                        saved = save_uploaded_file(proj_dir, tab_key, FileStorage(stream=source, filename=original_name))
                    created_paths.append(os.path.join(proj_dir, saved["relative_path"]))
                    saved_list.append(saved)
            if replaced_3mf_names:
                db_previous.append(project.get("slicing_file") or "")
                update_project_in_db(project_no, {"slicing_file": replaced_3mf_names[-1]})
        finally:
            for _, temp_path, _ in staged:
                try:
                    os.remove(temp_path)
                except OSError:
                    cleanup_errors.append("staging_cleanup_failed")

        message = f"{len(saved_list)}개 파일이 업로드되었습니다."
        if replaced_3mf_names:
            message = f"슬라이싱 3MF 파일이 표준 명칭('{replaced_3mf_names[0]}')으로 교체 및 최신 버전으로 적용되었습니다."
        payload = {"success": True, "data": saved_list, "message": message}
        if cleanup_errors:
            payload["cleanup_errors"] = cleanup_errors
        return jsonify(payload)
    except ProjectPathPolicyError as exc:
        rollback_batch(proj_dir if 'proj_dir' in locals() else None)
        payload = {"success": False, "error": exc.user_message}
        if cleanup_errors:
            payload["cleanup_errors"] = cleanup_errors
        return jsonify(payload), exc.status_code
    except ProjectFileAccessError as exc:
        rollback_batch(proj_dir if 'proj_dir' in locals() else None)
        payload = {"success": False, "error": exc.user_message}
        if cleanup_errors:
            payload["cleanup_errors"] = cleanup_errors
        return jsonify(payload), exc.status_code
    except ProjectBatchLockTimeout:
        return jsonify({"success": False, "error": "프로젝트 파일 작업이 사용 중입니다. 잠시 후 다시 시도해 주세요."}), 423
    except ThreeMFReplaceError:
        rollback_batch(proj_dir if 'proj_dir' in locals() else None)
        payload = {"success": False, "error": "3MF 교체 후 롤백 또는 임시 파일 정리가 완료되지 않았습니다."}
        if cleanup_errors:
            payload["cleanup_errors"] = cleanup_errors
        return jsonify(payload), 500
    except Exception:
        rollback_batch(proj_dir if 'proj_dir' in locals() else None)
        payload = {"success": False, "error": "파일을 업로드할 수 없습니다."}
        if cleanup_errors:
            payload["cleanup_errors"] = cleanup_errors
        return jsonify(payload), 500
    finally:
        if batch_lock is not None:
            batch_lock.__exit__(None, None, None)


@files_bp.route("/api/projects/<project_no>/files/open", methods=["POST"])
def api_open_file(project_no):
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 앱 열기를 사용할 수 없습니다."}), 503
    try:
        project = get_project_by_no(project_no)
        if not project or not project.get("project_path"):
            return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404
        data = request.get_json(silent=True) or {}
        tab_key, filename = _file_identifiers(data)
        file_path = resolve_project_tab_file(project["project_path"], tab_key, filename)
        if data.get("reveal", False):
            open_in_finder(file_path)
            message = "Finder에서 파일 위치를 열었습니다."
        else:
            open_with_default_app(file_path)
            message = "기본 프로그램으로 파일을 열었습니다."
        return jsonify({"success": True, "message": message})
    except ProjectFileAccessError as exc:
        return jsonify({"success": False, "error": exc.user_message}), exc.status_code
    except Exception:
        return jsonify({"success": False, "error": "파일을 열 수 없습니다."}), 500


@files_bp.route("/api/projects/<project_no>/files/rename", methods=["POST"])
def api_rename_file(project_no):
    try:
        project = get_project_by_no(project_no)
        if not project:
            return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404
        data = request.get_json(silent=True) or {}
        rename_project_file(project["project_path"], data.get("tab_key"), data.get("old_name"), data.get("new_name"))
        return jsonify({"success": True, "message": "파일명이 변경되었습니다."})
    except ProjectFileAccessError as exc:
        return jsonify({"success": False, "error": exc.user_message}), exc.status_code
    except Exception:
        return jsonify({"success": False, "error": "파일명을 변경할 수 없습니다."}), 400


@files_bp.route("/api/projects/<project_no>/files/version-bump", methods=["POST"])
def api_bump_file_version(project_no):
    try:
        project = get_project_by_no(project_no)
        if not project:
            return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404
        data = request.get_json(silent=True) or {}
        new_name = bump_file_version(project["project_path"], data.get("tab_key"), data.get("filename"))
        return jsonify({"success": True, "new_name": new_name, "message": f"새 버전 '{new_name}'이 생성되었습니다."})
    except ProjectFileAccessError as exc:
        return jsonify({"success": False, "error": exc.user_message}), exc.status_code
    except Exception:
        return jsonify({"success": False, "error": "파일 버전을 생성할 수 없습니다."}), 400


@files_bp.route("/api/projects/<project_no>/files/delete", methods=["POST"])
def api_delete_file(project_no):
    try:
        project = get_project_by_no(project_no)
        if not project:
            return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404
        data = request.get_json(silent=True) or {}
        delete_project_file(project["project_path"], data.get("tab_key"), data.get("filename"))
        return jsonify({"success": True, "message": f"'{data.get('filename')}' 파일이 삭제되었습니다."})
    except ProjectFileAccessError as exc:
        return jsonify({"success": False, "error": exc.user_message}), exc.status_code
    except Exception:
        return jsonify({"success": False, "error": "파일을 삭제할 수 없습니다."}), 400


@files_bp.route("/api/projects/<project_no>/files/raw", methods=["GET"])
def api_get_raw_file(project_no):
    project = get_project_by_no(project_no)
    if not project or not project.get("project_path"):
        return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404
    try:
        tab_key, filename = _file_identifiers({"tab_key": request.args.get("tab_key"), "filename": request.args.get("filename"), "path": request.args.get("path")})
        file_path = resolve_project_tab_file(project["project_path"], tab_key, filename)
        download = request.args.get("download", "0") == "1"
        mime_type, _ = mimetypes.guess_type(file_path)
        dangerous_inline = os.path.splitext(file_path)[1].lower() in {".html", ".htm", ".svg", ".xhtml", ".js"}
        response = send_file(file_path, mimetype=mime_type or "application/octet-stream", as_attachment=download or dangerous_inline)
        if hasattr(response, "headers"):
            response.headers["X-Content-Type-Options"] = "nosniff"
        return response
    except ProjectFileAccessError as exc:
        return jsonify({"success": False, "error": exc.user_message}), exc.status_code
    except Exception:
        return jsonify({"success": False, "error": "파일을 불러올 수 없습니다."}), 500
