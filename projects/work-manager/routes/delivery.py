from datetime import datetime

from flask import Blueprint, jsonify, request
import config

from repositories.projects import get_project_by_no
from delivery_service import (
    attach_tracking_url,
    format_logii_address,
    get_pending_deliveries,
    query_hanjin_tracking,
    normalize_courier,
    normalize_tracking_no,
    update_delivery_info,
)
from project_service import ProjectConflictError


delivery_bp = Blueprint("delivery", __name__)
def _json_object():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


@delivery_bp.route("/api/delivery/pending", methods=["GET"])
def api_get_pending_delivery():
    try:
        deliveries = get_pending_deliveries()
        for delivery in deliveries:
            delivery["logii_format"] = format_logii_address(delivery)
        return jsonify({"success": True, "data": deliveries, "count": len(deliveries)})
    except Exception:
        return jsonify({"success": False, "error": "배송 대기 목록을 불러올 수 없습니다."}), 500


@delivery_bp.route("/api/delivery/update", methods=["POST"])
def api_update_delivery():
    data = _json_object()
    if data is None:
        return jsonify({"success": False, "error": "JSON 배송 정보를 입력해 주세요."}), 400
    project_no = data.get("project_no")
    if not project_no:
        return jsonify({"success": False, "error": "프로젝트 번호가 필요합니다."}), 400
    try:
        updated = update_delivery_info(project_no, data)
        if not updated:
            return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404
        return jsonify({"success": True, "data": updated, "message": "배송 정보가 업데이트되었습니다."})
    except ProjectConflictError as exc:
        return jsonify({"success": False, "error": str(exc)}), 409
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception:
        return jsonify({"success": False, "error": "배송 정보를 업데이트할 수 없습니다."}), 500


@delivery_bp.route("/api/delivery/track", methods=["POST"])
def api_track_delivery():
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 배송조회를 사용할 수 없습니다."}), 503
    data = _json_object()
    if data is None:
        return jsonify({"success": False, "error": "JSON 배송 정보를 입력해 주세요."}), 400
    project_no = data.get("project_no")
    if not project_no:
        return jsonify({"success": False, "error": "프로젝트 번호가 필요합니다."}), 400
    try:
        project = get_project_by_no(project_no)
        if not project:
            return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404

        try:
            courier = normalize_courier(data.get("courier") or project.get("courier"), default=True)
            tracking_no = normalize_tracking_no(data.get("tracking_no") if "tracking_no" in data else project.get("tracking_no"))
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        if courier != "한진택배":
            return jsonify({"success": False, "error": "현재 공식 자동조회는 한진택배만 지원합니다."}), 400
        try:
            result = query_hanjin_tracking(tracking_no)
        except ValueError:
            return jsonify({"success": False, "error": "운송장번호가 필요합니다."}), 400
        except RuntimeError:
            return jsonify({"success": False, "error": "한진 배송조회에 실패했습니다. 잠시 후 다시 시도해 주세요."}), 502
        latest_progress = result.get("latest_progress") or {}
        update_data = {
            "courier": "한진택배",
            "tracking_no": result["tracking_no"],
            "tracking_status_text": result.get("status_text"),
            "tracking_latest_date": latest_progress.get("date"),
            "tracking_latest_time": latest_progress.get("time"),
            "tracking_latest_location": latest_progress.get("location"),
            "tracking_checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            # The external request is based on this snapshot.  Reject a
            # concurrent manual delivery edit instead of clearing/overwriting
            # its newer result.
            "expected_version": project.get("version"),
        }
        if result.get("deliv_status"):
            update_data["deliv_status"] = result["deliv_status"]

        updated_project = update_delivery_info(project_no, update_data, trusted_tracking=True)
        if not updated_project:
            return jsonify({"success": False, "error": "프로젝트를 찾을 수 없습니다."}), 404
        attach_tracking_url(updated_project)
        result["project"] = updated_project
        return jsonify({"success": True, "data": result, "message": "한진 공식 배송조회 결과를 반영했습니다."})
    except ProjectConflictError as exc:
        return jsonify({"success": False, "error": str(exc)}), 409
    except Exception:
        return jsonify({"success": False, "error": "배송 상태를 조회할 수 없습니다."}), 500
