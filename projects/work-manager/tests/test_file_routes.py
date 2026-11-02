import io
import importlib
import os
import sys
import tempfile
import unittest
import config
from unittest.mock import patch
from werkzeug.datastructures import FileStorage


class FileRoutesContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_dir = tempfile.TemporaryDirectory()
        db = sys.modules.get("db") or importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = os.path.join(cls.db_dir.name, "test.db")
        import migrations
        migrations.init_db()
        cls.app_module = importlib.import_module("app")
        cls.routes_module = importlib.import_module("routes.files")
        cls.client = cls.app_module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.db_dir.cleanup()

    def test_file_routes_are_registered_once(self):
        expected = {
            "/api/projects/<project_no>/open-folder",
            "/api/projects/<project_no>/open-3mf",
            "/api/projects/<project_no>/files",
            "/api/projects/<project_no>/files/upload",
            "/api/projects/<project_no>/files/open",
            "/api/projects/<project_no>/files/rename",
            "/api/projects/<project_no>/files/version-bump",
            "/api/projects/<project_no>/files/delete",
            "/api/projects/<project_no>/files/raw",
        }
        for path in expected:
            with self.subTest(path=path):
                rules = [rule for rule in self.app_module.app.url_map.iter_rules() if rule.rule == path]
                self.assertEqual(len(rules), 1)

    def test_files_list_contract_is_preserved(self):
        project = {"project_no": "TEST-001", "project_path": "/tmp/project"}
        tabs = {"received": {"count": 1, "files": []}}
        with patch.object(self.routes_module, "get_project_by_no", return_value=project), patch.object(
            self.routes_module, "list_project_tabs_and_files", return_value=tabs
        ):
            response = self.client.get("/api/projects/TEST-001/files")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"success": True, "data": tabs})

    def test_same_name_3mf_uploads_use_distinct_temp_paths_and_cleanup(self):
        with tempfile.TemporaryDirectory() as temp_dir, patch.object(config, "PROJECTS_DIR", temp_dir), patch.object(config, "COMPLETED_DIR", temp_dir):
            project_path = os.path.join(temp_dir, "project")
            os.makedirs(project_path)
            project = {"project_no": "TEST-001", "project_path": project_path}
            source_paths = []
            output_names = iter(("output_01.3mf", "output_02.3mf"))

            def fake_replace(project_dir, source_path, original_name, project_data=None, include_rollback_receipt=False, created_by_request=False):
                source_paths.append(source_path)
                output_path = os.path.join(project_dir, next(output_names))
                with open(output_path, "wb") as output:
                    output.write(b"3mf")
                return {"filename": os.path.basename(output_path), "path": output_path}

            upload_data = {
                "tab_key": "slicing",
                "files": [
                    (io.BytesIO(b"first"), "same.3mf"),
                    (io.BytesIO(b"second"), "same.3mf"),
                ],
            }
            with patch.object(self.routes_module, "DATA_DIR", temp_dir), patch.object(
                self.routes_module, "get_project_by_no", return_value=project
            ), patch.object(self.routes_module, "replace_or_save_project_3mf", side_effect=fake_replace), patch.object(
                self.routes_module, "update_project_in_db"
            ):
                response = self.client.post(
                    "/api/projects/TEST-001/files/upload", data=upload_data, content_type="multipart/form-data"
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(source_paths), 2)
            self.assertNotEqual(source_paths[0], source_paths[1])
            self.assertTrue(all(not os.path.exists(path) for path in source_paths))
            self.assertEqual(response.get_json()["data"][0]["filename"], "output_01.3mf")
            self.assertEqual(response.get_json()["data"][1]["filename"], "output_02.3mf")
            self.assertNotIn("path", response.get_json()["data"][0])
            self.assertNotIn("path", response.get_json()["data"][1])

    def test_later_3mf_failure_rolls_back_prior_receipt(self):
        with tempfile.TemporaryDirectory() as temp_dir, patch.object(config, "PROJECTS_DIR", temp_dir), patch.object(config, "COMPLETED_DIR", temp_dir):
            project_path = os.path.join(temp_dir, "project")
            os.makedirs(os.path.join(project_path, "03_슬라이싱_3MF"))
            project = {"project_no": "TEST-001", "project_path": project_path, "slicing_file": "old.3mf"}
            calls = []

            def fake_replace(project_dir, source_path, original_name, project_data=None, include_rollback_receipt=False, created_by_request=False):
                calls.append(source_path)
                if len(calls) == 2:
                    raise RuntimeError("second replacement failed")
                output_path = os.path.join(project_dir, "03_슬라이싱_3MF", "new.3mf")
                with open(output_path, "wb") as output:
                    output.write(b"new")
                return {"filename": "new.3mf", "path": output_path, "_rollback_receipt": {"version": 1}}

            upload_data = {"tab_key": "slicing", "files": [(io.BytesIO(b"one"), "a.3mf"), (io.BytesIO(b"two"), "b.3mf")]}
            with patch.object(self.routes_module, "DATA_DIR", temp_dir), patch.object(
                self.routes_module, "get_project_by_no", return_value=project
            ), patch.object(self.routes_module, "replace_or_save_project_3mf", side_effect=fake_replace), patch.object(
                self.routes_module, "rollback_project_3mf_replacement"
            ) as rollback, patch.object(self.routes_module, "update_project_in_db"):
                response = self.client.post("/api/projects/TEST-001/files/upload", data=upload_data, content_type="multipart/form-data")
            self.assertEqual(response.status_code, 500)
            rollback.assert_called_once()
            self.assertNotIn(project_path, response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
