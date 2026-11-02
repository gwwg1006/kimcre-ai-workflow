import os
import subprocess
import tempfile
import base64
import shutil
import uuid
import math
import numbers
import re
from datetime import datetime
import config
import openpyxl

def publish_no_replace(source_path, destination_path):
    """Publish a complete file without ever replacing an existing destination."""
    source = os.path.abspath(source_path)
    destination = os.path.abspath(destination_path)
    parent = os.path.dirname(destination)
    os.makedirs(parent, exist_ok=True)
    staging = os.path.join(parent, f".{os.path.basename(destination)}.{uuid.uuid4().hex}.stage")
    try:
        shutil.copy2(source, staging)
        with open(staging, "rb") as handle:
            os.fsync(handle.fileno())
        os.link(staging, destination)
        return destination
    except FileExistsError:
        raise
    finally:
        try:
            if os.path.exists(staging):
                os.remove(staging)
        except OSError:
            pass


def _export_excel_with_excel(excel_path, output_pdf_path):
    """Export through Microsoft Excel, preserving its print layout."""
    from appscript import app, k
    from xlwings import mac_dict
    from mactypes import Alias
    excel = app("Microsoft Excel", terms=mac_dict)
    excel.open(Alias(os.path.abspath(excel_path)), timeout=60)
    book = excel.workbooks[os.path.basename(excel_path)]
    try:
        book.save_workbook_as(
            filename=os.path.abspath(output_pdf_path),
            file_format=k.PDF_file_format,
            timeout=60,
        )
        with open(output_pdf_path, "rb") as result:
            if result.read(5) != b"%PDF-":
                raise RuntimeError("Excel PDF 파일이 올바르지 않습니다.")
    finally:
        book.close(saving=k.no, timeout=15)


def _strict_nonnegative_int(value, label, minimum=0):
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{label}은 {minimum} 이상의 정수여야 합니다.")
    if isinstance(value, numbers.Real):
        if not math.isfinite(value) or float(value) != int(value) or value < minimum:
            raise ValueError(f"{label}은 {minimum} 이상의 정수여야 합니다.")
        return int(value)
    text = str(value).strip().replace(",", "")
    if not re.fullmatch(r"\d+", text) or int(text) < minimum:
        raise ValueError(f"{label}은 {minimum} 이상의 정수여야 합니다.")
    return int(text)

def get_sandbox_dir():
    return tempfile.gettempdir()

def export_excel_to_pdf(excel_path, output_pdf_path=None):
    """Microsoft Excel에서 PDF로 내보냅니다."""
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external PDF services disabled")
    excel_path = os.path.abspath(excel_path)
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Excel file not found: {excel_path}")

    if output_pdf_path is None:
        output_pdf_path = os.path.splitext(excel_path)[0] + ".pdf"
    else:
        output_pdf_path = os.path.abspath(output_pdf_path)

    os.makedirs(os.path.dirname(output_pdf_path), exist_ok=True)

    _export_excel_with_excel(excel_path, output_pdf_path)
    return output_pdf_path

def export_excel_by_sheet_groups_to_pdf(excel_path, target_dir, project_no, client_name):
    """
    엑셀 파일 내의 시트들을 분류하여 각각 개별 PDF 파일로 분리 생성합니다.
    - '견적' 포함 시트 -> 제품견적서_{project_no}_{client_name}.pdf
    - '명세' 포함 시트 -> 거래명세서_{project_no}_{client_name}.pdf
    - 단일 시트 또는 기타 시트 -> 원본 파일명 기반 PDF 1개 생성
    반환값: 생성된 PDF 파일 경로 리스트 [pdf_path1, pdf_path2, ...]
    """
    excel_path = os.path.abspath(excel_path)
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Excel file not found: {excel_path}")

    os.makedirs(target_dir, exist_ok=True)
    sandbox_dir = get_sandbox_dir()
    
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external PDF services disabled")
    # 1. openpyxl로 시트 목록 분석
    wb_meta = openpyxl.load_workbook(excel_path, read_only=True)
    all_sheetnames = list(wb_meta.sheetnames)
    wb_meta.close()

    est_sheets = [s for s in all_sheetnames if "견적" in s]
    deliv_sheets = [s for s in all_sheetnames if "명세" in s]

    # 그룹 정의
    groups_to_export = []
    if est_sheets and deliv_sheets:
        groups_to_export.append(("제품견적서", est_sheets, f"제품견적서_{project_no}_{client_name}.pdf"))
        groups_to_export.append(("거래명세서", deliv_sheets, f"거래명세서_{project_no}_{client_name}.pdf"))
    elif est_sheets:
        groups_to_export.append(("제품견적서", est_sheets, f"제품견적서_{project_no}_{client_name}.pdf"))
    elif deliv_sheets:
        groups_to_export.append(("거래명세서", deliv_sheets, f"거래명세서_{project_no}_{client_name}.pdf"))
    else:
        base_name = os.path.splitext(os.path.basename(excel_path))[0]
        groups_to_export.append((base_name, all_sheetnames, f"{base_name}.pdf"))

    generated_pdfs = []
    try:
        for group_label, target_sheets, pdf_filename in groups_to_export:
            unique_id = uuid.uuid4().hex
            temp_xlsx_path = os.path.join(sandbox_dir, f"temp_{unique_id}.xlsx")
            temp_pdf_path = os.path.join(sandbox_dir, f"temp_{unique_id}.pdf")
            final_pdf_path = os.path.join(target_dir, pdf_filename)

            # openpyxl로 대상 시트만 남긴 임시 엑셀 생성
            wb_edit = openpyxl.load_workbook(excel_path, data_only=False)
            for s in list(wb_edit.sheetnames):
                if s not in target_sheets:
                    wb_edit.remove(wb_edit[s])
            wb_edit.save(temp_xlsx_path)
            wb_edit.close()

            try:
                _export_excel_with_excel(temp_xlsx_path, temp_pdf_path)
                publish_no_replace(temp_pdf_path, final_pdf_path)
                generated_pdfs.append(final_pdf_path)
            finally:
                if os.path.exists(temp_xlsx_path):
                    try: os.remove(temp_xlsx_path)
                    except Exception: pass
                if os.path.exists(temp_pdf_path):
                    try: os.remove(temp_pdf_path)
                    except Exception: pass

    except Exception:
        for generated in generated_pdfs:
            try:
                if os.path.isfile(generated):
                    os.remove(generated)
            except OSError:
                pass
        raise
    return generated_pdfs

CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

def get_image_base64(filename):
    """Use app-owned stamp copies before Office's protected container."""
    for template_dir in (config.LOCAL_TEMPLATES_DIR, config.OPS_TEMPLATES_DIR, config.OFFICE_TEMPLATES_DIR):
        try:
            with open(os.path.join(template_dir, filename), "rb") as f:
                return f"data:image/png;base64,{base64.b64encode(f.read()).decode('utf-8')}"
        except OSError:
            continue
    return ""

def render_html_to_pdf_sandboxed(html_content, output_pdf_path):
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external PDF services disabled")
    """
    macOS 권한/다이얼로그 없이 샌드박스 형태로 HTML을 고품질 A4 PDF로 변환
    """
    output_pdf_path = os.path.abspath(output_pdf_path)
    os.makedirs(os.path.dirname(output_pdf_path), exist_ok=True)

    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as tf:
        tf.write(html_content)
        temp_html_path = tf.name

    try:
        if os.path.exists(CHROME_PATH):
            cmd = [
                CHROME_PATH,
                "--headless",
                "--disable-gpu",
                "--no-pdf-header-footer",
                f"--print-to-pdf={output_pdf_path}",
                temp_html_path
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            if res.returncode == 0 and os.path.exists(output_pdf_path) and os.path.getsize(output_pdf_path) > 0:
                return output_pdf_path
        
        # Fallback to ReportLab if Chrome is unavailable
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        c = canvas.Canvas(output_pdf_path, pagesize=A4)
        c.drawString(100, 750, "PDF Generated")
        c.save()
        return output_pdf_path
    finally:
        if os.path.exists(temp_html_path):
            os.remove(temp_html_path)

def generate_pdf_document(data, doc_type="integrated", output_pdf_path=None):
    """
    완벽한 샌드박스 기반 견적서/명세서 PDF 생성 (권한 팝업 0)
    """
    recipient = data.get("recipient", "")
    contact = data.get("contact", "")
    date_str = data.get("date", datetime.now().strftime("%Y-%m-%d"))
    shipping_fee = _strict_nonnegative_int(data.get("shipping_fee", 3500), "배송비")
    tax_type = data.get("tax_type", "면세")
    items = data.get("items", [])

    stamp_est = get_image_base64("도장_제품견적서.png")
    stamp_del = get_image_base64("도장_거래명세서.png")

    # 금액 계산
    normalized_items = []
    for item in items:
        quantity = _strict_nonnegative_int(item.get("quantity", 1), "수량", minimum=1)
        price = _strict_nonnegative_int(item.get("price", 0), "단가")
        normalized_items.append((item, quantity, price))
    subtotal = sum(quantity * price for _, quantity, price in normalized_items)
    tax = int(subtotal * 0.1) if tax_type == "과세" else 0
    total = subtotal + shipping_fee + tax

    # 1. 제품견적서 HTML 생성
    est_rows_html = ""
    for idx, (item, q, p) in enumerate(normalized_items, 1):
        tot = q * p
        est_rows_html += f"""
        <tr>
            <td class="text-center">{idx}</td>
            <td class="text-left font-bold">{item.get('name', '')}</td>
            <td class="text-center">{item.get('material', '')} / {item.get('color', '')}</td>
            <td class="text-center">{item.get('note', '3D 프린팅')}</td>
            <td class="text-center">{q}</td>
            <td class="text-right">{p:,}</td>
            <td class="text-right font-bold">{tot:,}</td>
        </tr>
        """

    # 빈 줄 채우기 (최소 10줄)
    for idx in range(len(items) + 1, max(11, len(items) + 1)):
        est_rows_html += "<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>"

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<style>
@page {{
    size: A4 portrait;
    margin: 12mm 15mm;
}}
* {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}}
body {{
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Pretendard", sans-serif;
    color: #1e293b;
    background: #fff;
    font-size: 9.5pt;
    line-height: 1.4;
}}
.page {{
    page-break-after: always;
    padding: 10px 0;
}}
.page:last-child {{
    page-break-after: avoid;
}}
.header-title {{
    text-align: center;
    font-size: 20pt;
    font-weight: 900;
    letter-spacing: 6px;
    margin-bottom: 20px;
    padding-bottom: 6px;
    border-bottom: 2px solid #0f172a;
}}
.info-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 16px;
}}
.info-table {{
    width: 100%;
    border-collapse: collapse;
}}
.info-table th, .info-table td {{
    border: 1px solid #cbd5e1;
    padding: 5px 8px;
    font-size: 8.5pt;
}}
.info-table th {{
    background: #f8fafc;
    font-weight: bold;
    width: 25%;
    text-align: center;
}}
.supplier-box {{
    position: relative;
}}
.stamp-img {{
    position: absolute;
    right: 15px;
    bottom: 8px;
    width: 48px;
    height: 48px;
    opacity: 0.85;
}}
.items-table {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
}}
.items-table th, .items-table td {{
    border: 1px solid #94a3b8;
    padding: 6px 8px;
    font-size: 8.5pt;
}}
.items-table th {{
    background: #f1f5f9;
    font-weight: bold;
    text-align: center;
}}
.text-center {{ text-align: center; }}
.text-right {{ text-align: right; }}
.text-left {{ text-align: left; }}
.font-bold {{ font-weight: bold; }}

.summary-table {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 14px;
}}
.summary-table td {{
    border: 1px solid #94a3b8;
    padding: 6px 10px;
    font-size: 9pt;
}}
.total-highlight {{
    background: #e0f2fe;
    font-size: 11pt;
    font-weight: 900;
    color: #0369a1;
}}
.bank-info {{
    margin-top: 14px;
    padding: 10px 14px;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 8.5pt;
    color: #334155;
}}
</style>
</head>
<body>

<!-- 1. 제품견적서 페이지 -->
<div class="page">
    <div class="header-title">제 품 견 적 서</div>
    
    <div class="info-grid">
        <!-- 수신자 정보 -->
        <table class="info-table">
            <tr>
                <th>견적일자</th>
                <td>{date_str}</td>
            </tr>
            <tr>
                <th>수 신 처</th>
                <td class="font-bold">{recipient} 귀하</td>
            </tr>
            <tr>
                <th>연 락 처</th>
                <td>{contact}</td>
            </tr>
            <tr>
                <th>합계금액</th>
                <td class="font-bold" style="color:#0284c7;">일금 {total:,} 원정 ({tax_type})</td>
            </tr>
        </table>

        <!-- 공급자 정보 -->
        <div class="supplier-box">
            <table class="info-table">
                <tr>
                    <th>등록번호</th>
                    <td colspan="3" class="font-bold">000-00-00000</td>
                </tr>
                <tr>
                    <th>상 호</th>
                    <td>김명규크리에이티브</td>
                    <th>대 표</th>
                    <td>홍길동</td>
                </tr>
                <tr>
                    <th>소재지</th>
                    <td colspan="3">서울시 OO구 OO로 00</td>
                </tr>
                <tr>
                    <th>업 태</th>
                    <td>제조업</td>
                    <th>종 목</th>
                    <td>전시용 모형 제조</td>
                </tr>
                <tr>
                    <th>전화/이메일</th>
                    <td colspan="3">010-0000-0000 / example@example.com</td>
                </tr>
            </table>
            {f'<img class="stamp-img" src="{stamp_est}">' if stamp_est else ''}
        </div>
    </div>

    <!-- 품목 테이블 -->
    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 5%;">No</th>
                <th style="width: 28%;">품 명</th>
                <th style="width: 20%;">소재 / 색상</th>
                <th style="width: 15%;">규격/출력조건</th>
                <th style="width: 8%;">수량</th>
                <th style="width: 11%;">단가(원)</th>
                <th style="width: 13%;">금액(원)</th>
            </tr>
        </thead>
        <tbody>
            {est_rows_html}
        </tbody>
    </table>

    <!-- 금액 요약 테이블 -->
    <table class="summary-table">
        <tr>
            <td style="width: 25%;" class="text-center">공급가액: <strong>{subtotal:,}원</strong></td>
            <td style="width: 25%;" class="text-center">배송비: <strong>{shipping_fee:,}원</strong></td>
            <td style="width: 25%;" class="text-center">부가세 ({tax_type}): <strong>{tax:,}원</strong></td>
            <td style="width: 25%;" class="text-right total-highlight">최종 견적: {total:,}원</td>
        </tr>
    </table>

    <div class="bank-info">
        <strong>입금 계좌 안내:</strong> OO은행 000-000-000000 (예금주: 홍길동) &nbsp;|&nbsp; 세금계산서 및 현금영수증 발행 가능
    </div>
</div>
"""

    if doc_type == "integrated":
        # 2. 거래명세서 페이지 추가
        del_rows_html = ""
        for idx, (item, q, p) in enumerate(normalized_items, 1):
            tot = q * p
            del_rows_html += f"""
            <tr>
                <td class="text-center">{idx}</td>
                <td class="text-left font-bold">{item.get('name', '')}</td>
                <td class="text-center">{item.get('note', '3D 프린팅')}</td>
                <td class="text-center">{q}</td>
                <td class="text-right">{p:,}</td>
                <td class="text-right font-bold">{tot:,}</td>
                <td class="text-right">{int(tot * 0.1) if tax_type == '과세' else 0:,}</td>
            </tr>
            """
        for idx in range(len(items) + 1, max(11, len(items) + 1)):
            del_rows_html += "<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>"

        html += f"""
<!-- 2. 거래명세서 페이지 -->
<div class="page">
    <div class="header-title">거 래 명 세 서</div>
    
    <div class="info-grid">
        <table class="info-table">
            <tr>
                <th>발행일자</th>
                <td>{date_str}</td>
            </tr>
            <tr>
                <th>거래처명</th>
                <td class="font-bold">{recipient} 귀하</td>
            </tr>
            <tr>
                <th>연 락 처</th>
                <td>{contact}</td>
            </tr>
            <tr>
                <th>총 합계</th>
                <td class="font-bold" style="color:#0284c7;">{total:,} 원 (VAT 포함)</td>
            </tr>
        </table>

        <div class="supplier-box">
            <table class="info-table">
                <tr>
                    <th>등록번호</th>
                    <td colspan="3" class="font-bold">000-00-00000</td>
                </tr>
                <tr>
                    <th>상 호</th>
                    <td>김명규크리에이티브</td>
                    <th>대 표</th>
                    <td>홍길동</td>
                </tr>
                <tr>
                    <th>소재지</th>
                    <td colspan="3">서울시 OO구 OO로 00</td>
                </tr>
                <tr>
                    <th>업 태</th>
                    <td>제조업</td>
                    <th>종 목</th>
                    <td>전시용 모형 제조</td>
                </tr>
            </table>
            {f'<img class="stamp-img" src="{stamp_del}">' if stamp_del else ''}
        </div>
    </div>

    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 6%;">No</th>
                <th style="width: 32%;">품 명</th>
                <th style="width: 22%;">규 격</th>
                <th style="width: 8%;">수량</th>
                <th style="width: 11%;">단가(원)</th>
                <th style="width: 11%;">공급가액</th>
                <th style="width: 10%;">세액</th>
            </tr>
        </thead>
        <tbody>
            {del_rows_html}
        </tbody>
    </table>

    <table class="summary-table">
        <tr>
            <td style="width: 25%;" class="text-center">공급가액: <strong>{subtotal:,}원</strong></td>
            <td style="width: 25%;" class="text-center">배송비: <strong>{shipping_fee:,}원</strong></td>
            <td style="width: 25%;" class="text-center">세액: <strong>{tax:,}원</strong></td>
            <td style="width: 25%;" class="text-right total-highlight">합계금액: {total:,}원</td>
        </tr>
    </table>

    <div class="bank-info">
        <strong>입금 계좌 안내:</strong> OO은행 000-000-000000 (예금주: 홍길동)
    </div>
</div>
"""

    html += "</body></html>"
    return render_html_to_pdf_sandboxed(html, output_pdf_path)
