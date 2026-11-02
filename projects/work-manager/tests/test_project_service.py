import importlib
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from sync_service import parse_markdown_info
from project_service import generate_next_project_no
import config


class ProjectServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.db = importlib.import_module("db")
        self.addCleanup(setattr, self.db, "DB_PATH", self.db.DB_PATH)
        self.db.DB_PATH = str(root / "app.db")
        self.service = importlib.import_module("project_service")
        self.projects = root / "projects"
        self.completed = root / "completed"
        self.projects.mkdir()
        self.completed.mkdir()
        self.root_patches = [patch.object(config, "PROJECTS_DIR", str(self.projects)), patch.object(config, "COMPLETED_DIR", str(self.completed))]
        for item in self.root_patches:
            item.start()
            self.addCleanup(item.stop)
        importlib.import_module("migrations").init_db()
        self.patches = [
            patch.object(self.service, "PROJECTS_DIR", str(self.projects)),
            patch.object(self.service, "COMPLETED_DIR", str(self.completed)),
            patch.object(self.service, "OPERATIONS_FILE", str(root / "operations.xlsx")),
            patch.object(self.service, "sync_project_to_excel_ledger"),
            patch.object(self.service, "create_initial_3mf_file", return_value=("initial.3mf", str(root / "initial.3mf"))),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp_dir.cleanup()

    def _data(self, project_no="260824-101"):
        return {
            "project_no": project_no,
            "client_name": "테스트 고객",
            "job_name": "테스트 작업",
            "received_date": "2026-08-24",
            "quote_amount": 10000,
            "shipping_fee": 3500,
            "tax_type": "과세",
            "items": [{"name": "부품", "quantity": 2, "material": "PETG", "color": "White", "unit_price": 5000}],
        }

    def test_create_builds_standard_folders_items_and_partner(self):
        result = self.service.create_project_in_db_and_fs(self._data())
        self.assertEqual(result["project_no"], "260824-101")
        folder = self.projects / "2026" / "260824-101_테스트_고객_테스트_작업"
        for name in ("00_작업정보", "01_수신원본", "02_모델수정", "03_슬라이싱_3MF", "04_출력검수", "05_견적거래", "06_배송"):
            self.assertTrue((folder / name).is_dir())
        self.assertTrue((folder / "00_작업정보" / "작업정보.md").exists())
        conn = self.db.get_db_connection()
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM project_items WHERE project_no = ?", ("260824-101",)).fetchone()[0], 1)
        self.assertIsNotNone(conn.execute("SELECT id FROM partners WHERE name = ?", ("테스트 고객",)).fetchone())
        self.assertEqual(conn.execute("SELECT total_amount FROM projects WHERE project_no = ?", ("260824-101",)).fetchone()[0], 14850)
        conn.close()

    def test_contact_snapshot_selected_partner_and_update_does_not_change_master(self):
        partner = importlib.import_module("repositories.partners").create_partner({
            "name": "마스터", "contact_name": "마스터 담당", "phone": "010-1111", "address": "마스터 주소"
        })
        data = self._data("260824-120")
        data["partner_id"] = partner["id"]
        created = self.service.create_project_in_db_and_fs(data)
        self.assertEqual(created["contact_name"], "마스터 담당")
        updated = self.service.update_project_in_db("260824-120", {"contact_name": "프로젝트 담당"})
        self.assertEqual(updated["contact_name"], "프로젝트 담당")
        master = importlib.import_module("repositories.partners").get_partner_by_id(partner["id"])
        self.assertEqual(master["contact_name"], "마스터 담당")

        explicit_empty = self._data("260824-122")
        explicit_empty.update({"partner_id": partner["id"], "contact_name": ""})
        empty_snapshot = self.service.create_project_in_db_and_fs(explicit_empty)
        self.assertEqual(empty_snapshot["contact_name"], "")

    def test_update_project_uses_version_and_rejects_stale_writer(self):
        self.service.create_project_in_db_and_fs(self._data("260824-123"))
        first = self.service.update_project_in_db("260824-123", {"memo": "첫 수정"})
        self.assertEqual(first["version"], 2)
        with self.assertRaises(self.service.ProjectConflictError):
            self.service.update_project_in_db(
                "260824-123", {"memo": "오래된 수정", "expected_version": 1}
            )
        fresh = self.service.get_project_by_no("260824-123")
        self.assertEqual(fresh["memo"], "첫 수정")
        self.assertEqual(fresh["version"], 2)

    def test_direct_customer_contact_is_snapshotted_and_partner_created(self):
        data = self._data("260824-121")
        data.update({"contact_name": "직접 담당", "phone": "010-2222"})
        created = self.service.create_project_in_db_and_fs(data)
        self.assertEqual(created["contact_name"], "직접 담당")
        conn = self.db.get_db_connection()
        try:
            row = conn.execute("SELECT contact_name, phone FROM partners WHERE name = ?", ("테스트 고객",)).fetchone()
            self.assertEqual((row["contact_name"], row["phone"]), ("직접 담당", "010-2222"))
        finally:
            conn.close()

    def test_project_folder_year_follows_validated_project_number(self):
        self.service.create_project_in_db_and_fs(self._data("251231-001"))
        self.assertTrue((self.projects / "2025" / "251231-001_테스트_고객_테스트_작업").is_dir())
        self.assertFalse((self.projects / "2026" / "251231-001_테스트_고객_테스트_작업").exists())

    def test_create_rejects_db_or_folder_collision(self):
        conn = self.db.get_db_connection()
        conn.execute("INSERT INTO projects (project_no, client_name, job_name) VALUES (?, ?, ?)", ("260824-101", "기존", "기존"))
        conn.commit()
        conn.close()
        with self.assertRaises(ValueError):
            self.service.create_project_in_db_and_fs(self._data())
        existing = self.projects / "2026" / "260824-102_테스트_고객_테스트_작업"
        existing.mkdir(parents=True)
        with self.assertRaises(ValueError):
            self.service.create_project_in_db_and_fs(self._data("260824-102"))
        self.assertTrue(existing.exists())

    def test_concurrent_explicit_number_has_one_success_and_one_conflict(self):
        data = self._data("260824-117")
        def attempt(_):
            try:
                return self.service.create_project_in_db_and_fs(dict(data))
            except Exception as exc:
                return exc
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, range(2)))
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        self.assertEqual(sum(isinstance(result, self.service.ProjectConflictError) for result in results), 1)
        conn = self.db.get_db_connection()
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM projects WHERE project_no = ?", ("260824-117",)).fetchone()[0], 1)
        conn.close()

    def test_concurrent_generated_numbers_are_distinct(self):
        first = self._data()
        first.pop("project_no")
        second = dict(first)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(self.service.create_project_in_db_and_fs, (first, second)))
        self.assertEqual({result["project_no"] for result in results}, {"260824-001", "260824-002"})

    def test_invalid_project_numbers_do_not_create_rows_or_folders(self):
        for invalid in ("../260824-001", "/tmp/260824-001", "260824-001\\evil", "260232-001", "260824-abc", "260824-001\x00x"):
            with self.subTest(invalid=repr(invalid)):
                with self.assertRaises(ValueError):
                    self.service.create_project_in_db_and_fs(self._data(invalid))
        conn = self.db.get_db_connection()
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0], 0)
        conn.close()
        self.assertEqual(list(self.projects.iterdir()), [])

    def test_invalid_target_dates_do_not_touch_db_or_filesystem(self):
        for invalid in ("../2026-08-24", "2026-02-30", "260231", "20260824", "2026/08/24", ""):
            with self.subTest(invalid=repr(invalid)):
                with self.assertRaises(ValueError):
                    generate_next_project_no(invalid)
        self.assertEqual(list(self.projects.iterdir()), [])

    def test_amount_and_item_domain_validation_preserves_zero_shipping(self):
        data = self._data("260824-118")
        data["shipping_fee"] = 0
        result = self.service.create_project_in_db_and_fs(data)
        self.assertEqual(result["shipping_fee"], 0)
        for field in ("quote_amount", "shipping_fee", "model_fee", "post_process_fee", "paid_amount"):
            invalid = self._data("260824-119")
            invalid[field] = True
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    self.service.create_project_in_db_and_fs(invalid)
        for items in ('{"bad": true}', '[1]', '[{"quantity": 0}]', '[{"unit_price": -1}]', '{bad json}'):
            invalid = self._data("260824-120")
            invalid["items"] = items
            with self.subTest(items=items):
                with self.assertRaises(ValueError):
                    self.service.create_project_in_db_and_fs(invalid)

    def test_control_only_folder_components_are_rejected_without_row(self):
        for field in ("client_name", "job_name"):
            data = self._data("260824-115")
            data[field] = "\x00/"
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    self.service.create_project_in_db_and_fs(data)
        conn = self.db.get_db_connection()
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0], 0)
        conn.close()

    def test_create_failure_rolls_back_only_new_folder(self):
        with patch.object(self.service, "create_initial_3mf_file", side_effect=RuntimeError("3mf failed")):
            # create_initial_3mf_file failure is intentionally non-fatal in the legacy contract.
            self.service.create_project_in_db_and_fs(self._data("260824-103"))
        folder = self.projects / "2026" / "260824-103_테스트_고객_테스트_작업"
        self.assertTrue(folder.exists())

        with patch.object(self.service, "sync_project_to_excel_ledger", side_effect=RuntimeError("ledger failed")):
            self.service.create_project_in_db_and_fs(self._data("260824-104"))
        failed = self.projects / "2026" / "260824-104_테스트_고객_테스트_작업"
        self.assertTrue(failed.exists())
        self.assertTrue(folder.exists())
        conn = self.db.get_db_connection()
        self.assertIsNotNone(conn.execute("SELECT 1 FROM projects WHERE project_no = ?", ("260824-104",)).fetchone())
        conn.close()

    def test_create_db_failure_rolls_back_transaction_and_new_folder(self):
        data = self._data("260824-113")
        data["items"][0]["quantity"] = "not-a-number"
        with self.assertRaises(ValueError):
            self.service.create_project_in_db_and_fs(data)
        folder = self.projects / "2026" / "260824-113_테스트_고객_테스트_작업"
        self.assertFalse(folder.exists())
        conn = self.db.get_db_connection()
        self.assertIsNone(conn.execute("SELECT 1 FROM projects WHERE project_no = ?", ("260824-113",)).fetchone())
        conn.close()

    def test_control_input_db_failure_leaves_no_unchecked_folder(self):
        data = self._data("260824-116")
        data["client_name"] = "고객\x00/"
        data["items"] = [{"name": "부품", "quantity": "not-a-number"}]
        with self.assertRaises(ValueError):
            self.service.create_project_in_db_and_fs(data)
        self.assertFalse(any(path.name.startswith("260824-116") for path in self.projects.rglob("*")))

    def test_update_md_contains_one_received_date_line(self):
        self.service.create_project_in_db_and_fs(self._data("260824-111"))
        self.service.update_project_in_db("260824-111", {"memo": "수정"})
        md = (self.projects / "2026" / "260824-111_테스트_고객_테스트_작업" / "00_작업정보" / "작업정보.md").read_text(encoding="utf-8")
        self.assertEqual(md.count("- 접수일:"), 1)
        self.assertNotIn("    - ", md)
        for line in md.splitlines():
            if line.strip() and (line.lstrip().startswith(("#", "- ", "###", "|"))):
                self.assertEqual(line[0], line.lstrip()[0])
        parsed = parse_markdown_info(str(self.projects / "2026" / "260824-111_테스트_고객_테스트_작업" / "00_작업정보" / "작업정보.md"))
        self.assertEqual(parsed["접수일"], "2026-08-24")
        self.assertEqual(parsed["고객명"], "테스트 고객")
        self.assertEqual(parsed["결제상태"], "미청구")

    def test_update_recalculates_amounts_and_snapshot_items(self):
        self.service.create_project_in_db_and_fs(self._data("260824-105"))
        updated = self.service.update_project_in_db("260824-105", {
            "client_name": "수정 고객",
            "items": [{"name": "새 부품", "quantity": 1, "material": "PLA", "color": "Black", "unit_price": 7000}],
            "pay_status": "입금 완료",
        })
        self.assertEqual(updated["client_name"], "수정 고객")
        self.assertEqual(updated["total_amount"], 11550)
        self.assertEqual(updated["paid_amount"], 11550)
        self.assertEqual(updated["unpaid_amount"], 0)
        conn = self.db.get_db_connection()
        self.assertEqual(conn.execute("SELECT name FROM project_items WHERE project_no = ?", ("260824-105",)).fetchone()[0], "새 부품")
        conn.close()
        md = (self.projects / "2026" / "260824-105_테스트_고객_테스트_작업" / "00_작업정보" / "작업정보.md").read_text(encoding="utf-8")
        self.assertIn("수정 고객", md)

    def test_status_validation(self):
        with self.assertRaises(ValueError):
            self.service.update_status("missing", "bad_status", "접수")
        with self.assertRaises(ValueError):
            self.service.update_status("missing", "prod_status", "잘못된 상태")

    def _insert_project(self, project_no, path):
        conn = self.db.get_db_connection()
        conn.execute("INSERT INTO projects (project_no, client_name, job_name, project_path) VALUES (?, ?, ?, ?)", (project_no, "고객", "작업", str(path)))
        conn.commit()
        conn.close()

    def test_delete_normal_and_delete_files_false(self):
        folder = self.projects / "2026" / "260824-106_고객_작업"
        folder.mkdir(parents=True)
        self._insert_project("260824-106", folder)
        result = self.service.delete_project_from_db_and_fs("260824-106", True)
        self.assertEqual(result["project_no"], "260824-106")
        self.assertTrue(result["deleted"])
        self.assertTrue(result["files_deleted"])
        self.assertFalse(result["cleanup_pending"])
        self.assertEqual(result["warnings"], [])
        self.assertFalse(folder.exists())
        conn = self.db.get_db_connection()
        self.assertIsNone(conn.execute("SELECT 1 FROM projects WHERE project_no = ?", ("260824-106",)).fetchone())
        conn.close()

        keep = self.projects / "2026" / "260824-107_고객_작업"
        keep.mkdir(parents=True)
        self._insert_project("260824-107", keep)
        self.service.delete_project_from_db_and_fs("260824-107", False)
        self.assertTrue(keep.exists())

    def test_delete_missing_project_raises(self):
        with self.assertRaises(ValueError):
            self.service.delete_project_from_db_and_fs("missing", True)

    def test_delete_failure_keeps_folder_and_db_row(self):
        folder = self.projects / "2026" / "260824-112_고객_작업"
        folder.mkdir(parents=True)
        self._insert_project("260824-112", folder)
        with patch.object(self.service.shutil, "rmtree", side_effect=OSError("busy")):
            result = self.service.delete_project_from_db_and_fs("260824-112", True)
        self.assertTrue(result["deleted"])
        self.assertTrue(result["cleanup_pending"])
        self.assertTrue(result["warnings"])
        self.assertFalse(folder.exists())
        conn = self.db.get_db_connection()
        self.assertIsNone(conn.execute("SELECT 1 FROM projects WHERE project_no = ?", ("260824-112",)).fetchone())
        conn.close()
        self.assertTrue((self.projects / ".project_trash").exists())
        trash_items = list((self.projects / ".project_trash").iterdir())
        self.assertTrue(any("260824-112_" in item.name for item in trash_items))
        self.assertTrue(all("고객" not in item.name for item in trash_items))

    def test_delete_db_commit_failure_restores_original_folder_and_row(self):
        folder = self.projects / "2026" / "260824-114_고객_작업"
        folder.mkdir(parents=True)
        self._insert_project("260824-114", folder)
        real_connection = self.service.get_db_connection()
        class FailingConnection:
            def __getattr__(self, name):
                return getattr(real_connection, name)
            def commit(self):
                raise OSError("commit failed")
            def rollback(self):
                return real_connection.rollback()
            def close(self):
                return real_connection.close()
        with patch.object(self.service, "get_db_connection", return_value=FailingConnection()):
            with self.assertRaises(OSError):
                self.service.delete_project_from_db_and_fs("260824-114", True)
        self.assertTrue(folder.exists())
        conn = self.db.get_db_connection()
        self.assertIsNotNone(conn.execute("SELECT 1 FROM projects WHERE project_no = ?", ("260824-114",)).fetchone())
        conn.close()

    def test_delete_rejects_external_root_and_symlink_preserving_row(self):
        external = Path(self.temp_dir.name) / "external"
        external.mkdir()
        self._insert_project("260824-108", external)
        with self.assertRaises(ValueError):
            self.service.delete_project_from_db_and_fs("260824-108", True)

        root_project = self.projects
        self._insert_project("260824-109", root_project)
        with self.assertRaises(ValueError):
            self.service.delete_project_from_db_and_fs("260824-109", True)

        real = self.projects / "2026" / "real"
        real.mkdir(parents=True)
        link = self.projects / "2026" / "link"
        link.symlink_to(external, target_is_directory=True)
        self._insert_project("260824-110", link)
        with self.assertRaises(ValueError):
            self.service.delete_project_from_db_and_fs("260824-110", True)

        conn = self.db.get_db_connection()
        for no in ("260824-108", "260824-109", "260824-110"):
            self.assertIsNotNone(conn.execute("SELECT 1 FROM projects WHERE project_no = ?", (no,)).fetchone())
        conn.close()


if __name__ == "__main__":
    unittest.main()
