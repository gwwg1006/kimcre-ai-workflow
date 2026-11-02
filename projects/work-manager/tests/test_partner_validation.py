import importlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import config
import db
import migrations


class PartnerValidationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = db.DB_PATH
        db.DB_PATH = str(Path(self.tmp.name) / "partners.db")
        migrations.init_db()
        self.repo = importlib.import_module("repositories.partners")

    def tearDown(self):
        db.DB_PATH = self.old
        self.tmp.cleanup()

    def test_canonical_type_and_legacy_alias(self):
        created = self.repo.create_partner({"name": "업체", "partner_type": "업체/개인"})
        self.assertEqual(created["partner_type"], "미분류")
        updated = self.repo.update_partner(created["id"], {"partner_type": "개인"})
        self.assertEqual(updated["partner_type"], "개인")
        with self.assertRaises(ValueError):
            self.repo.create_partner({"name": "잘못", "partner_type": "기타"})

    def test_fresh_and_backfill_defaults_are_canonical_and_legacy_migration_is_idempotent(self):
        conn = db.get_db_connection()
        conn.execute("INSERT INTO partners (name, partner_type, is_active) VALUES (?, ?, ?)", ("레거시", "업체/개인", 0))
        conn.execute("INSERT INTO projects (project_no, client_name, job_name) VALUES (?, ?, ?)", ("260824-777", "신규 고객", "작업"))
        conn.commit()
        legacy_id = conn.execute("SELECT id FROM partners WHERE name = '레거시'").fetchone()[0]
        conn.close()
        migrations.init_db()
        migrations.init_db()
        conn = db.get_db_connection()
        try:
            legacy = conn.execute("SELECT id, partner_type, is_active FROM partners WHERE id = ?", (legacy_id,)).fetchone()
            fresh = conn.execute("SELECT partner_type FROM partners WHERE name = '신규 고객'").fetchone()
            self.assertEqual((legacy[0], legacy[1], legacy[2]), (legacy_id, "미분류", 0))
            self.assertEqual(fresh[0], "미분류")
        finally:
            conn.close()

    def test_limits_controls_and_non_string_values(self):
        cases = (
            {"name": "a" * 101},
            {"name": "a\x00"},
            {"name": "a", "phone": 123},
            {"name": "a", "memo": "m" * 2001},
            {"name": "a", "address": "x" * 301},
        )
        for data in cases:
            with self.subTest(data=data), self.assertRaises(ValueError):
                self.repo.create_partner(data)
        created = self.repo.create_partner({"name": "안전", "memo": "첫 줄\n둘째 줄"})
        self.assertEqual(created["memo"], "첫 줄\n둘째 줄")

    def test_is_active_injection_is_not_updateable(self):
        created = self.repo.create_partner({"name": "보관 대상"})
        updated = self.repo.update_partner(created["id"], {"name": "보관 대상", "is_active": 0})
        self.assertEqual(updated["is_active"], 1)

    def test_project_partner_creation_uses_same_validation(self):
        conn = db.get_db_connection()
        try:
            with self.assertRaises(ValueError):
                self.repo.ensure_partner_for_project({"client_name": "x", "phone": 123}, conn.cursor())
        finally:
            conn.rollback()
            conn.close()


if __name__ == "__main__":
    unittest.main()
