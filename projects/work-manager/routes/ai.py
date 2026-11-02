import json
import os
import shutil
import tempfile

from flask import Blueprint, jsonify, request

from ai_service import (
    global_project_chat_with_ai,
    modify_project_with_ai,
    parse_order_with_ai,
)
from repositories.projects import get_all_projects, get_dashboard_stats, get_project_by_no
from project_service import _validate_project_no
from project_service import update_project_in_db
from file_service import replace_or_save_project_3mf
from file_service import normalize_upload_filename
from ai_apply_service import apply_plan, validate_proposal
from ai_plan_service import create_plan, get_public_plan, cancel_plan, verify_confirmation_token
import config
from request_security import same_origin_loopback


ai_bp = Blueprint("ai", __name__)


def _safe_failure(reply, status=500):
    return jsonify({"success": False, "error": "AI 처리를 완료할 수 없습니다.", "reply": reply}), status


def _parse_json_field(raw, default, expected_type):
    if raw in (None, ""):
        return default
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("JSON 형식이 올바르지 않습니다.") from exc
    if not isinstance(value, expected_type):
        raise ValueError("JSON 형식이 올바르지 않습니다.")
    return value


def _request_message_history():
    if request.is_json:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise ValueError("JSON 형식이 올바르지 않습니다.")
        return data.get("message", ""), _parse_json_field(data.get("history"), [], list), data
    return (
        request.form.get("message", ""),
        _parse_json_field(request.form.get("history"), [], list),
        request.form,
    )


def _save_uploads(field_name):
    temp_dir = tempfile.mkdtemp(prefix="ai-upload-", dir=None)
    records = []
    for upload in request.files.getlist(field_name):
        if not upload.filename:
            continue
        try:
            original_name = normalize_upload_filename(os.path.basename(upload.filename))
        except Exception as exc:
            raise ValueError("유효하지 않은 첨부 파일명입니다.") from exc
        if len(records) >= config.AI_PLAN_MAX_FILES:
            raise ValueError("첨부 파일 개수가 제한을 초과했습니다.")
        if original_name.casefold() in {record["original_name"].casefold() for record in records}:
            raise ValueError("원본 파일명이 중복되었습니다.")
        if os.path.splitext(original_name)[1].lower() not in config.AI_PLAN_ALLOWED_EXTENSIONS:
            raise ValueError("허용되지 않은 첨부 파일 형식입니다.")
        suffix = os.path.splitext(original_name)[1]
        handle = tempfile.NamedTemporaryFile(prefix="upload-", suffix=suffix, dir=temp_dir, delete=False)
        handle.close()
        upload.save(handle.name)
        size = os.path.getsize(handle.name)
        if size > config.AI_PLAN_MAX_FILE_BYTES or sum(r["size"] for r in records) + size > config.AI_PLAN_MAX_TOTAL_BYTES:
            raise ValueError("첨부 파일 크기 제한을 초과했습니다.")
        records.append({"original_name": original_name, "path": handle.name, "size": size})
    return temp_dir, records


def _cleanup_uploads(temp_dir):
    if temp_dir:
        shutil.rmtree(temp_dir, ignore_errors=True)


def _public_ai_failure(result, reply):
    payload = {
        "success": False,
        "error": "AI 처리를 완료할 수 없습니다.",
        "reply": result.get("reply") if isinstance(result, dict) and isinstance(result.get("reply"), str) else reply,
        "suggested_actions": result.get("suggested_actions", []) if isinstance(result, dict) else [],
    }
    code = result.get("code") if isinstance(result, dict) else None
    if code in {"AI_TIMEOUT", "AI_UNAVAILABLE", "AI_INVALID_OUTPUT"}:
        payload["code"] = code
    return payload


def _ai_failure_status(result):
    code = result.get("code") if isinstance(result, dict) else None
    return {"AI_TIMEOUT": 504, "AI_UNAVAILABLE": 503, "AI_INVALID_OUTPUT": 502}.get(code, 400)


def _consent(data):
    value = data.get("external_ai_consent") if isinstance(data, dict) else None
    return value is True or (isinstance(value, str) and value.lower() == "true")


def _plan_origin_ok():
    return same_origin_loopback(request.headers.get("Origin"), request.host,
                                "https" if request.is_secure else "http", reject_suffix=True)


def _public_apply_result(result):
    if not isinstance(result, dict):
        return {"applied_projects": [], "file_results": [], "failures": []}
    applied = []
    for item in result.get("applied_projects", []):
        if isinstance(item, dict) and item.get("project_no"):
            applied.append({"project_no": item["project_no"], "status": "applied"})
    files = []
    for item in result.get("file_results", []):
        if isinstance(item, dict) and item.get("project_no"):
            entry = {"project_no": item["project_no"], "status": "applied"}
            for key in ("filename", "original_uploaded_name", "raw_saved"):
                if isinstance(item.get(key), str) and item[key]:
                    entry[key] = item[key]
            files.append(entry)
    failures = []
    for item in result.get("failures", []):
        if isinstance(item, dict) and item.get("project_no"):
            failures.append({"project_no": item["project_no"], "error": "처리되지 않았습니다."})
    warnings = result.get("warnings", [])
    return {"applied_projects": applied, "file_results": files, "failures": failures,
            "warnings": ["처리 중 경고가 발생했습니다."] if warnings else [],
            "partial": bool(result.get("partial"))}


def _safe_plan_error(status, message):
    return jsonify({"success": False, "error": message}), status


def _plan_preview(plan, ai_res):
    confirmation_token = plan.pop("confirmation_token", None)
    return {
        "success": True, "requires_confirmation": True, "plan_id": plan["id"], "plan": plan,
        "confirmation_token": confirmation_token,
        "reply": (ai_res.get("reply", "AI 변경 제안을 생성했습니다. 아직 적용되지 않았습니다. 승인해 주세요.") + " (아직 적용되지 않음: 명시적 승인이 필요합니다.)"),
        "proposed_updates": ai_res.get("updated_fields", ai_res.get("executed_updates", [])),
        "proposed_file_ops": ai_res.get("file_operations", []), "suggested_actions": ai_res.get("suggested_actions", []),
        "expires_at": plan["expires_at"], "executed_updates": [], "executed_file_ops": [],
    }


@ai_bp.route("/api/ai/plans/<plan_id>/apply", methods=["POST"])
def api_ai_plan_apply(plan_id):
    if not _plan_origin_ok():
        return _safe_plan_error(403, "허용되지 않은 요청 출처입니다.")
    if not verify_confirmation_token(plan_id, request.headers.get("X-AI-Confirmation-Token", "")):
        return _safe_plan_error(404, "AI 승인 계획을 찾을 수 없습니다.")
    if (request.content_type or "").split(";", 1)[0].strip().lower() != "application/json":
        return _safe_plan_error(400, "JSON 요청 본문이 필요합니다.")
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return _safe_plan_error(400, "JSON 요청 본문이 필요합니다.")
    try:
        outcome = apply_plan(plan_id)
        if outcome is None:
            return _safe_plan_error(404, "AI 승인 계획을 찾을 수 없습니다.")
        status = outcome.get("status")
        if status in {"expired", "cancelled"}:
            return _safe_plan_error(410, "AI 승인 계획이 만료되었거나 취소되었습니다.")
        if status in {"applying", "failed"}:
            return _safe_plan_error(409, "AI 승인 계획을 적용할 수 없습니다.")
        if status != "applied":
            return _safe_plan_error(409, "AI 승인 계획 상태를 확인할 수 없습니다.")
        return jsonify({"success": True, "status": "applied", "cached": bool(outcome.get("cached")),
                        "result": _public_apply_result(outcome.get("result"))})
    except ValueError:
        return _safe_plan_error(409, "AI 승인 계획 상태를 확인할 수 없습니다.")
    except Exception:
        return _safe_plan_error(500, "AI 승인 계획을 적용할 수 없습니다.")


@ai_bp.route("/api/ai/plans/<plan_id>", methods=["DELETE"])
def api_ai_plan_cancel(plan_id):
    if not _plan_origin_ok():
        return _safe_plan_error(403, "허용되지 않은 요청 출처입니다.")
    if not verify_confirmation_token(plan_id, request.headers.get("X-AI-Confirmation-Token", "")):
        return _safe_plan_error(404, "AI 승인 계획을 찾을 수 없습니다.")
    try:
        outcome = cancel_plan(plan_id)
        if outcome is None:
            return _safe_plan_error(404, "AI 승인 계획을 찾을 수 없습니다.")
        if outcome.get("status") == "expired":
            return _safe_plan_error(410, "AI 승인 계획이 만료되었습니다.")
        return jsonify({"success": True, "plan_id": plan_id, "status": "cancelled"})
    except ValueError:
        return _safe_plan_error(409, "AI 승인 계획을 취소할 수 없습니다.")
    except Exception:
        return _safe_plan_error(500, "AI 승인 계획을 취소할 수 없습니다.")


@ai_bp.route("/api/ai/parse-order", methods=["POST"])
def api_ai_parse_order():
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 AI를 사용할 수 없습니다."}), 503
    temp_dir = None
    try:
        if request.is_json:
            data = request.get_json(silent=True)
            if not isinstance(data, dict):
                raise ValueError("JSON 형식이 올바르지 않습니다.")
            message = data.get("message", "")
            current_data = _parse_json_field(data.get("current_data", {}), {}, dict)
            history = _parse_json_field(data.get("history", []), [], list)
        else:
            message = request.form.get("message", "")
            current_data = _parse_json_field(request.form.get("current_data"), {}, dict)
            history = _parse_json_field(request.form.get("history"), [], list)
            data = request.form
        if not _consent(data):
            return jsonify({"success": False, "code": "AI_CONSENT_REQUIRED", "error": "외부 AI 분석 동의가 필요합니다."}), 400
        temp_dir, records = _save_uploads("files")
        result = parse_order_with_ai(
            user_message=message, file_paths=[r["path"] for r in records],
            current_data=current_data, history=history,
        )
        if not isinstance(result, dict):
            result = {}
        uploaded_files = [r["original_name"] for r in records]
        if not result.get("success"):
            public_failure = _public_ai_failure(result, "AI 분석을 완료하지 못했습니다.")
            public_failure["uploaded_files"] = uploaded_files
            return jsonify(public_failure), _ai_failure_status(result)
        result["uploaded_files"] = uploaded_files
        return jsonify(result)
    except ValueError:
        return jsonify({"success": False, "error": "주문 정보의 JSON 형식이 올바르지 않습니다.", "reply": "입력 형식을 확인해 주세요."}), 400
    except Exception:
        return _safe_failure("AI 분석 중 오류가 발생했습니다.")
    finally:
        _cleanup_uploads(temp_dir)


@ai_bp.route("/api/projects/<project_no>/ai-modify", methods=["POST"])
def api_ai_modify_project(project_no):
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 AI를 사용할 수 없습니다."}), 503
    temp_dir = None
    try:
        try:
            project_no = _validate_project_no(project_no)
        except ValueError:
            return jsonify({"success": False, "error": "프로젝트 번호 형식이 올바르지 않습니다."}), 400
        data = request.get_json(silent=True) if request.is_json else request.form
        if not _consent(data):
            return jsonify({"success": False, "code": "AI_CONSENT_REQUIRED", "error": "외부 AI 분석 동의가 필요합니다."}), 400
        project = get_project_by_no(project_no)
        if not project:
            return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다.", "reply": "프로젝트를 찾을 수 없습니다."}), 404
        message, history, _ = _request_message_history()
        temp_dir, records = _save_uploads("files")
        paths = [r["path"] for r in records]
        ai_res = modify_project_with_ai(project_data=project, user_message=message, file_paths=paths, history=history)
        if not isinstance(ai_res, dict) or not ai_res.get("success"):
            return jsonify(_public_ai_failure(ai_res, "AI 수정이 반영되지 않았습니다.")), _ai_failure_status(ai_res)

        proposal = {"updated_fields": ai_res.get("updated_fields", {}), "file_operations": [{**op, "project_no": project_no} for op in ai_res.get("file_operations", [])]}
        validate_proposal("project", proposal, {project_no: project}, {r["original_name"].casefold() for r in records})
        plan = create_plan("project", proposal, {project_no: __import__("ai_plan_service").project_fingerprint(project)}, project_no=project_no, file_records=records)
        return jsonify(_plan_preview(plan, ai_res))
    except ValueError:
        return jsonify({"success": False, "error": "AI 수정 입력 형식이 올바르지 않습니다.", "reply": "입력 형식을 확인해 주세요."}), 400
    except Exception:
        return _safe_failure("AI 수정 중 오류가 발생했습니다.")
    finally:
        _cleanup_uploads(temp_dir)


@ai_bp.route("/api/ai/global-chat", methods=["POST"])
def api_ai_global_chat():
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 AI를 사용할 수 없습니다."}), 503
    temp_dir = None
    try:
        message, history, data = _request_message_history()
        if not _consent(data):
            return jsonify({"success": False, "code": "AI_CONSENT_REQUIRED", "error": "외부 AI 분석 동의가 필요합니다."}), 400
        temp_dir, records = _save_uploads("files")
        paths = [r["path"] for r in records]
        all_projects = get_all_projects()
        stats = get_dashboard_stats()
        ai_res = global_project_chat_with_ai(user_message=message, history=history, file_paths=paths, all_projects=all_projects, stats=stats)
        if not isinstance(ai_res, dict) or not ai_res.get("success"):
            return jsonify(_public_ai_failure(ai_res, "AI 관제 응답을 생성하지 못했습니다.")), _ai_failure_status(ai_res)

        executed_updates = ai_res.get("executed_updates", [])
        file_operations = ai_res.get("file_operations", [])
        target_nos = {u.get("project_no") for u in executed_updates if u.get("project_no")} | {o.get("project_no") for o in file_operations if o.get("project_no")}
        projects = {no: get_project_by_no(no) for no in target_nos}
        proposal = {"executed_updates": executed_updates, "file_operations": file_operations}
        if not executed_updates and not file_operations:
            return jsonify({"success": True, "reply": ai_res.get("reply", ""), "suggested_actions": ai_res.get("suggested_actions", []), "executed_updates": [], "executed_file_ops": [], "stats": stats, "uploaded_files": [r["original_name"] for r in records]})
        validate_proposal("global", proposal, projects, {r["original_name"].casefold() for r in records})
        from ai_plan_service import project_fingerprint
        fingerprints = {no: project_fingerprint(projects[no]) for no in target_nos}
        plan = create_plan("global", proposal, fingerprints, file_records=records)
        return jsonify(_plan_preview(plan, ai_res))
    except ValueError:
        return jsonify({"success": False, "error": "AI 입력 형식이 올바르지 않습니다.", "reply": "입력 형식을 확인해 주세요."}), 400
    except Exception:
        return _safe_failure("AI 관제 처리 중 오류가 발생했습니다.")
    finally:
        _cleanup_uploads(temp_dir)
