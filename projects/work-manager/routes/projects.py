import re
from flask import Blueprint, jsonify, request
import config

from project_service import (
    create_project_in_db_and_fs,
    delete_project_from_db_and_fs,
    generate_next_project_no,
    update_project_in_db,
    update_status,
    ProjectConflictError,
)
from repositories.projects import get_all_projects, get_project_by_no
from delivery_service import attach_tracking_url, format_logii_address
from file_service import list_project_tabs_and_files
from sync_service import process_pending_sync_jobs
from request_security import same_origin_loopback


projects_bp = Blueprint("projects", __name__)


def _safe_bool(value, default=True):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off", ""}:
            return False
    return default


def _json_or_form(allow_empty=False):
    if request.is_json:
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else None
    if request.form:
        return request.form.to_dict()
    return {} if allow_empty else None


def _not_found():
    return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404


def _sync_origin_ok():
    return same_origin_loopback(request.headers.get("Origin"), request.host,
                                "https" if request.is_secure else "http", reject_suffix=True)


@projects_bp.route("/api/projects/sync-pending", methods=["POST"])
def api_sync_pending():
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 운영대장 동기화를 사용할 수 없습니다."}), 503
    if not _sync_origin_ok():
        return jsonify({"success": False, "error": "허용되지 않은 요청 출처입니다."}), 403
    if (request.content_type or "").split(";", 1)[0].strip().lower() != "application/json":
        return jsonify({"success": False, "error": "JSON 요청 본문이 필요합니다."}), 400
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "error": "JSON 요청 본문이 필요합니다."}), 400
    limit = data.get("limit", 20)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
        return jsonify({"success": False, "error": "limit은 1에서 100 사이의 정수여야 합니다."}), 400
    retry_failed = data.get("retry_failed", False)
    if not isinstance(retry_failed, bool):
        return jsonify({"success": False, "error": "retry_failed는 boolean이어야 합니다."}), 400
    project_no = data.get("project_no")
    if project_no is not None and (not isinstance(project_no, str) or not re.fullmatch(r"\d{6}-\d{3,}", project_no)):
        return jsonify({"success": False, "error": "project_no 형식이 올바르지 않습니다."}), 400
    try:
        result = process_pending_sync_jobs(limit=limit, retry_failed=retry_failed, project_no=project_no)
        safe = {key: int(result.get(key, 0) or 0) for key in ("processed", "succeeded", "failed", "superseded", "remaining")}
        return jsonify({"success": True, **safe})
    except Exception:
        return jsonify({"success": False, "error": "동기화 대기 작업을 처리할 수 없습니다."}), 500


def _safe_error(message, status=400):
    return jsonify({"success": False, "error": message}), status


@projects_bp.route("/api/projects", methods=["GET"])
def api_get_projects():
    def status_values(name):
        value = request.args.get(name)
        if not value:
            return None
        values = [item.strip() for item in value.split(",") if item.strip()]
        return values or None

    filters = {
        "search": request.args.get("search"),
        "prod_status": status_values("prod_status"),
        "pay_status": status_values("pay_status"),
        "deliv_status": status_values("deliv_status"),
        "overall_status": status_values("overall_status"),
    }
    try:
        projects = [attach_tracking_url(project) for project in get_all_projects(filters)]
        return jsonify({"success": True, "data": projects, "count": len(projects)})
    except Exception:
        return _safe_error("프로젝트 목록을 불러올 수 없습니다.", 500)


@projects_bp.route("/api/projects/next-no", methods=["GET"])
def api_next_project_no():
    try:
        next_no = generate_next_project_no(request.args.get("date"))
        return jsonify({"success": True, "next_no": next_no})
    except ValueError:
        return _safe_error("대상 날짜를 확인할 수 없습니다.")
    except Exception:
        return _safe_error("다음 프로젝트 번호를 확인할 수 없습니다.", 500)


@projects_bp.route("/api/projects/<project_no>", methods=["GET"])
def api_get_project_detail(project_no):
    try:
        project = get_project_by_no(project_no)
        if not project:
            return _not_found()
        project["tabs"] = list_project_tabs_and_files(project.get("project_path"))
        project["logii_address"] = format_logii_address(project)
        attach_tracking_url(project)
        return jsonify({"success": True, "data": project})
    except Exception:
        return _safe_error("프로젝트 상세 정보를 불러올 수 없습니다.", 500)


@projects_bp.route("/api/projects", methods=["POST"])
def api_create_project():
    try:
        if request.is_json:
            data = request.get_json(silent=True)
            if not isinstance(data, dict):
                return _safe_error("JSON 프로젝트 정보를 입력해 주세요.")
            files = []
        else:
            if not request.form and not request.files:
                return _safe_error("프로젝트 정보를 입력해 주세요.")
            data = request.form.to_dict()
            files = request.files.getlist("files")
        new_project = create_project_in_db_and_fs(data, files)
        return jsonify({"success": True, "data": new_project, "message": "새 프로젝트가 성공적으로 등록되었습니다."})
    except ProjectConflictError as exc:
        return _safe_error(str(exc), 409)
    except ValueError:
        return _safe_error("프로젝트 정보를 확인할 수 없습니다.")
    except Exception:
        return _safe_error("프로젝트를 등록할 수 없습니다.", 500)


@projects_bp.route("/api/projects/<project_no>", methods=["PUT"])
def api_update_project(project_no):
    data = _json_or_form()
    if data is None:
        return _safe_error("JSON 프로젝트 정보를 입력해 주세요.")
    try:
        if not get_project_by_no(project_no):
            return _not_found()
        updated = update_project_in_db(project_no, data)
        if not updated:
            return _not_found()
        return jsonify({"success": True, "data": updated, "message": "프로젝트 정보가 수정되었습니다."})
    except ProjectConflictError as exc:
        return _safe_error(str(exc), 409)
    except ValueError:
        return _safe_error("프로젝트 정보를 확인할 수 없습니다.")
    except Exception:
        return _safe_error("프로젝트를 수정할 수 없습니다.", 500)


@projects_bp.route("/api/projects/<project_no>/status", methods=["POST"])
def api_update_project_status(project_no):
    data = _json_or_form()
    if data is None:
        return _safe_error("JSON 상태 정보를 입력해 주세요.")
    if not data.get("status_type") or not data.get("status_val"):
        return _safe_error("상태 유형과 상태값이 필요합니다.")
    try:
        if not get_project_by_no(project_no):
            return _not_found()
        if "expected_version" in data:
            updated = update_status(
                project_no, data["status_type"], data["status_val"],
                expected_version=data.get("expected_version"),
            )
        else:
            updated = update_status(project_no, data["status_type"], data["status_val"])
        if not updated:
            return _not_found()
        return jsonify({
            "success": True, "data": updated,
            "message": f"{data['status_type']} 상태가 '{data['status_val']}'(으)로 변경되었습니다.",
        })
    except ProjectConflictError as exc:
        return _safe_error(str(exc), 409)
    except ValueError:
        return _safe_error("프로젝트 상태 정보를 확인할 수 없습니다.")
    except Exception:
        return _safe_error("프로젝트 상태를 변경할 수 없습니다.", 500)


@projects_bp.route("/api/projects/<project_no>/complete", methods=["POST"])
def api_complete_project(project_no):
    data = _json_or_form(allow_empty=True)
    if data is None:
        return _safe_error("JSON 완료 정보를 입력해 주세요.")
    try:
        if not get_project_by_no(project_no):
            return _not_found()
        complete_data = {
            "prod_status": "제작 완료", "deliv_status": "배송 완료",
            "pay_status": "입금 완료", "overall_status": "완료",
        }
        if isinstance(data, dict) and "expected_version" in data:
            complete_data["expected_version"] = data["expected_version"]
        updated = update_project_in_db(project_no, complete_data)
        if not updated:
            return _not_found()
        return jsonify({"success": True, "data": updated, "message": "프로젝트가 완료 처리되었습니다."})
    except ProjectConflictError as exc:
        return _safe_error(str(exc), 409)
    except ValueError:
        return _safe_error("프로젝트 완료 정보를 확인할 수 없습니다.")
    except Exception:
        return _safe_error("프로젝트를 완료 처리할 수 없습니다.", 500)


@projects_bp.route("/api/projects/<project_no>", methods=["DELETE"])
@projects_bp.route("/api/projects/<project_no>/delete", methods=["POST", "DELETE"])
def api_delete_project(project_no):
    data = request.get_json(silent=True) if request.is_json else None
    if request.is_json and data is None:
        return _safe_error("JSON 삭제 정보를 입력해 주세요.")
    if data is not None and not isinstance(data, dict):
        return _safe_error("JSON 삭제 정보를 입력해 주세요.")
    try:
        if not get_project_by_no(project_no):
            return _not_found()
        delete_files = _safe_bool(
            data.get("delete_files", True) if isinstance(data, dict) else request.args.get("delete_files", True),
            default=True,
        )
        result = delete_project_from_db_and_fs(project_no, delete_files=delete_files)
        warnings = result.get("warnings", [])
        message = f"프로젝트 [{project_no}]가 삭제되었습니다."
        if warnings:
            message += " " + " ".join(warnings)
        return jsonify({"success": True, "data": result, "warnings": warnings, "message": message})
    except ValueError:
        return _safe_error("프로젝트 정보를 확인할 수 없습니다.")
    except Exception:
        return _safe_error("프로젝트를 삭제할 수 없습니다.", 500)
