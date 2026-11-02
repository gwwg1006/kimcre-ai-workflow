import importlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class ProjectRoutesContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_dir = tempfile.TemporaryDirectory()
        db = importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.db_dir.name) / "test.db")
        importlib.import_module("migrations").init_db()
        cls.app_module = importlib.import_module("app")
        cls.routes_module = importlib.import_module("routes.projects")
        cls.client = cls.app_module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.db_dir.cleanup()

    def test_project_urls_and_methods_are_registered_once(self):
        expected = {
            ("/api/projects", "GET"), ("/api/projects", "POST"),
            ("/api/projects/next-no", "GET"),
            ("/api/projects/<project_no>", "GET"), ("/api/projects/<project_no>", "PUT"),
            ("/api/projects/<project_no>", "DELETE"),
            ("/api/projects/<project_no>/status", "POST"),
            ("/api/projects/<project_no>/complete", "POST"),
            ("/api/projects/<project_no>/delete", "POST"),
            ("/api/projects/<project_no>/delete", "DELETE"),
        }
        for endpoint, method in expected:
            self.assertEqual(sum(
                rule.rule == endpoint and method in rule.methods
                for rule in self.app_module.app.url_map.iter_rules()
            ), 1)

    def test_mutation_rejects_cross_origin_form_or_json(self):
        with patch.object(self.routes_module, "create_project_in_db_and_fs", side_effect=AssertionError("must not mutate")) as create_fn:
            response = self.client.post("/api/projects", json={"client_name": "x"}, headers={"Origin": "http://evil.example"})
        self.assertEqual(response.status_code, 403)
        create_fn.assert_not_called()

    def test_oversized_request_returns_safe_json_413(self):
        original = self.app_module.app.config["MAX_CONTENT_LENGTH"]
        self.app_module.app.config["MAX_CONTENT_LENGTH"] = 1
        try:
            response = self.client.post(
                "/api/projects",
                data=b"{}",
                content_type="application/json",
            )
        finally:
            self.app_module.app.config["MAX_CONTENT_LENGTH"] = original
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.get_json(), {
            "success": False,
            "error": "요청 크기 제한을 초과했습니다.",
        })

    def test_sync_pending_is_blocked_when_external_services_are_disabled(self):
        with patch.object(self.routes_module.config, "DISABLE_EXTERNAL_SERVICES", True), \
             patch.object(self.routes_module, "process_pending_sync_jobs", side_effect=AssertionError("must not process")) as processor:
            response = self.client.post("/api/projects/sync-pending", json={"limit": 1})
        self.assertEqual(response.status_code, 503)
        processor.assert_not_called()

    def test_list_filters_and_detail_composition(self):
        projects = [{"project_no": "260824-001", "courier": "한진택배", "tracking_no": "123"}]
        with patch.object(self.routes_module, "get_all_projects", return_value=projects) as list_fn, \
             patch.object(self.routes_module, "attach_tracking_url", side_effect=lambda value: value):
            response = self.client.get(
                "/api/projects?search=Acme&prod_status=접수,%20출력%20중&pay_status=입금%20대기"
            )
        self.assertEqual(response.status_code, 200)
        list_fn.assert_called_once_with({
            "search": "Acme", "prod_status": ["접수", "출력 중"],
            "pay_status": ["입금 대기"], "deliv_status": None, "overall_status": None,
        })

        project = {"project_no": "260824-001", "project_path": "/private/project"}
        with patch.object(self.routes_module, "get_project_by_no", return_value=project), \
             patch.object(self.routes_module, "list_project_tabs_and_files", return_value={"received": []}), \
             patch.object(self.routes_module, "format_logii_address", return_value={"single_line": "addr"}), \
             patch.object(self.routes_module, "attach_tracking_url", side_effect=lambda value: value):
            response = self.client.get("/api/projects/260824-001")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"]["tabs"], {"received": []})
        self.assertEqual(response.get_json()["data"]["logii_address"], {"single_line": "addr"})

    def test_next_no_and_create_json_formdata_contracts(self):
        with patch.object(self.routes_module, "generate_next_project_no", return_value="260824-002") as next_no:
            response = self.client.get("/api/projects/next-no?date=2026-08-24")
        self.assertEqual(response.status_code, 200)
        next_no.assert_called_once_with("2026-08-24")

        created = {"project_no": "260824-001"}
        with patch.object(self.routes_module, "create_project_in_db_and_fs", return_value=created) as create_fn:
            response = self.client.post("/api/projects", json={"client_name": "Acme"})
        self.assertEqual(response.status_code, 200)
        create_fn.assert_called_once_with({"client_name": "Acme"}, [])

        with patch.object(self.routes_module, "create_project_in_db_and_fs", return_value=created) as create_fn:
            response = self.client.post(
                "/api/projects",
                data={"client_name": "Acme", "files": (io.BytesIO(b"stl"), "part.stl")},
                content_type="multipart/form-data",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(create_fn.call_args.args[0], {"client_name": "Acme"})
        self.assertEqual(create_fn.call_args.args[1][0].filename, "part.stl")

    def test_project_conflict_maps_to_409(self):
        with patch.object(
            self.routes_module,
            "create_project_in_db_and_fs",
            side_effect=self.routes_module.ProjectConflictError("duplicate"),
        ):
            response = self.client.post("/api/projects", json={"client_name": "Acme", "job_name": "Part"})
        self.assertEqual(response.status_code, 409)

    def test_update_status_complete_and_missing_projects(self):
        project = {"project_no": "260824-001"}
        updated = {"project_no": "260824-001", "prod_status": "출력 중"}
        with patch.object(self.routes_module, "get_project_by_no", return_value=project), \
             patch.object(self.routes_module, "update_project_in_db", return_value=updated) as update_fn:
            response = self.client.put("/api/projects/260824-001", json={"memo": "note"})
        self.assertEqual(response.status_code, 200)
        update_fn.assert_called_once_with("260824-001", {"memo": "note"})

        with patch.object(self.routes_module, "get_project_by_no", return_value=project), \
             patch.object(self.routes_module, "update_status", return_value=updated) as status_fn:
            response = self.client.post("/api/projects/260824-001/status", json={"status_type": "prod_status", "status_val": "출력 중"})
        self.assertEqual(response.status_code, 200)
        status_fn.assert_called_once_with("260824-001", "prod_status", "출력 중")

        with patch.object(self.routes_module, "get_project_by_no", return_value=project), \
             patch.object(self.routes_module, "update_project_in_db", return_value=updated) as complete_fn:
            response = self.client.post("/api/projects/260824-001/complete")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(complete_fn.call_args.args[1]["overall_status"], "완료")

        with patch.object(self.routes_module, "get_project_by_no", return_value=None):
            self.assertEqual(self.client.put("/api/projects/missing", json={"memo": "x"}).status_code, 404)
            self.assertEqual(self.client.post("/api/projects/missing/status", json={"status_type": "prod_status", "status_val": "접수"}).status_code, 404)
            self.assertEqual(self.client.post("/api/projects/missing/complete").status_code, 404)

    def test_delete_files_boolean_forms_and_not_found(self):
        project = {"project_no": "260824-001"}
        for value, expected in ((True, True), (1, True), ("true", True), ("yes", True), (False, False), (0, False), ("false", False), ("no", False)):
            with self.subTest(value=value), patch.object(self.routes_module, "get_project_by_no", return_value=project), \
                 patch.object(self.routes_module, "delete_project_from_db_and_fs", return_value={"deleted": True}) as delete_fn:
                response = self.client.post("/api/projects/260824-001/delete", json={"delete_files": value})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(delete_fn.call_args.kwargs["delete_files"], expected)

        with patch.object(self.routes_module, "get_project_by_no", return_value=None):
            response = self.client.delete("/api/projects/missing")
        self.assertEqual(response.status_code, 404)

        warning_result = {
            "project_no": "260824-001", "deleted": True, "files_deleted": True,
            "cleanup_pending": True, "warnings": ["후속 정리 필요"],
        }
        with patch.object(self.routes_module, "get_project_by_no", return_value=project), \
             patch.object(self.routes_module, "delete_project_from_db_and_fs", return_value=warning_result):
            response = self.client.delete("/api/projects/260824-001")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["success"])
        self.assertEqual(response.get_json()["warnings"], ["후속 정리 필요"])
        self.assertIn("후속 정리 필요", response.get_json()["message"])

    def test_invalid_input_and_internal_errors_are_safe(self):
        self.assertEqual(self.client.put("/api/projects/p", data="bad", content_type="text/plain").status_code, 400)
        self.assertEqual(self.client.post("/api/projects/p/status", json={}).status_code, 400)
        self.assertEqual(self.client.post("/api/projects", data="bad", content_type="text/plain").status_code, 400)

        with patch.object(self.routes_module, "get_all_projects", side_effect=RuntimeError("/private/projects.db")):
            response = self.client.get("/api/projects")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("/private/projects.db", response.get_data(as_text=True))

        with patch.object(self.routes_module, "get_project_by_no", return_value={"project_no": "p"}), \
             patch.object(self.routes_module, "update_project_in_db", side_effect=RuntimeError("/private/project")):
            response = self.client.put("/api/projects/p", json={"memo": "x"})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("/private/project", response.get_data(as_text=True))

        with patch.object(self.routes_module, "get_project_by_no", return_value={"project_no": "p"}), \
             patch.object(self.routes_module, "delete_project_from_db_and_fs", side_effect=RuntimeError("/private/project")):
            response = self.client.delete("/api/projects/p")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("/private/project", response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
