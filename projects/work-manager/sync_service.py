"""파일시스템·엑셀과 SQLite 운영대장 사이의 동기화 서비스."""
import os
import re
import math
import numbers
import tempfile
import shutil
import fcntl
import errno
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
import openpyxl
import config
from config import PROJECTS_DIR, OPERATIONS_FILE, DEFAULT_COURIER
from db import get_db_connection
from migrations import init_db
from repositories.partners import migrate_projects_to_partners
from repositories.projects import get_project_by_no
from projection_renderer import render_project_markdown
from project_path_policy import resolve_project_root, ProjectPathPolicyError

@contextmanager
def _projection_lock(timeout=30):
    lock_path = os.path.join(tempfile.gettempdir(), "luna-ai-sync-projection.lock")
    handle = open(lock_path, "a+", encoding="utf-8")
    deadline = time.monotonic() + max(0, float(timeout))
    try:
        while True:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError as exc:
                if exc.errno not in (errno.EACCES, errno.EAGAIN):
                    raise
                if time.monotonic() >= deadline:
                    raise TimeoutError("projection_lock_timeout")
                time.sleep(0.05)
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()

@contextmanager
def _lease_heartbeat(job_id, lease_token, lease_seconds=120):
    """Extend a claimed job while a blocking projection is running."""
    from repositories.sync_jobs import heartbeat
    stop = threading.Event()
    lost = threading.Event()
    thread = None
    interval = max(0.05, min(float(lease_seconds) / 3, 30.0))
    def run():
        while not stop.wait(interval):
            try:
                if not heartbeat(job_id, lease_token, lease_seconds):
                    lost.set(); return
            except Exception:
                lost.set(); return
    try:
        try:
            renewed = heartbeat(job_id, lease_token, lease_seconds)
        except Exception:
            renewed = False
        if not renewed:
            lost.set()
        thread = threading.Thread(target=run, name="sync-lease-heartbeat", daemon=True)
        thread.start()
        yield lost
    finally:
        stop.set()
        if thread is not None:
            thread.join(timeout=max(1.0, interval + 0.5))


class _LeaseLostBeforeProjection(RuntimeError):
    """Lease가 projection side effect 전에 사라진 경우."""

def calculate_amounts(quote_amount, shipping_fee, model_fee, post_process_fee, tax_type, paid_amount):
    subtotal = (quote_amount or 0) + (model_fee or 0) + (post_process_fee or 0) + (shipping_fee or 0)
    if tax_type == "과세":
        tax = int(subtotal * 0.1)
        total = subtotal + tax
    else:
        total = subtotal
    unpaid = max(0, total - (paid_amount or 0))
    return total, unpaid

def parse_markdown_info(md_path):
    """00_작업정보/작업정보.md 파싱"""
    if not os.path.exists(md_path):
        return {}
    data = {}
    with open(md_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.splitlines()
    for line in lines:
        line = line.strip()
        if line.startswith("- "):
            parts = line[2:].split(":", 1)
            if len(parts) == 2:
                key = parts[0].strip()
                val = parts[1].strip()
                data[key] = val
    return data


_MARKDOWN_AMOUNT_RE = re.compile(r"^\s*(?:(?:\d{1,3}(?:,\d{3})+)|\d+)\s*원?\s*$")


def parse_markdown_amount(value, default=None):
    """Parse one non-negative Markdown amount without joining embedded digits."""
    if value is None or not isinstance(value, str) or not value.strip():
        return default
    text = value.strip()
    if not _MARKDOWN_AMOUNT_RE.fullmatch(text):
        return default
    digits = text.replace(",", "").replace("원", "").strip()
    try:
        return int(digits)
    except (TypeError, ValueError, OverflowError):
        return default

def parse_quotation_excel(fpath):
    """
    05_견적거래 폴더의 견적서/명세서 엑셀 파일로부터 실제 품목명, 수량, 단가, 소재, 색상 파싱
    """
    if not os.path.exists(fpath):
        return None
    wb = None
    try:
        wb = openpyxl.load_workbook(fpath, data_only=True)
        items = []
        shipping_fee = 3500
        tax_type = "면세"

        sheet = None
        for sname in wb.sheetnames:
            if "견적서" in sname or "명세서" in sname:
                sheet = wb[sname]
                break
        if not sheet:
            sheet = wb.active
        if sheet is None:
            wb.close()
            return None

        header_row = -1
        for r in range(1, 20):
            row_vals = [str(sheet.cell(r, c).value or "") for c in range(1, sheet.max_column + 1)]
            if any("품명" in v for v in row_vals) or any("품    명" in v for v in row_vals):
                header_row = r
                break

        if header_row > 0:
            for r in range(header_row + 1, sheet.max_row + 1):
                name_val = sheet.cell(r, 5).value or sheet.cell(r, 3).value
                if not name_val:
                    continue
                name_str = str(name_val).strip()
                if not name_str or name_str in ["No", "합계", "합   계", "공급자", "비고"]:
                    continue
                if "배송비" in name_str:
                    fee = sheet.cell(r, 25).value or sheet.cell(r, 28).value or sheet.cell(r, 9).value or sheet.cell(r, 10).value
                    if fee is not None:
                        shipping_fee = _strict_excel_int(fee, "배송비")
                    continue
                if "부가세" in name_str or "판매가" in name_str:
                    if "(다)" in name_str or "가+나+다" in name_str or "과세" in name_str or "10%" in name_str or "VAT" in name_str:
                        tax_type = "과세"
                    elif "면세" in name_str:
                        tax_type = "면세"
                    continue
                if any(x in name_str for x in ["공급가", "판매가", "합계금액", "결제안내", "입금안내"]):
                    continue

                qty = sheet.cell(r, 10).value or sheet.cell(r, 8).value or 1
                mat = sheet.cell(r, 13).value or ""
                col = sheet.cell(r, 17).value or ""
                note = sheet.cell(r, 20).value or sheet.cell(r, 6).value or ""
                price = sheet.cell(r, 25).value or sheet.cell(r, 9).value or 0

                try:
                    qty = _strict_excel_int(qty, "수량")
                except (ValueError, TypeError):
                    qty = 1
                try:
                    price = _strict_excel_int(price, "단가")
                except (ValueError, TypeError):
                    price = 0

                if price > 0 or name_str:
                    items.append({
                        "name": name_str,
                        "quantity": qty,
                        "material": str(mat),
                        "color": str(col),
                        "note": str(note),
                        "unit_price": price,
                        "total": qty * price
                    })

        wb.close()
        subtotal = sum(it["total"] for it in items)
        if items:
            return {
                "items": items,
                "subtotal": subtotal,
                "shipping_fee": shipping_fee,
                "total_amount": subtotal + shipping_fee,
                "tax_type": tax_type
            }
    except Exception as e:
        print(f"Error parsing quotation Excel {fpath}: {e}")
    finally:
        if wb is not None:
            try:
                wb.close()
            except Exception:
                pass
    return None
def _strict_excel_int(value, label):
    if isinstance(value, bool) or value is None or value == "":
        raise ValueError(f"{label} 값이 올바르지 않습니다.")
    if isinstance(value, numbers.Real):
        if not math.isfinite(value) or float(value) != int(value):
            raise ValueError(f"{label} 값은 정수여야 합니다.")
        result = int(value)
        if result < 0:
            raise ValueError(f"{label} 값은 0 이상의 정수여야 합니다.")
        return result
    text = str(value).strip().replace(",", "")
    if not re.fullmatch(r"[+-]?\d+", text):
        raise ValueError(f"{label} 값은 정수여야 합니다.")
    result = int(text)
    if result < 0:
        raise ValueError(f"{label} 값은 0 이상의 정수여야 합니다.")
    return result


def _sync_from_filesystem_and_excel_impl():
    """
    기존 10_프로젝트 폴더들과 김명규크리에이티브_운영대장.xlsx 파일로부터 SQLite DB 동기화
    """
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. 운영대장 엑셀 파일 읽기
    excel_projects = {}
    excel_items = {}
    if os.path.exists(OPERATIONS_FILE):
        wb = None
        try:
            wb = openpyxl.load_workbook(OPERATIONS_FILE, data_only=True)
            if "작업대장" in wb.sheetnames:
                sheet = wb["작업대장"]
                headers = [sheet.cell(1, c).value for c in range(1, sheet.max_column + 1)]
                header_map = {str(h).strip(): c for c, h in enumerate(headers, 1) if h}
                
                for r in range(2, sheet.max_row + 1):
                    p_no = sheet.cell(r, header_map.get("프로젝트번호", 1)).value
                    if not p_no:
                        continue
                    p_no = str(p_no).strip()
                    
                    def get_val(name):
                        col = header_map.get(name)
                        if col:
                            v = sheet.cell(r, col).value
                            if isinstance(v, datetime):
                                return v.strftime("%Y-%m-%d")
                            return v
                        return None

                    excel_projects[p_no] = {
                        "project_no": p_no,
                        "received_date": get_val("접수일") or datetime.now().strftime("%Y-%m-%d"),
                        "client_name": get_val("고객명") or "",
                        "job_name": get_val("작업명") or "",
                        "channel": get_val("접수채널") or "카카오톡",
                        "material": get_val("소재") or "",
                        "color": get_val("색상") or "",
                        "quantity": str(get_val("수량") or "1"),
                        "quote_amount": _strict_excel_int(get_val("견적금액") or 0, "견적금액"),
                        "shipping_fee": _strict_excel_int(get_val("배송비") or 3500, "배송비"),
                        "prod_status": get_val("제작상태") or "접수",
                        "pay_status": get_val("결제상태") or "미청구",
                        "deliv_status": get_val("배송상태") or "예약 필요",
                        "overall_status": get_val("전체상태") or "진행 중",
                        "due_date": get_val("납기예정"),
                        "project_path": get_val("프로젝트경로"),
                        "original_files": get_val("원본파일"),
                        "slicing_file": get_val("3MF파일"),
                        "tracking_no": get_val("운송장번호"),
                        "memo": get_val("메모")
                    }

            if "품목상세" in wb.sheetnames:
                sheet = wb["품목상세"]
                headers = [sheet.cell(1, c).value for c in range(1, sheet.max_column + 1)]
                header_map = {str(h).strip(): c for c, h in enumerate(headers, 1) if h}
                
                for r in range(2, sheet.max_row + 1):
                    p_no = sheet.cell(r, header_map.get("프로젝트번호", 1)).value
                    if not p_no:
                        continue
                    p_no = str(p_no).strip()
                    
                    def get_item_val(name):
                        col = header_map.get(name)
                        return sheet.cell(r, col).value if col else None

                    item = {
                        "project_no": p_no,
                        "seq": _strict_excel_int(get_item_val("순번") or 1, "순번"),
                        "name": str(get_item_val("품목명") or ""),
                        "original_stl": str(get_item_val("원본 STL") or ""),
                        "quantity": _strict_excel_int(get_item_val("수량") or 1, "수량"),
                        "material": str(get_item_val("소재") or ""),
                        "color": str(get_item_val("색상") or ""),
                        "layer_height": float(get_item_val("레이어(mm)") or 0.2),
                        "wall_count": _strict_excel_int(get_item_val("벽 개수") or 3, "벽 개수"),
                        "infill_rate": float(get_item_val("채움률") or 0.2),
                        "status": str(get_item_val("공정상태") or "대기")
                    }
                    if p_no not in excel_items:
                        excel_items[p_no] = []
                    excel_items[p_no].append(item)
            wb.close()
        except Exception as e:
            print(f"Error reading Excel ledger: {e}")
        finally:
            if wb is not None:
                try:
                    wb.close()
                except Exception:
                    pass

    # 2. 파일 시스템 스캔 (10_프로젝트/<연도>/)
    fs_projects = {}
    fs_items = {}
    if os.path.exists(PROJECTS_DIR):
        for year in os.listdir(PROJECTS_DIR):
            year_path = os.path.join(PROJECTS_DIR, year)
            if not os.path.isdir(year_path) or year.startswith("."):
                continue
            for p_folder in os.listdir(year_path):
                folder_path = os.path.join(year_path, p_folder)
                if not os.path.isdir(folder_path) or p_folder.startswith("."):
                    continue
                
                parts = p_folder.split("_", 2)
                p_no = parts[0]
                client_name = parts[1] if len(parts) > 1 else ""
                job_name = parts[2] if len(parts) > 2 else ""

                # 00_작업정보/작업정보.md 파싱
                md_path = os.path.join(folder_path, "00_작업정보", "작업정보.md")
                md_data = parse_markdown_info(md_path)

                # 05_견적거래 폴더 내 견적서 엑셀 파싱
                quote_data = None
                est_folder = os.path.join(folder_path, "05_견적거래")
                if os.path.exists(est_folder):
                    for f in sorted(os.listdir(est_folder)):
                        if f.endswith(".xlsx") and not f.startswith("~$"):
                            q_res = parse_quotation_excel(os.path.join(est_folder, f))
                            if q_res and q_res.get("items"):
                                quote_data = q_res
                                break

                # 금액 결정
                raw_quote_amt = md_data.get("견적금액", "0")
                parsed_quote_amt = parse_markdown_amount(raw_quote_amt, default=0)
                shipping_fee = parse_markdown_amount(md_data.get("배송비", "3500"), default=3500)
                tax_type = "면세"

                if quote_data:
                    parsed_quote_amt = quote_data["subtotal"]
                    shipping_fee = quote_data["shipping_fee"]
                    tax_type = quote_data["tax_type"]
                    fs_items[p_no] = quote_data["items"]

                fs_projects[p_no] = {
                    "project_no": p_no,
                    "client_name": client_name or md_data.get("고객명", ""),
                    "job_name": job_name or md_data.get("작업명", ""),
                    "project_path": folder_path,
                    "received_date": md_data.get("접수일", f"20{p_no[:2]}-{p_no[2:4]}-{p_no[4:6]}" if len(p_no) >= 6 else datetime.now().strftime("%Y-%m-%d")),
                    "channel": md_data.get("접수채널", "카카오톡"),
                    "material": md_data.get("소재", ""),
                    "color": md_data.get("색상", ""),
                    "quantity": md_data.get("수량", "1"),
                    "quote_amount": parsed_quote_amt,
                    "shipping_fee": shipping_fee,
                    "tax_type": tax_type,
                    "prod_status": md_data.get("제작상태", "접수"),
                    "pay_status": md_data.get("결제상태", "미청구"),
                    "deliv_status": md_data.get("배송상태") or "예약 필요",
                    "due_date": md_data.get("납기안내") or md_data.get("납기"),
                    "address": md_data.get("배송주소", ""),
                    "request_notes": md_data.get("출력조건", "")
                }

    # 3. 데이터 병합 후 DB 저장
    all_keys = set(excel_projects.keys()).union(fs_projects.keys())
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for p_no in all_keys:
        p_excel = excel_projects.get(p_no, {})
        p_fs = fs_projects.get(p_no, {})
        
        client_name = p_fs.get("client_name") or p_excel.get("client_name") or "미지정"
        job_name = p_fs.get("job_name") or p_excel.get("job_name") or "신규작업"
        received_date = p_fs.get("received_date") or p_excel.get("received_date") or datetime.now().strftime("%Y-%m-%d")
        channel = p_fs.get("channel") or p_excel.get("channel") or "카카오톡"
        material = p_fs.get("material") or p_excel.get("material") or ""
        color = p_fs.get("color") or p_excel.get("color") or ""
        quantity = str(p_fs.get("quantity") or p_excel.get("quantity") or "1")
        
        # 파일시스템 05_견적거래 견적서 우선, 없으면 엑셀 대장
        quote_amount = int(p_fs.get("quote_amount") if p_fs.get("quote_amount") is not None and p_fs.get("quote_amount") > 0 else (p_excel.get("quote_amount") or 0))
        shipping_fee = int(p_fs.get("shipping_fee") if p_fs.get("shipping_fee") is not None else (p_excel.get("shipping_fee") or 3500))
        tax_type = p_fs.get("tax_type") or "면세"
        
        prod_status = p_excel.get("prod_status") or p_fs.get("prod_status") or "접수"
        pay_status = p_excel.get("pay_status") or p_fs.get("pay_status") or "미청구"
        deliv_status = p_excel.get("deliv_status") or p_fs.get("deliv_status") or "예약 필요"
        due_date = p_excel.get("due_date") or p_fs.get("due_date") or ""
        project_path = p_fs.get("project_path") or p_excel.get("project_path") or ""
        original_files = p_excel.get("original_files") or ""
        slicing_file = p_excel.get("slicing_file") or ""
        tracking_no = p_excel.get("tracking_no") or ""
        memo = p_excel.get("memo") or ""
        address = p_fs.get("address") or ""
        request_notes = p_fs.get("request_notes") or ""

        # 전체 완료 상태 판별
        if prod_status == "제작 완료" and pay_status == "입금 완료" and deliv_status == "배송 완료":
            overall_status = "완료"
        else:
            overall_status = "진행 중"

        total_amount, _ = calculate_amounts(quote_amount, shipping_fee, 0, 0, tax_type, 0)
        if pay_status == "입금 완료":
            paid_amount = total_amount
            unpaid_amount = 0
        else:
            paid_amount = 0
            unpaid_amount = total_amount

        cursor.execute("""
        INSERT INTO projects (
            project_no, received_date, client_name, job_name, channel,
            material, color, quantity, quote_amount, shipping_fee,
            model_fee, post_process_fee, tax_type, total_amount, paid_amount,
            unpaid_amount, prod_status, pay_status, deliv_status, overall_status,
            due_date, project_path, original_files, slicing_file, tracking_no,
            courier, phone, address, detail_address, zipcode, box_type,
            memo, request_notes, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            0, 0, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, '', ?, '', '', 'A',
            ?, ?, ?, ?
        ) ON CONFLICT(project_no) DO UPDATE SET
            received_date=excluded.received_date,
            client_name=excluded.client_name,
            job_name=excluded.job_name,
            channel=excluded.channel,
            material=excluded.material,
            color=excluded.color,
            quantity=excluded.quantity,
            quote_amount=excluded.quote_amount,
            shipping_fee=excluded.shipping_fee,
            tax_type=excluded.tax_type,
            total_amount=excluded.total_amount,
            prod_status=excluded.prod_status,
            pay_status=excluded.pay_status,
            deliv_status=excluded.deliv_status,
            overall_status=excluded.overall_status,
            due_date=excluded.due_date,
            project_path=excluded.project_path,
            original_files=excluded.original_files,
            slicing_file=excluded.slicing_file,
            tracking_no=excluded.tracking_no,
            memo=excluded.memo,
            address=COALESCE(projects.address, excluded.address),
            request_notes=COALESCE(projects.request_notes, excluded.request_notes),
            updated_at=excluded.updated_at
        """, (
            p_no, received_date, client_name, job_name, channel,
            material, color, quantity, quote_amount, shipping_fee,
            tax_type, total_amount, paid_amount,
            unpaid_amount, prod_status, pay_status, deliv_status, overall_status,
            due_date, project_path, original_files, slicing_file, tracking_no,
            DEFAULT_COURIER, address, memo, request_notes, now_str, now_str
        ))

        # 품목 등록: 05_견적거래 견적서 품목 우선 적용
        items_to_save = fs_items.get(p_no) or excel_items.get(p_no)
        if items_to_save:
            cursor.execute("DELETE FROM project_items WHERE project_no = ?", (p_no,))
            for idx, item in enumerate(items_to_save, 1):
                u_price = item.get("unit_price") or (quote_amount if len(items_to_save) == 1 else 0)
                cursor.execute("""
                INSERT INTO project_items (
                    project_no, seq, name, original_stl, quantity,
                    material, color, layer_height, wall_count, infill_rate,
                    unit_price, status, note
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    p_no, item.get("seq", idx), item["name"], item.get("original_stl", f"{item['name']}.stl"),
                    item.get("quantity", 1), item.get("material", material), item.get("color", color),
                    item.get("layer_height", 0.2), item.get("wall_count", 3), item.get("infill_rate", 0.2),
                    u_price, item.get("status", "견적 완료"), item.get("note", "")
                ))

    migrate_projects_to_partners(cursor)
    conn.commit()
    conn.close()


def sync_from_filesystem_and_excel():
    """Run the legacy importer with an outer rollback/close guard."""
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external ledger services disabled")
    holder = {}
    original_get = get_db_connection

    def tracked_connection():
        conn = original_get()
        holder["conn"] = conn
        return conn

    globals()["get_db_connection"] = tracked_connection
    try:
        return _sync_from_filesystem_and_excel_impl()
    except Exception:
        conn = holder.get("conn")
        if conn is not None:
            try:
                conn.rollback()
            finally:
                conn.close()
        raise
    finally:
        globals()["get_db_connection"] = original_get
def sync_project_to_excel_ledger(project_no):
    """
    특정 프로젝트의 최신 정보를 김명규크리에이티브_운영대장.xlsx에 반영
    """
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external ledger services disabled")
    if not os.path.exists(OPERATIONS_FILE):
        return False
        
    project = get_project_by_no(project_no)
    if not project:
        raise ValueError("project_not_found")

    wb = None
    try:
        wb = openpyxl.load_workbook(OPERATIONS_FILE)
        if "작업대장" in wb.sheetnames:
            sheet = wb["작업대장"]
            headers = [sheet.cell(1, c).value for c in range(1, sheet.max_column + 1)]
            header_map = {str(h).strip(): c for c, h in enumerate(headers, 1) if h}

            target_row = None
            for r in range(2, sheet.max_row + 1):
                cell_val = sheet.cell(r, header_map.get("프로젝트번호", 1)).value
                if cell_val and str(cell_val).strip() == project_no:
                    target_row = r
                    break

            if target_row is None:
                target_row = sheet.max_row + 1

            def set_val(col_name, val):
                col = header_map.get(col_name)
                if col:
                    sheet.cell(target_row, col, value=val)

            set_val("프로젝트번호", project["project_no"])
            set_val("접수일", project["received_date"])
            set_val("고객명", project["client_name"])
            set_val("작업명", project["job_name"])
            set_val("접수채널", project["channel"])
            set_val("소재", project["material"])
            set_val("색상", project["color"])
            set_val("수량", project["quantity"])
            set_val("견적금액", project["quote_amount"])
            set_val("배송비", project["shipping_fee"])
            set_val("제작상태", project["prod_status"])
            set_val("결제상태", project["pay_status"])
            set_val("배송상태", project["deliv_status"])
            set_val("전체상태", project["overall_status"])
            set_val("납기예정", project["due_date"])
            set_val("프로젝트경로", project["project_path"])
            set_val("원본파일", project["original_files"])
            set_val("3MF파일", project["slicing_file"])
            set_val("운송장번호", project["tracking_no"])
            set_val("메모", project["memo"])

            _save_workbook_atomic(wb, OPERATIONS_FILE)
            return True
    finally:
        if wb is not None:
            try:
                wb.close()
            except Exception:
                pass


def remove_project_from_excel_ledger(project_no):
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external ledger services disabled")
    if not os.path.exists(OPERATIONS_FILE):
        return False
    wb = None
    try:
        wb = openpyxl.load_workbook(OPERATIONS_FILE)
        if "작업대장" not in wb.sheetnames:
            return False
        sheet = wb["작업대장"]
        headers = [sheet.cell(1, c).value for c in range(1, sheet.max_column + 1)]
        header_map = {str(h).strip(): c for c, h in enumerate(headers, 1) if h}
        p_col = header_map.get("프로젝트번호", 1)
        for row in range(2, sheet.max_row + 1):
            if str(sheet.cell(row, p_col).value or "").strip() == project_no:
                sheet.delete_rows(row, 1)
                _save_workbook_atomic(wb, OPERATIONS_FILE)
                return True
        return False
    finally:
        if wb is not None:
            wb.close()


def _save_workbook_atomic(workbook, target_path):
    directory = os.path.dirname(os.path.abspath(target_path)) or "."
    fd, temp_path = tempfile.mkstemp(prefix=".sync-", suffix=".xlsx", dir=directory)
    os.close(fd)
    original_mode = None
    try:
        original_mode = os.stat(target_path).st_mode & 0o777
    except FileNotFoundError:
        pass
    try:
        workbook.save(temp_path)
        if original_mode is not None:
            os.chmod(temp_path, original_mode)
        os.replace(temp_path, target_path)
        temp_path = None
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


def _projection_markdown(project):
    """Use the dependency-neutral canonical project markdown renderer."""
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM project_items WHERE project_no = ? ORDER BY seq", (project["project_no"],)).fetchall()
        items = [dict(row) for row in rows]
    finally:
        conn.close()
    table = ""
    if items:
        table = "\n### 세부 출력 품목 내역\n\n| 번호 | 품명 / 파일명 | 소재 | 색상 | 수량 | 단가 | 합계 | 비고 |\n|---|---|---|---|---|---|---|---|\n"
        for idx, item in enumerate(items, 1):
            qty = int(item.get("quantity") or 1)
            price = int(item.get("unit_price") or 0)
            table += f"| {idx} | {item.get('name') or '-'} | {item.get('material') or '-'} | {item.get('color') or '-'} | {qty} | {price:,}원 | {qty * price:,}원 | {item.get('note') or ''} |\n"
    values = dict(project)
    values.setdefault("total_quantity", values.get("quantity", "1"))
    return render_project_markdown(project["project_no"], project["client_name"], project["job_name"], values, table)


def sync_project_projections(project_no):
    project = get_project_by_no(project_no)
    if not project:
        raise ValueError("project_not_found")
    try:
        project_path = str(resolve_project_root(project.get("project_path")))
    except ProjectPathPolicyError as exc:
        raise ValueError("project_path_invalid") from exc
    md_dir = os.path.join(project_path, "00_작업정보")
    os.makedirs(md_dir, exist_ok=True)
    target = os.path.join(md_dir, "작업정보.md")
    fd, temp_path = tempfile.mkstemp(prefix=".작업정보.", suffix=".tmp", dir=md_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(_projection_markdown(project))
        os.replace(temp_path, target)
        temp_path = None
        sync_project_to_excel_ledger(project_no)
        return {"project_no": project_no, "operation": "upsert"}
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


def process_pending_sync_jobs(limit=20, retry_failed=False, project_no=None):
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external ledger services disabled")
    from repositories.sync_jobs import (claim_next, mark_done, mark_failed,
                                        reset_failed_jobs, count_open_jobs, LEASE_SECONDS)
    if retry_failed:
        reset_failed_jobs(project_no=project_no)
    bounded_limit = max(1, min(int(limit), 100))
    summary = {"processed": 0, "succeeded": 0, "failed": 0, "superseded": 0, "remaining": 0}
    for _ in range(bounded_limit):
        job = claim_next(project_no=project_no, owner=f"sync:{os.getpid()}")
        if not job:
            break
        lease_token = job.get("lease_token")
        summary["processed"] += 1
        projection_completed = False
        superseded = False
        try:
            if job["operation"] == "upsert":
                with _projection_lock():
                    with _lease_heartbeat(job["id"], lease_token, LEASE_SECONDS) as lost:
                        if lost.is_set(): raise _LeaseLostBeforeProjection("lease_lost")
                        sync_project_projections(job["project_no"])
                        projection_completed = True
                        superseded = lost.is_set()
            elif job["operation"] == "delete":
                with _projection_lock():
                    with _lease_heartbeat(job["id"], lease_token, LEASE_SECONDS) as lost:
                        if lost.is_set(): raise _LeaseLostBeforeProjection("lease_lost")
                        remove_project_from_excel_ledger(job["project_no"])
                        projection_completed = True
                        superseded = lost.is_set()
            else:
                raise ValueError("unsupported_operation")
            if projection_completed:
                done = mark_done(job["id"], lease_token)
                if superseded or not done:
                    # Side effect completed, but the lease was lost or another
                    # worker owns the token. Never mark that worker failed.
                    superseded = True
            if superseded:
                summary["superseded"] += 1
            else:
                summary["succeeded"] += 1
        except ValueError as exc:
            mark_failed(job["id"], "projection_not_found" if str(exc) == "project_not_found" else "projection_failed", lease_token)
            summary["failed"] += 1
        except _LeaseLostBeforeProjection:
            # Leave the expired processing row untouched so the next owner can
            # reclaim it; no projection side effect has started.
            summary["superseded"] += 1
        except Exception as exc:
            code = str(exc) if str(exc) in {"projection_lock_timeout", "lease_lost"} else "projection_failed"
            mark_failed(job["id"], code, lease_token)
            summary["failed"] += 1
    summary["remaining"] = count_open_jobs(project_no=project_no)
    return summary
