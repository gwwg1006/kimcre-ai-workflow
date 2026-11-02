import os
import sys
import shutil
import json
import math
import numbers
import re
import importlib
import logging
import uuid
from datetime import datetime
import config
import unicodedata
from project_path_policy import resolve_project_root, ProjectPathPolicyError

# 견적서(에이전트) src 경로 추가
ESTIMATE_SRC_DIR = None if config.E2E_MODE else os.path.expanduser("~/사업/견적서(에이전트)/src")
if ESTIMATE_SRC_DIR and ESTIMATE_SRC_DIR not in sys.path:
    sys.path.insert(0, ESTIMATE_SRC_DIR)

from pdf_service import export_excel_to_pdf, export_excel_by_sheet_groups_to_pdf, generate_pdf_document, publish_no_replace
from project_service import update_project_in_db
from repositories.projects import get_project_by_no
from file_service import project_batch_lock


def _strict_nonnegative_int(value, label):
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{label}은 0 이상의 정수여야 합니다.")
    if isinstance(value, numbers.Real):
        if not math.isfinite(value) or float(value) != int(value) or value < 0:
            raise ValueError(f"{label}은 0 이상의 정수여야 합니다.")
        return int(value)
    text = str(value).strip().replace(",", "")
    if not re.fullmatch(r"\d+", text):
        raise ValueError(f"{label}은 0 이상의 정수여야 합니다.")
    return int(text)


def _load_estimate_core():
    try:
        core = importlib.import_module("create_estimate")
        core.TEMPLATE_DIR = config.LOCAL_TEMPLATES_DIR
        return core
    except ImportError as exc:
        raise RuntimeError("견적 생성 모듈을 사용할 수 없습니다. 견적서(에이전트) 설치를 확인해 주세요.") from exc


def _safe_filename_component(value):
    cleaned = unicodedata.normalize("NFKC", str(value or ""))
    cleaned = re.sub(r"[\x00-\x1f\x7f/\\]+", "_", cleaned).strip(" .")
    cleaned = cleaned[:80].strip(" .")
    return cleaned or "고객"


def _available_document_stem(target_dir, doc_type, project_no, client_name):
    prefix = "통합견적명세서" if doc_type == "integrated" else ("제품견적서" if doc_type == "estimate" else "거래명세서")
    safe_client = _safe_filename_component(client_name)
    index = 1
    while True:
        suffix = "" if index == 1 else f"_v{index:02d}"
        stem_client = f"{safe_client}{suffix}"
        names = [f"{prefix}_{project_no}_{stem_client}.xlsx"]
        if doc_type == "integrated":
            names += [f"통합견적명세서_{project_no}_{stem_client}.pdf", f"제품견적서_{project_no}_{stem_client}.pdf", f"거래명세서_{project_no}_{stem_client}.pdf"]
        else:
            names += [f"{prefix}_{project_no}_{stem_client}.pdf"]
        if not any(os.path.exists(os.path.join(target_dir, name)) for name in names):
            return stem_client
        index += 1

def _generate_estimate_and_pdf(project_no, estimate_data, doc_type="integrated", convert_pdf=True):
    """
    견적서 및 거래명세서 엑셀 생성 -> Microsoft Excel PDF 내보내기 -> 05_견적거래 저장 -> 결제상태/품목 업데이트
    """
    if doc_type not in {"integrated", "estimate", "delivery"}:
        raise ValueError("지원하지 않는 견적 문서 유형입니다.")
    if not isinstance(project_no, str) or not re.fullmatch(r"\d{6}-\d{3,}", project_no):
        raise ValueError("프로젝트 번호 형식이 올바르지 않습니다.")
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external estimate services disabled")
    project = get_project_by_no(project_no)
    if not project:
        raise ValueError(f"Project not found: {project_no}")

    try:
        project_path = str(resolve_project_root(project.get("project_path")))
    except ProjectPathPolicyError as exc:
        raise ValueError("프로젝트 경로를 사용할 수 없습니다.") from exc

    # 데이터 구성
    client_name = estimate_data.get("recipient") or project["client_name"]
    date_str = estimate_data.get("date") or datetime.now().strftime("%Y-%m-%d")
    contact = estimate_data.get("contact") or project.get("phone", "")
    address = estimate_data.get("address") or f"{project.get('address', '')} {project.get('detail_address', '')}".strip()
    shipping_fee = _strict_nonnegative_int(estimate_data.get("shipping_fee") if estimate_data.get("shipping_fee") is not None else project.get("shipping_fee", 3500), "배송비")
    shipping_method = estimate_data.get("shipping_method", "택배")
    tax_type = estimate_data.get("tax_type", project.get("tax_type", "면세"))

    # 품목 리스트
    raw_items = estimate_data.get("items", [])
    items = []
    total_item_amount = 0
    for idx, it in enumerate(raw_items, 1):
        q = _strict_nonnegative_int(it.get("quantity", 1), "수량")
        if q < 1:
            raise ValueError("수량은 1 이상의 정수여야 합니다.")
        p = _strict_nonnegative_int(it.get("price", 0), "단가")
        total_item_amount += (q * p)
        items.append({
            "code": f"P{idx:02d}",
            "name": it.get("name", f"품목 {idx}"),
            "quantity": q,
            "material": it.get("material", project.get("material", "PLA")),
            "color": it.get("color", project.get("color", "White")),
            "note": it.get("note", "3D 프린팅"),
            "price": p
        })

    payload = {
        "recipient": client_name,
        "contact": contact,
        "contact_person": client_name,
        "email": estimate_data.get("email", ""),
        "address": address,
        "shipping_method": shipping_method,
        "shipping_fee": shipping_fee,
        "date": date_str,
        "tax_type": tax_type,
        "items": items
    }

    # 1. 엑셀 생성 (openpyxl 기반 순수 파이썬 생성, Excel 앱 구동 X)
    excel_path = None
    estimate_core = _load_estimate_core()
    if doc_type == "integrated":
        excel_path = estimate_core.create_integrated_document(payload)
    elif doc_type == "estimate":
        excel_path = estimate_core.create_product_estimate(payload)
    elif doc_type == "delivery":
        excel_path = estimate_core.create_delivery_note(payload)
    else:
        raise ValueError("지원하지 않는 견적 문서 유형입니다.")

    # 2. 결과물을 프로젝트의 05_견적거래 폴더로 이동/복사
    target_dir = os.path.join(project_path, "05_견적거래")
    os.makedirs(target_dir, exist_ok=True)
    
    file_client_name = _available_document_stem(target_dir, doc_type, project_no, client_name)
    excel_filename = f"{'통합견적명세서' if doc_type=='integrated' else ('제품견적서' if doc_type=='estimate' else '거래명세서')}_{project_no}_{file_client_name}.xlsx"
    final_excel_path = os.path.join(target_dir, excel_filename)
    excel_published = False
    excel_stage = f"{final_excel_path}.{uuid.uuid4().hex}.tmp"
    try:
        shutil.copy2(excel_path, excel_stage)
        publish_no_replace(excel_stage, final_excel_path)
        excel_published = True
    except Exception as exc:
        try:
            if os.path.isfile(excel_stage):
                os.remove(excel_stage)
        except OSError:
            pass
        raise RuntimeError("견적서 엑셀 산출물을 저장하지 못했습니다.") from exc

    # 3. 샌드박스 Excel -> 각각 분리된 개별 PDF 변환 (제품견적서.pdf, 거래명세서.pdf 각각 생성)
    final_pdf_paths = []
    if convert_pdf:
        try:
            final_pdf_paths = export_excel_by_sheet_groups_to_pdf(
                final_excel_path, target_dir, project_no, file_client_name
            )
        except Exception:
            logging.getLogger(__name__).exception("Microsoft Excel PDF export failed")
            final_pdf_paths = []

        expected_pdf_count = 2 if doc_type == "integrated" else 1
        final_pdf_paths = [p for p in final_pdf_paths if os.path.isfile(p) and os.path.getsize(p) > 0]
        if len(final_pdf_paths) != expected_pdf_count:
            cleanup_candidates = [*final_pdf_paths]
            if excel_published:
                cleanup_candidates.append(final_excel_path)
            for output in cleanup_candidates:
                try:
                    if output and os.path.isfile(output):
                        os.remove(output)
                except OSError:
                    pass
            raise RuntimeError("PDF 산출물을 완성하지 못했습니다.")

    # 4. 품목·프로젝트 금액을 한 transaction으로 갱신
    update_result = None
    try:
        update_result = update_project_in_db(project_no, {
            "quote_amount": total_item_amount,
            "shipping_fee": shipping_fee,
            "tax_type": tax_type,
            "pay_status": "견적 발송",
            "items": [{"name": it["name"], "quantity": it["quantity"], "material": it["material"], "color": it["color"], "unit_price": it["price"], "note": it["note"]} for it in items],
        }, expected_version=estimate_data.get("expected_version"))
        if update_result is None:
            raise RuntimeError("프로젝트 견적 상태를 저장하지 못했습니다.")
    except Exception:
        # Only this request's collision-free outputs are eligible for cleanup.
        cleanup_candidates = list(final_pdf_paths)
        if excel_published:
            cleanup_candidates.append(final_excel_path)
        for output in cleanup_candidates:
            try:
                if output and os.path.isfile(output):
                    os.remove(output)
            except OSError:
                pass
        raise
    primary_pdf = final_pdf_paths[0] if final_pdf_paths else None

    return {
        "excel_path": final_excel_path,
        "excel_filename": excel_filename,
        "pdf_paths": final_pdf_paths,
        "pdf_filenames": [os.path.basename(p) for p in final_pdf_paths],
        "pdf_path": primary_pdf,
        "pdf_filename": os.path.basename(primary_pdf) if primary_pdf else None,
        "quote_amount": total_item_amount,
        "shipping_fee": shipping_fee
    }


def generate_estimate_and_pdf(project_no, estimate_data, doc_type="integrated", convert_pdf=True):
    """Serialize output selection and publication for one project."""
    with project_batch_lock(project_no, lock_root=config.DATA_DIR):
        return _generate_estimate_and_pdf(project_no, estimate_data, doc_type, convert_pdf)
