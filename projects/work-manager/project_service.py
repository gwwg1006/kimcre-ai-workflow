"""프로젝트 생성·수정·상태·삭제 서비스."""
import json
import os
import re
import shutil
import math
import numbers
import threading
import uuid
from datetime import datetime
from pathlib import Path

from config import (
    PROJECTS_DIR, COMPLETED_DIR, OPERATIONS_FILE,
    STANDARD_SUBFOLDERS, PROD_STATUSES, PAY_STATUSES, DELIV_STATUSES,
    DEFAULT_COURIER,
)
from db import get_db_connection
from repositories.partners import ensure_partner_for_project
from repositories.projects import get_project_by_no
from sync_service import process_pending_sync_jobs
from repositories.sync_jobs import count_open_jobs
from repositories.sync_jobs import enqueue_job
from file_service import create_initial_3mf_file, save_project_source_files


def sync_project_to_excel_ledger(*args, **kwargs):
    """Legacy test/integration seam; the service no longer imports sync at load time."""
    from sync_service import sync_project_to_excel_ledger as sync
    return sync(*args, **kwargs)

class ProjectConflictError(ValueError):
    """프로젝트 번호/폴더 충돌을 호출자가 409로 매핑할 수 있게 한다."""


_CREATE_LOCK = threading.RLock()


def _parse_nonnegative_int(value, label, *, minimum=0):
    if isinstance(value, bool):
        raise ValueError(f"{label}은(는) 정수여야 합니다.")
    if value is None or value == "":
        return minimum
    try:
        if isinstance(value, numbers.Real):
            if not math.isfinite(value) or float(value) != int(value):
                raise ValueError
            parsed = int(value)
        elif isinstance(value, str):
            normalized = value.strip()
            if not re.fullmatch(r"\+?\d+", normalized):
                raise ValueError
            parsed = int(normalized)
        else:
            raise ValueError
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label}은(는) 정수여야 합니다.") from exc
    if parsed < minimum:
        raise ValueError(f"{label}은(는) {minimum} 이상이어야 합니다.")
    return parsed


def _parse_items(raw_items):
    if raw_items is None:
        return []
    if isinstance(raw_items, str):
        try:
            raw_items = json.loads(raw_items)
        except (TypeError, ValueError) as exc:
            raise ValueError("품목 정보 형식이 올바르지 않습니다.") from exc
    if not isinstance(raw_items, list) or any(not isinstance(item, dict) for item in raw_items):
        raise ValueError("품목 정보 형식이 올바르지 않습니다.")
    for item in raw_items:
        item["quantity"] = _parse_nonnegative_int(item.get("quantity", 1), "품목 수량", minimum=1)
        item["unit_price"] = _parse_nonnegative_int(item.get("unit_price", item.get("price", 0)), "품목 단가")
    return raw_items


def _validate_date(value, label):
    if value in (None, ""):
        return
    if not isinstance(value, str):
        raise ValueError(f"{label} 형식이 올바르지 않습니다.")
    try:
        datetime.strptime(value.strip(), "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"{label} 형식이 올바르지 않습니다.") from exc


def _validate_domain_fields(values, *, creating=False):
    if creating or any(key in values for key in ("prod_status", "pay_status", "deliv_status", "tax_type")):
        if values.get("prod_status", "접수") not in PROD_STATUSES:
            raise ValueError("제작 상태가 올바르지 않습니다.")
        if values.get("pay_status", "미청구") not in PAY_STATUSES:
            raise ValueError("결제 상태가 올바르지 않습니다.")
        if values.get("deliv_status", "예약 필요") not in DELIV_STATUSES:
            raise ValueError("배송 상태가 올바르지 않습니다.")
        if values.get("tax_type", "면세") not in ("면세", "과세"):
            raise ValueError("과세 구분이 올바르지 않습니다.")
    _validate_date(values.get("received_date"), "접수일")
    _validate_date(values.get("due_date"), "납기일")


def _validate_project_text(value, label, max_length=300):
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > max_length or any(ord(char) == 0 or ord(char) < 32 and char not in "\t" or ord(char) == 127 for char in value):
        raise ValueError(f"{label} 형식이 올바르지 않습니다.")
    return value.strip()


def _validate_project_no(value):
    """프로젝트 경로에 사용 가능한 YYMMDD-NNN 번호만 허용한다."""
    if not isinstance(value, str):
        raise ValueError("프로젝트 번호 형식이 올바르지 않습니다.")
    normalized = value.strip()
    match = re.fullmatch(r"(\d{6})-(\d{3,})", normalized)
    if not match:
        raise ValueError("프로젝트 번호 형식이 올바르지 않습니다.")
    try:
        datetime.strptime("20" + match.group(1), "%Y%m%d")
    except ValueError as exc:
        raise ValueError("프로젝트 번호의 날짜가 올바르지 않습니다.") from exc
    return normalized


def _safe_folder_component(value, label):
    """고객명/작업명을 폴더 구성요소로 정리하고 빈 결과를 거부한다."""
    cleaned = re.sub(r"[\x00-\x1f\x7f\s/\\:]+", "_", str(value or "").strip())
    cleaned = cleaned.strip(" ._")
    if not cleaned:
        raise ValueError(f"{label}을(를) 폴더명으로 사용할 수 없습니다.")
    return cleaned

def generate_next_project_no(target_date_str=None):
    """
    현재 날짜 기준 YYMMDD-NNN 형식의 고유 번호 생성 (예: 260820-001)
    """
    if target_date_str is None:
        parsed_date = datetime.now()
    elif isinstance(target_date_str, str):
        clean_date = target_date_str.strip()
        try:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", clean_date):
                parsed_date = datetime.strptime(clean_date, "%Y-%m-%d")
            elif re.fullmatch(r"\d{6}", clean_date):
                parsed_date = datetime.strptime("20" + clean_date, "%Y%m%d")
            else:
                raise ValueError
        except ValueError as exc:
            raise ValueError("대상 날짜 형식이 올바르지 않습니다.") from exc
    else:
        raise ValueError("대상 날짜 형식이 올바르지 않습니다.")
    prefix = parsed_date.strftime("%y%m%d")
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT project_no FROM projects WHERE project_no LIKE ? ORDER BY project_no DESC", (f"{prefix}-%",))
        rows = cursor.fetchall()
    finally:
        conn.close()

    existing_nums = []
    for r in rows:
        m = re.search(r"-(\d+)$", r["project_no"])
        if m:
            existing_nums.append(int(m.group(1)))
            
    # Also check filesystem directly to prevent collisions
    year_str = parsed_date.strftime("%Y")
    year_dir = os.path.join(PROJECTS_DIR, year_str)
    if os.path.exists(year_dir):
        for fname in os.listdir(year_dir):
            if fname.startswith(f"{prefix}-"):
                m = re.search(rf"^{prefix}-(\d+)", fname)
                if m:
                    existing_nums.append(int(m.group(1)))

    next_seq = max(existing_nums, default=0) + 1
    return _validate_project_no(f"{prefix}-{next_seq:03d}")

def calculate_amounts(quote_amount, shipping_fee, model_fee, post_process_fee, tax_type, paid_amount):
    subtotal = (quote_amount or 0) + (model_fee or 0) + (post_process_fee or 0) + (shipping_fee or 0)
    if tax_type == "과세":
        tax = int(subtotal * 0.1)
        total = subtotal + tax
    else:
        total = subtotal
    unpaid = max(0, total - (paid_amount or 0))
    return total, unpaid


from projection_renderer import render_project_markdown as _render_project_markdown

def _create_project_in_db_and_fs(data, files=None):
    """
    신규 프로젝트 등록 (DB, 파일시스템 7개 폴더, 작업정보.md, 운영대장 엑셀)
    """
    now = datetime.now()
    
    # 1. 프로젝트 번호 생성
    p_no = data.get("project_no") or generate_next_project_no(data.get("received_date"))
    client_name = data.get("client_name", "").strip()
    job_name = data.get("job_name", "").strip()
    
    if not client_name or not job_name:
        raise ValueError("고객명과 작업명은 필수 입력 항목입니다.")

    # 2. 폴더명 생성 및 7개 서브폴더 생성
    p_no = _validate_project_no(p_no)
    project_path = _project_path_for(p_no, client_name, job_name)
    os.makedirs(os.path.dirname(project_path), exist_ok=True)
    try:
        os.mkdir(project_path)
    except FileExistsError as exc:
        raise ProjectConflictError("프로젝트 폴더가 이미 존재합니다.") from exc
    
    for sub in STANDARD_SUBFOLDERS:
        os.makedirs(os.path.join(project_path, sub), exist_ok=True)

    # 3. 첨부파일 저장 (01_수신원본)
    saved_files = save_project_source_files(project_path, files)

    # 4. 품목 목록 파싱 및 금액 계산
    items_list = _parse_items(data.get("items"))
    quote_amount = _parse_nonnegative_int(data.get("quote_amount"), "견적 금액")
    shipping_fee = _parse_nonnegative_int(data["shipping_fee"], "배송비") if "shipping_fee" in data else 3500
    model_fee = _parse_nonnegative_int(data.get("model_fee"), "모델 수정비")
    post_process_fee = _parse_nonnegative_int(data.get("post_process_fee"), "후가공비")
    tax_type = data.get("tax_type", "면세")
    paid_amount = _parse_nonnegative_int(data.get("paid_amount"), "입금액")

    received_date = data.get("received_date") or now.strftime("%Y-%m-%d")
    channel = data.get("channel", "카카오톡")
    material = data.get("material", "")
    color = data.get("color", "")
    quantity = str(data.get("quantity", "1"))
    prod_status = data.get("prod_status", "접수")
    pay_status = data.get("pay_status", "미청구")
    deliv_status = data.get("deliv_status") or "예약 필요"
    due_date = data.get("due_date", "")
    phone = data.get("phone", "")
    address = data.get("address", "")
    detail_address = data.get("detail_address", "")
    contact_name = _validate_project_text(data.get("contact_name", ""), "담당자", 100)
    zipcode = data.get("zipcode", "")
    box_type = data.get("box_type", "A")
    memo = data.get("memo", "")
    request_notes = data.get("request_notes", "")
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    _validate_domain_fields({**data, "received_date": received_date, "due_date": due_date,
                             "prod_status": prod_status, "pay_status": pay_status,
                             "deliv_status": deliv_status, "tax_type": tax_type}, creating=True)

    # 품목 목록이 있는 경우 총 수량, 주요 소재/색상, 품목 합계 금액 자동 정규화
    if items_list:
        total_item_qty = 0
        total_item_price = 0
        materials = []
        colors = []
        for it in items_list:
            q = it["quantity"]
            total_item_qty += q
            p = it["unit_price"]
            total_item_price += p * q
            m = it.get("material")
            if m and m not in materials:
                materials.append(m)
            c = it.get("color")
            if c and c not in colors:
                colors.append(c)
        
        if not data.get("quantity") or data.get("quantity") == "1":
            quantity = f"{total_item_qty}개 ({len(items_list)}종)" if len(items_list) > 1 else str(total_item_qty)
        if not material and materials:
            material = " / ".join(materials)
        if not color and colors:
            color = " / ".join(colors)
        if (not quote_amount or quote_amount == 0) and total_item_price > 0:
            quote_amount = total_item_price

    if pay_status == "입금 완료" and paid_amount == 0:
        subtotal = (quote_amount or 0) + (model_fee or 0) + (post_process_fee or 0) + (shipping_fee or 0)
        paid_amount = int(subtotal * 1.1) if tax_type == "과세" else subtotal

    total_amount, unpaid_amount = calculate_amounts(quote_amount, shipping_fee, model_fee, post_process_fee, tax_type, paid_amount)
    overall_status = "완료" if (prod_status == "제작 완료" and pay_status == "입금 완료" and deliv_status == "배송 완료") else "진행 중"

    # 5. 00_작업정보/작업정보.md 작성
    items_table_md = ""
    if items_list:
        items_table_md = "\n### 세부 출력 품목 내역\n\n| 번호 | 품명 / 파일명 | 소재 | 색상 | 수량 | 단가 | 합계 | 비고 |\n|---|---|---|---|---|---|---|---|\n"
        for idx, it in enumerate(items_list, 1):
            it_name = it.get("name") or f"품목_{idx}"
            it_mat = it.get("material") or material or "-"
            it_col = it.get("color") or color or "-"
            it_q = it["quantity"]
            it_p = it["unit_price"]
            it_sub = it_q * it_p
            it_n = it.get("note") or it.get("notes") or ""
            items_table_md += f"| {idx} | {it_name} | {it_mat} | {it_col} | {it_q} | {it_p:,}원 | {it_sub:,}원 | {it_n} |\n"

    md_path = os.path.join(project_path, "00_작업정보", "작업정보.md")
    md_content = _render_project_markdown(p_no, client_name, job_name, {
        "received_date": received_date, "channel": channel, "quantity": quantity,
        "total_quantity": quantity, "material": material, "quote_amount": quote_amount,
        "shipping_fee": shipping_fee, "tax_type": tax_type, "total_amount": total_amount,
        "prod_status": prod_status, "pay_status": pay_status, "deliv_status": deliv_status,
        "due_date": due_date, "address": address, "detail_address": detail_address,
        "request_notes": request_notes, "memo": memo,
    }, items_table_md)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    # 5-1. 03_슬라이싱_3MF 폴더에 프로젝트 이름 기반 초기 빈 3MF 파일 생성
    # (Bambu Studio에서 열어 슬라이싱 후 저장 시 경로가 꼬이지 않고 프로젝트 폴더에 바로 저장되도록 보장)
    try:
        initial_3mf_name, _ = create_initial_3mf_file(project_path, p_no, client_name, job_name, material, color, quantity)
    except Exception as e:
        print(f"Error creating initial 3MF file: {e}")
        initial_3mf_name = ""

    # 6. SQLite DB 저장
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        partner_id = ensure_partner_for_project(data, cursor)
        # ensure_partner_for_project may fill absent snapshot keys from the
        # selected master; explicit empty values remain unchanged.
        contact_name = _validate_project_text(data.get("contact_name", ""), "담당자", 100)
        cursor.execute("""
        INSERT INTO projects (
            project_no, received_date, client_name, job_name, channel,
            material, color, quantity, quote_amount, shipping_fee,
            model_fee, post_process_fee, tax_type, total_amount, paid_amount,
            unpaid_amount, prod_status, pay_status, deliv_status, overall_status,
            due_date, project_path, original_files, slicing_file, tracking_no,
            courier, partner_id, contact_name, phone, address, detail_address, zipcode, box_type,
            memo, request_notes, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, '',
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?
        )
        """, (
            p_no, received_date, client_name, job_name, channel,
            material, color, quantity, quote_amount, shipping_fee,
            model_fee, post_process_fee, tax_type, total_amount, paid_amount,
            unpaid_amount, prod_status, pay_status, deliv_status, overall_status,
            due_date, project_path, ", ".join(saved_files), initial_3mf_name,
            DEFAULT_COURIER, partner_id, contact_name, phone, address, detail_address, zipcode, box_type,
            memo, request_notes, now_str, now_str
        ))
    
        # 6-1. project_items 테이블에 세부 품목 등록
        if items_list:
            cursor.execute("DELETE FROM project_items WHERE project_no = ?", (p_no,))
            for idx, it in enumerate(items_list, 1):
                it_name = it.get("name") or f"품목_{idx}"
                it_qty = it["quantity"]
                it_mat = it.get("material") or material
                it_col = it.get("color") or color
                it_price = it["unit_price"]
                it_note = it.get("note") or it.get("notes") or ""
                it_stl = it.get("original_stl") or (f"{it_name}.stl" if not it_name.endswith((".stl", ".3mf", ".step")) else it_name)
                
                cursor.execute("""
                INSERT INTO project_items (
                    project_no, seq, name, original_stl, quantity,
                    material, color, layer_height, wall_count, infill_rate,
                    unit_price, status, note
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    p_no, idx, it_name, it_stl, it_qty,
                    it_mat, it_col, 0.2, 3, 0.2,
                    it_price, "접수", it_note
                ))
        elif job_name:
            # 단일 품목 자동 생성
            cursor.execute("""
            INSERT INTO project_items (
                project_no, seq, name, original_stl, quantity,
                material, color, layer_height, wall_count, infill_rate,
                unit_price, status, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                p_no, 1, job_name, f"{job_name}.stl", int(quantity) if quantity.isdigit() else 1,
                material, color, 0.2, 3, 0.2,
                quote_amount, "접수", request_notes
            ))
    
        enqueue_job("upsert", p_no, {"source": "project_mutation"}, conn=conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    warnings = []
    try:
        process_pending_sync_jobs(limit=5, project_no=p_no)
    except Exception:
        warnings.append("projection_sync_failed")
    result = get_project_by_no(p_no)
    result["sync_pending"] = bool(count_open_jobs(project_no=p_no))
    result["warnings"] = warnings
    return result


def _project_path_for(project_no, client_name, job_name, year=None):
    safe_no = _validate_project_no(project_no)
    safe_client = _safe_folder_component(client_name, "고객명")
    safe_job = _safe_folder_component(job_name, "작업명")
    project_year = "20" + safe_no[:2]
    year = str(year or project_year)
    if not re.fullmatch(r"\d{4}", year):
        raise ValueError("연도 형식이 올바르지 않습니다.")
    if year != project_year:
        raise ValueError("프로젝트 번호와 연도가 일치하지 않습니다.")
    root = Path(PROJECTS_DIR).resolve()
    year_root = (root / year).resolve()
    candidate = (year_root / f"{safe_no}_{safe_client}_{safe_job}").resolve()
    if year_root.parent != root or candidate.parent != year_root or candidate == root:
        raise ValueError("프로젝트 경로가 허용된 범위를 벗어났습니다.")
    return str(candidate)


def create_project_in_db_and_fs(data, files=None):
    """신규 프로젝트를 생성하고, 실패 시 이번 호출이 만든 폴더만 롤백한다."""
    with _CREATE_LOCK:
        payload = dict(data)
        project_no = payload.get("project_no") or generate_next_project_no(payload.get("received_date"))
        project_no = _validate_project_no(project_no)
        client_name = str(payload.get("client_name") or "").strip()
        job_name = str(payload.get("job_name") or "").strip()
        if not client_name or not job_name:
            raise ValueError("고객명과 작업명은 필수 입력 항목입니다.")

        conn = get_db_connection()
        try:
            exists = conn.execute("SELECT 1 FROM projects WHERE project_no = ?", (project_no,)).fetchone()
        finally:
            conn.close()
        if exists:
            raise ProjectConflictError("이미 존재하는 프로젝트 번호입니다.")

        target = _project_path_for(project_no, client_name, job_name)
        if os.path.lexists(target):
            raise ProjectConflictError("프로젝트 폴더가 이미 존재합니다.")

        payload["project_no"] = project_no
        try:
            return _create_project_in_db_and_fs(payload, files)
        except ProjectConflictError:
            raise
        except Exception as original_error:
            if os.path.isdir(target) and not os.path.islink(target):
                try:
                    shutil.rmtree(target)
                except Exception as cleanup_error:
                    raise RuntimeError("프로젝트 생성 실패 후 새 폴더 정리에 실패했습니다.") from cleanup_error
                if os.path.lexists(target):
                    raise RuntimeError("프로젝트 생성 실패 후 새 폴더가 남아 있습니다.") from original_error
            raise

def update_project_in_db(project_no, data, *, expected_version=None):
    """
    프로젝트 정보 수정
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Serialize the read/merge/write cycle.  Without this, two requests
        # can each read an old full row and the later writer can erase the
        # earlier writer's unrelated fields.
        cursor.execute("BEGIN IMMEDIATE")
        if expected_version is None and isinstance(data, dict) and "expected_version" in data:
            expected_version = data.get("expected_version")
        if expected_version is not None:
            try:
                if isinstance(expected_version, bool):
                    raise ValueError
                expected_version = int(expected_version)
            except (TypeError, ValueError) as exc:
                raise ValueError("expected_version은 양의 정수여야 합니다.") from exc
            if expected_version < 1:
                raise ValueError("expected_version은 양의 정수여야 합니다.")
        
        # 기존 정보 가져오기
        cursor.execute("SELECT * FROM projects WHERE project_no = ?", (project_no,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise ValueError(f"Project not found: {project_no}")
    
        current = dict(row)
        current_version = int(current.get("version") or 1)
        if expected_version is not None and expected_version != current_version:
            raise ProjectConflictError(
                f"프로젝트가 다른 화면에서 변경되었습니다. 최신 버전: {current_version}"
            )
        if not str(current.get("courier") or "").strip():
            current["courier"] = DEFAULT_COURIER
        # 병합
        for k, v in data.items():
            if k in current and k != "items":
                current[k] = v
        if "contact_name" in data:
            current["contact_name"] = _validate_project_text(data["contact_name"], "담당자", 100)
        else:
            current["contact_name"] = _validate_project_text(current.get("contact_name"), "담당자", 100)
        _validate_domain_fields(data)
    
        # 품목 업데이트 처리
        raw_items = data.get("items")
        items_list = None
        if raw_items is not None:
            items_list = _parse_items(raw_items)
    
        if items_list is not None:
            cursor.execute("DELETE FROM project_items WHERE project_no = ?", (project_no,))
            total_item_qty = 0
            total_item_price = 0
            materials = []
            colors = []
    
            for idx, it in enumerate(items_list, 1):
                it_name = it.get("name") or f"품목_{idx}"
                it_qty = it["quantity"]
                it_mat = it.get("material") or current.get("material") or "PLA"
                it_col = it.get("color") or current.get("color") or "White"
                it_price = it["unit_price"]
                it_note = it.get("note") or it.get("notes") or ""
                it_stl = it.get("original_stl") or (f"{it_name}.stl" if not it_name.endswith((".stl", ".3mf", ".step")) else it_name)
                
                total_item_qty += it_qty
                total_item_price += (it_price * it_qty)
                if it_mat and it_mat not in materials:
                    materials.append(it_mat)
                if it_col and it_col not in colors:
                    colors.append(it_col)
    
                cursor.execute("""
                INSERT INTO project_items (
                    project_no, seq, name, original_stl, quantity,
                    material, color, layer_height, wall_count, infill_rate,
                    unit_price, status, note
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    project_no, idx, it_name, it_stl, it_qty,
                    it_mat, it_col, 0.2, 3, 0.2,
                    it_price, "접수", it_note
                ))
    
            if items_list:
                current["quantity"] = f"{total_item_qty}개 ({len(items_list)}종)" if len(items_list) > 1 else str(total_item_qty)
                if materials:
                    current["material"] = " / ".join(materials)
                if colors:
                    current["color"] = " / ".join(colors)
                if total_item_price > 0 and "quote_amount" not in data:
                    current["quote_amount"] = total_item_price
    
        quote_amount = _parse_nonnegative_int(current.get("quote_amount"), "견적 금액")
        shipping_fee = _parse_nonnegative_int(current.get("shipping_fee"), "배송비", minimum=0)
        model_fee = _parse_nonnegative_int(current.get("model_fee"), "모델 수정비")
        post_process_fee = _parse_nonnegative_int(current.get("post_process_fee"), "후가공비")
        tax_type = current.get("tax_type", "면세")
        paid_amount = _parse_nonnegative_int(current.get("paid_amount"), "입금액")
        
        prod_status = current.get("prod_status", "접수")
        pay_status = current.get("pay_status", "미청구")
        deliv_status = current.get("deliv_status") or "예약 필요"
    
        if pay_status == "입금 완료" and ("paid_amount" not in data or paid_amount == 0):
            subtotal = (quote_amount or 0) + (model_fee or 0) + (post_process_fee or 0) + (shipping_fee or 0)
            total = int(subtotal * 1.1) if tax_type == "과세" else subtotal
            paid_amount = total
            current["paid_amount"] = paid_amount
        elif pay_status in ["미청구", "견적 발송", "입금 대기"] and "paid_amount" not in data:
            paid_amount = 0
            current["paid_amount"] = paid_amount
    
        total_amount, unpaid_amount = calculate_amounts(quote_amount, shipping_fee, model_fee, post_process_fee, tax_type, paid_amount)
        overall_status = "완료" if (prod_status == "제작 완료" and pay_status == "입금 완료" and deliv_status == "배송 완료") else "진행 중"
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
        next_version = current_version + 1
        cursor.execute("""
        UPDATE projects SET
            client_name = ?,
            job_name = ?,
            channel = ?,
            material = ?,
            color = ?,
            quantity = ?,
            quote_amount = ?,
            shipping_fee = ?,
            model_fee = ?,
            post_process_fee = ?,
            tax_type = ?,
            total_amount = ?,
            paid_amount = ?,
            unpaid_amount = ?,
            prod_status = ?,
            pay_status = ?,
            deliv_status = ?,
            overall_status = ?,
            due_date = ?,
            phone = ?,
            address = ?,
            detail_address = ?,
            zipcode = ?,
            box_type = ?,
            tracking_no = ?,
            courier = ?,
            partner_id = ?,
            contact_name = ?,
            tracking_status_text = ?,
            tracking_latest_date = ?,
            tracking_latest_time = ?,
            tracking_latest_location = ?,
            tracking_checked_at = ?,
            memo = ?,
            request_notes = ?,
            version = ?,
            updated_at = ?
        WHERE project_no = ?
        """, (
            current["client_name"], current["job_name"], current["channel"],
            current["material"], current["color"], current["quantity"],
            quote_amount, shipping_fee, model_fee, post_process_fee, tax_type,
            total_amount, paid_amount, unpaid_amount,
            prod_status, pay_status, deliv_status, overall_status,
            current["due_date"], current["phone"], current["address"],
            current["detail_address"], current["zipcode"], current["box_type"],
            current["tracking_no"], current["courier"],
            current.get("partner_id"),
            current.get("contact_name", ""),
            current.get("tracking_status_text"), current.get("tracking_latest_date"),
            current.get("tracking_latest_time"), current.get("tracking_latest_location"),
            current.get("tracking_checked_at"), current["memo"], current["request_notes"],
            next_version, now_str, project_no
        ))
        enqueue_job("upsert", project_no, {"source": "project_mutation"}, conn=conn)
        conn.commit()
    
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    warnings = []
    try:
        process_pending_sync_jobs(limit=5, project_no=project_no)
    except Exception:
        warnings.append("projection_sync_failed")
    result = get_project_by_no(project_no)
    result["sync_pending"] = bool(count_open_jobs(project_no=project_no))
    result["warnings"] = warnings
    return result

def update_status(project_no, status_type, status_val, *, expected_version=None):
    """
    status_type: 'prod_status', 'pay_status', 'deliv_status'
    """
    valid_map = {
        "prod_status": PROD_STATUSES,
        "pay_status": PAY_STATUSES,
        "deliv_status": DELIV_STATUSES
    }
    if status_type not in valid_map:
        raise ValueError(f"Invalid status type: {status_type}")
    if status_val not in valid_map[status_type]:
        raise ValueError(f"Invalid status value '{status_val}' for {status_type}")
        
    return update_project_in_db(project_no, {status_type: status_val}, expected_version=expected_version)

def delete_project_from_db_and_fs(project_no, delete_files=True):
    """
    프로젝트 삭제:
    1. DB (projects, project_items) 삭제
    2. 파일시스템 프로젝트 폴더 삭제 (옵션)
    3. 운영대장 엑셀에서 해당 행 삭제
    """
    project = get_project_by_no(project_no)
    if not project:
        raise ValueError("Project not found")
    project_path = project.get("project_path")
    warnings = []
    cleanup_pending = False

    if delete_files and project_path:
        candidate = Path(project_path)
        roots = [Path(PROJECTS_DIR), Path(COMPLETED_DIR)]
        if candidate.is_symlink():
            raise ValueError("프로젝트 경로가 안전하지 않습니다.")
        try:
            canonical = candidate.resolve(strict=candidate.exists())
            canonical_roots = [root.resolve(strict=False) for root in roots]
            if any(canonical == root for root in canonical_roots):
                raise ValueError("프로젝트 경로가 안전하지 않습니다.")
            if not any(root == canonical or root in canonical.parents for root in canonical_roots):
                raise ValueError("프로젝트 경로가 안전하지 않습니다.")
        except FileNotFoundError:
            raise ValueError("프로젝트 경로를 확인할 수 없습니다.")

    # 1. 같은 파일시스템 안의 격리 휴지통으로 원자적 이동한다.
    staged_path = None
    if delete_files and project_path and os.path.exists(project_path):
        allowed_root = next(
            root.resolve(strict=False)
            for root in (Path(PROJECTS_DIR), Path(COMPLETED_DIR))
            if root.resolve(strict=False) == canonical or root.resolve(strict=False) in canonical.parents
        )
        trash_dir = allowed_root / ".project_trash"
        trash_dir.mkdir(parents=True, exist_ok=True)
        staged_path = trash_dir / f"{_validate_project_no(project_no)}_{uuid.uuid4().hex}"
        os.replace(project_path, staged_path)

    # 2. DB commit 전에 실패하면 격리 폴더를 원래 위치로 복구한다.
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM project_items WHERE project_no = ?", (project_no,))
        cursor.execute("DELETE FROM projects WHERE project_no = ?", (project_no,))
        enqueue_job("delete", project_no, {}, conn=conn)
        conn.commit()
    except Exception:
        conn.rollback()
        if staged_path is not None and os.path.exists(staged_path):
            try:
                os.replace(staged_path, project_path)
            except Exception as restore_error:
                raise OSError("프로젝트 삭제 실패 후 원래 폴더 복구에 실패했습니다.") from restore_error
        raise
    finally:
        conn.close()

    # 3. DB 삭제가 확정된 뒤 격리 폴더를 제거한다. 실패해도 논리 삭제 성공을 반환하되 경고한다.
    if staged_path is not None:
        try:
            shutil.rmtree(staged_path)
            if os.path.lexists(staged_path):
                raise OSError("프로젝트 격리 폴더 삭제가 완료되지 않았습니다.")
        except Exception as exc:
            print(f"Warning removing staged project folder {staged_path}: {exc}")
            cleanup_pending = True
            warnings.append("프로젝트 폴더가 격리 휴지통에 남아 있어 후속 정리가 필요합니다.")
        trash_dir = staged_path.parent
        if not cleanup_pending and trash_dir.exists():
            try:
                if not any(trash_dir.iterdir()):
                    trash_dir.rmdir()
            except Exception as exc:
                cleanup_pending = True
                warnings.append("격리 휴지통 폴더를 정리하지 못했습니다.")

    try:
        process_pending_sync_jobs(limit=5, project_no=project_no)
    except Exception:
        warnings.append("projection_sync_failed")
    warnings = list(dict.fromkeys(warnings))

    return {
        "project_no": project_no,
        "deleted": True,
        "files_deleted": staged_path is not None,
        "cleanup_pending": cleanup_pending,
        "warnings": warnings,
        "sync_pending": bool(count_open_jobs(project_no=project_no)),
    }
