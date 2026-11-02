import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class StaticCacheVersionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import importlib
        cls.db_tmp = tempfile.TemporaryDirectory()
        db = importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.db_tmp.name) / "app.db")
        cls.app_module = importlib.import_module("app")

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.db_tmp.cleanup()

    def test_mtime_changes_asset_version(self):
        with tempfile.TemporaryDirectory() as root:
            asset = Path(root) / "js" / "changed.js"
            asset.parent.mkdir(parents=True)
            asset.write_text("one", encoding="utf-8")
            from flask import Flask
            isolated_app = Flask("static-version-fixture", static_folder=root)
            with isolated_app.test_request_context("/"):
                first = self.app_module.static_asset_url("js/changed.js")
                os.utime(asset, ns=(asset.stat().st_atime_ns, asset.stat().st_mtime_ns + 1_000_000))
                asset.write_text("two", encoding="utf-8")
                second = self.app_module.static_asset_url("js/changed.js")
            self.assertNotEqual(first, second)
            self.assertRegex(first, r"/js/changed\.js\?v=[0-9a-f]+-[0-9a-f]+$")

    def test_index_versions_every_local_css_and_script(self):
        response = self.app_module.app.test_client().get("/")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        local = re.findall(r"(?:src|href)=\"(/static/[^\"]+)\"", html)
        self.assertGreater(len(local), 10)
        self.assertTrue(all("?v=" in url for url in local), local)

    def test_asset_path_cannot_escape_static_root(self):
        with self.app_module.app.test_request_context("/"):
            with self.assertRaises(ValueError):
                self.app_module.static_asset_url("../config.py")

    def test_missing_asset_has_same_origin_unversioned_fallback(self):
        with self.app_module.app.test_request_context("/"):
            self.assertEqual(self.app_module.static_asset_url("js/missing.js"), "/static/js/missing.js")

    def test_control_and_backslash_paths_are_rejected(self):
        with self.app_module.app.test_request_context("/"):
            for value in ("js\\missing.js", "js/\x00missing.js", "js/\x7fmissing.js"):
                with self.subTest(value=repr(value)), self.assertRaises(ValueError):
                    self.app_module.static_asset_url(value)

    def test_external_and_dangling_symlinks_do_not_escape_or_crash(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            static = Path(root) / "static"
            static.mkdir()
            (Path(outside) / "secret.js").write_text("secret", encoding="utf-8")
            (static / "external.js").symlink_to(Path(outside) / "secret.js")
            (static / "dangling.js").symlink_to(Path(outside) / "gone.js")
            from flask import Flask
            isolated_app = Flask("static-symlink-fixture", static_folder=str(static))
            with isolated_app.test_request_context("/"):
                with self.assertRaises(ValueError):
                    self.app_module.static_asset_url("external.js")
                self.assertEqual(self.app_module.static_asset_url("dangling.js"), "/static/dangling.js")


if __name__ == "__main__":
    unittest.main()
