import importlib
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock


class DbHygieneTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = importlib.import_module("db")
        self.old_path = self.db.DB_PATH
        self.db.DB_PATH = str(Path(self.temp_dir.name) / "test.db")
        self.migrations = importlib.import_module("migrations")
        self.migrations.init_db()

    def tearDown(self):
        self.db.DB_PATH = self.old_path
        self.temp_dir.cleanup()

    def test_factory_enables_foreign_keys_and_keeps_row_factory(self):
        conn = self.db.get_db_connection()
        try:
            self.assertEqual(conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)
            self.assertIs(conn.row_factory, sqlite3.Row)
        finally:
            conn.close()

    def test_invalid_item_rejected_and_project_delete_cascades(self):
        conn = self.db.get_db_connection()
        try:
            conn.execute(
                "INSERT INTO projects (project_no, client_name, job_name) VALUES (?, ?, ?)",
                ("260824-001", "고객", "작업"),
            )
            conn.execute(
                "INSERT INTO project_items (project_no, name) VALUES (?, ?)",
                ("260824-001", "정상"),
            )
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO project_items (project_no, name) VALUES (?, ?)",
                    ("missing", "고아"),
                )
            conn.commit()
            conn.execute("DELETE FROM projects WHERE project_no = ?", ("260824-001",))
            conn.commit()
            self.assertEqual(
                conn.execute("SELECT COUNT(*) FROM project_items").fetchone()[0], 0
            )
        finally:
            conn.close()

    def test_migration_diagnoses_but_does_not_delete_legacy_orphan(self):
        raw = sqlite3.connect(self.db.DB_PATH)
        try:
            raw.execute("PRAGMA foreign_keys = OFF")
            raw.execute(
                "INSERT INTO project_items (project_no, name) VALUES (?, ?)",
                ("legacy-orphan", "보존"),
            )
            raw.commit()
        finally:
            raw.close()

        self.migrations.init_db()
        conn = self.db.get_db_connection()
        try:
            self.assertEqual(
                conn.execute(
                    "SELECT COUNT(*) FROM project_items WHERE project_no = ?",
                    ("legacy-orphan",),
                ).fetchone()[0],
                1,
            )
        finally:
            conn.close()

    def test_project_read_paths_close_when_select_fails(self):
        repo = importlib.import_module("repositories.projects")
        delivery = importlib.import_module("delivery_service")

        class BrokenConnection:
            def __init__(self):
                self.closed = False

            def execute(self, *args, **kwargs):
                raise RuntimeError("select failed")

            def cursor(self):
                raise RuntimeError("select failed")

            def close(self):
                self.closed = True

        for function, module in (
            (repo.get_project_by_no, repo),
            (repo.get_all_projects, repo),
            (repo.get_dashboard_stats, repo),
            (delivery.get_pending_deliveries, delivery),
        ):
            broken = BrokenConnection()
            with mock.patch.object(module, "get_db_connection", return_value=broken):
                with self.assertRaises(RuntimeError):
                    function("x") if function is repo.get_project_by_no else function()
            self.assertTrue(broken.closed, function.__name__)

    def test_init_db_is_idempotent(self):
        self.migrations.init_db()
        self.migrations.init_db()
        conn = self.db.get_db_connection()
        try:
            tables = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
            self.assertIn("projects", tables)
            self.assertIn("project_items", tables)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
