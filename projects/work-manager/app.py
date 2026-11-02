import os
import time
from pathlib import Path
import config
from flask import Flask, current_app, url_for
from flask_cors import CORS

from config import DEFAULT_APP_HOST, DEFAULT_APP_PORT, MAX_REQUEST_BYTES
from migrations import init_db
# Historical name retained for test/integration patch points.  Startup sync
# drains DB-owned projection jobs only; it never imports stale files back into
# the database.
from sync_service import process_pending_sync_jobs as sync_from_filesystem_and_excel
from routes.files import files_bp
from routes.estimates import estimates_bp
from routes.partners import partners_bp
from routes.delivery import delivery_bp
from routes.projects import projects_bp
from routes.ai import ai_bp
from routes.system import system_bp

def parse_bool(value, default=False):
    """환경변수용 불리언을 안전하게 해석한다."""
    if value is None:
        return default
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off", ""}:
        return False
    return default


def get_runtime_config(environ=None):
    """서버 런타임 설정을 읽는다. 테스트에서 environ을 주입할 수 있다."""
    environ = environ if environ is not None else os.environ
    try:
        port = int(environ.get("APP_PORT") or environ.get("PORT") or DEFAULT_APP_PORT)
    except (TypeError, ValueError):
        port = DEFAULT_APP_PORT
    raw_origins = environ.get("CORS_ORIGINS", "")
    origins = tuple(
        origin.strip()
        for origin in str(raw_origins).split(",")
        if origin.strip() and origin.strip() != "*"
    )
    host = environ.get("APP_HOST") or DEFAULT_APP_HOST
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("APP_HOST must be a loopback host")
    return {
        "host": host,
        "port": port,
        "startup_sync": parse_bool(environ.get("STARTUP_SYNC"), default=False),
        "enable_cors": parse_bool(environ.get("ENABLE_CORS"), default=False),
        "cors_origins": origins,
    }


def configure_cors(flask_app, runtime_config):
    """명시된 origin만 API 경로에 CORS를 적용한다."""
    if runtime_config.get("enable_cors") and runtime_config.get("cors_origins"):
        CORS(flask_app, resources={r"/api/*": {"origins": list(runtime_config["cors_origins"])}})


def static_asset_url(filename):
    """Return a safe static URL; mtime+size is intentionally local-dev cache metadata.

    The file may change between this validation/stat and the later static response;
    changing code-directory files is outside the local-app threat model.
    """
    if (not isinstance(filename, str) or not filename or filename.startswith(("/", "\\"))
            or "\\" in filename or "\x00" in filename
            or any(ord(char) < 32 or 0x7F <= ord(char) <= 0x9F for char in filename)):
        raise ValueError("static asset path must be relative")
    relative = Path(filename)
    if ".." in relative.parts:
        raise ValueError("static asset path must stay inside static/")
    static_root = Path(current_app.static_folder).resolve(strict=True)
    try:
        asset = (static_root / relative).resolve(strict=True)
        asset.relative_to(static_root)
        stat = asset.stat()
    except FileNotFoundError:
        # Keep the page renderable when an optional/deployment asset is missing;
        # Flask's same-origin static route will deterministically return 404.
        return url_for("static", filename=relative.as_posix())
    except OSError:
        return url_for("static", filename=relative.as_posix())
    version = f"{stat.st_mtime_ns:x}-{stat.st_size:x}"
    return url_for("static", filename=relative.as_posix(), v=version)


app = Flask(__name__, static_folder="static", template_folder="templates")
app.jinja_env.globals["static_asset_url"] = static_asset_url
app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES
configure_cors(app, get_runtime_config())
app.register_blueprint(files_bp)
app.register_blueprint(estimates_bp)
app.register_blueprint(partners_bp)
app.register_blueprint(delivery_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(system_bp)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True

from request_security import validate_unsafe_request
app.before_request(validate_unsafe_request)

@app.errorhandler(413)
def request_too_large(_error):
    return {"success": False, "error": "요청 크기 제한을 초과했습니다."}, 413

# DB 스키마는 즉시 준비한다. 전체 동기화는 로컬 실행 시 한 번만 수행한다.
init_db()

def run_server(runtime_config=None):
    """선택적 초기 동기화 후 Flask 서버를 실행한다."""
    runtime_config = runtime_config or get_runtime_config()
    host = runtime_config["host"]
    port = runtime_config["port"]
    print(f"Starting server on http://{host}:{port}")
    if runtime_config.get("startup_sync") and not config.DISABLE_EXTERNAL_SERVICES:
        sync_started_at = time.perf_counter()
        sync_from_filesystem_and_excel()
        print(f"Initial sync completed in {time.perf_counter() - sync_started_at:.2f}s")
    else:
        print("Startup sync skipped; use the dashboard sync button when needed.")
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    run_server()
