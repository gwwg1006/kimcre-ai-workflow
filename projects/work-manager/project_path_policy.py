"""Central trust boundary for database-backed project directories."""
from pathlib import Path
import os
import config


class ProjectPathPolicyError(Exception):
    def __init__(self, message="프로젝트 경로를 사용할 수 없습니다.", status_code=403):
        super().__init__(message)
        self.user_message = message
        self.status_code = status_code


def _allowed_roots():
    roots = []
    for value in (getattr(config, "PROJECTS_DIR", None), getattr(config, "COMPLETED_DIR", None)):
        if not value:
            continue
        try:
            root = Path(value).resolve(strict=False)
        except (OSError, RuntimeError):
            continue
        if root not in roots:
            roots.append(root)
    return roots


def resolve_project_root(project_path, must_exist=True):
    """Return a canonical, non-symlink project directory under an allowed root."""
    if not isinstance(project_path, (str, bytes, os.PathLike)):
        raise ProjectPathPolicyError("프로젝트 경로를 사용할 수 없습니다.", 400)
    try:
        raw = Path(os.fspath(project_path))
    except (TypeError, ValueError):
        raise ProjectPathPolicyError("프로젝트 경로를 사용할 수 없습니다.", 400)
    if not str(raw).strip():
        raise ProjectPathPolicyError("프로젝트를 찾을 수 없습니다.", 404)
    if raw.is_symlink():
        raise ProjectPathPolicyError("프로젝트 경로가 안전하지 않습니다.", 403)
    if must_exist and not raw.exists():
        raise ProjectPathPolicyError("프로젝트를 찾을 수 없습니다.", 404)
    try:
        candidate = raw.resolve(strict=must_exist)
    except FileNotFoundError:
        raise ProjectPathPolicyError("프로젝트를 찾을 수 없습니다.", 404)
    except (OSError, RuntimeError):
        raise ProjectPathPolicyError("프로젝트 경로를 사용할 수 없습니다.", 403)
    if must_exist and (not candidate.is_dir() or candidate.is_symlink()):
        raise ProjectPathPolicyError("프로젝트 경로가 안전하지 않습니다.", 403)
    for allowed in _allowed_roots():
        try:
            relative = candidate.relative_to(allowed)
        except ValueError:
            continue
        if relative.parts and candidate != allowed:
            return candidate
        raise ProjectPathPolicyError("프로젝트 경로가 안전하지 않습니다.", 403)
    raise ProjectPathPolicyError("프로젝트 폴더 밖의 경로입니다.", 403)
