import importlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class PartnerRoutesContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_dir = tempfile.TemporaryDirectory()
        db = importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.db_dir.name) / "test.db")
        importlib.import_module("migrations").init_db()
        cls.app_module = importlib.import_module("app")
        cls.routes_module = importlib.import_module("routes.partners")
        cls.client = cls.app_module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.db_dir.cleanup()

    def test_partner_urls_are_registered_once(self):
        expected = {
            ("/api/partners", "GET"),
            ("/api/partners", "POST"),
            ("/api/partners/<int:partner_id>", "PUT"),
            ("/api/partners/<int:partner_id>", "DELETE"),
        }
        actual = {
            (rule.rule, method)
            for rule in self.app_module.app.url_map.iter_rules()
            for method in rule.methods
            if rule.rule in {item[0] for item in expected} and method in {item[1] for item in expected}
        }
        self.assertEqual(actual, expected)
        for endpoint, method in expected:
            self.assertEqual(sum(
                rule.rule == endpoint and method in rule.methods
                for rule in self.app_module.app.url_map.iter_rules()
            ), 1)

    def test_list_forwards_trimmed_search_and_safe_include_inactive(self):
        with patch.object(self.routes_module, "list_partners", return_value=[]) as list_fn:
            response = self.client.get(
                "/api/partners?search=%20Acme%20&include_inactive=YES"
            )
        self.assertEqual(response.status_code, 200)
        list_fn.assert_called_once_with("Acme", include_inactive=True)

        with patch.object(self.routes_module, "list_partners", return_value=[]) as list_fn:
            self.client.get("/api/partners?include_inactive=false")
        list_fn.assert_called_once_with("", include_inactive=False)

        response = self.client.get("/api/partners?search=" + ("x" * 101))
        self.assertEqual(response.status_code, 400)
        response = self.client.get("/api/partners?search=%00")
        self.assertEqual(response.status_code, 400)

    def test_create_update_and_archive_success_contracts(self):
        created = {"id": 7, "name": "Acme"}
        updated = {"id": 7, "name": "Acme Updated"}
        with patch.object(self.routes_module, "create_partner", return_value=created) as create_fn:
            response = self.client.post("/api/partners", json={"name": "Acme"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"], created)
        create_fn.assert_called_once_with({"name": "Acme"}, allow_duplicate=False)

        with patch.object(self.routes_module, "update_partner", return_value=updated) as update_fn:
            response = self.client.put("/api/partners/7", json={"name": "Acme Updated"})
        self.assertEqual(response.status_code, 200)
        update_fn.assert_called_once_with(7, {"name": "Acme Updated"})

        with patch.object(self.routes_module, "archive_partner", return_value={"id": 7, "is_active": 0}) as archive_fn:
            response = self.client.delete("/api/partners/7")
        self.assertEqual(response.status_code, 200)
        archive_fn.assert_called_once_with(7)

    def test_allow_duplicate_accepts_true_values_but_not_string_false(self):
        for value, expected in ((True, True), (1, True), ("true", True), ("yes", True), ("false", False), (False, False)):
            with self.subTest(value=value), patch.object(
                self.routes_module, "create_partner", return_value={"id": 1}
            ) as create_fn:
                response = self.client.post(
                    "/api/partners", json={"name": "Acme", "allow_duplicate": value}
                )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(create_fn.call_args.kwargs["allow_duplicate"], expected)

    def test_duplicate_keeps_public_existing_partner_fields_only(self):
        duplicate = ValueError("이미 등록된 거래처명입니다.")
        duplicate.existing_partner = {
            "id": 2, "name": "Acme", "phone": "010", "project_count": 3,
            "created_at": "private timestamp", "internal_secret": "do not expose",
        }
        with patch.object(self.routes_module, "create_partner", side_effect=duplicate):
            response = self.client.post("/api/partners", json={"name": "Acme"})
        self.assertEqual(response.status_code, 409)
        body = response.get_json()
        self.assertEqual(body["existing_partner"]["name"], "Acme")
        self.assertNotIn("created_at", body["existing_partner"])
        self.assertNotIn("internal_secret", body["existing_partner"])

    def test_invalid_input_not_found_and_internal_error_are_safe(self):
        response = self.client.post("/api/partners", data="not-json", content_type="text/plain")
        self.assertEqual(response.status_code, 400)
        self.assertIn("JSON", response.get_json()["error"])

        missing = ValueError("거래처명은 필수 입력 항목입니다.")
        with patch.object(self.routes_module, "create_partner", side_effect=missing):
            response = self.client.post("/api/partners", json={})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "거래처명은 필수 입력 항목입니다.")

        not_found = ValueError("거래처를 찾을 수 없습니다.")
        with patch.object(self.routes_module, "update_partner", side_effect=not_found):
            response = self.client.put("/api/partners/999", json={"name": "Missing"})
        self.assertEqual(response.status_code, 404)

        internal = RuntimeError("/Users/customer/private/partners.db")
        with patch.object(self.routes_module, "archive_partner", side_effect=internal):
            response = self.client.delete("/api/partners/999")
        self.assertEqual(response.status_code, 500)
        serialized = response.get_data(as_text=True)
        self.assertNotIn(str(internal), serialized)
        self.assertEqual(response.get_json()["error"], "거래처를 보관 처리할 수 없습니다.")


if __name__ == "__main__":
    unittest.main()
