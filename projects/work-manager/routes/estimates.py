from flask import Blueprint, jsonify, request, current_app
import config

from estimate_service import generate_estimate_and_pdf
from project_service import ProjectConflictError


estimates_bp = Blueprint("estimates", __name__)


@estimates_bp.route("/api/projects/<project_no>/estimate/generate", methods=["POST"])
def api_generate_estimate(project_no):
    if config.DISABLE_EXTERNAL_SERVICES:
        return jsonify({"success": False, "error": "E2E 격리 모드에서는 외부 Excel/PDF를 사용할 수 없습니다."}), 503
    try:
        data = request.get_json(silent=True) or {}
        doc_type = data.get("doc_type", "integrated")
        convert_pdf = data.get("convert_pdf", True)
        result = generate_estimate_and_pdf(
            project_no, data, doc_type=doc_type, convert_pdf=convert_pdf
        )
        return jsonify({
            "success": True,
            "data": result,
            "message": "견적서 엑셀 및 PDF 생성이 완료되었습니다.",
        })
    except ProjectConflictError as exc:
        return jsonify({"success": False, "error": str(exc)}), 409
    except Exception:
        current_app.logger.exception("Estimate generation failed for %s", project_no)
        return jsonify({
            "success": False,
            "error": "견적서 및 거래명세서를 생성할 수 없습니다.",
        }), 500
