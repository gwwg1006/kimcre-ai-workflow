import os

# 기본 경로 설정. 환경변수는 명시적으로 지정한 경우에만 운영 기본값을 대체한다.
_DEFAULT_BASE_DIR = os.path.expanduser("~/사업")
_E2E_MODE = os.environ.get("KMC_E2E_MODE", "").strip() == "1"
E2E_MODE = _E2E_MODE
DISABLE_EXTERNAL_SERVICES = _E2E_MODE or os.environ.get("KMC_DISABLE_EXTERNAL_SERVICES", "").strip().lower() in {"1", "true", "yes", "on"}


def _env_path(name, default):
    value = os.environ.get(name)
    return os.path.abspath(value) if value and value.strip() else default


def _env_int(name, default, minimum, maximum):
    value = os.environ.get(name, "").strip()
    if not value:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return min(maximum, max(minimum, parsed))


BASE_DIR = _env_path("KMC_BASE_DIR", _DEFAULT_BASE_DIR)
PROJECTS_DIR = _env_path("KMC_PROJECTS_DIR", os.path.join(BASE_DIR, "10_프로젝트"))
COMPLETED_DIR = _env_path("KMC_COMPLETED_DIR", os.path.join(BASE_DIR, "20_완료"))
OPERATIONS_FILE = _env_path("KMC_OPERATIONS_FILE", os.path.join(BASE_DIR, "00_운영", "김명규크리에이티브_운영대장.xlsx"))
# 템플릿 경로 설정 (Office 원본 및 로컬 복사본)
OFFICE_TEMPLATES_DIR = os.path.expanduser("~/Library/Group Containers/UBF8T346G9.Office/User Content.localized/Templates.localized")
APP_DIR = os.path.join(BASE_DIR, "작업관리웹")
LOCAL_TEMPLATES_DIR = os.path.join(APP_DIR, "templates_excel")
OPS_TEMPLATES_DIR = os.path.join(BASE_DIR, "00_운영", "템플릿")

def get_template_path(filename="통합견적명세서_템플릿.xltx"):
    # 1. Office 원본 경로 우선
    office_p = os.path.join(OFFICE_TEMPLATES_DIR, filename)
    if _E2E_MODE:
        return os.path.join(LOCAL_TEMPLATES_DIR, filename)
    if os.path.exists(office_p):
        return office_p
    # 2. 작업관리웹 로컬 사본
    local_p = os.path.join(LOCAL_TEMPLATES_DIR, filename)
    if os.path.exists(local_p):
        return local_p
    # 3. 운영 템플릿 사본
    ops_p = os.path.join(OPS_TEMPLATES_DIR, filename)
    if os.path.exists(ops_p):
        return ops_p
    return office_p

# 웹앱 전용 데이터베이스 및 업로드 경로
DATA_DIR = _env_path("KMC_DATA_DIR", os.path.join(APP_DIR, "data"))
DB_PATH = _env_path("KMC_DB_PATH", os.path.join(DATA_DIR, "app.db"))
AI_PENDING_DIR = os.path.join(DATA_DIR, "ai_pending")


def _validate_e2e_paths():
    if not _E2E_MODE:
        return
    base = os.path.realpath(BASE_DIR)
    home = os.path.realpath(os.path.expanduser("~"))
    if not os.environ.get("KMC_BASE_DIR") or base in {"/", home, os.path.realpath(_DEFAULT_BASE_DIR)}:
        raise RuntimeError("KMC_E2E_MODE requires a dedicated non-production KMC_BASE_DIR")
    mutable = {
        "PROJECTS_DIR": PROJECTS_DIR,
        "COMPLETED_DIR": COMPLETED_DIR,
        "DATA_DIR": DATA_DIR,
    }
    leaves = {name: os.path.realpath(path) for name, path in mutable.items()}
    for name, path in leaves.items():
        if path == base or os.path.commonpath((base, path)) != base:
            raise RuntimeError(f"{name} must be a distinct child of KMC_BASE_DIR in E2E mode")
    leaf_paths = tuple(leaves.values())
    for index, left in enumerate(leaf_paths):
        for right in leaf_paths[index + 1:]:
            if os.path.commonpath((left, right)) in {left, right}:
                raise RuntimeError("PROJECTS_DIR, COMPLETED_DIR, and DATA_DIR must not overlap in E2E mode")

    operations = os.path.realpath(OPERATIONS_FILE)
    operations_parent = os.path.realpath(os.path.dirname(OPERATIONS_FILE))
    if os.path.commonpath((base, operations_parent)) != base:
        raise RuntimeError("OPERATIONS_FILE must be inside KMC_BASE_DIR in E2E mode")
    if any(os.path.commonpath((operations, leaf)) in {operations, leaf} for leaf in leaf_paths):
        raise RuntimeError("OPERATIONS_FILE must not overlap an E2E data directory")

    db_path = os.path.realpath(DB_PATH)
    if os.path.commonpath((leaves["DATA_DIR"], db_path)) != leaves["DATA_DIR"]:
        raise RuntimeError("DB_PATH must be inside DATA_DIR in E2E mode")
    if db_path == operations:
        raise RuntimeError("DB_PATH and OPERATIONS_FILE must be different in E2E mode")
    for name, path in {"OPERATIONS_FILE": operations, "DB_PATH": db_path}.items():
        if path == base or os.path.commonpath((base, path)) != base:
            raise RuntimeError(f"{name} must be contained by KMC_BASE_DIR in E2E mode")


_validate_e2e_paths()
AI_PLAN_TTL_SECONDS = 30 * 60
AI_PLAN_MAX_FILES = 20
AI_PLAN_MAX_FILE_BYTES = 25 * 1024 * 1024
AI_PLAN_MAX_TOTAL_BYTES = 100 * 1024 * 1024
AI_PLAN_ALLOWED_EXTENSIONS = frozenset({
    ".3mf", ".csv", ".jpeg", ".jpg", ".pdf", ".png", ".stl", ".step", ".stp", ".webp", ".xlsx",
})

# AI runtime profiles. Fast/structured defaults are overridable without code changes.
AI_MODEL = os.environ.get("KMC_AI_MODEL", "gemini-3.8-flash-low").strip()
AI_FALLBACK_MODEL = os.environ.get("KMC_AI_FALLBACK_MODEL", "gemini-3.7-flash-low").strip()
AI_AGENT = os.environ.get("KMC_AI_AGENT", "kmc-operations").strip()
AI_REASONING_EFFORT = os.environ.get("KMC_AI_REASONING_EFFORT", "low").strip().lower()
if AI_REASONING_EFFORT not in {"low", "medium", "high"}:
    AI_REASONING_EFFORT = "low"
AI_PARSE_TIMEOUT_SECONDS = _env_int("KMC_AI_PARSE_TIMEOUT_SECONDS", 75, 15, 180)
AI_MODIFY_TIMEOUT_SECONDS = _env_int("KMC_AI_MODIFY_TIMEOUT_SECONDS", 60, 15, 180)
AI_GLOBAL_TIMEOUT_SECONDS = _env_int("KMC_AI_GLOBAL_TIMEOUT_SECONDS", 45, 15, 180)
AI_MAX_ATTEMPTS = _env_int("KMC_AI_MAX_ATTEMPTS", 2, 1, 3)
AI_CLI_SHUTDOWN_RESERVE_SECONDS = _env_int("KMC_AI_CLI_SHUTDOWN_RESERVE_SECONDS", 10, 3, 30)
AI_RETRY_MIN_BUDGET_SECONDS = _env_int("KMC_AI_RETRY_MIN_BUDGET_SECONDS", 15, 5, 60)
AI_MAX_CONCURRENT_REQUESTS = _env_int("KMC_AI_MAX_CONCURRENT_REQUESTS", 2, 1, 4)
AI_MAX_MESSAGE_CHARS = _env_int("KMC_AI_MAX_MESSAGE_CHARS", 6000, 500, 20000)
AI_MAX_HISTORY_MESSAGES = _env_int("KMC_AI_MAX_HISTORY_MESSAGES", 6, 0, 12)
AI_MAX_HISTORY_CHARS = _env_int("KMC_AI_MAX_HISTORY_CHARS", 1200, 200, 4000)
AI_MAX_PROJECT_CONTEXT = _env_int("KMC_AI_MAX_PROJECT_CONTEXT", 250, 25, 1000)

# 표준 7개 하위 폴더 정의
STANDARD_SUBFOLDERS = [
    "00_작업정보",
    "01_수신원본",
    "02_모델수정",
    "03_슬라이싱_3MF",
    "04_출력검수",
    "05_견적거래",
    "06_배송"
]

# 화면 탭과 실제 폴더 매핑
TAB_TO_FOLDER = {
    "received": "01_수신원본",
    "modified": "02_모델수정",
    "slicing": "03_슬라이싱_3MF",
    "qc": "04_출력검수",
    "estimate": "05_견적거래",
    "delivery": "06_배송",
    "info": "00_작업정보"
}

FOLDER_TO_TAB = {v: k for k, v in TAB_TO_FOLDER.items()}

# 상태 정의
PROD_STATUSES = ["접수", "슬라이싱", "견적 대기", "출력 중", "검수", "제작 완료"]
PAY_STATUSES = ["미청구", "견적 발송", "입금 대기", "부분 입금", "입금 완료"]
DELIV_STATUSES = ["미정", "예약 필요", "예약 완료", "발송", "배송 완료"]

# 기본 단가 규칙
DEFAULT_HOURLY_RATE = 3500
DEFAULT_SHIPPING_FEE = 3500
DEFAULT_COURIER = "한진택배"
COURIER_ALLOWLIST = ("한진택배", "CJ대한통운", "롯데택배", "로젠택배", "우체국택배")

# 서버 런타임 기본값: 로컬 안전 실행을 우선하며 필요 시 환경변수로 변경한다.
DEFAULT_APP_HOST = "127.0.0.1"
DEFAULT_APP_PORT = 5001
MAX_REQUEST_BYTES = 110 * 1024 * 1024
