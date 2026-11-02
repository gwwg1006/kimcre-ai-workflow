import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class ProjectFileApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # app import 시 운영 DB를 건드리지 않도록 테스트 전용 DB를 지정한다.
        cls.db_dir = tempfile.TemporaryDirectory()
        db = sys.modules.get("db") or importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.db_dir.name) / "test.db")
        importlib.import_module("migrations").init_db()
        cls.app_module = importlib.import_module("app")
        cls.routes_module = importlib.import_module("routes.files")
        cls.client = cls.app_module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.db_dir.cleanup()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.project_root = root / "project"
        self.other_root = root / "other-project"
        import config
        self.root_patches = [patch.object(config, "PROJECTS_DIR", str(root)), patch.object(config, "COMPLETED_DIR", str(root / "completed"))]
        for item in self.root_patches:
            item.start()
            self.addCleanup(item.stop)
        self.project_root.mkdir()
        self.other_root.mkdir()
        self.normal_file = self.project_root / "01_수신원본" / "sample.txt"
        self.normal_file.parent.mkdir()
        self.normal_file.write_text("inside", encoding="utf-8")
        self.external_file = root / "external.txt"
        self.external_file.write_text("outside", encoding="utf-8")
        self.other_file = self.other_root / "other.txt"
        self.other_file.write_text("other", encoding="utf-8")
        self.project = {"project_no": "TEST-001", "project_path": str(self.project_root)}
        self.project_map = {"TEST-001": self.project}
        self.project_lookup = patch.object(
            self.routes_module, "get_project_by_no", side_effect=self.project_map.get
        )
        self.project_lookup.start()

    def tearDown(self):
        self.project_lookup.stop()
        self.tmp.cleanup()

    def test_raw_identifier_contract_and_download(self):
        with patch.object(self.routes_module, "send_file", return_value="RAW") as send_file:
            response = self.client.get(
                "/api/projects/TEST-001/files/raw?path=01_%EC%88%98%EC%8B%A0%EC%9B%90%EB%B3%B8/sample.txt"
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_data(as_text=True), "RAW")
            send_file.assert_called_once_with(
                str(self.normal_file.resolve()),
                mimetype="text/plain",
                as_attachment=False,
            )

            send_file.reset_mock()
            response = self.client.get(
                "/api/projects/TEST-001/files/raw",
                query_string={"tab_key": "received", "filename": "sample.txt", "download": "1"},
            )
            self.assertEqual(response.status_code, 200)
            send_file.assert_called_once_with(
                str(self.normal_file.resolve()),
                mimetype="text/plain",
                as_attachment=True,
            )

    def test_open_and_reveal_use_canonical_internal_path(self):
        with patch.object(self.routes_module, "open_with_default_app") as open_default:
            response = self.client.post(
                "/api/projects/TEST-001/files/open",
                json={"file_path": "01_수신원본/sample.txt"},
            )
        self.assertEqual(response.status_code, 200)
        open_default.assert_called_once_with(str(self.normal_file.resolve()))

        with patch.object(self.routes_module, "open_in_finder") as open_finder:
            response = self.client.post(
                "/api/projects/TEST-001/files/open",
                json={"tab_key": "received", "filename": "sample.txt", "reveal": True},
            )
        self.assertEqual(response.status_code, 200)
        open_finder.assert_called_once_with(str(self.normal_file.resolve()))

    def test_external_absolute_parent_and_other_project_are_forbidden(self):
        paths = [
            str(self.external_file),
            "../external.txt",
            str(self.other_file),
        ]
        for path in paths:
            with self.subTest(path=path):
                response = self.client.get(
                    "/api/projects/TEST-001/files/raw", query_string={"path": path}
                )
                self.assertEqual(response.status_code, 403)
                self.assertNotIn(str(self.external_file), response.get_data(as_text=True))

                response = self.client.post(
                    "/api/projects/TEST-001/files/open", json={"file_path": path}
                )
                self.assertEqual(response.status_code, 403)

    def test_external_symlink_is_forbidden(self):
        link = self.project_root / "outside-link.txt"
        try:
            link.symlink_to(self.external_file)
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"symlink unavailable: {exc}")
        response = self.client.get(
            "/api/projects/TEST-001/files/raw", query_string={"path": str(link)}
        )
        self.assertEqual(response.status_code, 403)

    def test_missing_project_file_and_project_are_404_without_paths(self):
        response = self.client.get(
            "/api/projects/TEST-001/files/raw", query_string={"path": "missing.txt"}
        )
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(str(self.project_root), response.get_data(as_text=True))

        response = self.client.post(
            "/api/projects/NOPE/files/open", json={"file_path": "missing.txt"}
        )
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("NOPE", response.get_data(as_text=True))

        for request_kwargs in ({"data": "not-json"}, {}):
            with self.subTest(request_kwargs=request_kwargs):
                response = self.client.post(
                    "/api/projects/TEST-001/files/open", **request_kwargs
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json()["error"], "파일 식별자가 안전하지 않습니다.")
                self.assertNotIn(str(self.project_root), response.get_data(as_text=True))

    def test_unexpected_open_error_does_not_leak_exception(self):
        with patch.object(
            self.routes_module, "open_with_default_app", side_effect=RuntimeError("secret path")
        ):
            response = self.client.post(
                "/api/projects/TEST-001/files/open",
                json={"file_path": "01_수신원본/sample.txt"},
            )
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("secret path", response.get_data(as_text=True))
        self.assertEqual(response.get_json()["error"], "파일을 열 수 없습니다.")

    def test_rename_version_bump_and_delete_normal_files(self):
        response = self.client.post(
            "/api/projects/TEST-001/files/rename",
            json={
                "tab_key": "received",
                "old_name": "sample.txt",
                "new_name": "renamed.txt",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue((self.normal_file.parent / "renamed.txt").is_file())

        version_source = self.normal_file.parent / "model.stl"
        version_source.write_text("stl", encoding="utf-8")
        response = self.client.post(
            "/api/projects/TEST-001/files/version-bump",
            json={"tab_key": "received", "filename": "model.stl"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["new_name"], "model_v02.stl")
        self.assertTrue((self.normal_file.parent / "model_v02.stl").is_file())

        response = self.client.post(
            "/api/projects/TEST-001/files/delete",
            json={"tab_key": "received", "filename": "renamed.txt"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse((self.normal_file.parent / "renamed.txt").exists())

    def test_mutating_file_apis_reject_path_names_and_invalid_tabs(self):
        requests = [
            ("rename", {"tab_key": "received", "old_name": "../external.txt", "new_name": "x.txt"}),
            ("rename", {"tab_key": "received", "old_name": "sample.txt", "new_name": str(self.external_file)}),
            ("version-bump", {"tab_key": "received", "filename": "../external.txt"}),
            ("version-bump", {"tab_key": "received", "filename": str(self.external_file)}),
            ("delete", {"tab_key": "received", "filename": "../external.txt"}),
            ("delete", {"tab_key": "received", "filename": str(self.external_file)}),
            ("delete", {"tab_key": "unknown", "filename": "sample.txt"}),
        ]
        for operation, payload in requests:
            with self.subTest(operation=operation, payload=payload):
                response = self.client.post(
                    f"/api/projects/TEST-001/files/{operation}", json=payload
                )
                self.assertEqual(response.status_code, 400)
                self.assertNotIn(str(self.external_file), response.get_data(as_text=True))

    def test_mutating_file_apis_reject_external_symlink_sources(self):
        link = self.normal_file.parent / "linked.txt"
        try:
            link.symlink_to(self.external_file)
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"symlink unavailable: {exc}")

        cases = [
            ("rename", {"tab_key": "received", "old_name": "linked.txt", "new_name": "safe.txt"}),
            ("version-bump", {"tab_key": "received", "filename": "linked.txt"}),
            ("delete", {"tab_key": "received", "filename": "linked.txt"}),
        ]
        for operation, payload in cases:
            with self.subTest(operation=operation):
                response = self.client.post(
                    f"/api/projects/TEST-001/files/{operation}", json=payload
                )
                self.assertEqual(response.status_code, 403)
                self.assertNotIn(str(self.external_file), response.get_data(as_text=True))
        self.assertTrue(link.is_symlink())

    def test_mutating_file_apis_handle_missing_files_and_empty_body_safely(self):
        for operation, payload in [
            ("rename", {"tab_key": "received", "old_name": "missing.txt", "new_name": "x.txt"}),
            ("version-bump", {"tab_key": "received", "filename": "missing.txt"}),
            ("delete", {"tab_key": "received", "filename": "missing.txt"}),
        ]:
            with self.subTest(operation=operation):
                response = self.client.post(
                    f"/api/projects/TEST-001/files/{operation}", json=payload
                )
                self.assertEqual(response.status_code, 404)
                self.assertNotIn(str(self.project_root), response.get_data(as_text=True))

                response = self.client.post(f"/api/projects/TEST-001/files/{operation}", data="not-json")
                self.assertEqual(response.status_code, 400)
                self.assertNotIn(str(self.project_root), response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
