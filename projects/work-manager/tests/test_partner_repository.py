import importlib
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


class PartnerRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        db = importlib.import_module("db")
        self.addCleanup(setattr, db, "DB_PATH", db.DB_PATH)
        db.DB_PATH = str(Path(self.temp_dir.name) / "repository.db")
        self.db = db
        self.migrations = importlib.import_module("migrations")
        self.repo = importlib.import_module("repositories.partners")
        self.migrations.init_db()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_existing_projects_migrate_with_latest_priority_and_are_idempotent(self):
        conn = self.db.get_db_connection()
        conn.execute("INSERT INTO projects (project_no, client_name, job_name, phone, zipcode, address, detail_address, memo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     ("260824-001", "Acme", "old", "010-old", "11111", "old address", "old detail", "old memo", "2026-08-20", "2026-08-20"))
        conn.execute("INSERT INTO projects (project_no, client_name, job_name, phone, zipcode, address, detail_address, memo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     ("260824-002", " Acme ", "new", "010-new", "", "new address", "", "", "2026-08-24", "2026-08-24"))
        conn.commit()
        self.repo.migrate_projects_to_partners(conn.cursor())
        conn.commit()
        partner = conn.execute("SELECT * FROM partners WHERE name = 'Acme'").fetchone()
        self.assertEqual(partner["phone"], "010-new")
        self.assertEqual(partner["address"], "new address")
        self.assertEqual(partner["zipcode"], "11111")
        self.assertEqual(partner["detail_address"], "old detail")
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM partners").fetchone()[0], 1)
        conn.close()
        self.migrations.init_db()
        conn = self.db.get_db_connection()
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM partners").fetchone()[0], 1)
        self.assertTrue(all(row["partner_id"] for row in conn.execute("SELECT partner_id FROM projects")))
        conn.close()

    def test_crud_search_archive_and_duplicate(self):
        created = self.repo.create_partner({"name": "Acme", "phone": "010"})
        self.assertEqual(self.repo.find_partner_by_name(" acme ")["id"], created["id"])
        self.assertEqual(len(self.repo.list_partners("010")), 1)
        with self.assertRaises(ValueError) as ctx:
            self.repo.create_partner({"name": "Acme"})
        self.assertEqual(ctx.exception.existing_partner["id"], created["id"])
        updated = self.repo.update_partner(created["id"], {"name": "Acme Co", "memo": "memo"})
        self.assertEqual(updated["name"], "Acme Co")
        self.assertEqual(self.repo.archive_partner(created["id"])["is_active"], 0)
        self.assertIsNone(self.repo.find_partner_by_name("Acme Co"))
        self.assertEqual(self.repo.find_partner_by_name("Acme Co", include_inactive=True)["id"], created["id"])

    def test_concurrent_same_name_only_one_non_duplicate_create_succeeds(self):
        def create():
            try:
                return ("ok", self.repo.create_partner({"name": "동시 거래처"})["id"])
            except ValueError as exc:
                return ("duplicate", getattr(exc, "existing_partner", None) is not None)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _item: create(), range(2)))
        self.assertEqual([item[0] for item in results].count("ok"), 1)
        self.assertEqual([item[0] for item in results].count("duplicate"), 1)
        self.assertEqual(self.repo.list_partners("동시 거래처")[0]["name"], "동시 거래처")

    def test_ensure_explicit_existing_and_new_partner(self):
        existing = self.repo.create_partner({"name": "Existing"})
        conn = self.db.get_db_connection()
        self.assertEqual(self.repo.ensure_partner_for_project({"partner_id": existing["id"], "client_name": "Other"}, conn.cursor()), existing["id"])
        self.assertEqual(self.repo.ensure_partner_for_project({"client_name": "Existing"}, conn.cursor()), existing["id"])
        new_id = self.repo.ensure_partner_for_project({"client_name": "New", "phone": "010"}, conn.cursor())
        self.assertTrue(new_id)
        conn.commit()
        self.assertEqual(self.repo.find_partner_by_name("New")["id"], new_id)
        conn.close()

    def test_database_compatibility_reexports_repository_and_connection(self):
        database = importlib.import_module("database")
        self.assertIs(database.get_db_connection, self.db.get_db_connection)
        self.assertIs(database.list_partners, self.repo.list_partners)
        self.assertIs(database.create_partner, self.repo.create_partner)
        database.init_db()


if __name__ == "__main__":
    unittest.main()
