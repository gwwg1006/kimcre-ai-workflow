import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import estimate_service
import config


class EstimateServiceSafetyTest(unittest.TestCase):
    def test_lazy_import_and_strict_numbers(self):
        import sys
        self.assertNotIn("xlwings", sys.modules)
        self.assertEqual(estimate_service._strict_nonnegative_int(2.0, "x"), 2)
        self.assertEqual(estimate_service._strict_nonnegative_int("2,000", "x"), 2000)
        for value in (True, -1, 1.5, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                estimate_service._strict_nonnegative_int(value, "x")

    def test_estimate_updates_items_and_project_once(self):
        with tempfile.TemporaryDirectory() as root, patch.object(config, "PROJECTS_DIR", root), patch.object(config, "COMPLETED_DIR", root), patch.object(config, "DATA_DIR", root):
            project_path = Path(root) / "project"
            target = project_path / "05_견적거래"
            target.mkdir(parents=True)
            source = Path(root) / "source.xlsx"
            source.write_bytes(b"xlsx")
            project = {"project_no": "260824-001", "client_name": "고객", "project_path": str(project_path), "shipping_fee": 3500}
            core = type("Core", (), {"create_integrated_document": lambda *_: str(source)})()
            with patch.object(estimate_service, "get_project_by_no", return_value=project), \
                 patch.object(estimate_service, "_load_estimate_core", return_value=core), \
                 patch.object(estimate_service, "update_project_in_db") as update:
                result = estimate_service.generate_estimate_and_pdf(
                    "260824-001", {"items": [{"name": "../품목", "quantity": 2.0, "price": "1,000"}]}, convert_pdf=False
                )
            update.assert_called_once()
            payload = update.call_args.args[1]
            self.assertEqual(payload["items"][0]["quantity"], 2)
            self.assertEqual(payload["items"][0]["unit_price"], 1000)
            self.assertNotIn("/", Path(result["excel_path"]).name)

    def test_invalid_estimate_number_does_not_call_generator(self):
        with tempfile.TemporaryDirectory() as root, patch.object(config, "PROJECTS_DIR", root), patch.object(config, "COMPLETED_DIR", root), patch.object(config, "DATA_DIR", root):
            project_path = Path(root) / "project"
            (project_path / "05_견적거래").mkdir(parents=True)
            project = {"project_no": "260824-001", "client_name": "고객", "project_path": str(project_path), "shipping_fee": 0}
            with patch.object(estimate_service, "get_project_by_no", return_value=project), \
                 patch.object(estimate_service, "_load_estimate_core") as loader:
                with self.assertRaises(ValueError):
                    estimate_service.generate_estimate_and_pdf(
                        "260824-001", {"shipping_fee": 1.5, "items": []}, convert_pdf=False
                    )
            loader.assert_not_called()

    def test_publish_collision_never_deletes_racing_external_pdf(self):
        with tempfile.TemporaryDirectory() as root, patch.object(config, "PROJECTS_DIR", root), patch.object(config, "COMPLETED_DIR", root), patch.object(config, "DATA_DIR", root):
            project_path = Path(root) / "project"
            (project_path / "05_견적거래").mkdir(parents=True)
            source = Path(root) / "source.xlsx"
            source.write_bytes(b"xlsx")
            project = {"project_no": "260824-001", "client_name": "고객", "project_path": str(project_path), "shipping_fee": 0}
            core = type("Core", (), {"create_integrated_document": lambda *_: str(source)})()
            racing = project_path / "05_견적거래" / "제품견적서_260824-001_고객.pdf"

            def fail_export(_excel, _target, _project_no, _stem):
                racing.write_bytes(b"external")
                raise FileExistsError("publish collision")

            def fake_pdf(_payload, doc_type="integrated", output_pdf_path=None):
                Path(output_pdf_path).write_bytes(b"fallback")
                return output_pdf_path

            with patch.object(estimate_service, "get_project_by_no", return_value=project), \
                 patch.object(estimate_service, "_load_estimate_core", return_value=core), \
                 patch.object(estimate_service, "export_excel_by_sheet_groups_to_pdf", side_effect=fail_export), \
                 patch.object(estimate_service, "generate_pdf_document", side_effect=fake_pdf), \
                 patch.object(estimate_service, "update_project_in_db") as update:
                with self.assertRaises(RuntimeError):
                    estimate_service.generate_estimate_and_pdf("260824-001", {"items": []}, convert_pdf=True)
            self.assertEqual(racing.read_bytes(), b"external")
            update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
