import os
import signal
import threading
import time

from flask import Blueprint, jsonify, render_template
import config

from repositories.projects import get_dashboard_stats
# Keep the historical local name so existing integrations can patch it, but
# the general UI endpoint now only drains DB-owned projection jobs.  Legacy
# file/Excel import remains an explicit maintenance operation elsewhere.
from sync_service import process_pending_sync_jobs as sync_from_filesystem_and_excel


system_bp = Blueprint("system", __name__)


def schedule_server_shutdown():
    """Return the HTTP acknowledgement before ending this local server process."""
    def terminate_after_response():
        time.sleep(0.25)
        os.kill(os.getpid(), signal.SIGTERM)

    threading.Thread(target=terminate_after_response, daemon=True).start()


@system_bp.route("/")
def index():
    return render_template("index.html")


@system_bp.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"success": True, "status": "ok"})


@system_bp.route("/api/stats", methods=["GET"])
def api_stats():
    try:
        return jsonify({"success": True, "data": get_dashboard_stats()})
    except Exception:
        return jsonify({"success": False, "error": "대시보드 통계를 불러올 수 없습니다."}), 500


@system_bp.route("/api/sync", methods=["POST"])
def api_sync_all():
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 운영대장 동기화를 사용할 수 없습니다."}), 503
    try:
        result = sync_from_filesystem_and_excel()
        counts = result if isinstance(result, dict) else {}
        return jsonify({"success": True, "message": "DB 기준 운영대장 동기화가 완료되었습니다.", **{
            key: int(counts.get(key, 0) or 0) for key in ("processed", "succeeded", "failed", "remaining")
        }})
    except Exception:
        return jsonify({"success": False, "error": "파일 시스템 및 운영대장을 동기화할 수 없습니다."}), 500


@system_bp.route("/api/system/shutdown", methods=["POST"])
def api_shutdown_server():
    """Stop only this loopback server after the browser receives a success reply."""
    schedule_server_shutdown()
    return jsonify({
        "success": True,
        "message": "작업관리 서버를 종료했습니다. 다시 사용하려면 시작 앱을 실행하세요.",
    })
