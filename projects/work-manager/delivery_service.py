import os
import re
from urllib.parse import quote
from html.parser import HTMLParser
from urllib.request import Request, urlopen
import openpyxl
from db import get_db_connection
from project_service import update_project_in_db
from repositories.projects import get_project_by_no
import config


HANJIN_TRACKING_RESULT_URL = (
    "https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do"
    "?mCode=MN038&schLang=KR&wblnumText2={tracking_no}"
)

COURIER_ALIASES = {
    "한진": "한진택배", "한진택배": "한진택배", "hanjin": "한진택배", "kr_hanjin": "한진택배",
    "cj": "CJ대한통운", "cj대한통운": "CJ대한통운", "대한통운": "CJ대한통운", "koreaexpress": "CJ대한통운",
    "롯데": "롯데택배", "롯데택배": "롯데택배", "lotte": "롯데택배",
    "로젠": "로젠택배", "로젠택배": "로젠택배", "logen": "로젠택배",
    "우체국": "우체국택배", "우체국택배": "우체국택배", "epost": "우체국택배",
}


def normalize_courier(value, *, default=False):
    text = str(value or "").strip()
    if not text and default:
        return config.DEFAULT_COURIER
    if not text or len(text) > 40 or any(ord(ch) < 32 or ord(ch) == 127 for ch in text):
        raise ValueError("지원하지 않는 택배사입니다.")
    canonical = COURIER_ALIASES.get(text.casefold())
    if canonical is None:
        raise ValueError("지원하지 않는 택배사입니다.")
    return canonical


def normalize_tracking_no(value):
    """빈 값 또는 공백/하이픈을 제외한 10~14자리 숫자만 허용한다."""
    text = str(value or "").strip()
    if not text:
        return ""
    if any(ch not in "0123456789- \t" for ch in text):
        raise ValueError("운송장번호는 숫자 10~14자리여야 합니다.")
    normalized = text.replace("-", "").replace(" ", "").replace("\t", "")
    if not normalized.isdigit() or not 10 <= len(normalized) <= 14:
        raise ValueError("운송장번호는 숫자 10~14자리여야 합니다.")
    return normalized


def get_tracking_url(courier, tracking_no):
    """지원하는 택배사의 공식 배송조회 URL을 생성한다."""
    try:
        normalized = normalize_tracking_no(tracking_no)
    except ValueError:
        # Legacy rows may contain short or non-numeric values.  Presentation
        # must remain safe even though new writes are strict.
        return ""
    try:
        courier_key = normalize_courier(courier, default=True)
    except ValueError:
        return ""
    if not normalized:
        return ""
    if courier_key == "한진택배":
        return HANJIN_TRACKING_RESULT_URL.format(tracking_no=quote(normalized, safe=""))
    return ""


def attach_tracking_url(project):
    """프로젝트 응답에 DB에 저장하지 않는 공식 조회 링크를 추가한다."""
    if project is None:
        return project
    project["tracking_url"] = get_tracking_url(project.get("courier"), project.get("tracking_no"))
    return project


class _HanjinTextParser(HTMLParser):
    """한진 결과 페이지에서 화면 텍스트만 추출하는 최소 파서."""

    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        text = " ".join(data.split())
        if text:
            self.parts.append(text)

    @property
    def text(self):
        return " ".join(self.parts)


def _map_hanjin_delivery_status(text):
    """한진 화면 문구를 작업관리웹의 배송 상태로 보수적으로 매핑한다."""
    if any(keyword in text for keyword in ("배송완료", "배달완료")):
        return "배송 완료"
    if any(keyword in text for keyword in ("배송출발", "배송 터미널 도착", "배송터미널도착", "상품이동중", "이동중", "배송중", "간선상차")):
        return "발송"
    if any(keyword in text for keyword in ("집하", "터미널입고", "상품접수", "상품 접수")):
        return "발송"
    return ""


_HANJIN_PROGRESS_DATETIME = re.compile(r"(?P<date>\d{4}-\d{2}-\d{2})\s+(?P<time>\d{2}:\d{2})")
_PHONE_IN_PARENS = re.compile(r"\s*\([^)]*\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}[^)]*\)")


def _parse_latest_hanjin_progress(progress_text):
    """한진 진행 표에서 가장 최신 이력의 시각·위치·전체 문구를 분리한다."""
    matches = list(_HANJIN_PROGRESS_DATETIME.finditer(progress_text))
    if not matches:
        return {}

    latest = matches[-1]
    row_text = progress_text[latest.end():].strip()
    description_start = next(
        (index for index in (row_text.find(marker) for marker in ("고객님", "상품", "배송", "배달", "간선")) if index >= 0),
        -1,
    )
    if description_start >= 0:
        location = row_text[:description_start].strip()
        description = row_text[description_start:].strip()
    else:
        # 한진 화면은 "분당 터미널 분당터미널에서 ..."처럼 위치 뒤에
        # 고객/상품 키워드 없이 진행 문구를 붙이는 경우가 있다.
        location_match = re.match(r"(?P<location>.+?(?:터미널|영업소|대리점|센터|\(집\)))\s+", row_text)
        location = location_match.group("location").strip() if location_match else ""
        description = row_text[location_match.end():].strip() if location_match else row_text
    description = _PHONE_IN_PARENS.sub("", description).strip()
    description = re.sub(r"\s+(에서|으로|에게|부터|까지|은|는|이|가|을|를|에|의|로|와|과|도|만)", r"\1", description)
    description = re.sub(r"(으로|에서|로|에)(이동|입고|출고|도착|배송|배달|집하)", r"\1 \2", description)

    return {
        "date": latest.group("date"),
        "time": latest.group("time"),
        "location": location,
        "description": description,
    }


def query_hanjin_tracking(tracking_no):
    """한진 공식 결과 페이지를 조회해 최신 화면 문구와 표준 상태를 반환한다."""
    if config.DISABLE_EXTERNAL_SERVICES:
        raise RuntimeError("external delivery services disabled")
    normalized = normalize_tracking_no(tracking_no)
    if not normalized:
        raise ValueError("운송장번호가 필요합니다.")

    url = get_tracking_url("한진택배", normalized)
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 (KMC Work Manager)"})
    try:
        with urlopen(request, timeout=10) as response:
            raw_html = response.read()
            encoding = response.headers.get_content_charset() or "utf-8"
    except Exception as exc:
        raise RuntimeError(f"한진 배송조회에 연결하지 못했습니다: {exc}") from exc

    parser = _HanjinTextParser()
    parser.feed(raw_html.decode(encoding, errors="replace"))
    page_text = parser.text
    if normalized not in page_text:
        raise RuntimeError("한진 조회 결과에서 운송장번호를 확인하지 못했습니다.")

    progress_text = page_text
    if "배송 진행상황" in page_text:
        progress_text = page_text.split("배송 진행상황", 1)[1]
    if "현지 배송진행" in progress_text:
        progress_text = progress_text.split("현지 배송진행", 1)[0]

    latest_progress = _parse_latest_hanjin_progress(progress_text)
    status_text = latest_progress.get("description", "")
    if not status_text:
        for phrase in (
            "배송완료", "배달완료", "배송출발", "배송 터미널 도착", "배송터미널도착",
            "상품이동중", "배송중", "간선상차", "터미널입고", "상품을 집하하여", "상품을 접수하였습니다"
        ):
            if phrase in progress_text:
                status_text = phrase
                break

    return {
        "courier": "한진택배",
        "tracking_no": normalized,
        "tracking_url": url,
        "status_text": status_text,
        "deliv_status": _map_hanjin_delivery_status(status_text or progress_text),
        "latest_progress": latest_progress,
    }

def get_pending_deliveries():
    """
    배송 예약 또는 발송이 필요한 프로젝트 목록
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT * FROM projects
        WHERE deliv_status IN ('예약 필요', '예약 완료', '발송')
        ORDER BY CASE deliv_status
            WHEN '예약 필요' THEN 1
            WHEN '예약 완료' THEN 2
            WHEN '발송' THEN 3
            ELSE 4 END, due_date ASC, project_no DESC
        """)
        return [attach_tracking_url(dict(r)) for r in cursor.fetchall()]
    finally:
        conn.close()

def format_logii_address(project):
    """
    로지아이 또는 스마트스토어 등 택배 예약 시스템용 표준 복사 텍스트 포맷 생성
    """
    name = project.get("client_name", "")
    phone = project.get("phone", "")
    zipcode = project.get("zipcode", "")
    address = project.get("address", "")
    detail = project.get("detail_address", "")
    full_address = f"{address} {detail}".strip()
    box_type = project.get("box_type", "A")
    item_name = project.get("job_name", "3D 프린팅 시제품")
    
    # 1줄 요약 클립보드 포맷
    single_line = f"{name}\t{phone}\t{zipcode}\t{address}\t{detail}\t{box_type}\t{item_name}"
    
    # 상세 보기 텍스트
    formatted_block = f"""[수령인] {name}
[연락처] {phone}
[우편번호] {zipcode}
[주소] {full_address}
[물품명] {item_name}
[박스크기] {box_type}타입 (극소형/소형)"""

    return {
        "single_line": single_line,
        "formatted_block": formatted_block,
        "name": name,
        "phone": phone,
        "full_address": full_address,
        "box_type": box_type,
        "item_name": item_name
    }

def update_delivery_info(project_no, data, *, trusted_tracking=False):
    """
    운송장번호, 택배사, 배송상태 업데이트
    """
    update_data = {}
    if "expected_version" in data:
        update_data["expected_version"] = data["expected_version"]
    if "tracking_no" in data:
        update_data["tracking_no"] = normalize_tracking_no(data["tracking_no"])
    if "courier" in data:
        update_data["courier"] = normalize_courier(data["courier"], default=True)
    tracking_result_fields = (
        "tracking_status_text", "tracking_latest_date", "tracking_latest_time",
        "tracking_latest_location", "tracking_checked_at",
    )
    # 운송장 또는 택배사를 직접 바꾸면 이전 조회 이력을 먼저 지운다.
    if "tracking_no" in data or "courier" in data:
        update_data.update({field: None for field in tracking_result_fields})
    for field in tracking_result_fields:
        if trusted_tracking and field in data:
            update_data[field] = data[field]
    if "deliv_status" in data:
        update_data["deliv_status"] = data["deliv_status"]
    if "box_type" in data:
        update_data["box_type"] = data["box_type"]
    if "address" in data:
        update_data["address"] = data["address"]
    if "detail_address" in data:
        update_data["detail_address"] = data["detail_address"]
    if "phone" in data:
        update_data["phone"] = data["phone"]

    return update_project_in_db(project_no, update_data)
