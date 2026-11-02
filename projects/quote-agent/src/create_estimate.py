import openpyxl
import os
import json
import argparse
from datetime import datetime
from openpyxl.styles import Font, Alignment
from copy import copy

# 템플릿 파일 경로 (Office 원본 및 로컬 복사본)
TEMPLATE_DIR = os.path.expanduser("~/Library/Group Containers/UBF8T346G9.Office/User Content.localized/Templates.localized")
OUTPUT_DIR = os.path.expanduser("~/사업/견적서(에이전트)/출력파일")

def find_template(filename="통합견적명세서_템플릿.xltx"):
    search_paths = [
        os.path.join(TEMPLATE_DIR, filename),
        os.path.join(os.path.expanduser("~/사업/작업관리웹/templates_excel"), filename),
        os.path.join(os.path.expanduser("~/사업/00_운영/템플릿"), filename),
        os.path.join(os.path.expanduser("~/사업/견적서(에이전트)/templates"), filename),
    ]
    for p in search_paths:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"Template not found: {filename} in any template search path")

def apply_print_setup(sheet):
    # A4 용지 및 세로 방향 설정
    sheet.page_setup.orientation = sheet.ORIENTATION_PORTRAIT
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    
    # 1페이지 안에 딱 맞춰서 출력되도록 스케일링 설정
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 1
    
    # 명시적으로 인쇄 영역을 잡아야 여백이 늘어나서 작아지는 버그를 막을 수 있습니다.
    if "제품견적서" in sheet.title:
        sheet.print_area = f"'{sheet.title}'!$B$2:$AF$39"
    elif "거래명세서" in sheet.title:
        sheet.print_area = f"'{sheet.title}'!$A$1:$L$38"

def create_delivery_note(data):
    try:
        template_path = find_template("거래명세서_김명규크리에이티브_.xltx")
    except FileNotFoundError:
        template_path = find_template("통합견적명세서_템플릿.xltx")
        
    wb = openpyxl.load_workbook(template_path, data_only=False)
    wb.template = False # 일반 xlsx 파일로 저장하도록 설정
    
    if "거래명세서" in wb.sheetnames:
        src_sheet = wb["거래명세서"]
        if "제품견적서" in wb.sheetnames:
            wb.remove(wb["제품견적서"])
    else:
        src_sheet = wb.active
    
    # 1. 헤더 정보 및 기본 데이터 추출
    date_str = data.get("date", datetime.now().strftime("%Y-%m-%d"))
    recipient = data.get("recipient", "")
    contact_person = data.get("contact_person", "")
    shipping_fee = data.get("shipping_fee", 3500)
    tax_type = data.get("tax_type", "면세")
    is_taxable = (tax_type == "과세")
    items = data.get("items", [])
    
    # 규격 열 너비 계산
    max_spec_width = 15.0
    for item in items:
        spec_text = item.get("note", "")
        if spec_text:
            char_width = sum(2 if ord(char) > 127 else 1.2 for char in str(spec_text))
            needed_width = char_width + 4.0
            if needed_width > max_spec_width:
                max_spec_width = needed_width
    half_width = max_spec_width / 2.0

    # 청크 분할 (16개 단위)
    chunks = [items[i:i+16] for i in range(0, max(1, len(items)), 16)]
    
    for page_idx, chunk in enumerate(chunks):
        page_num = page_idx + 1
        sheet = wb.copy_worksheet(src_sheet)
        for img in src_sheet._images:
            sheet.add_image(copy(img), img.anchor)
        sheet.title = f"거래명세서_{page_num}"
        apply_print_setup(sheet)
        
        sheet.column_dimensions['F'].width = half_width
        sheet.column_dimensions['G'].width = half_width
        
        sheet["D3"] = date_str
        sheet["D4"] = recipient
        sheet["D6"] = f"{contact_person} 귀하" if contact_person else f"{recipient} 귀하"
        sheet["B7"] = "총 합계\n(VAT 포함)" if is_taxable else "총 합계\n(면세)"
        
        for idx in range(16):
            r = 11 + idx
            if idx < len(chunk):
                item = chunk[idx]
                del_sheet = sheet
                del_sheet[f"B{r}"] = page_idx * 16 + idx + 1
                del_sheet[f"B{r}"].font = Font(name='맑은 고딕', size=9, bold=True, color='000000')
                del_sheet[f"B{r}"].alignment = Alignment(horizontal='center', vertical='center')
                del_sheet[f"C{r}"] = item.get("name", "")
                sheet[f"F{r}"] = item.get("note", "3D 프린팅")
                sheet[f"H{r}"] = item.get("quantity", 0)
                sheet[f"I{r}"] = item.get("price", 0)
                sheet[f"J{r}"] = f"=H{r}*I{r}"
                sheet[f"K{r}"] = f"=J{r}*10%" if is_taxable else 0
            else:
                sheet[f"B{r}"] = None
                sheet[f"C{r}"] = None
                sheet[f"F{r}"] = None
                sheet[f"H{r}"] = None
                sheet[f"I{r}"] = None
                sheet[f"J{r}"] = None
                sheet[f"K{r}"] = None

        current_shipping_fee = shipping_fee if page_num == len(chunks) else 0
        sheet["I32"] = current_shipping_fee
        sheet["H32"] = 1 if current_shipping_fee > 0 else 0
        sheet["J32"] = "=I32*H32"
        sheet["K32"] = "=J32*0.1" if is_taxable else 0
        
        sheet["J33"] = "=SUM(J11:J32)"
        sheet["K33"] = "=SUM(K11:K32)" if is_taxable else 0
        sheet["D7"] = "=J33+K33"
        
    wb.remove(src_sheet)
    
    # 저장 파일명 생성
    safe_recipient = "".join([c for c in recipient if c.isalnum() or c in (' ', '_', '-')]).strip()
    date_clean = date_str.replace("-", "")
    output_filename = f"거래명세서_{safe_recipient}_{date_clean}.xlsx"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    wb.save(output_path)
    wb.close()
    return output_path

def create_product_estimate(data):
    try:
        template_path = find_template("제품견적서_김명규 크리에이티브_최종.xltx")
    except FileNotFoundError:
        template_path = find_template("통합견적명세서_템플릿.xltx")
        
    wb = openpyxl.load_workbook(template_path, data_only=False)
    wb.template = False # 일반 xlsx 파일로 저장하도록 설정
    
    if "제품견적서" in wb.sheetnames:
        src_sheet = wb["제품견적서"]
        if "거래명세서" in wb.sheetnames:
            wb.remove(wb["거래명세서"])
    else:
        src_sheet = wb.active
    
    # 1. 헤더 정보 추출
    date_str = data.get("date", datetime.now().strftime("%Y-%m-%d"))
    recipient = data.get("recipient", "")
    contact = data.get("contact", "")
    email = data.get("email", "")
    address = data.get("address", "")
    shipping_method = data.get("shipping_method", "택배")
    shipping_fee = data.get("shipping_fee", 3500)
    tax_type = data.get("tax_type", "면세")
    is_taxable = (tax_type == "과세")
    items = data.get("items", [])
    
    # 청크 분할 (16개 단위)
    chunks = [items[i:i+16] for i in range(0, max(1, len(items)), 16)]
    
    for page_idx, chunk in enumerate(chunks):
        page_num = page_idx + 1
        sheet = wb.copy_worksheet(src_sheet)
        for img in src_sheet._images:
            sheet.add_image(copy(img), img.anchor)
        sheet.title = f"제품견적서_{page_num}"
        apply_print_setup(sheet)
        
        sheet["D5"] = date_str
        sheet["D6"] = recipient
        sheet["K6"] = contact
        sheet["D7"] = email
        sheet["D8"] = address
        sheet["D10"] = shipping_method
        
        current_shipping_fee = shipping_fee if page_num == len(chunks) else 0
        sheet["K10"] = current_shipping_fee
        
        for idx in range(16):
            r = 15 + idx
            if idx < len(chunk):
                item = chunk[idx]
                sheet[f"B{r}"] = item.get("code", "")
                sheet[f"E{r}"] = item.get("name", "")
                sheet[f"J{r}"] = item.get("quantity", 0)
                sheet[f"M{r}"] = item.get("material", "")
                sheet[f"Q{r}"] = item.get("color", "")
                sheet[f"T{r}"] = item.get("note", "")
                sheet[f"Y{r}"] = item.get("price", 0)
                sheet[f"AB{r}"] = f"=Y{r}*J{r}"
            else:
                # 빈 셀 처리
                sheet[f"B{r}"] = None
                sheet[f"E{r}"] = None
                sheet[f"J{r}"] = None
                sheet[f"M{r}"] = None
                sheet[f"Q{r}"] = None
                sheet[f"T{r}"] = None
                sheet[f"Y{r}"] = None
                sheet[f"AB{r}"] = None
                
        sheet["J31"] = 1 if current_shipping_fee > 0 else 0
        sheet["Y31"] = current_shipping_fee
        sheet["AB31"] = "=Y31*J31"
        
        # 부가세 및 합계 수식 기입
        if is_taxable:
            sheet["E32"] = "부가세 (다)"
            sheet["J32"] = 1
            sheet["AB32"] = "=J33*0.1"
            sheet["B34"] = "판매가 (가+나+다)"
        else:
            sheet["E32"] = "부가세 (면세)"
            sheet["J32"] = 0
            sheet["AB32"] = 0
            sheet["B34"] = "판매가 (면세)"

        sheet["J33"] = "=SUM(AB15:AB31)"
        sheet["J34"] = "=AB32+J33"
        sheet["O12"] = "=J34"
        
    wb.remove(src_sheet)
    
    # 저장 파일명 생성
    safe_recipient = "".join([c for c in recipient if c.isalnum() or c in (' ', '_', '-')]).strip()
    date_clean = date_str.replace("-", "")
    output_filename = f"제품견적서_{safe_recipient}_{date_clean}.xlsx"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    wb.save(output_path)
    wb.close()
    return output_path

def create_integrated_document(data):
    template_path = find_template("통합견적명세서_템플릿.xltx")
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")
        
    wb = openpyxl.load_workbook(template_path, data_only=False)
    wb.template = False
    
    src_est = wb["제품견적서"]
    src_del = wb["거래명세서"]
    
    # 0. 데이터 준비
    date_str = data.get("date", datetime.now().strftime("%Y-%m-%d"))
    recipient = data.get("recipient", "")
    contact = data.get("contact", "")
    email = data.get("email", "")
    address = data.get("address", "")
    shipping_method = data.get("shipping_method", "택배")
    shipping_fee = data.get("shipping_fee", 3500)
    tax_type = data.get("tax_type", "면세")
    is_taxable = (tax_type == "과세")
    items = data.get("items", [])
    contact_person = data.get("contact_person", "")
    
    # 청크 분할 
    est_chunks = [items[i:i+16] for i in range(0, max(1, len(items)), 16)]
    del_chunks = [items[i:i+16] for i in range(0, max(1, len(items)), 16)]
    
    # 규격 열 너비 계산 (거래명세서 용)
    max_spec_width = 15.0
    for item in items:
        spec_text = item.get("note", "")
        if spec_text:
            char_width = sum(2 if ord(char) > 127 else 1.2 for char in str(spec_text))
            needed_width = char_width + 4.0
            if needed_width > max_spec_width:
                max_spec_width = needed_width
    half_width = max_spec_width / 2.0
    
    # 1. 제품견적서 시트 생성
    for page_idx, chunk in enumerate(est_chunks):
        page_num = page_idx + 1
        est_sheet = wb.copy_worksheet(src_est)
        for img in src_est._images:
            est_sheet.add_image(copy(img), img.anchor)
        est_sheet.title = f"제품견적서_{page_num}"
        apply_print_setup(est_sheet)
        
        # --- 제품견적서 기입 ---
        est_sheet["D5"] = date_str
        est_sheet["D6"] = recipient
        est_sheet["K6"] = contact
        est_sheet["D7"] = email
        est_sheet["D8"] = address
        est_sheet["D10"] = shipping_method
        
        current_shipping_fee = shipping_fee if page_num == len(est_chunks) else 0
        est_sheet["K10"] = current_shipping_fee
        est_sheet["J31"] = 1 if current_shipping_fee > 0 else 0
        est_sheet["Y31"] = current_shipping_fee
        est_sheet["AB31"] = "=Y31*J31"
        
        for idx in range(16):
            r = 15 + idx
            if idx < len(chunk):
                item = chunk[idx]
                est_sheet[f"B{r}"] = item.get("code", "")
                est_sheet[f"E{r}"] = item.get("name", "")
                est_sheet[f"J{r}"] = item.get("quantity", 0)
                est_sheet[f"M{r}"] = item.get("material", "")
                est_sheet[f"Q{r}"] = item.get("color", "")
                est_sheet[f"T{r}"] = item.get("note", "")
                est_sheet[f"Y{r}"] = item.get("price", 0)
                est_sheet[f"AB{r}"] = f"=Y{r}*J{r}"
            else:
                est_sheet[f"B{r}"] = None
                est_sheet[f"E{r}"] = None
                est_sheet[f"J{r}"] = None
                est_sheet[f"M{r}"] = None
                est_sheet[f"Q{r}"] = None
                est_sheet[f"T{r}"] = None
                est_sheet[f"Y{r}"] = None
                est_sheet[f"AB{r}"] = None
                
        if is_taxable:
            est_sheet["E32"] = "부가세 (다)"
            est_sheet["J32"] = 1
            est_sheet["AB32"] = "=J33*0.1"
            est_sheet["B34"] = "판매가 (가+나+다)"
        else:
            est_sheet["E32"] = "부가세 (면세)"
            est_sheet["J32"] = 0
            est_sheet["AB32"] = 0
            est_sheet["B34"] = "판매가 (면세)"

        est_sheet["J33"] = "=SUM(AB15:AB31)"
        est_sheet["J34"] = "=AB32+J33"
        est_sheet["O12"] = "=J34"
        
    # 2. 거래명세서 시트 생성
    for page_idx, chunk in enumerate(del_chunks):
        page_num = page_idx + 1
        del_sheet = wb.copy_worksheet(src_del)
        for img in src_del._images:
            del_sheet.add_image(copy(img), img.anchor)
        del_sheet.title = f"거래명세서_{page_num}"
        apply_print_setup(del_sheet)
        
        # --- 거래명세서 기입 ---
        del_sheet.column_dimensions['F'].width = half_width
        del_sheet.column_dimensions['G'].width = half_width
        
        del_sheet["D3"] = date_str
        del_sheet["D4"] = recipient
        del_sheet["D6"] = f"{contact_person} 귀하" if contact_person else f"{recipient} 귀하"
        del_sheet["B7"] = "총 합계\n(VAT 포함)" if is_taxable else "총 합계\n(면세)"
        
        for idx in range(16):
            r = 11 + idx
            if idx < len(chunk):
                item = chunk[idx]
                del_sheet[f"B{r}"] = page_idx * 16 + idx + 1
                del_sheet[f"B{r}"].font = Font(name='맑은 고딕', size=9, bold=True, color='000000')
                del_sheet[f"B{r}"].alignment = Alignment(horizontal='center', vertical='center')
                del_sheet[f"C{r}"] = item.get("name", "")
                del_sheet[f"F{r}"] = item.get("note", "3D 프린팅")
                del_sheet[f"H{r}"] = item.get("quantity", 0)
                del_sheet[f"I{r}"] = item.get("price", 0)
                del_sheet[f"J{r}"] = f"=H{r}*I{r}"
                del_sheet[f"K{r}"] = f"=J{r}*10%" if is_taxable else 0
            else:
                del_sheet[f"B{r}"] = None
                del_sheet[f"C{r}"] = None
                del_sheet[f"F{r}"] = None
                del_sheet[f"H{r}"] = None
                del_sheet[f"I{r}"] = None
                del_sheet[f"J{r}"] = None
                del_sheet[f"K{r}"] = None
                
        current_shipping_fee = shipping_fee if page_num == len(del_chunks) else 0
        del_sheet["I32"] = current_shipping_fee
        del_sheet["H32"] = 1 if current_shipping_fee > 0 else 0
        del_sheet["J32"] = "=I32*H32"
        del_sheet["K32"] = "=J32*0.1" if is_taxable else 0
        
        del_sheet["J33"] = "=SUM(J11:J32)"
        del_sheet["K33"] = "=SUM(K11:K32)" if is_taxable else 0
        del_sheet["D7"] = "=J33+K33"

    # 원본 템플릿 시트 삭제
    wb.remove(src_est)
    wb.remove(src_del)
    
    # 4. 저장 파일명 생성
    safe_recipient = "".join([c for c in recipient if c.isalnum() or c in (' ', '_', '-')]).strip()
    date_clean = date_str.replace("-", "")
    output_filename = f"통합견적명세서_{safe_recipient}_{date_clean}.xlsx"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    wb.save(output_path)
    wb.close()
    return output_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create Estimate and Delivery Note Excel files from JSON data.")
    parser.add_argument("--type", choices=["estimate", "delivery", "integrated"], required=True, help="Document type: 'estimate', 'delivery' or 'integrated'")
    parser.add_argument("--data", type=str, help="JSON string of the document data")
    parser.add_argument("--file", type=str, help="Path to JSON file containing the document data")
    
    args = parser.parse_args()
    
    if args.data:
        data = json.loads(args.data)
    elif args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        raise ValueError("Either --data or --file must be provided.")
        
    if args.type == "delivery":
        path = create_delivery_note(data)
        print(f"SUCCESS:{path}")
    elif args.type == "estimate":
        path = create_product_estimate(data)
        print(f"SUCCESS:{path}")
    elif args.type == "integrated":
        path = create_integrated_document(data)
        print(f"SUCCESS:{path}")
