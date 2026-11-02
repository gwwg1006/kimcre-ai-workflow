import importlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class DeliveryRoutesContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_dir = tempfile.TemporaryDirectory()
        db = importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.db_dir.name) / "test.db")
        importlib.import_module("migrations").init_db()
        cls.app_module = importlib.import_module("app")
        cls.routes_module = importlib.import_module("routes.delivery")
        cls.client = cls.app_module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.db_dir.cleanup()

    def test_delivery_urls_are_registered_once(self):
        expected = {
            ("/api/delivery/pending", "GET"),
            ("/api/delivery/update", "POST"),
            ("/api/delivery/track", "POST"),
        }
        for endpoint, method in expected:
            self.assertEqual(sum(
                rule.rule == endpoint and method in rule.methods
                for rule in self.app_module.app.url_map.iter_rules()
            ), 1)

    def test_pending_adds_logii_format_and_count(self):
        deliveries = [{"project_no": "260824-001", "client_name": "고객"}]
        with patch.object(self.routes_module, "get_pending_deliveries", return_value=deliveries), \
             patch.object(self.routes_module, "format_logii_address", return_value={"single_line": "formatted"}) as formatter:
            response = self.client.get("/api/delivery/pending")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["count"], 1)
        self.assertEqual(response.get_json()["data"][0]["logii_format"], {"single_line": "formatted"})
        formatter.assert_called_once_with(deliveries[0])

    def test_update_success_and_safe_missing_cases(self):
        updated = {"project_no": "260824-001", "deliv_status": "발송"}
        with patch.object(self.routes_module, "update_delivery_info", return_value=updated) as update_fn:
            response = self.client.post("/api/delivery/update", json={"project_no": "260824-001", "tracking_no": "123"})
        self.assertEqual(response.status_code, 200)
        update_fn.assert_called_once_with("260824-001", {"project_no": "260824-001", "tracking_no": "123"})

        response = self.client.post("/api/delivery/update", data="not-json", content_type="text/plain")
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/delivery/update", json={})
        self.assertEqual(response.status_code, 400)

        with patch.object(self.routes_module, "update_delivery_info", return_value=None):
            response = self.client.post("/api/delivery/update", json={"project_no": "missing"})
        self.assertEqual(response.status_code, 404)

        with patch.object(self.routes_module, "update_delivery_info", side_effect=RuntimeError("/private/db")):
            response = self.client.post("/api/delivery/update", json={"project_no": "260824-001"})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("/private/db", response.get_data(as_text=True))

    def test_track_forwards_latest_progress_and_attaches_url(self):
        project = {"project_no": "260824-001", "courier": "hanjin", "tracking_no": "537442940344"}
        result = {
            "tracking_no": "537442940344", "status_text": "상품을 집하하여 발송",
            "deliv_status": "발송", "latest_progress": {
                "date": "2026-08-24", "time": "10:20", "location": "서울센터",
            },
        }
        updated = {"project_no": "260824-001", "courier": "한진택배", "tracking_no": "537442940344"}
        def attach_url(value):
            value["tracking_url"] = "https://www.hanjin.com/track/537442940344"
            return value

        with patch.object(self.routes_module, "get_project_by_no", return_value=project), \
             patch.object(self.routes_module, "query_hanjin_tracking", return_value=result), \
             patch.object(self.routes_module, "update_delivery_info", return_value=updated) as update_fn, \
             patch.object(self.routes_module, "attach_tracking_url", side_effect=attach_url):
            response = self.client.post("/api/delivery/track", json={"project_no": "260824-001"})
        self.assertEqual(response.status_code, 200)
        call_data = update_fn.call_args.args[1]
        self.assertEqual(call_data["tracking_latest_date"], "2026-08-24")
        self.assertEqual(call_data["tracking_latest_time"], "10:20")
        self.assertEqual(call_data["tracking_latest_location"], "서울센터")
        self.assertEqual(response.get_json()["data"]["project"]["project_no"], "260824-001")
        self.assertEqual(response.get_json()["data"]["project"]["tracking_url"], "https://www.hanjin.com/track/537442940344")

    def test_track_alias_missing_project_and_safe_errors(self):
        with patch.object(self.routes_module, "get_project_by_no", return_value={"courier": "한진택배", "tracking_no": "123"}), \
             patch.object(self.routes_module, "query_hanjin_tracking", return_value={"tracking_no": "123", "latest_progress": {}}), \
             patch.object(self.routes_module, "update_delivery_info", return_value={"tracking_no": "123"}), \
             patch.object(self.routes_module, "attach_tracking_url", side_effect=lambda value: value):
            response = self.client.post("/api/delivery/track", json={"project_no": "p", "courier": "CJ"})
        self.assertEqual(response.status_code, 400)

        with patch.object(self.routes_module, "get_project_by_no", return_value=None):
            response = self.client.post("/api/delivery/track", json={"project_no": "missing"})
        self.assertEqual(response.status_code, 404)

        with patch.object(self.routes_module, "get_project_by_no", return_value={"courier": "한진택배", "tracking_no": ""}), \
             patch.object(self.routes_module, "query_hanjin_tracking", side_effect=ValueError("운송장번호가 필요합니다.")):
            response = self.client.post("/api/delivery/track", json={"project_no": "p"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "운송장번호가 필요합니다.")

        external = RuntimeError("https://private.example/path")
        with patch.object(self.routes_module, "get_project_by_no", return_value={"courier": "한진택배", "tracking_no": "1234567890"}), \
             patch.object(self.routes_module, "query_hanjin_tracking", side_effect=external):
            response = self.client.post("/api/delivery/track", json={"project_no": "p"})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn(str(external), response.get_data(as_text=True))

        with patch.object(self.routes_module, "get_project_by_no", return_value={"courier": "한진택배", "tracking_no": "1234567890"}), \
             patch.object(self.routes_module, "query_hanjin_tracking", return_value={"tracking_no": "1234567890", "latest_progress": {}}), \
             patch.object(self.routes_module, "update_delivery_info", side_effect=RuntimeError("/private/db")):
            response = self.client.post("/api/delivery/track", json={"project_no": "p"})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("/private/db", response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
