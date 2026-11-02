import importlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class EstimateRoutesContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_dir = tempfile.TemporaryDirectory()
        db = importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.db_dir.name) / "test.db")
        importlib.import_module("migrations").init_db()
        cls.app_module = importlib.import_module("app")
        cls.routes_module = importlib.import_module("routes.estimates")
        cls.client = cls.app_module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.db_dir.cleanup()

    def test_estimate_endpoint_is_registered_once(self):
        endpoint = "/api/projects/<project_no>/estimate/generate"
        matches = [rule for rule in self.app_module.app.url_map.iter_rules()
                   if rule.rule == endpoint and "POST" in rule.methods]
        self.assertEqual(len(matches), 1)

    def test_empty_body_uses_safe_defaults(self):
        with patch.object(self.routes_module, "generate_estimate_and_pdf",
                          return_value={"xlsx": "estimate.xlsx"}) as generate:
            response = self.client.post("/api/projects/260824-001/estimate/generate")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["success"], True)
        self.assertEqual(response.get_json()["data"], {"xlsx": "estimate.xlsx"})
        generate.assert_called_once_with(
            "260824-001", {}, doc_type="integrated", convert_pdf=True
        )

    def test_non_json_body_uses_safe_defaults(self):
        with patch.object(self.routes_module, "generate_estimate_and_pdf",
                          return_value={}) as generate:
            response = self.client.post(
                "/api/projects/260824-002/estimate/generate",
                data="not-json",
                content_type="text/plain",
            )

        self.assertEqual(response.status_code, 200)
        generate.assert_called_once_with(
            "260824-002", {}, doc_type="integrated", convert_pdf=True
        )

    def test_explicit_document_options_are_forwarded(self):
        payload = {
            "doc_type": "estimate",
            "convert_pdf": False,
            "items": [{"name": "sample"}],
        }
        with patch.object(self.routes_module, "generate_estimate_and_pdf",
                          return_value={"pdf": None}) as generate:
            response = self.client.post(
                "/api/projects/260824-003/estimate/generate",
                json=payload,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"], {"pdf": None})
        generate.assert_called_once_with(
            "260824-003", payload, doc_type="estimate", convert_pdf=False
        )

    def test_service_error_has_fixed_safe_response(self):
        internal_error = "failed at /Users/customer/private/estimate.xlsx"
        with patch.object(self.routes_module, "generate_estimate_and_pdf",
                          side_effect=RuntimeError(internal_error)):
            response = self.client.post(
                "/api/projects/260824-004/estimate/generate", json={}
            )

        self.assertEqual(response.status_code, 500)
        body = response.get_json()
        self.assertEqual(body["error"], "견적서 및 거래명세서를 생성할 수 없습니다.")
        serialized = response.get_data(as_text=True)
        self.assertNotIn(internal_error, serialized)
        self.assertNotIn("/Users/customer/private", serialized)


if __name__ == "__main__":
    unittest.main()
