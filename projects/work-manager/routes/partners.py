from flask import Blueprint, jsonify, request

from repositories.partners import archive_partner, create_partner, list_partners, update_partner


partners_bp = Blueprint("partners", __name__)

_PUBLIC_PARTNER_FIELDS = (
    "id", "name", "partner_type", "contact_name", "phone", "zipcode",
    "address", "detail_address", "memo", "is_active", "project_count",
)


def _public_partner(partner):
    if not isinstance(partner, dict):
        return partner
    result = {key: partner[key] for key in _PUBLIC_PARTNER_FIELDS if key in partner}
    if result.get("partner_type") == "업체/개인":
        result["partner_type"] = "미분류"
    return result


def _json_object():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def _truthy_json(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value == 1:
        return True
    return isinstance(value, str) and value.strip().lower() in {"1", "true", "yes"}


def _value_error_response(exc):
    message = str(exc)
    if getattr(exc, "existing_partner", None):
        return jsonify({
            "success": False,
            "error": "이미 등록된 거래처명입니다.",
            "duplicate": True,
            "existing_partner": _public_partner(exc.existing_partner),
        }), 409
    if "찾을 수 없습니다" in message:
        return jsonify({"success": False, "error": "거래처를 찾을 수 없습니다."}), 404
    if "필수 입력" in message:
        return jsonify({"success": False, "error": "거래처명은 필수 입력 항목입니다."}), 400
    return jsonify({"success": False, "error": "거래처 정보를 처리할 수 없습니다."}), 400


@partners_bp.route("/api/partners", methods=["GET"])
def api_get_partners():
    search = request.args.get("search", "").strip()
    if len(search) > 100 or any(ord(char) < 32 or ord(char) == 127 for char in search):
        return jsonify({"success": False, "error": "검색어가 올바르지 않습니다."}), 400
    include_inactive = _truthy_json(request.args.get("include_inactive", "false"))
    return jsonify({
        "success": True,
        "data": [_public_partner(partner) for partner in list_partners(search, include_inactive=include_inactive)],
    })


@partners_bp.route("/api/partners", methods=["POST"])
def api_create_partner():
    data = _json_object()
    if data is None:
        return jsonify({"success": False, "error": "JSON 거래처 정보를 입력해 주세요."}), 400
    try:
        partner = create_partner(data, allow_duplicate=_truthy_json(data.get("allow_duplicate")))
        return jsonify({"success": True, "data": partner, "message": "거래처가 등록되었습니다."})
    except ValueError as exc:
        return _value_error_response(exc)
    except Exception:
        return jsonify({"success": False, "error": "거래처를 등록할 수 없습니다."}), 500


@partners_bp.route("/api/partners/<int:partner_id>", methods=["PUT"])
def api_update_partner(partner_id):
    data = _json_object()
    if data is None:
        return jsonify({"success": False, "error": "JSON 거래처 정보를 입력해 주세요."}), 400
    try:
        partner = update_partner(partner_id, data)
        return jsonify({"success": True, "data": partner, "message": "거래처 정보가 수정되었습니다."})
    except ValueError as exc:
        return _value_error_response(exc)
    except Exception:
        return jsonify({"success": False, "error": "거래처를 수정할 수 없습니다."}), 500


@partners_bp.route("/api/partners/<int:partner_id>", methods=["DELETE"])
def api_archive_partner(partner_id):
    try:
        result = archive_partner(partner_id)
        return jsonify({"success": True, "data": result, "message": "거래처를 보관 처리했습니다."})
    except ValueError as exc:
        return _value_error_response(exc)
    except Exception:
        return jsonify({"success": False, "error": "거래처를 보관 처리할 수 없습니다."}), 500
