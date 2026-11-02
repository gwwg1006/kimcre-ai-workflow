import json
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


class AiPlanServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "plans.db")
        self.pending = str(Path(self.tmp.name) / "ai_pending")
        self.db_patch = patch.object(db, "DB_PATH", self.db_path)
        self.dir_patch = patch.object(config, "AI_PENDING_DIR", self.pending)
        self.db_patch.start()
        self.dir_patch.start()
        migrations.init_db()

    def tearDown(self):
        self.dir_patch.stop()
        self.db_patch.stop()
        self.tmp.cleanup()

    def _source(self, name="견적서.PDF", content=b"sample"):
        path = Path(self.tmp.name) / name
        path.write_bytes(content)
        return path

    def test_create_json_public_redaction_and_copy(self):
        source = self._source()
        plan = ai_plan_service.create_plan(
            "project", {"updated_fields": {"memo": "safe"}}, {"p": "abc"},
            project_no="260824-001", file_paths=[str(source)],
            now=datetime(2026, 8, 24, tzinfo=timezone.utc), ttl_seconds=60,
        )
        self.assertEqual(plan["status"], "pending")
        self.assertNotIn("staged_path", json.dumps(plan))
        self.assertNotIn("stored_name", json.dumps(plan))
        self.assertEqual(plan["staged_files"], [{"original_name": "견적서.PDF", "size": 6}])
        staging = Path(self.pending) / plan["id"]
        self.assertEqual(len(list(staging.iterdir())), 1)
        self.assertEqual(list(staging.iterdir())[0].suffix, ".pdf")
        raw = ai_plans.get_plan(plan["id"])
        self.assertIn("updated_fields", json.loads(raw["proposal_json"]))
        self.assertNotIn("prompt", raw["proposal_json"])

    def test_cancel_is_idempotent_and_removes_staging(self):
        plan = ai_plan_service.create_plan("global", {"x": 1})
        staging = Path(self.pending) / plan["id"]
        self.assertTrue(staging.exists())
        cancelled = ai_plan_service.cancel_plan(plan["id"])
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertFalse(staging.exists())
        self.assertEqual(ai_plan_service.cancel_plan(plan["id"])["status"], "cancelled")

    def test_expire_cleanup_and_applied_cannot_cancel(self):
        old = datetime(2026, 8, 24, tzinfo=timezone.utc)
        plan = ai_plan_service.create_plan("global", {}, now=old, ttl_seconds=1)
        self.assertEqual(ai_plan_service.cleanup_expired_plans(datetime(2026, 8, 24, 0, 1, tzinfo=timezone.utc)), 1)
        self.assertEqual(ai_plan_service.get_public_plan(plan["id"])["status"], "expired")
        applied = ai_plan_service.create_plan("global", {})
        ai_plans.update_plan_status(applied["id"], "applied", "2026-08-24T00:00:00+00:00")
        with self.assertRaises(ValueError):
            ai_plan_service.cancel_plan(applied["id"])

    def test_limits_and_failure_cleanup(self):
        bad = self._source("bad.exe")
        with self.assertRaises(ValueError):
            ai_plan_service.create_plan("global", {}, file_paths=[str(bad)])
        missing = Path(self.tmp.name) / "missing.pdf"
        with self.assertRaises(ValueError):
            ai_plan_service.create_plan("global", {}, file_paths=[str(missing)])
        with patch.object(ai_plan_service.ai_plans, "insert_plan", side_effect=RuntimeError("db")):
            with self.assertRaises(RuntimeError):
                ai_plan_service.create_plan("global", {}, file_paths=[str(self._source())])
        self.assertEqual(list(Path(self.pending).glob("*")), [])

    def test_duplicate_basename_is_rejected_case_insensitively(self):
        first = self._source("Part.PDF")
        second = self._source("part.pdf")
        with self.assertRaises(ValueError):
            ai_plan_service.create_plan("global", {}, file_paths=[str(first), str(second)])

    def test_filename_domain_rejects_dot_nul_control_and_nfkc_duplicates(self):
        for name in (".", "..", "bad\x00.pdf", "bad\n.pdf"):
            with self.subTest(name=repr(name)):
                with self.assertRaises(ValueError):
                    ai_plan_service.create_plan("global", {}, file_records=[{"path": str(self._source("safe.pdf")), "original_name": name}])
        first = self._source("nfkc-a.pdf")
        second = self._source("nfkc-b.pdf")
        with self.assertRaises(ValueError):
            ai_plan_service.create_plan("global", {}, file_records=[
                {"path": str(first), "original_name": "Ａ.pdf"},
                {"path": str(second), "original_name": "A.pdf"},
            ])

    def test_concurrent_claim_has_exactly_one_winner(self):
        plan = ai_plan_service.create_plan("global", {})
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda _: ai_plan_service.claim_plan_for_apply(plan["id"]), range(2)))
        self.assertEqual(sum(item["claimed"] for item in outcomes), 1)
        self.assertEqual({item["status"] for item in outcomes}, {"applying"})

    def test_claim_expired_transitions_and_finalize_is_cached(self):
        plan = ai_plan_service.create_plan("global", {}, now=datetime(2026, 8, 24, tzinfo=timezone.utc), ttl_seconds=1)
        expired = ai_plan_service.claim_plan_for_apply(plan["id"], datetime(2026, 8, 24, 0, 1, tzinfo=timezone.utc))
        self.assertFalse(expired["claimed"])
        self.assertEqual(expired["status"], "expired")

        applying = ai_plan_service.create_plan("global", {})
        ai_plan_service.claim_plan_for_apply(applying["id"])
        finalized = ai_plan_service.finalize_plan(applying["id"], "applied", {"ok": True})
        self.assertFalse(finalized["cached"])
        cached = ai_plan_service.finalize_plan(applying["id"], "applied", {"ok": False})
        self.assertTrue(cached["cached"])
        self.assertEqual(cached["result"], {"ok": True})

    def test_stale_applying_is_failed_without_staging_cleanup(self):
        plan = ai_plan_service.create_plan("global", {})
        old = "2026-08-24T00:00:00+00:00"
        ai_plans.update_plan_status(plan["id"], "applying", old)
        outcome = ai_plan_service.claim_plan_for_apply(plan["id"], datetime(2026, 8, 24, 1, 0, tzinfo=timezone.utc))
        self.assertFalse(outcome["claimed"])
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(json.loads(ai_plans.get_plan(plan["id"])["result_json"])["code"], "apply_interrupted_recovery_required")
        self.assertTrue((Path(self.pending) / plan["id"]).exists())

    def test_internal_resolver_rejects_traversal_and_symlink(self):
        source = self._source("model.3mf")
        plan = ai_plan_service.create_plan("global", {}, file_paths=[str(source)])
        resolved = ai_plan_service.resolve_staged_file(plan["id"], "MODEL.3MF")
        self.assertTrue(Path(resolved).is_file())
        self.assertEqual(Path(resolved).parent, Path(self.pending).resolve() / plan["id"])
        with self.assertRaises(FileNotFoundError):
            ai_plan_service.resolve_staged_file(plan["id"], "../model.3mf")
        internal = ai_plan_service.get_internal_plan(plan["id"])
        stored = internal["staged_files"][0]["stored_name"]
        staged = Path(self.pending) / plan["id"]
        (staged / stored).unlink()
        (staged / stored).symlink_to(source)
        with self.assertRaises(FileNotFoundError):
            ai_plan_service.resolve_staged_file(plan["id"], "model.3mf")

    def test_cleanup_failure_is_recorded_without_reversing_status(self):
        plan = ai_plan_service.create_plan("global", {})
        with patch.object(ai_plan_service.shutil, "rmtree", side_effect=OSError("busy")):
            cancelled = ai_plan_service.cancel_plan(plan["id"])
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertTrue(cancelled["result"]["cleanup_pending"])
        self.assertTrue(cancelled["result"]["warnings"])

        applied = ai_plan_service.create_plan("global", {})
        ai_plan_service.claim_plan_for_apply(applied["id"])
        with patch.object(ai_plan_service.shutil, "rmtree", side_effect=OSError("busy")):
            finalized = ai_plan_service.finalize_plan(applied["id"], "applied", {"ok": True})
        self.assertEqual(finalized["status"], "applied")
        self.assertTrue(finalized["result"]["cleanup_pending"])

    def test_fingerprint_stable_without_updated_at_and_detects_change(self):
        project = {"project_no": "p", "client_name": "A", "updated_at": "one", "items": [{"name": "x", "quantity": 1}]}
        same = dict(project, updated_at="two")
        changed = dict(project, memo="changed")
        changed_file = dict(project, slicing_file="new.3mf")
        self.assertEqual(ai_plan_service.project_fingerprint(project), ai_plan_service.project_fingerprint(same))
        self.assertNotEqual(ai_plan_service.project_fingerprint(project), ai_plan_service.project_fingerprint(changed))
        self.assertNotEqual(ai_plan_service.project_fingerprint(project), ai_plan_service.project_fingerprint(changed_file))


if __name__ == "__main__":
    unittest.main()
