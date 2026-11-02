import hashlib
import hmac
import json
import os
import shutil
import stat
import tempfile
import uuid
import secrets
import unicodedata
from datetime import datetime, timedelta, timezone

import config
from repositories import ai_plans


def _now(now=None):
    value = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _timestamp(value=None):
    return _now(value).isoformat(timespec="seconds")


def project_fingerprint(project):
    fields = (
        "project_no", "client_name", "job_name", "channel", "material", "color", "quantity", "received_date",
        "quote_amount", "shipping_fee", "model_fee", "post_process_fee", "tax_type", "total_amount",
        "paid_amount", "unpaid_amount", "prod_status", "pay_status", "deliv_status", "overall_status",
        "due_date", "phone", "address", "detail_address", "zipcode", "box_type", "tracking_no",
        "courier", "memo", "request_notes", "original_files", "slicing_file", "project_path",
    )
    canonical = {key: project.get(key) for key in fields}
    canonical["items"] = project.get("items") or []
    payload = json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _validate_files(file_paths=None, file_records=None):
    if file_records is not None:
        paths = [(item["path"], item["original_name"]) for item in file_records]
    else:
        paths = [(path, None) for path in (file_paths or [])]
    if len(paths) > config.AI_PLAN_MAX_FILES:
        raise ValueError("첨부 파일 개수가 제한을 초과했습니다.")
    valid = []
    total = 0
    names = set()
    for source, supplied_name in paths:
        source_path = os.fspath(source)
        if os.path.islink(source_path) or not os.path.isfile(source_path):
            raise ValueError("첨부 파일이 없거나 안전한 일반 파일이 아닙니다.")
        original_name = unicodedata.normalize("NFKC", str(supplied_name or os.path.basename(source_path)))
        if os.path.basename(original_name) != original_name:
            raise ValueError("첨부 파일명이 안전하지 않습니다.")
        if not original_name or original_name in {".", ".."} or any(ord(ch) < 32 or ord(ch) == 127 for ch in original_name):
            raise ValueError("첨부 파일명이 안전하지 않습니다.")
        if len(original_name) > 255:
            raise ValueError("첨부 파일명이 너무 깁니다.")
        name_key = unicodedata.normalize("NFKC", original_name).casefold()
        if name_key in names:
            raise ValueError("원본 파일명이 중복되어 첨부 파일을 구분할 수 없습니다.")
        names.add(name_key)
        extension = os.path.splitext(original_name)[1].lower()
        if extension not in config.AI_PLAN_ALLOWED_EXTENSIONS:
            raise ValueError("허용되지 않은 첨부 파일 형식입니다.")
        # Capture the source identity while validating.  The copy path below
        # opens with O_NOFOLLOW and checks this identity again, so a rename or
        # symlink swap between validation and copy cannot be silently staged.
        if not hasattr(os, "O_NOFOLLOW"):
            raise ValueError("첨부 파일을 안전하게 열 수 없습니다.")
        try:
            source_fd = os.open(source_path, os.O_RDONLY | os.O_NOFOLLOW)
            source_stat = os.fstat(source_fd)
        except (OSError, ValueError):
            raise ValueError("첨부 파일이 없거나 안전한 일반 파일이 아닙니다.")
        finally:
            try:
                os.close(source_fd)
            except (UnboundLocalError, OSError):
                pass
        if not stat.S_ISREG(source_stat.st_mode):
            raise ValueError("첨부 파일이 없거나 안전한 일반 파일이 아닙니다.")
        size = source_stat.st_size
        if size > config.AI_PLAN_MAX_FILE_BYTES:
            raise ValueError("개별 첨부 파일 크기 제한을 초과했습니다.")
        total += size
        if total > config.AI_PLAN_MAX_TOTAL_BYTES:
            raise ValueError("첨부 파일 총 크기 제한을 초과했습니다.")
        valid.append((source_path, original_name, extension, size, source_stat.st_dev, source_stat.st_ino))
    return valid


def _copy_source_verified(source_path, destination, expected_size, expected_dev, expected_ino):
    """Copy one validated source without following a replacement symlink."""
    if not hasattr(os, "O_NOFOLLOW"):
        raise ValueError("첨부 파일을 안전하게 열 수 없습니다.")
    source_fd = os.open(source_path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(source_fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_dev != expected_dev or
                before.st_ino != expected_ino or before.st_size != expected_size):
            raise ValueError("첨부 파일이 검증 후 변경되었습니다.")
        digest = hashlib.sha256()
        copied = 0
        with os.fdopen(source_fd, "rb", closefd=True) as source:
            source_fd = None
            with open(destination, "wb") as target:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    target.write(chunk)
                    digest.update(chunk)
                    copied += len(chunk)
                target.flush()
                os.fsync(target.fileno())
            after = os.fstat(source.fileno())
        if copied != expected_size or after.st_size != expected_size:
            raise ValueError("첨부 파일 크기가 검증과 일치하지 않습니다.")
        destination_digest = hashlib.sha256()
        with open(destination, "rb") as published:
            for chunk in iter(lambda: published.read(1024 * 1024), b""):
                destination_digest.update(chunk)
        if destination_digest.hexdigest() != digest.hexdigest():
            raise ValueError("첨부 파일 무결성 검증에 실패했습니다.")
    finally:
        if source_fd is not None:
            os.close(source_fd)


def _public(row, confirmation_token=None):
    if row is None:
        return None
    result = {
        "id": row["id"], "scope": row["scope"], "project_no": row["project_no"], "status": row["status"],
        "proposal": json.loads(row["proposal_json"]),
        "expected_fingerprints": json.loads(row["expected_fingerprints_json"]),
        "staged_files": [{"original_name": item["original_name"], "size": item["size"]}
                         for item in json.loads(row["staged_files_json"])],
        "result": json.loads(row["result_json"]) if row["result_json"] else None,
        "created_at": row["created_at"], "expires_at": row["expires_at"],
        "applied_at": row["applied_at"], "updated_at": row["updated_at"],
    }
    if confirmation_token:
        result["confirmation_token"] = confirmation_token
    return result


def create_plan(scope, proposal, expected_fingerprints=None, project_no=None, file_paths=None, file_records=None, now=None, ttl_seconds=None):
    if scope not in {"project", "global"}:
        raise ValueError("AI 계획 범위가 올바르지 않습니다.")
    if scope == "project" and not project_no:
        raise ValueError("프로젝트 계획에는 project_no가 필요합니다.")
    valid_files = _validate_files(file_paths, file_records)
    plan_id = str(uuid.uuid4())
    confirmation_token = secrets.token_urlsafe(32)
    staging_dir = os.path.join(config.AI_PENDING_DIR, plan_id)
    created = _now(now)
    expires = created + timedelta(seconds=ttl_seconds if ttl_seconds is not None else config.AI_PLAN_TTL_SECONDS)
    staged = []
    try:
        os.makedirs(staging_dir, exist_ok=False)
        for source, original_name, extension, size, source_dev, source_ino in valid_files:
            stored_name = f"{uuid.uuid4().hex}{extension}"
            temp_fd, temp_path = tempfile.mkstemp(prefix=".staged-", dir=staging_dir)
            os.close(temp_fd)
            try:
                _copy_source_verified(source, temp_path, size, source_dev, source_ino)
                final_path = os.path.join(staging_dir, stored_name)
                # link() publishes without replacing an existing destination;
                # the UUID name makes collisions improbable and still safe.
                os.link(temp_path, final_path)
                os.unlink(temp_path)
            except Exception:
                try:
                    os.unlink(temp_path)
                except FileNotFoundError:
                    pass
                raise
            staged.append({"original_name": original_name, "stored_name": stored_name, "size": size})
        ai_plans.insert_plan({
            "id": plan_id, "scope": scope, "project_no": project_no, "status": "pending",
            "proposal": proposal, "expected_fingerprints": expected_fingerprints or {}, "staged_files": staged,
            "created_at": _timestamp(created), "expires_at": _timestamp(expires), "updated_at": _timestamp(created),
            "confirmation_token_hash": hashlib.sha256(confirmation_token.encode("utf-8")).hexdigest(),
        })
    except Exception:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise
    return {**get_public_plan(plan_id), "confirmation_token": confirmation_token}


def get_public_plan(plan_id):
    return _public(ai_plans.get_plan(plan_id))


def verify_confirmation_token(plan_id, token):
    row = ai_plans.get_plan(plan_id)
    if not row or not token or not row.get("confirmation_token_hash"):
        return False
    candidate = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return hmac.compare_digest(candidate, row["confirmation_token_hash"])


def get_internal_plan(plan_id):
    row = ai_plans.get_plan(plan_id)
    if row is None:
        return None
    return {
        "id": row["id"], "scope": row["scope"], "project_no": row["project_no"], "status": row["status"],
        "proposal": json.loads(row["proposal_json"]),
        "expected_fingerprints": json.loads(row["expected_fingerprints_json"]),
        "staged_files": json.loads(row["staged_files_json"]),
        "result": json.loads(row["result_json"]) if row["result_json"] else None,
        "created_at": row["created_at"], "expires_at": row["expires_at"],
        "applied_at": row["applied_at"], "updated_at": row["updated_at"],
        "staging_dir": os.path.join(config.AI_PENDING_DIR, row["id"]),
    }


def claim_plan_for_apply(plan_id, now=None):
    current = _now(now)
    outcome = ai_plans.claim_plan(plan_id, _timestamp(current), _timestamp(current - timedelta(minutes=10)))
    if outcome is None:
        return None
    row = outcome["plan"]
    if outcome["status"] == "expired":
        _cleanup_staging(plan_id)
    cached = json.loads(row["result_json"]) if row.get("result_json") else None
    return {
        "claimed": outcome["claimed"], "status": outcome["status"], "plan": _public(row),
        "cached_result": cached if outcome["status"] == "applied" else None,
    }


def resolve_staged_file(plan_id, original_name):
    plan = get_internal_plan(plan_id)
    if plan is None:
        raise FileNotFoundError("AI 계획을 찾을 수 없습니다.")
    raw_name = os.fspath(original_name)
    if os.path.basename(raw_name) != raw_name:
        raise FileNotFoundError("스테이징 파일명이 안전하지 않습니다.")
    wanted = raw_name.casefold()
    match = next((item for item in plan["staged_files"] if item["original_name"].casefold() == wanted), None)
    if match is None:
        raise FileNotFoundError("스테이징 파일을 찾을 수 없습니다.")
    plan_dir = os.path.realpath(plan["staging_dir"])
    candidate = os.path.realpath(os.path.join(plan_dir, match["stored_name"]))
    if os.path.commonpath([plan_dir, candidate]) != plan_dir or os.path.islink(candidate) or not os.path.isfile(candidate):
        raise FileNotFoundError("스테이징 파일 경로가 안전하지 않습니다.")
    return candidate


def _record_cleanup_warning(plan_id, warning):
    row = ai_plans.get_plan(plan_id)
    if row is None:
        return
    result = json.loads(row["result_json"]) if row["result_json"] else {}
    if not isinstance(result, dict):
        result = {"value": result}
    warnings = list(result.get("warnings") or [])
    warning = "staging_cleanup_pending"
    if warning not in warnings:
        warnings.append(warning)
    ai_plans.merge_plan_result(
        plan_id,
        {"warnings": warnings, "cleanup_pending": True},
        expected_statuses={row["status"]},
        updated_at=_timestamp(),
    )


def _cleanup_staging(plan_id):
    staging_dir = os.path.join(config.AI_PENDING_DIR, plan_id)
    if not os.path.lexists(staging_dir):
        return True
    try:
        shutil.rmtree(staging_dir)
        return True
    except Exception as exc:
        _record_cleanup_warning(plan_id, f"staging cleanup pending: {exc}")
        return False


def cancel_plan(plan_id, now=None):
    row = ai_plans.get_plan(plan_id)
    if not row:
        return None
    if row["status"] in {"applied", "applying"}:
        raise ValueError("적용 중이거나 적용된 AI 계획은 취소할 수 없습니다.")
    if row["status"] in {"cancelled", "expired"}:
        return _public(row)
    transition = ai_plans.update_plan_status(
        plan_id, "cancelled", _timestamp(now), expected_statuses={"pending", "failed"}
    )
    if not transition["updated"]:
        latest = transition["row"] or ai_plans.get_plan(plan_id)
        if latest and latest["status"] in {"cancelled", "expired"}:
            return _public(latest)
        if latest and latest["status"] in {"applied", "applying"}:
            raise ValueError("적용 중이거나 적용된 AI 계획은 취소할 수 없습니다.")
        raise ValueError("AI 계획 상태가 변경되어 취소할 수 없습니다.")
    _cleanup_staging(plan_id)
    return get_public_plan(plan_id)


def cleanup_expired_plans(now=None):
    now_text = _timestamp(now)
    expired_ids = ai_plans.expire_pending_plans(now_text)
    expired_ids.extend(ai_plans.expire_retryable_failed_plans(now_text))
    for plan_id in expired_ids:
        _cleanup_staging(plan_id)
    return len(expired_ids)


def finalize_plan(plan_id, status, result):
    if status not in {"applied", "failed"}:
        raise ValueError("최종 AI 계획 상태가 올바르지 않습니다.")
    row = ai_plans.get_plan(plan_id)
    if row is None:
        return None
    if row["status"] == "applied":
        return {"status": "applied", "result": json.loads(row["result_json"]) if row["result_json"] else None,
                "plan": _public(row), "cached": True}
    if row["status"] != "applying":
        raise ValueError("적용 중인 AI 계획만 최종 처리할 수 있습니다.")
    now_text = _timestamp()
    retryable_busy = (
        status == "failed" and isinstance(result, dict) and
        result.get("retryable") is True and result.get("code") == "project_busy"
    )
    transition = ai_plans.update_plan_status(
        plan_id, status, now_text, result=result,
        applied_at=now_text if status == "applied" else None,
        expected_status="applying",
    )
    if not transition["updated"]:
        latest = transition["row"] or ai_plans.get_plan(plan_id)
        if latest and latest["status"] == "applied":
            return {"status": "applied", "result": json.loads(latest["result_json"]) if latest["result_json"] else None,
                    "plan": _public(latest), "cached": True}
        raise ValueError("적용 중인 AI 계획만 최종 처리할 수 있습니다.")
    if not retryable_busy:
        _cleanup_staging(plan_id)
    final = get_internal_plan(plan_id)
    return {"status": final["status"], "result": final["result"], "plan": _public(ai_plans.get_plan(plan_id)), "cached": False}
