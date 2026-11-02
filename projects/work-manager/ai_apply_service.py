import os
from contextlib import ExitStack

import config
from ai_plan_service import claim_plan_for_apply, finalize_plan, get_internal_plan, project_fingerprint, resolve_staged_file
from file_service import ProjectBatchLockTimeout, project_batch_lock, replace_or_save_project_3mf, rollback_project_3mf_replacement
from project_service import update_project_in_db
from repositories.projects import get_dashboard_stats, get_project_by_no


ALLOWED_UPDATE_FIELDS = {
    "client_name", "job_name", "channel", "material", "color", "quantity", "quote_amount", "shipping_fee",
    "model_fee", "post_process_fee", "tax_type", "paid_amount", "prod_status", "pay_status", "deliv_status",
    "due_date", "contact_name", "phone", "address", "detail_address", "zipcode", "tracking_no", "courier", "memo",
    "request_notes", "items",
}
STATUS_FIELDS = {
    "prod_status": config.PROD_STATUSES,
    "pay_status": config.PAY_STATUSES,
    "deliv_status": config.DELIV_STATUSES,
}
ITEM_FIELDS = {"name", "material", "color", "quantity", "unit_price", "price", "note", "notes", "original_stl"}


def _safe_result(value):
    if isinstance(value, dict):
        return {key: _safe_result(item) for key, item in value.items() if key not in {"path", "backup_dir"}}
    if isinstance(value, list):
        return [_safe_result(item) for item in value]
    return value


def _failure_code(exc):
    text = str(exc).lower()
    if "stale" in text or "fingerprint" in text:
        return "stale_or_missing"
    if "project" in text:
        return "project_not_found"
    if "file" in text or "3mf" in text:
        return "file_operation_failed"
    return "apply_failed"


def validate_proposal(scope, proposal, projects, staged_original_names):
    if not isinstance(proposal, dict):
        raise ValueError("AI 제안 형식이 올바르지 않습니다.")
    updates = proposal.get("updated_fields", {})
    executed_updates = proposal.get("executed_updates", [])
    operations = proposal.get("file_operations", [])
    if not isinstance(updates, dict) or not isinstance(operations, list) or not isinstance(executed_updates, list):
        raise ValueError("AI 제안 형식이 올바르지 않습니다.")
    unknown = set(updates) - ALLOWED_UPDATE_FIELDS
    if unknown:
        raise ValueError("허용되지 않은 수정 필드가 포함되었습니다.")
    for field, values in STATUS_FIELDS.items():
        if field in updates and updates[field] not in values:
            raise ValueError("상태 값이 올바르지 않습니다.")
    if "items" in updates:
        if not isinstance(updates["items"], list):
            raise ValueError("품목 형식이 올바르지 않습니다.")
        for item in updates["items"]:
            if not isinstance(item, dict) or set(item) - ITEM_FIELDS:
                raise ValueError("품목 형식이 올바르지 않습니다.")
    for value in updates.values():
        if isinstance(value, str) and len(value) > 2000:
            raise ValueError("AI 수정 값이 너무 깁니다.")
    for update in executed_updates:
        if not isinstance(update, dict) or not update.get("project_no") or not isinstance(update.get("fields"), dict):
            raise ValueError("프로젝트 업데이트 형식이 올바르지 않습니다.")
        if set(update["fields"]) - ALLOWED_UPDATE_FIELDS:
            raise ValueError("허용되지 않은 프로젝트 필드가 포함되었습니다.")
        if update["project_no"] not in projects or not projects.get(update["project_no"]):
            raise ValueError("프로젝트 업데이트 대상이 올바르지 않습니다.")
    if len(operations) > len(projects):
        raise ValueError("프로젝트별 파일 작업 수가 올바르지 않습니다.")
    seen_projects = set()
    for operation in operations:
        if not isinstance(operation, dict) or set(operation) - {"op", "project_no", "source_filename", "summary"}:
            raise ValueError("파일 작업 형식이 올바르지 않습니다.")
        if operation.get("op") != "replace_3mf" or not operation.get("project_no") or not operation.get("source_filename"):
            raise ValueError("지원하지 않는 파일 작업입니다.")
        project_no = operation["project_no"]
        if project_no in seen_projects or project_no not in projects or not projects.get(project_no):
            raise ValueError("파일 작업 대상 프로젝트가 올바르지 않습니다.")
        seen_projects.add(project_no)
        source = operation["source_filename"]
        if os.path.basename(source) != source or not source.lower().endswith(".3mf") or source.casefold() not in staged_original_names:
            raise ValueError("3MF 첨부 파일 매칭이 올바르지 않습니다.")
        if len(source) > 255 or any(ord(ch) < 32 or ord(ch) == 127 for ch in source):
            raise ValueError("3MF 첨부 파일명이 안전하지 않습니다.")
        if "summary" in operation and (not isinstance(operation["summary"], str) or len(operation["summary"]) > 500):
            raise ValueError("파일 작업 설명이 올바르지 않습니다.")
    target_projects = {item.get("project_no") for item in executed_updates if isinstance(item, dict) and item.get("project_no")}
    target_projects.update(item.get("project_no") for item in operations if isinstance(item, dict) and item.get("project_no"))
    if len(target_projects) > 1:
        raise ValueError("한 계획에서 여러 프로젝트를 변경할 수 없습니다.")
    if scope == "project" and len(projects) != 1:
        raise ValueError("프로젝트 계획 대상이 올바르지 않습니다.")
    return True


def _apply_locked_plan(plan_id, plan, projects, project_nos):
    proposal = plan["proposal"]
    updates = proposal.get("updated_fields", {})
    operations = proposal.get("file_operations", [])
    applied_projects, file_results, failures = [], [], []
    ops_by_project = {operation["project_no"]: operation for operation in operations}
    global_updates = {item["project_no"]: item.get("fields", {}) for item in proposal.get("executed_updates", [])}
    target_fields = updates if plan["scope"] == "project" else {}
    for no in project_nos:
        project = projects.get(no)
        if not project:
            failures.append({"project_no": no, "error": "project_not_found"})
            continue
        fields = dict(target_fields if no == plan.get("project_no") else global_updates.get(no, {}))
        operation = ops_by_project.get(no)
        receipt = None
        try:
            if operation:
                source = resolve_staged_file(plan_id, operation["source_filename"])
                replacement = replace_or_save_project_3mf(project.get("folder_path") or project.get("project_path"), source, operation["source_filename"], project_data=project, include_rollback_receipt=True)
                receipt = replacement.get("_rollback_receipt")
                if replacement.get("filename"):
                    fields["slicing_file"] = replacement["filename"]
            if fields:
                updated = update_project_in_db(no, fields)
                if not updated:
                    raise ValueError("db_update_failed")
            if operation:
                file_results.append({"project_no": no, "filename": replacement.get("filename", ""), "status": "applied"})
            if fields:
                applied_projects.append({"project_no": no, "status": "applied"})
        except Exception as exc:
            if receipt is not None:
                try:
                    rollback_project_3mf_replacement(project.get("folder_path") or project.get("project_path"), receipt)
                    failures.append({"project_no": no, "error": "db_update_failed_file_restored"})
                except Exception:
                    failures.append({"project_no": no, "error": "file_recovery_required"})
            else:
                failures.append({"project_no": no, "error": _failure_code(exc)})
    result = {"applied_projects": applied_projects, "file_results": file_results, "failures": failures, "partial": bool(failures)}
    if not failures:
        result["stats"] = _safe_result(get_dashboard_stats())
    return finalize_plan(plan_id, "applied" if not failures else "failed", result)


def _busy_result(plan_id):
    return finalize_plan(plan_id, "failed", {
        "code": "project_busy",
        "failures": [{"error": "project_busy"}],
        "partial": False,
        "retryable": True,
    })


def apply_plan(plan_id):
    claim = claim_plan_for_apply(plan_id)
    if claim is None:
        return None
    if not claim["claimed"]:
        if claim["status"] == "applied":
            return {"status": "applied", "result": claim["cached_result"], "cached": True}
        return {"status": claim["status"], "cached": False, "plan": claim["plan"]}
    plan = get_internal_plan(plan_id)
    if plan is None:
        return None
    proposal = plan["proposal"]
    updates = proposal.get("updated_fields", {})
    operations = proposal.get("file_operations", [])
    project_nos = set(plan["expected_fingerprints"])
    for operation in operations:
        project_nos.add(operation["project_no"])
    project_nos.update(
        item["project_no"] for item in proposal.get("executed_updates", [])
        if isinstance(item, dict) and item.get("project_no")
    )
    projects = {no: get_project_by_no(no) for no in project_nos}
    try:
        validate_proposal(plan["scope"], proposal, projects, {item["original_name"].casefold() for item in plan["staged_files"]})
    except ValueError:
        return finalize_plan(plan_id, "failed", {"code": "proposal_invalid"})
    stale = []
    for no, expected in plan["expected_fingerprints"].items():
        current = projects.get(no)
        if not current or project_fingerprint(current) != expected:
            stale.append(no)
    if stale:
        result = {"applied_projects": [], "file_results": [], "failures": [{"project_no": no, "error": "stale_or_missing"} for no in stale], "partial": False}
        return finalize_plan(plan_id, "failed", result)

    try:
        with ExitStack() as stack:
            for project_no in sorted(project_nos):
                stack.enter_context(project_batch_lock(project_no, lock_root=config.DATA_DIR))
            latest_plan = get_internal_plan(plan_id)
            if not latest_plan or latest_plan.get("status") != "applying":
                return {"status": latest_plan.get("status", "failed") if latest_plan else "failed", "cached": False}
            latest_nos = set(latest_plan["expected_fingerprints"])
            latest_nos.update(item["project_no"] for item in latest_plan["proposal"].get("file_operations", []))
            latest_nos.update(item["project_no"] for item in latest_plan["proposal"].get("executed_updates", []) if item.get("project_no"))
            if latest_nos != project_nos:
                return finalize_plan(plan_id, "failed", {
                    "code": "proposal_invalid", "reason": "target_set_changed", "partial": False,
                })
            latest_projects = {no: get_project_by_no(no) for no in latest_nos}
            try:
                validate_proposal(latest_plan["scope"], latest_plan["proposal"], latest_projects, {item["original_name"].casefold() for item in latest_plan["staged_files"]})
            except ValueError:
                return finalize_plan(plan_id, "failed", {"code": "proposal_invalid", "partial": False})
            for no, expected in latest_plan["expected_fingerprints"].items():
                current = latest_projects.get(no)
                if not current or project_fingerprint(current) != expected:
                    return finalize_plan(plan_id, "failed", {"code": "stale_or_missing", "failures": [{"project_no": no, "error": "stale_or_missing"}], "partial": False})
            return _apply_locked_plan(plan_id, latest_plan, latest_projects, latest_nos)
    except ProjectBatchLockTimeout:
        return _busy_result(plan_id)
