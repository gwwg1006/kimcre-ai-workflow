import importlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class SystemRoutesContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_dir = tempfile.TemporaryDirectory()
        db = importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.db_dir.name) / "test.db")
        importlib.import_module("migrations").init_db()
        cls.app_module = importlib.import_module("app")
        cls.routes_module = importlib.import_module("routes.system")
        cls.client = cls.app_module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.db_dir.cleanup()

    def test_system_urls_are_registered_once(self):
        expected = {
            ("/", "GET"), ("/api/health", "GET"),
            ("/api/stats", "GET"), ("/api/sync", "POST"),
            ("/api/system/shutdown", "POST"),
        }
        for endpoint, method in expected:
            self.assertEqual(sum(
                rule.rule == endpoint and method in rule.methods
                for rule in self.app_module.app.url_map.iter_rules()
            ), 1)

    def test_index_render_and_health_do_not_require_database_work(self):
        with patch.object(self.routes_module, "render_template", return_value="<html>ok</html>") as render:
            response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(as_text=True), "<html>ok</html>")
        render.assert_called_once_with("index.html")

        with patch.object(self.routes_module, "get_dashboard_stats", side_effect=AssertionError("must not call stats")), \
             patch.object(self.routes_module, "sync_from_filesystem_and_excel", side_effect=AssertionError("must not call sync")):
            response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"success": True, "status": "ok"})

    def test_stats_and_sync_success_contracts(self):
        with patch.object(self.routes_module, "get_dashboard_stats", return_value={"in_progress": 2}) as stats:
            response = self.client.get("/api/stats")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"success": True, "data": {"in_progress": 2}})
        stats.assert_called_once_with()

        with patch.object(self.routes_module, "sync_from_filesystem_and_excel") as sync:
            response = self.client.post("/api/sync")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["success"])
        sync.assert_called_once_with()

    def test_stats_and_sync_errors_are_safe(self):
        with patch.object(self.routes_module, "get_dashboard_stats", side_effect=RuntimeError("/private/app.db")):
            response = self.client.get("/api/stats")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("/private/app.db", response.get_data(as_text=True))

        with patch.object(self.routes_module, "sync_from_filesystem_and_excel", side_effect=RuntimeError("/private/ledger.xlsx")):
            response = self.client.post("/api/sync")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("/private/ledger.xlsx", response.get_data(as_text=True))

    def test_shutdown_acknowledges_before_scheduling_process_termination(self):
        with patch.object(self.routes_module, "schedule_server_shutdown") as shutdown:
            response = self.client.post("/api/system/shutdown")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["success"])
        shutdown.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
