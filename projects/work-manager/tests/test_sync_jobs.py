import importlib
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import openpyxl
import fcntl
import time
import threading
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
import config


class SyncJobsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.root_patches = [patch.object(config, "PROJECTS_DIR", str(root / "projects")), patch.object(config, "COMPLETED_DIR", str(root / "completed"))]
        for item in self.root_patches:
            item.start()
            self.addCleanup(item.stop)
        self.db = importlib.import_module("db")
        self.addCleanup(setattr, self.db, "DB_PATH", self.db.DB_PATH)
        self.db.DB_PATH = str(root / "app.db")
        self.migrations = importlib.import_module("migrations")
        self.migrations.init_db()
        self.jobs = importlib.import_module("repositories.sync_jobs")
        self.sync = importlib.import_module("sync_service")
        self.project_root = root / "projects" / "2026" / "260824-001_고객_작업"
        (self.project_root / "00_작업정보").mkdir(parents=True)
        (self.project_root / "00_작업정보" / "작업정보.md").write_text("old", encoding="utf-8")
        conn = self.db.get_db_connection()
        conn.execute("INSERT INTO projects(project_no,client_name,job_name,project_path,received_date) VALUES (?,?,?,?,?)", ("260824-001", "고객", "작업", str(self.project_root), "2026-08-24"))
        conn.commit()
        conn.close()
        self.operations = root / "operations.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "작업대장"
        for col, name in enumerate(("프로젝트번호", "고객명", "작업명", "접수일"), 1):
            ws.cell(1, col, name)
        wb.save(self.operations)
        wb.close()

    def tearDown(self):
        self.tmp.cleanup()

    def _row(self, job_id):
        conn = self.db.get_db_connection()
        row = conn.execute("SELECT * FROM sync_jobs WHERE id=?", (job_id,)).fetchone()
        conn.close()
        return dict(row)

    def test_pending_failed_coalesce_but_processing_gets_new_job(self):
        first = self.jobs.enqueue_job("upsert", "260824-001", {"v": 1})
        same = self.jobs.enqueue_job("upsert", "260824-001", {"v": 2})
        self.assertEqual(first, same)
        self.assertEqual(self._row(first)["payload_json"], '{"v": 2}')
        self.assertTrue(self.jobs.mark_processing(first))
        second = self.jobs.enqueue_job("upsert", "260824-001", {"v": 3})
        self.assertNotEqual(first, second)
        self.assertEqual(self._row(second)["status"], "pending")

    def test_stale_reset_is_committed_and_mark_failure_safe(self):
        job = self.jobs.enqueue_job("upsert", "260824-001")
        conn = self.db.get_db_connection()
        old = (datetime.now(timezone.utc) - timedelta(minutes=20)).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("UPDATE sync_jobs SET status='processing', lease_expires_at=?, updated_at=? WHERE id=?", (old, old, job))
        conn.commit(); conn.close()
        self.jobs.list_pending(stale_before=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        self.assertEqual(self._row(job)["status"], "pending")
        claimed = self.jobs.claim_next()
        self.assertIsNotNone(claimed)
        self.jobs.mark_failed(job, "/private/customer/path", claimed["lease_token"])
        self.assertEqual(self._row(job)["last_error"], "projection_failed")

    def test_processor_success_is_idempotent_and_updates_markdown(self):
        job = self.jobs.enqueue_job("upsert", "260824-001")
        with patch.object(self.sync, "OPERATIONS_FILE", str(self.operations)):
            first = self.sync.process_pending_sync_jobs(limit=10)
            second = self.sync.process_pending_sync_jobs(limit=10)
        self.assertEqual(first["succeeded"], 1)
        self.assertEqual(second["processed"], 0)
        self.assertEqual(self._row(job)["status"], "done")
        self.assertIn("- 고객명: 고객", (self.project_root / "00_작업정보" / "작업정보.md").read_text(encoding="utf-8"))
        wb = openpyxl.load_workbook(self.operations, data_only=True)
        self.assertEqual(wb["작업대장"].cell(2, 1).value, "260824-001")
        wb.close()

    def test_failure_isolated_and_retry_resets_attempts(self):
        bad = self.jobs.enqueue_job("upsert", "missing")
        good = self.jobs.enqueue_job("delete", "260824-001")
        with patch.object(self.sync, "remove_project_from_excel_ledger", return_value=True):
            summary = self.sync.process_pending_sync_jobs(limit=10)
        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["succeeded"], 1)
        self.assertEqual(self._row(bad)["last_error"], "projection_not_found")
        self.assertEqual(self._row(good)["status"], "done")
        self.jobs.reset_failed_jobs()
        self.assertEqual(self._row(bad)["attempts"], 0)
        for _ in range(6):
            if self.jobs.mark_processing(bad):
                self.jobs.mark_failed(bad, "projection_failed", self._row(bad)["lease_token"])
        self.assertEqual(self._row(bad)["attempts"], 5)
        self.assertFalse(self.jobs.mark_processing(bad))

    def test_concurrent_claim_has_one_winner(self):
        job = self.jobs.enqueue_job("upsert", "260824-001")
        with ThreadPoolExecutor(max_workers=2) as pool:
            rows = list(pool.map(lambda _: self.jobs.claim_next(), range(2)))
        winners = [row for row in rows if row]
        self.assertEqual(len(winners), 1)
        self.jobs.mark_failed(job, "projection_failed", winners[0]["lease_token"])

    def test_expired_final_attempt_becomes_failed(self):
        job = self.jobs.enqueue_job("upsert", "260824-001")
        conn = self.db.get_db_connection()
        old = (datetime.now(timezone.utc) - timedelta(minutes=20)).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("UPDATE sync_jobs SET status='processing', attempts=5, lease_expires_at=? WHERE id=?", (old, job))
        conn.commit(); conn.close()
        self.assertIsNone(self.jobs.claim_next())
        row = self._row(job)
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["last_error"], "attempt_limit")
        self.assertEqual(self.jobs.reset_failed_jobs("260824-001"), 1)

    def test_legacy_null_lease_is_requeued_by_migration(self):
        job = self.jobs.enqueue_job("upsert", "260824-001")
        conn = self.db.get_db_connection()
        conn.execute("UPDATE sync_jobs SET status='processing', lease_expires_at=NULL WHERE id=?", (job,))
        conn.commit(); conn.close()
        self.migrations.init_db()
        self.assertEqual(self._row(job)["status"], "pending")

    def test_lock_timeout_is_bounded(self):
        path = os.path.join(tempfile.gettempdir(), "luna-ai-sync-projection.lock")
        with open(path, "a+") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            with self.assertRaises(TimeoutError):
                with self.sync._projection_lock(timeout=0.05):
                    pass
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def test_heartbeat_extends_long_lease(self):
        job = self.jobs.enqueue_job("upsert", "260824-001")
        claimed = self.jobs.claim_next(lease_seconds=1)
        with self.sync._lease_heartbeat(job, claimed["lease_token"], lease_seconds=1) as lost:
            time.sleep(1.15)
            self.assertFalse(lost.is_set())
        self.assertEqual(self._row(job)["status"], "processing")

    def test_completed_projection_with_lost_token_is_superseded_not_failed(self):
        job = self.jobs.enqueue_job("upsert", "260824-001")
        lost = threading.Event()

        @contextmanager
        def fake_heartbeat(_job_id, _token, _seconds):
            yield lost

        with patch.object(self.sync, "_lease_heartbeat", fake_heartbeat), \
             patch.object(self.sync, "sync_project_projections", side_effect=lambda _project_no: lost.set()), \
             patch.object(self.jobs, "mark_done", return_value=False) as mark_done, \
             patch.object(self.jobs, "mark_failed", side_effect=AssertionError("superseded job must not fail")) as mark_failed:
            result = self.sync.process_pending_sync_jobs(limit=1)
        self.assertEqual(result["superseded"], 1)
        self.assertEqual(result["failed"], 0)
        mark_done.assert_called_once()
        mark_failed.assert_not_called()

    def test_heartbeat_busy_timeout_is_bounded(self):
        job = self.jobs.enqueue_job("upsert", "260824-001")
        claimed = self.jobs.claim_next(lease_seconds=10)
        lock_conn = self.db.get_db_connection()
        lock_conn.execute("BEGIN IMMEDIATE")
        started = time.monotonic()
        try:
            with self.assertRaises(Exception):
                self.jobs.heartbeat(job, claimed["lease_token"], lease_seconds=10)
        finally:
            lock_conn.rollback()
            lock_conn.close()
        self.assertLess(time.monotonic() - started, 1.0)

    def test_missing_project_is_safe_failure(self):
        job = self.jobs.enqueue_job("upsert", "not-there")
        result = self.sync.process_pending_sync_jobs(limit=1)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(self._row(job)["last_error"], "projection_not_found")

    def test_delete_ledger_is_idempotent(self):
        with patch.object(self.sync, "OPERATIONS_FILE", str(self.operations)):
            self.assertFalse(self.sync.remove_project_from_excel_ledger("missing"))
            self.assertFalse(self.sync.remove_project_from_excel_ledger("missing"))


if __name__ == "__main__":
    unittest.main()
