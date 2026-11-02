import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask, jsonify


class ServerRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_dir = tempfile.TemporaryDirectory()
        db = sys.modules.get("db") or importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.db_dir.name) / "test.db")
        cls.app_module = importlib.import_module("app")

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.db_dir.cleanup()

    def test_default_runtime_is_loopback_fast_and_cors_off(self):
        config = self.app_module.get_runtime_config({})
        self.assertEqual(config["host"], "127.0.0.1")
        self.assertEqual(config["port"], 5001)
        self.assertFalse(config["startup_sync"])
        self.assertFalse(config["enable_cors"])
        self.assertEqual(config["cors_origins"], ())

        response = self.app_module.app.test_client().get(
            "/api/health", headers={"Origin": "http://localhost:3000"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.headers.get("Access-Control-Allow-Origin"))

    def test_bool_parsing_and_runtime_overrides(self):
        for value in ("1", "true", "YES", "on"):
            self.assertTrue(self.app_module.parse_bool(value))
        for value in ("0", "false", "NO", "off", ""):
            self.assertFalse(self.app_module.parse_bool(value, default=True))
        self.assertTrue(self.app_module.parse_bool("unknown", default=True))
        self.assertFalse(self.app_module.parse_bool("unknown"))

        config = self.app_module.get_runtime_config({
            "APP_HOST": "127.0.0.1",
            "APP_PORT": "5050",
            "STARTUP_SYNC": "1",
            "ENABLE_CORS": "true",
            "CORS_ORIGINS": "https://example.com, *, http://localhost:3000",
        })
        self.assertEqual(config["host"], "127.0.0.1")
        self.assertEqual(config["port"], 5050)
        self.assertTrue(config["startup_sync"])
        self.assertTrue(config["enable_cors"])
        self.assertNotIn("*", config["cors_origins"])
        self.assertEqual(config["cors_origins"], ("https://example.com", "http://localhost:3000"))

        with self.assertRaises(ValueError):
            self.app_module.get_runtime_config({"APP_HOST": "0.0.0.0"})

    def test_run_server_skips_or_runs_startup_sync(self):
        base = {"host": "127.0.0.1", "port": 5001, "startup_sync": False, "enable_cors": False, "cors_origins": ()}
        with patch.object(self.app_module, "sync_from_filesystem_and_excel") as sync, patch.object(self.app_module.app, "run") as run:
            self.app_module.run_server(base)
        sync.assert_not_called()
        run.assert_called_once_with(host="127.0.0.1", port=5001, debug=False)

        enabled = dict(base, startup_sync=True)
        with patch.object(self.app_module, "sync_from_filesystem_and_excel") as sync, patch.object(self.app_module.app, "run") as run:
            self.app_module.run_server(enabled)
        sync.assert_called_once_with()
        run.assert_called_once_with(host="127.0.0.1", port=5001, debug=False)

        with patch.object(self.app_module.config, "DISABLE_EXTERNAL_SERVICES", True), \
             patch.object(self.app_module, "sync_from_filesystem_and_excel") as sync, patch.object(self.app_module.app, "run") as run:
            self.app_module.run_server(enabled)
        sync.assert_not_called()
        run.assert_called_once_with(host="127.0.0.1", port=5001, debug=False)

    def test_explicit_cors_origin_only(self):
        allowed_app = Flask("allowed-cors-test")
        allowed_app.add_url_rule("/api/health", view_func=lambda: jsonify({"status": "ok"}))
        self.app_module.configure_cors(allowed_app, {
            "enable_cors": True,
            "cors_origins": ("http://localhost:3000",),
        })
        allowed_response = allowed_app.test_client().get(
            "/api/health", headers={"Origin": "http://localhost:3000"}
        )
        self.assertEqual(allowed_response.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000")
        denied_response = allowed_app.test_client().get(
            "/api/health", headers={"Origin": "http://evil.example"}
        )
        self.assertIsNone(denied_response.headers.get("Access-Control-Allow-Origin"))

    def test_health_does_not_require_sync(self):
        with patch.object(self.app_module, "sync_from_filesystem_and_excel") as sync:
            response = self.app_module.app.test_client().get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok", "success": True})
        sync.assert_not_called()


if __name__ == "__main__":
    unittest.main()
