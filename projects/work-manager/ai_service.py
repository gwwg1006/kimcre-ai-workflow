import os
import json
import re
import signal
import time
import subprocess
import shutil
import tempfile
import threading
from datetime import datetime
import config
from ai_contracts import (
    GLOBAL_SCHEMA,
    MODIFY_SCHEMA,
    ORDER_SCHEMA,
    build_global_prompt,
    build_modify_prompt,
    build_order_prompt,
    clean_order_data,
    normalize_order_payload,
    provider_schema,
    validate_contract,
)

AGY_PATHS = [
    os.path.expanduser("~/.local/bin/agy"),
    shutil.which("agy") or "agy"
]

_AI_SLOTS = threading.BoundedSemaphore(config.AI_MAX_CONCURRENT_REQUESTS)
_TRANSIENT_ERROR_MARKERS = (
    "experiencing high traffic", "rate limit", "too many requests", "temporarily unavailable",
    "bad gateway", "gateway timeout", "connection reset", "connection refused", "http 429",
    "http 502", "http 503", "http 504", "empty response",
)
_STRUCTURED_OUTPUT_KEYS = ("structured_output", "result", "response", "output", "content", "message")
_ALLOWED_ACTION_TYPES = {"open_project", "open_3mf", "generate_estimate", "open_delivery", "new_project"}

def get_agy_bin():
    for p in AGY_PATHS:
        if p and os.path.exists(p) and os.access(p, os.X_OK):
            return p
    return "agy"

def _canonical_allowed_dirs(allowed_dirs):
    """Return existing, canonical directories for agy's read boundary."""
    normalized = []
    seen = set()
    broad_roots = {
        os.path.realpath(os.path.abspath(os.sep)),
        os.path.realpath(os.path.expanduser("~")),
        os.path.realpath(os.path.dirname(os.path.abspath(__file__))),
    }
    for directory in allowed_dirs or []:
        if not directory:
            continue
        canonical = os.path.realpath(os.path.abspath(os.fspath(directory)))
        if not os.path.isdir(canonical) or canonical in broad_roots or canonical in seen:
            continue
        seen.add(canonical)
        normalized.append(canonical)
    return normalized


def _allowed_dirs_for_files(file_paths):
    """Allow agy to read only the existing parent directories of uploads."""
    parents = []
    for file_path in file_paths or []:
        if file_path and os.path.isfile(file_path) and not os.path.islink(file_path):
            parents.append(os.path.dirname(os.path.abspath(os.fspath(file_path))))
    return _canonical_allowed_dirs(parents)


def _stop_process_group(process, grace_seconds=1.0):
    """Stop only the process group created for one AI invocation."""
    if process is None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        process.wait(timeout=grace_seconds)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        process.wait(timeout=grace_seconds)
    except subprocess.TimeoutExpired:
        pass


def _run_agy_command(command, timeout, cwd):
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=cwd,
        shell=False,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _stop_process_group(process)
        raise
    return process.returncode, stdout, stderr


def _is_transient_error(message):
    lowered = (message or "").lower()
    return any(marker in lowered for marker in _TRANSIENT_ERROR_MARKERS)


def _agy_returned_empty_response(stdout):
    """Detect agy 1.2+ print-timeout envelopes that otherwise look successful."""
    envelope = extract_json_from_text(stdout)
    if not isinstance(envelope, dict):
        return False
    if envelope.get("status") != "SUCCESS" or envelope.get("response") not in ("", None):
        return False
    usage = envelope.get("usage")
    return not isinstance(usage, dict) or usage.get("total_tokens", 0) == 0


def _configured_models():
    """Return the primary model and one distinct low-latency fallback at most."""
    models = []
    for model in (config.AI_MODEL, config.AI_FALLBACK_MODEL):
        if model and model not in models:
            models.append(model)
    return models or [None]


def execute_agy_prompt(prompt, timeout=90, max_retries=None, allowed_dirs=None, schema=None):
    """
    Run one bounded, structured, read-only agy request.

    ``timeout`` is the total wall-clock budget across all attempts. Retries are
    limited to fast transient failures so a request cannot silently take N x
    timeout seconds.
    """
    if config.DISABLE_EXTERNAL_SERVICES:
        return None, "외부 AI 서비스가 비활성화되어 있습니다."
    if not isinstance(prompt, str) or not prompt.strip():
        return None, "AI 입력이 비어 있습니다."
    attempts = config.AI_MAX_ATTEMPTS if max_retries is None else max(1, int(max_retries))
    if not _AI_SLOTS.acquire(timeout=0.25):
        return None, "AI 처리 요청이 많습니다. 잠시 후 다시 시도해 주세요."
    agy_bin = get_agy_bin()
    last_err = ""
    deadline = time.monotonic() + max(1, timeout)
    try:
        with tempfile.TemporaryDirectory(prefix="agy-ai-") as isolated_cwd:
            models = _configured_models()
            for attempt in range(attempts):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None, "AI 응답 시간이 초과되었습니다."
                model = models[min(attempt, len(models) - 1)]
                future_retry_budget = (attempts - attempt - 1) * config.AI_RETRY_MIN_BUDGET_SECONDS
                print_timeout = max(
                    1,
                    int(remaining) - config.AI_CLI_SHUTDOWN_RESERVE_SECONDS - future_retry_budget,
                )
                cmd = [
                    agy_bin, "--sandbox", "--mode", "plan", "--disable-slash-commands",
                    "--output-format", "json", "--effort", config.AI_REASONING_EFFORT,
                ]
                if config.AI_AGENT:
                    cmd.extend(["--agent", config.AI_AGENT])
                if model:
                    cmd.extend(["--model", model])
                if schema:
                    cmd.extend(["--json-schema", json.dumps(schema, ensure_ascii=False, separators=(",", ":"))])
                for directory in _canonical_allowed_dirs(allowed_dirs):
                    cmd.extend(["--add-dir", directory])
                cmd.extend([
                    "--print-timeout", f"{print_timeout}s",
                    "--log-file", os.path.join(isolated_cwd, "agy.log"), "-p", prompt,
                ])
                try:
                    returncode, stdout, stderr = _run_agy_command(cmd, remaining, isolated_cwd)
                except subprocess.TimeoutExpired:
                    return None, "AI 응답 시간이 초과되었습니다."
                except OSError as exc:
                    return None, str(exc)
                if returncode == 0 and stdout.strip() and not _agy_returned_empty_response(stdout):
                    return stdout.strip(), None
                last_err = "AI provider returned an empty response." if _agy_returned_empty_response(stdout) else (stderr or stdout or "agy CLI execution failed").strip()
                if not _is_transient_error(last_err) or attempt >= attempts - 1:
                    break
                backoff = min(0.75, 0.25 * (2 ** attempt))
                if deadline - time.monotonic() <= backoff:
                    break
                time.sleep(backoff)
    finally:
        _AI_SLOTS.release()

    return None, last_err or "AI 응답을 생성하지 못했습니다."

def extract_json_from_text(text):
    """
    AI 출력 텍스트에서 ```json ... ``` 또는 최외각 { ... } JSON 추출
    """
    if not text:
        return None

    cleaned = text.strip()

    # 1. 최외각 코드블록(```json ... ```) 래핑 제거 후 직접 파싱 시도
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        candidate = "\n".join(lines).strip()
        try:
            return json.loads(candidate, strict=False)
        except Exception:
            pass

    # 2. 첫 번째 '{' 부터 마지막 '}' 까지의 최외각 블록 추출
    first_idx = text.find("{")
    last_idx = text.rfind("}")
    if first_idx != -1 and last_idx != -1 and last_idx > first_idx:
        candidate = text[first_idx:last_idx + 1]
        try:
            return json.loads(candidate, strict=False)
        except Exception:
            pass

    # 3. Greedy ```json ... ``` 정규식 매칭
    m = re.search(r"```(?:json)?\s*([\s\S]*)\s*```", text, re.IGNORECASE)
    if m:
        try:
            return json.loads(m.group(1).strip(), strict=False)
        except Exception:
            pass

    # 4. Non-greedy ```json ... ``` 정규식 매칭
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if m:
        try:
            return json.loads(m.group(1).strip(), strict=False)
        except Exception:
            pass

    return None


def extract_structured_payload(text, required_keys):
    """Unwrap agy's JSON envelope and return only the contracted payload."""
    parsed = extract_json_from_text(text)
    queue = [parsed]
    visited = set()
    while queue:
        value = queue.pop(0)
        identity = id(value)
        if identity in visited:
            continue
        visited.add(identity)
        if isinstance(value, dict):
            if required_keys.issubset(value):
                return value
            for key in _STRUCTURED_OUTPUT_KEYS:
                if key in value:
                    queue.append(value[key])
        elif isinstance(value, list):
            queue.extend(value[-3:])
        elif isinstance(value, str):
            nested = extract_json_from_text(value)
            if nested is not None:
                queue.append(nested)
    return None

def extract_chat_response(text):
    """
    Extract a complete global-chat contract. Malformed/free-text output fails
    closed so agent progress or partial mutation instructions never reach UI.
    """
    required = {"reply", "suggested_actions", "executed_updates", "file_operations"}
    parsed = extract_structured_payload(text, required)
    if not isinstance(parsed, dict) or not isinstance(parsed.get("reply"), str):
        return None
    if any(not isinstance(parsed.get(key), list) for key in required - {"reply"}):
        return None
    actions = []
    for action in parsed["suggested_actions"][:5]:
        if not isinstance(action, dict):
            continue
        action_type = action.get("type")
        if action_type not in _ALLOWED_ACTION_TYPES or not isinstance(action.get("label"), str):
            continue
        if action_type != "new_project" and not isinstance(action.get("project_no"), str):
            continue
        actions.append({key: action[key] for key in ("type", "project_no", "label") if key in action})
    result = {
        "reply": parsed["reply"].strip(),
        "suggested_actions": actions,
        "executed_updates": parsed["executed_updates"],
        "file_operations": parsed["file_operations"],
    }
    return result if _matches_contract(result, GLOBAL_SCHEMA) else None


def _matches_contract(value, schema):
    try:
        validate_contract(value, schema)
        return True
    except ValueError:
        return False

def _nonnegative_int(value, default=0):
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, str):
        normalized = value.replace(",", "").replace("원", "").strip()
        if normalized.isdigit():
            return int(normalized)
    return default


def normalize_ai_extracted_data(data):
    """Cross-check item unit prices and derive a missing quotation subtotal."""
    if not isinstance(data, dict):
        return data
    items = data.get("items")
    if not isinstance(items, list) or not items:
        return data

    total_calculated = 0
    sum_prices_without_qty = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        quantity = max(1, _nonnegative_int(item.get("quantity"), 1))
        price = _nonnegative_int(item.get("price", item.get("unit_price")), 0)
        total_calculated += quantity * price
        sum_prices_without_qty += price

    quote_amount = _nonnegative_int(data.get("quote_amount"), 0)
    looks_like_line_totals = (
        quote_amount > 0
        and abs(sum_prices_without_qty - quote_amount) <= max(1000, quote_amount * 0.03)
        and total_calculated > quote_amount * 1.3
    )
    if looks_like_line_totals:
        for item in items:
            if not isinstance(item, dict):
                continue
            quantity = max(1, _nonnegative_int(item.get("quantity"), 1))
            price = _nonnegative_int(item.get("price", item.get("unit_price")), 0)
            if quantity > 1 and price > 0:
                item["price"] = round(price / quantity)
                item["unit_price"] = item["price"]
        total_calculated = sum(
            max(1, _nonnegative_int(item.get("quantity"), 1))
            * _nonnegative_int(item.get("price", item.get("unit_price")), 0)
            for item in items if isinstance(item, dict)
        )
    if quote_amount == 0:
        data["quote_amount"] = total_calculated
    return data


def parse_order_with_ai(user_message, file_paths=None, current_data=None, history=None):
    """
    agy Flash 모델을 사용하여 카톡 대화/사진/메모/요청사항에서
    3D 프린팅 신규 작업 등록에 필요한 정보를 구조화된 JSON으로 추출
    """
    today_str = datetime.now().strftime("%Y-%m-%d")
    file_paths = file_paths or []
    current_data = current_data or {}
    history = history or []

    # The versioned builder replaces the legacy prose above with a compact,
    # injection-aware contract. Keeping construction local also makes each
    # request independent and cache-friendly for the model provider.
    prompt = build_order_prompt(user_message, file_paths, current_data, history, today_str)
    raw_out, err = execute_agy_prompt(
        prompt,
        timeout=config.AI_PARSE_TIMEOUT_SECONDS,
        allowed_dirs=_allowed_dirs_for_files(file_paths),
        schema=provider_schema(ORDER_SCHEMA),
    )
    if not raw_out:
        return {
            "success": False,
            "code": "AI_TIMEOUT" if "시간이 초과" in (err or "") else "AI_UNAVAILABLE",
            "error": "AI 분석을 완료할 수 없습니다.",
            "reply": "AI 분석을 완료하지 못했습니다. 잠시 후 다시 시도하거나 직접 입력해 주세요."
        }

    parsed = extract_structured_payload(raw_out, {"reply", "data", "missing_fields"})
    parsed = normalize_order_payload(parsed)
    if not _matches_contract(parsed, ORDER_SCHEMA):
        return {
            "success": False,
            "code": "AI_INVALID_OUTPUT",
            "error": "AI가 구조화된 주문 정보를 반환하지 않았습니다.",
            "reply": "첨부파일을 읽었지만 신규 작업 정보로 변환하지 못했습니다. 필요한 항목을 직접 입력해 주세요."
        }

    extracted_data = normalize_ai_extracted_data(clean_order_data(parsed["data"]))

    return {
        "success": True,
        "reply": parsed["reply"].strip() or "작업 정보가 추출되었습니다.",
        "data": extracted_data,
        "missing_fields": [str(field)[:100] for field in parsed["missing_fields"][:30]]
    }

def modify_project_with_ai(project_data, user_message, file_paths=None, history=None):
    """
    기존 프로젝트 정보를 바탕으로 자연어 요청 / 사진 / 캡처에서 변경할 필드들을 추출하여 수정
    """
    today_str = datetime.now().strftime("%Y-%m-%d")

    file_paths = file_paths or []
    history = history or []

    # 기존 프로젝트 정보 정리 (불필요한 바이너리/긴 탭 데이터 제외)
    clean_project = {
        "project_no": project_data.get("project_no"),
        "client_name": project_data.get("client_name"),
        "job_name": project_data.get("job_name"),
        "received_date": project_data.get("received_date"),
        "channel": project_data.get("channel"),
        "material": project_data.get("material"),
        "color": project_data.get("color"),
        "quantity": project_data.get("quantity"),
        "quote_amount": project_data.get("quote_amount"),
        "shipping_fee": project_data.get("shipping_fee"),
        "model_fee": project_data.get("model_fee"),
        "post_process_fee": project_data.get("post_process_fee"),
        "tax_type": project_data.get("tax_type", "면세"),
        "paid_amount": project_data.get("paid_amount"),
        "prod_status": project_data.get("prod_status"),
        "pay_status": project_data.get("pay_status"),
        "deliv_status": project_data.get("deliv_status"),
        "due_date": project_data.get("due_date"),
        "phone": project_data.get("phone"),
        "address": project_data.get("address"),
        "detail_address": project_data.get("detail_address"),
        "zipcode": project_data.get("zipcode"),
        "tracking_no": project_data.get("tracking_no"),
        "courier": project_data.get("courier"),
        "memo": project_data.get("memo"),
        "request_notes": project_data.get("request_notes"),
        "items": project_data.get("items", [])
    }

    prompt = build_modify_prompt(clean_project, user_message, file_paths, history, today_str)
    raw_out, err = execute_agy_prompt(
        prompt,
        timeout=config.AI_MODIFY_TIMEOUT_SECONDS,
        allowed_dirs=_allowed_dirs_for_files(file_paths),
        schema=provider_schema(MODIFY_SCHEMA),
    )
    if not raw_out:
        return {
            "success": False,
            "code": "AI_TIMEOUT" if "시간이 초과" in (err or "") else "AI_UNAVAILABLE",
            "error": "AI 수정 제안을 완료할 수 없습니다.",
            "reply": "AI 수정 제안을 생성하지 못했습니다. 아무 변경도 적용되지 않았습니다.",
            "file_operations": []
        }

    parsed = extract_structured_payload(raw_out, {"reply", "updated_fields", "file_operations"})
    if not _matches_contract(parsed, MODIFY_SCHEMA):
        return {
            "success": False,
            "code": "AI_INVALID_OUTPUT",
            "error": "AI 응답 형식이 올바르지 않습니다.",
            "reply": "AI 수정 제안을 확인할 수 없어 아무 변경도 적용하지 않았습니다.",
            "file_operations": []
        }

    updated = normalize_ai_extracted_data(parsed.get("updated_fields", {}))

    return {
        "success": True,
        "reply": parsed["reply"].strip() or "프로젝트 변경을 제안합니다.",
        "updated_fields": updated,
        "file_operations": parsed["file_operations"][:1]
    }

def global_project_chat_with_ai(user_message, history=None, file_paths=None, all_projects=None, stats=None):
    """
    김명규크리에이티브 메인 페이지 전체 프로젝트 통합 관제 AI.
    전체 프로젝트 상태 질의응답, 통계 분석, 상태 변경 명령, 3MF/견적서/배송 액션 연동 지원.
    """
    current_time_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    prompt = build_global_prompt(
        user_message, file_paths, history, all_projects, stats, current_time_str
    )
    raw_out, err = execute_agy_prompt(
        prompt,
        timeout=config.AI_GLOBAL_TIMEOUT_SECONDS,
        allowed_dirs=_allowed_dirs_for_files(file_paths),
        schema=provider_schema(GLOBAL_SCHEMA),
    )
    if not raw_out:
        return {
            "success": False,
            "code": "AI_TIMEOUT" if "시간이 초과" in (err or "") else "AI_UNAVAILABLE",
            "error": "AI 관제 응답을 완료할 수 없습니다.",
            "reply": "AI 관제 응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            "suggested_actions": [],
            "executed_updates": [],
            "file_operations": []
        }

    chat_data = extract_chat_response(raw_out)
    if chat_data is None or not _matches_contract(chat_data, GLOBAL_SCHEMA):
        return {
            "success": False,
            "code": "AI_INVALID_OUTPUT",
            "error": "AI 응답 형식이 올바르지 않습니다.",
            "reply": "AI 응답을 확인할 수 없어 아무 변경도 제안하지 않았습니다.",
            "suggested_actions": [],
            "executed_updates": [],
            "file_operations": [],
        }
    known_project_nos = {
        project.get("project_no") for project in (all_projects or [])
        if isinstance(project, dict) and project.get("project_no")
    }
    chat_data["suggested_actions"] = [
        action for action in chat_data["suggested_actions"]
        if action["type"] == "new_project" or action.get("project_no") in known_project_nos
    ]
    return {
        "success": True,
        "reply": chat_data.get("reply", "응답이 완료되었습니다."),
        "suggested_actions": chat_data.get("suggested_actions", []),
        "executed_updates": chat_data.get("executed_updates", []),
        "file_operations": chat_data.get("file_operations", [])
    }
