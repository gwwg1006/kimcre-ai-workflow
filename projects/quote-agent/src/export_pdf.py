import xlwings as xw
import os
import shutil
import uuid
import argparse

SANDBOX_DIR_PRIMARY = os.path.expanduser("~/Library/Containers/com.microsoft.Excel/Data/tmp")
SANDBOX_DIR_FALLBACK = os.path.expanduser("~/Library/Group Containers/UBF8T346G9.Office")

def get_sandbox_dir():
    for d in [SANDBOX_DIR_PRIMARY, SANDBOX_DIR_FALLBACK]:
        try:
            os.makedirs(d, exist_ok=True)
            if os.path.exists(d) and os.access(d, os.W_OK):
                return d
        except Exception:
            continue
    return "/tmp"

def export_to_pdf(excel_path, pdf_path=None):
    """
    엑셀 파일을 macOS 샌드박스 임시 폴더로 복사한 뒤, Excel 앱을 백그라운드로 실행하여 PDF로 내보냅니다.
    이 방식은 macOS 권한 팝업(Grant Access 다이얼로그)이 전혀 발생하지 않으며,
    엑셀 템플릿의 서식/배치/도장/수식을 100% 동일하게 PDF로 변환합니다.
    """
    excel_path = os.path.abspath(excel_path)
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Excel file not found: {excel_path}")
    
    if pdf_path is None:
        pdf_path = os.path.splitext(excel_path)[0] + ".pdf"
    else:
        pdf_path = os.path.abspath(pdf_path)

    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)

    sandbox_dir = get_sandbox_dir()
    unique_id = uuid.uuid4().hex
    temp_excel_path = os.path.join(sandbox_dir, f"temp_{unique_id}.xlsx")
    temp_pdf_path = os.path.join(sandbox_dir, f"temp_{unique_id}.pdf")

    # 1. 샌드박스 폴더로 엑셀 복사
    shutil.copy2(excel_path, temp_excel_path)

    # 2. 엑셀 앱을 백그라운드로 실행
    app = xw.App(visible=False, add_book=False)
    wb = None
    
    try:
        wb = app.books.open(temp_excel_path)
        wb.to_pdf(temp_pdf_path)
        wb.close()
        wb = None
        
        if os.path.exists(temp_pdf_path) and os.path.getsize(temp_pdf_path) > 0:
            shutil.copy2(temp_pdf_path, pdf_path)
            print(f"SUCCESS: {pdf_path}")
            return pdf_path
        else:
            raise RuntimeError("PDF export failed or output is empty.")
        
    except Exception as e:
        print(f"ERROR: {e}")
        raise e
        
    finally:
        if wb is not None:
            try:
                wb.close()
            except Exception:
                pass
        try:
            app.quit()
        except Exception:
            pass
        if os.path.exists(temp_excel_path):
            try:
                os.remove(temp_excel_path)
            except Exception:
                pass
        if os.path.exists(temp_pdf_path):
            try:
                os.remove(temp_pdf_path)
            except Exception:
                pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="엑셀 파일을 PDF로 변환합니다.")
    parser.add_argument("--file", required=True, help="변환할 엑셀 파일 경로")
    parser.add_argument("--output", help="저장할 PDF 파일 경로 (선택)")
    args = parser.parse_args()
    
    export_to_pdf(args.file, args.output)

