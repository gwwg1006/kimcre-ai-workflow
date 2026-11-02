import multiprocessing
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import ai_apply_service
import config
import db
import ai_plan_service
import migrations
from file_service import project_batch_lock


def _hold_lock(lock_root, ready, release):
    with project_batch_lock("260824-001", lock_root=lock_root, timeout=1):
        ready.set()
        release.wait(3)


class AiApplyLockingTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmp.name) / "data"
        self.data_dir.mkdir()
        self.project = {"project_no": "260824-001", "project_path": str(Path(self.tmp.name) / "project"), "client_name": "고객", "items": []}
        self.plan = {
            "id": "plan-1", "scope": "project", "project_no": "260824-001", "status": "applying",
            "proposal": {"updated_fields": {"memo": "safe"}, "executed_updates": [], "file_operations": []},
            "expected_fingerprints": {"260824-001": "fp"}, "staged_files": [],
        }

    def tearDown(self):
        self.tmp.cleanup()

    def _patch_common(self, finalize):
        return patch.multiple(
            ai_apply_service,
            claim_plan_for_apply=lambda _id: {"claimed": True, "status": "applying"},
            get_internal_plan=lambda _id: dict(self.plan),
            get_project_by_no=lambda _no: dict(self.project),
            project_fingerprint=lambda _project: "fp",
            finalize_plan=finalize,
            config=config,
        )

    def test_busy_lock_finalizes_without_mutation(self):
        ready, release = multiprocessing.Event(), multiprocessing.Event()
        child = multiprocessing.Process(target=_hold_lock, args=(str(self.data_dir), ready, release))
        child.start(); self.assertTrue(ready.wait(2))
        finalized = []
        try:
            def finalize(_id, status, result):
                finalized.append((status, result)); return {"status": status, "result": result}
            original_lock = ai_apply_service.project_batch_lock
            def short_lock(project_no, lock_root=None):
                return original_lock(project_no, lock_root=lock_root, timeout=0.1)
            with self._patch_common(finalize), patch.object(ai_apply_service.config, "DATA_DIR", str(self.data_dir)), \
                 patch.object(ai_apply_service, "project_batch_lock", short_lock), \
                 patch.object(ai_apply_service, "update_project_in_db") as update:
                result = ai_apply_service.apply_plan("plan-1")
            self.assertEqual(result["status"], "failed")
            self.assertEqual(finalized[0][1]["code"], "project_busy")
            update.assert_not_called()
        finally:
            release.set(); child.join(3)
            if child.is_alive(): child.terminate(); child.join(1)

    def test_retries_after_lock_release_and_mutates_once(self):
        finalized = []
        def finalize(_id, status, result):
            finalized.append((status, result)); return {"status": status, "result": result}
        with self._patch_common(finalize), patch.object(ai_apply_service.config, "DATA_DIR", str(self.data_dir)), \
             patch.object(ai_apply_service, "update_project_in_db", return_value=dict(self.project)) as update:
            result = ai_apply_service.apply_plan("plan-1")
        self.assertEqual(result["status"], "applied")
        update.assert_called_once_with("260824-001", {"memo": "safe"})

    def test_fingerprint_change_while_rechecking_stops_before_mutation(self):
        finalized = []
        def finalize(_id, status, result):
            finalized.append((status, result)); return {"status": status, "result": result}
        fingerprints = iter(("fp", "changed"))
        with self._patch_common(finalize), patch.object(ai_apply_service.config, "DATA_DIR", str(self.data_dir)), \
             patch.object(ai_apply_service, "project_fingerprint", side_effect=lambda _project: next(fingerprints)), \
             patch.object(ai_apply_service, "update_project_in_db") as update:
            result = ai_apply_service.apply_plan("plan-1")
        self.assertEqual(result["status"], "failed")
        self.assertEqual(finalized[0][1]["code"], "stale_or_missing")
        update.assert_not_called()

    def test_same_pending_plan_concurrent_apply_mutates_once(self):
        db_path = str(self.data_dir / "plans.db")
        pending = str(self.data_dir / "pending")
        proposal = {"updated_fields": {"memo": "once"}, "executed_updates": [], "file_operations": []}
        with patch.object(db, "DB_PATH", db_path), patch.object(config, "AI_PENDING_DIR", pending):
            migrations.init_db()
            plan = ai_plan_service.create_plan(
                "project", proposal, {"260824-001": "fp"}, project_no="260824-001"
            )
            entered = multiprocessing.Event()
            release = multiprocessing.Event()
            calls = []

            def update(project_no, fields):
                calls.append((project_no, fields))
                entered.set()
                release.wait(2)
                return dict(self.project)

            def invoke():
                return ai_apply_service.apply_plan(plan["id"])

            with patch.object(ai_apply_service, "get_project_by_no", return_value=dict(self.project)), \
                 patch.object(ai_apply_service, "project_fingerprint", return_value="fp"), \
                 patch.object(ai_apply_service, "update_project_in_db", side_effect=update), \
                 patch.object(ai_apply_service.config, "DATA_DIR", str(self.data_dir)):
                pool = ThreadPoolExecutor(max_workers=2)
                first_future = pool.submit(invoke)
                self.assertTrue(entered.wait(2))
                second_future = pool.submit(invoke)
                second_result = second_future.result(timeout=2)
                release.set()
                first_result = first_future.result(timeout=2)
                pool.shutdown(wait=True)
                results = [first_result, second_result]

            self.assertEqual(len(calls), 1)
            self.assertEqual(sum(item.get("status") == "applied" for item in results), 1)
            self.assertEqual(sum(item.get("status") == "applying" for item in results), 1)
            self.assertEqual(ai_plan_service.get_public_plan(plan["id"])["status"], "applied")

    def test_different_plans_same_project_second_is_stale(self):
        db_path = str(self.data_dir / "plans.db")
        pending = str(self.data_dir / "pending")
        proposal = {"updated_fields": {"memo": "once"}, "executed_updates": [], "file_operations": []}
        with patch.object(db, "DB_PATH", db_path), patch.object(config, "AI_PENDING_DIR", pending):
            migrations.init_db()
            first = ai_plan_service.create_plan("project", proposal, {"260824-001": "fp"}, project_no="260824-001")
            second = ai_plan_service.create_plan("project", proposal, {"260824-001": "fp"}, project_no="260824-001")
            entered = multiprocessing.Event()
            release = multiprocessing.Event()
            calls = []

            def update(project_no, fields):
                calls.append(project_no)
                entered.set(); release.wait(2)
                return dict(self.project)

            def invoke(plan_id):
                return ai_apply_service.apply_plan(plan_id)

            with patch.object(ai_apply_service, "get_project_by_no", return_value=dict(self.project)), \
                 patch.object(ai_apply_service, "project_fingerprint", side_effect=lambda _project: "fp" if len(calls) == 0 else "changed"), \
                 patch.object(ai_apply_service, "update_project_in_db", side_effect=update), \
                 patch.object(ai_apply_service.config, "DATA_DIR", str(self.data_dir)):
                pool = ThreadPoolExecutor(max_workers=2)
                first_future = pool.submit(invoke, first["id"])
                self.assertTrue(entered.wait(2))
                second_future = pool.submit(invoke, second["id"])
                release.set()
                results = [first_future.result(timeout=2), second_future.result(timeout=2)]
                pool.shutdown(wait=True)

            self.assertEqual(calls, ["260824-001"])
            statuses = {item.get("status") for item in results}
            self.assertIn("applied", statuses)
            self.assertIn("failed", statuses)


if __name__ == "__main__":
    unittest.main()
