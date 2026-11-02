import importlib
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import ai_plan_service
import config
import db
import migrations
from repositories import ai_plans


class AiPlanCasTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "plans.db")
        self.db_patch = patch.object(db, "DB_PATH", self.db_path)
        self.pending_patch = patch.object(config, "AI_PENDING_DIR", str(Path(self.tmp.name) / "pending"))
        self.db_patch.start()
        self.pending_patch.start()
        migrations.init_db()

    def tearDown(self):
        self.pending_patch.stop()
        self.db_patch.stop()
        self.tmp.cleanup()

    def test_plan_indexes_are_idempotent(self):
        migrations.init_db()
        conn = db.get_db_connection()
        try:
            names = {row[1] for row in conn.execute("PRAGMA index_list(ai_plans)").fetchall()}
            self.assertTrue({
                "idx_ai_plans_status_expires",
                "idx_ai_plans_project_status",
                "idx_ai_plans_updated",
            } <= names)
        finally:
            conn.close()

    def test_status_update_is_compare_and_set(self):
        plan = ai_plan_service.create_plan("global", {})
        won = ai_plans.update_plan_status(
            plan["id"], "cancelled", "now", expected_status="pending"
        )
        lost = ai_plans.update_plan_status(
            plan["id"], "failed", "later", expected_status="pending"
        )
        self.assertTrue(won["updated"])
        self.assertEqual(won["row"]["status"], "cancelled")
        self.assertFalse(lost["updated"])
        self.assertEqual(lost["row"]["status"], "cancelled")

    def test_duplicate_finalize_only_one_wins_and_other_reads_cache(self):
        plan = ai_plan_service.create_plan("global", {})
        ai_plan_service.claim_plan_for_apply(plan["id"])
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(
                lambda value: ai_plan_service.finalize_plan(plan["id"], "applied", {"winner": value}),
                (1, 2),
            ))
        self.assertEqual({item["status"] for item in outcomes}, {"applied"})
        self.assertEqual(sum(not item["cached"] for item in outcomes), 1)
        self.assertEqual(sum(bool(item["cached"]) for item in outcomes), 1)

    def test_cancel_and_claim_are_terminal_or_single_winner(self):
        plan = ai_plan_service.create_plan("global", {})
        cancelled = ai_plan_service.cancel_plan(plan["id"])
        self.assertEqual(cancelled["status"], "cancelled")
        claim = ai_plan_service.claim_plan_for_apply(plan["id"])
        self.assertFalse(claim["claimed"])
        self.assertEqual(claim["status"], "cancelled")

    def test_retryable_failed_claim_preserves_result_until_finalize(self):
        plan = ai_plan_service.create_plan("global", {})
        ai_plan_service.claim_plan_for_apply(plan["id"])
        ai_plan_service.finalize_plan(plan["id"], "failed", {"code": "project_busy", "retryable": True})
        retry = ai_plan_service.claim_plan_for_apply(plan["id"])
        self.assertTrue(retry["claimed"])
        self.assertEqual(ai_plans.get_plan(plan["id"])["status"], "applying")
        self.assertEqual(ai_plans.get_plan(plan["id"])["result_json"], '{"code": "project_busy", "retryable": true}')

    def test_busy_failure_preserves_staging_until_retry_success(self):
        source = Path(self.tmp.name) / "model.3mf"
        source.write_bytes(b"3mf-bytes")
        plan = ai_plan_service.create_plan(
            "global", {}, file_records=[{"path": str(source), "original_name": "model.3mf"}]
        )
        staging = Path(config.AI_PENDING_DIR) / plan["id"]
        ai_plan_service.claim_plan_for_apply(plan["id"])
        ai_plan_service.finalize_plan(plan["id"], "failed", {"code": "project_busy", "retryable": True})
        self.assertTrue(staging.exists())
        self.assertTrue(ai_plan_service.verify_confirmation_token(plan["id"], plan["confirmation_token"]))
        self.assertTrue(Path(ai_plan_service.resolve_staged_file(plan["id"], "model.3mf")).exists())
        ai_plan_service.claim_plan_for_apply(plan["id"])
        ai_plan_service.finalize_plan(plan["id"], "applied", {"ok": True})
        self.assertFalse(staging.exists())
        self.assertIsNotNone(ai_plans.get_plan(plan["id"])["applied_at"])

    def test_retryable_busy_expires_and_is_swept(self):
        old = datetime(2026, 8, 24, tzinfo=timezone.utc)
        source = Path(self.tmp.name) / "model.3mf"
        source.write_bytes(b"3mf-bytes")
        plan = ai_plan_service.create_plan(
            "global", {}, file_records=[{"path": str(source), "original_name": "model.3mf"}],
            now=old, ttl_seconds=1,
        )
        staging = Path(config.AI_PENDING_DIR) / plan["id"]
        ai_plan_service.claim_plan_for_apply(plan["id"], old)
        ai_plan_service.finalize_plan(plan["id"], "failed", {"code": "project_busy", "retryable": True})
        self.assertEqual(
            ai_plan_service.cleanup_expired_plans(datetime(2026, 8, 24, 0, 1, tzinfo=timezone.utc)),
            1,
        )
        self.assertEqual(ai_plan_service.get_public_plan(plan["id"])["status"], "expired")
        self.assertFalse(staging.exists())

    def test_nonretry_failure_cleans_staging_and_leaves_applied_at_null(self):
        source = Path(self.tmp.name) / "model.3mf"
        source.write_bytes(b"3mf-bytes")
        plan = ai_plan_service.create_plan(
            "global", {}, file_records=[{"path": str(source), "original_name": "model.3mf"}]
        )
        staging = Path(config.AI_PENDING_DIR) / plan["id"]
        ai_plan_service.claim_plan_for_apply(plan["id"])
        ai_plan_service.finalize_plan(plan["id"], "failed", {"code": "file_operation_failed"})
        row = ai_plans.get_plan(plan["id"])
        self.assertFalse(staging.exists())
        self.assertIsNone(row["applied_at"])

    def test_direct_pending_expiry_claim_removes_staging(self):
        old = datetime(2026, 8, 24, tzinfo=timezone.utc)
        source = Path(self.tmp.name) / "pending.3mf"
        source.write_bytes(b"pending")
        plan = ai_plan_service.create_plan(
            "global", {}, file_records=[{"path": str(source), "original_name": "pending.3mf"}],
            now=old, ttl_seconds=1,
        )
        staging = Path(config.AI_PENDING_DIR) / plan["id"]
        outcome = ai_plan_service.claim_plan_for_apply(
            plan["id"], datetime(2026, 8, 24, 0, 1, tzinfo=timezone.utc)
        )
        self.assertEqual(outcome["status"], "expired")
        self.assertFalse(staging.exists())

    def test_direct_retryable_expiry_claim_removes_staging(self):
        old = datetime(2026, 8, 24, tzinfo=timezone.utc)
        source = Path(self.tmp.name) / "busy.3mf"
        source.write_bytes(b"busy")
        plan = ai_plan_service.create_plan(
            "global", {}, file_records=[{"path": str(source), "original_name": "busy.3mf"}],
            now=old, ttl_seconds=1,
        )
        staging = Path(config.AI_PENDING_DIR) / plan["id"]
        ai_plan_service.claim_plan_for_apply(plan["id"], old)
        ai_plan_service.finalize_plan(plan["id"], "failed", {"code": "project_busy", "retryable": True})
        outcome = ai_plan_service.claim_plan_for_apply(
            plan["id"], datetime(2026, 8, 24, 0, 1, tzinfo=timezone.utc)
        )
        self.assertEqual(outcome["status"], "expired")
        self.assertFalse(staging.exists())

    def test_expired_cleanup_failure_keeps_expired_status_and_warning(self):
        old = datetime(2026, 8, 24, tzinfo=timezone.utc)
        source = Path(self.tmp.name) / "busy-warning.3mf"
        source.write_bytes(b"busy-warning")
        plan = ai_plan_service.create_plan(
            "global", {}, file_records=[{"path": str(source), "original_name": "busy-warning.3mf"}],
            now=old, ttl_seconds=1,
        )
        ai_plan_service.claim_plan_for_apply(plan["id"], old)
        ai_plan_service.finalize_plan(plan["id"], "failed", {"code": "project_busy", "retryable": True})
        with patch("ai_plan_service.shutil.rmtree", side_effect=OSError("busy")):
            outcome = ai_plan_service.claim_plan_for_apply(
                plan["id"], datetime(2026, 8, 24, 0, 1, tzinfo=timezone.utc)
            )
        self.assertEqual(outcome["status"], "expired")
        public = ai_plan_service.get_public_plan(plan["id"])
        self.assertEqual(public["status"], "expired")
        self.assertTrue(public["result"]["cleanup_pending"])


if __name__ == "__main__":
    unittest.main()
