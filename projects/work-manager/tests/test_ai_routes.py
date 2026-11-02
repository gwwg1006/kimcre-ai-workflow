import importlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from repositories import ai_plans


class AiRoutesContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_dir = tempfile.TemporaryDirectory()
        cls.pending_dir = tempfile.TemporaryDirectory()
        db = importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.db_dir.name) / "test.db")
        importlib.import_module("migrations").init_db()
        cls.app_module = importlib.import_module("app")
        cls.routes_module = importlib.import_module("routes.ai")
        cls.config = importlib.import_module("config")
        cls.original_pending_dir = cls.config.AI_PENDING_DIR
        cls.config.AI_PENDING_DIR = cls.pending_dir.name
        cls.client = cls.app_module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.config.AI_PENDING_DIR = cls.original_pending_dir
        cls.db_dir.cleanup()
        cls.pending_dir.cleanup()

    def test_ai_urls_are_registered_once(self):
        self.assertEqual(sum(r.rule == "/api/ai/parse-order" and "POST" in r.methods for r in self.app_module.app.url_map.iter_rules()), 1)
        self.assertEqual(sum(r.rule == "/api/projects/<project_no>/ai-modify" and "POST" in r.methods for r in self.app_module.app.url_map.iter_rules()), 1)

    def test_consent_required_for_all_external_calls(self):
        response = self.client.post("/api/ai/parse-order", json={})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "AI_CONSENT_REQUIRED")
        response = self.client.post("/api/ai/global-chat", json={})
        self.assertEqual(response.status_code, 400)

    def test_parse_is_nonpersistent_and_forwards_fields_with_consent(self):
        before = set(Path(self.pending_dir.name).iterdir())
        with patch.object(self.routes_module, "parse_order_with_ai", return_value={"success": True, "data": {}}) as parse_fn:
            response = self.client.post("/api/ai/parse-order", json={"message": "주문", "current_data": {"client": "A"}, "history": [], "external_ai_consent": True})
        self.assertEqual(response.status_code, 200)
        parse_fn.assert_called_once_with(user_message="주문", file_paths=[], current_data={"client": "A"}, history=[])
        self.assertEqual(set(Path(self.pending_dir.name).iterdir()), before)

    def test_modify_returns_preview_plan_and_preserves_original_filename(self):
        project = {"project_no": "260824-001", "client_name": "A", "folder_path": self.db_dir.name, "items": []}
        ai_result = {"success": True, "reply": "수정", "updated_fields": {"memo": "x"}, "file_operations": [{"op": "replace_3mf", "source_filename": "원본.3mf"}]}
        with patch.object(self.routes_module, "get_project_by_no", return_value=project), patch.object(self.routes_module, "modify_project_with_ai", return_value=ai_result), patch.object(self.routes_module, "update_project_in_db") as update:
            response = self.client.post("/api/projects/260824-001/ai-modify", data={"external_ai_consent": "true", "files": (io.BytesIO(b"3mf"), "원본.3mf")}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body["requires_confirmation"])
        self.assertEqual(body["executed_updates"], [])
        self.assertEqual(body["plan"]["staged_files"][0]["original_name"], "원본.3mf")
        self.assertIn("confirmation_token", body)
        self.assertNotIn("confirmation_token", body["plan"])
        self.assertNotIn("/private", json.dumps(body))
        raw = ai_plans.get_plan(body["plan_id"])
        self.assertNotIn(body["confirmation_token"], json.dumps(raw))
        update.assert_not_called()

    def test_global_pure_query_has_no_plan(self):
        pure = {"success": True, "reply": "현황", "suggested_actions": [], "executed_updates": [], "file_operations": []}
        with patch.object(self.routes_module, "get_all_projects", return_value=[]), patch.object(self.routes_module, "get_dashboard_stats", return_value={}), patch.object(self.routes_module, "global_project_chat_with_ai", return_value=pure):
            response = self.client.post("/api/ai/global-chat", json={"message": "현황", "history": [], "external_ai_consent": True})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("plan_id", response.get_json())

    def test_ai_runtime_failures_use_safe_gateway_statuses(self):
        with patch.object(self.routes_module, "parse_order_with_ai", return_value={
            "success": False, "code": "AI_TIMEOUT", "reply": "시간 초과", "error": "internal provider detail",
        }):
            response = self.client.post("/api/ai/parse-order", json={"message": "x", "external_ai_consent": True})
        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.get_json()["code"], "AI_TIMEOUT")

        with patch.object(self.routes_module, "get_all_projects", return_value=[]), \
             patch.object(self.routes_module, "get_dashboard_stats", return_value={}), \
             patch.object(self.routes_module, "global_project_chat_with_ai", return_value={
                 "success": False, "code": "AI_INVALID_OUTPUT", "reply": "확인 불가", "error": "private stderr",
             }):
            response = self.client.post("/api/ai/global-chat", json={"message": "x", "external_ai_consent": True})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()["code"], "AI_INVALID_OUTPUT")
        self.assertNotIn("private stderr", json.dumps(response.get_json()))

    def test_invalid_proposal_is_rejected_before_plan_creation(self):
        project = {"project_no": "260824-002", "client_name": "A", "folder_path": self.db_dir.name, "items": []}
        with patch.object(self.routes_module, "get_project_by_no", return_value=project), patch.object(self.routes_module, "modify_project_with_ai", return_value={"success": True, "updated_fields": {"unknown": 1}, "file_operations": []}):
            response = self.client.post("/api/projects/260824-002/ai-modify", json={"external_ai_consent": True, "message": "x"})
        self.assertEqual(response.status_code, 400)

    def test_malformed_project_number_is_rejected_without_ai_call(self):
        with patch.object(self.routes_module, "modify_project_with_ai") as modify:
            response = self.client.post("/api/projects/p/ai-modify", json={"external_ai_consent": True})
        self.assertEqual(response.status_code, 400)
        modify.assert_not_called()

    def test_plan_apply_requires_token_origin_and_json(self):
        route = self.routes_module
        with patch.object(route, "verify_confirmation_token", return_value=False):
            response = self.client.post("/api/ai/plans/p1/apply", json={})
        self.assertEqual(response.status_code, 404)
        with patch.object(route, "verify_confirmation_token", return_value=True):
            response = self.client.post("/api/ai/plans/p1/apply", json={}, headers={"Origin": "https://evil.example", "X-AI-Confirmation-Token": "t"})
            self.assertEqual(response.status_code, 403)
            response = self.client.post("/api/ai/plans/p1/apply", data="{}", content_type="text/plain", headers={"X-AI-Confirmation-Token": "t"})
        self.assertEqual(response.status_code, 400)

    def test_plan_apply_redacts_result_and_supports_cached_replay(self):
        outcome = {"status": "applied", "cached": False, "result": {
            "applied_projects": [{"project_no": "p1", "project": {"address": "PRIVATE"}, "fields": {"memo": "PRIVATE"}}],
            "file_results": [{"project_no": "p1", "filename": "saved.3mf", "path": "/private/path", "warnings": ["x"]}],
            "failures": [], "warnings": ["warning"],
        }}
        with patch.object(self.routes_module, "verify_confirmation_token", return_value=True), patch.object(self.routes_module, "apply_plan", return_value=outcome) as apply:
            response = self.client.post("/api/ai/plans/p1/apply", json={}, headers={"X-AI-Confirmation-Token": "t"})
            replay = dict(outcome, cached=True)
            apply.return_value = replay
            response_replay = self.client.post("/api/ai/plans/p1/apply", json={}, headers={"X-AI-Confirmation-Token": "t"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response_replay.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["result"]["file_results"][0]["filename"], "saved.3mf")
        self.assertNotIn("PRIVATE", json.dumps(body))
        self.assertNotIn("/private", json.dumps(body))
        self.assertTrue(response_replay.get_json()["cached"])

    def test_plan_apply_status_mapping_and_cancel_contract(self):
        with patch.object(self.routes_module, "verify_confirmation_token", return_value=True), patch.object(self.routes_module, "apply_plan", return_value={"status": "failed", "result": {}}):
            response = self.client.post("/api/ai/plans/p1/apply", json={}, headers={"X-AI-Confirmation-Token": "t"})
        self.assertEqual(response.status_code, 409)
        with patch.object(self.routes_module, "verify_confirmation_token", return_value=True), patch.object(self.routes_module, "cancel_plan", return_value={"status": "cancelled"}):
            response = self.client.delete("/api/ai/plans/p1", headers={"X-AI-Confirmation-Token": "t"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"plan_id": "p1", "status": "cancelled", "success": True})


if __name__ == "__main__":
    unittest.main()
