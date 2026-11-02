import hashlib
import importlib
import io
import multiprocessing
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
import config


def _hold_project_lock(lock_root, ready, release):
    from file_service import project_batch_lock

    with project_batch_lock("TEST-001", lock_root=lock_root, timeout=1):
        ready.set()
        release.wait(3)


class FileBatchIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import importlib
        import sys

        cls.tmp_db = tempfile.TemporaryDirectory()
        db = sys.modules.get("db") or importlib.import_module("db")
        cls.db_module = db
        cls.original_db_path = db.DB_PATH
        db.DB_PATH = str(Path(cls.tmp_db.name) / "app.db")
        cls.migrations = importlib.import_module("migrations")
        cls.migrations.init_db()
        cls.app_module = importlib.import_module("app")
        cls.routes = importlib.import_module("routes.files")

    @classmethod
    def tearDownClass(cls):
        cls.db_module.DB_PATH = cls.original_db_path
        cls.tmp_db.cleanup()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root_patches = [patch.object(config, "PROJECTS_DIR", self.tmp.name), patch.object(config, "COMPLETED_DIR", self.tmp.name)]
        for item in self.root_patches:
            item.start()
            self.addCleanup(item.stop)
        root = Path(self.tmp.name)
        self.project = root / "project"
        for name in ("00_작업정보", "01_수신원본", "02_모델수정", "03_슬라이싱_3MF", "04_출력검수", "05_견적거래", "06_배송"):
            (self.project / name).mkdir(parents=True)
        self.old_root = self.project / "03_슬라이싱_3MF" / "P01_작업_v01.3mf"
        self.old_root.write_bytes(b"old-root")
        self.old_raw = self.project / "01_수신원본" / "old.3mf"
        self.old_raw.write_bytes(b"old-raw")
        self.db = importlib.import_module("db")
        conn = self.db.get_db_connection()
        conn.execute("DELETE FROM projects WHERE project_no=?", ("TEST-001",))
        conn.execute(
            "INSERT INTO projects(project_no, client_name, job_name, project_path, slicing_file, received_date) VALUES (?, ?, ?, ?, ?, ?)",
            ("TEST-001", "고객", "작업", str(self.project), self.old_root.name, "2026-08-24"),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        self.tmp.cleanup()

    @staticmethod
    def _valid_3mf(payload):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("3D/3dmodel.model", payload)
        stream.seek(0)
        return stream

    @staticmethod
    def _tree_digest(root):
        rows = []
        for path in sorted(root.rglob("*")):
            if path.is_file() and not path.is_symlink():
                rows.append((str(path.relative_to(root)), hashlib.sha256(path.read_bytes()).hexdigest()))
        return rows

    def _slicing_file(self):
        conn = self.db.get_db_connection()
        try:
            return conn.execute(
                "SELECT slicing_file FROM projects WHERE project_no='TEST-001'"
            ).fetchone()[0]
        finally:
            conn.close()

    def test_real_mixed_batch_db_failure_restores_files_and_db(self):
        before_tree = self._tree_digest(self.project)
        before_db = self._slicing_file()
        real_update = self.routes.update_project_in_db
        real_rollback = self.routes.rollback_project_3mf_replacement
        update_calls = 0
        rollback_errors = []

        def fail_after_final_update(project_no, data):
            nonlocal update_calls
            update_calls += 1
            result = real_update(project_no, data)
            if update_calls == 1:
                raise RuntimeError("injected final DB failure")
            return result

        def record_rollback(*args, **kwargs):
            try:
                return real_rollback(*args, **kwargs)
            except Exception as exc:
                rollback_errors.append(repr(exc))
                raise

        files = {
            "tab_key": "slicing",
            "files": [
                (io.BytesIO(b"stl-bytes"), "part.stl"),
                (self._valid_3mf(b"first"), "first.3mf"),
                (self._valid_3mf(b"second"), "second.3mf"),
            ],
        }
        with patch.object(self.routes, "DATA_DIR", self.tmp.name), \
             patch.object(self.routes, "get_project_by_no", return_value={
                 "project_no": "TEST-001", "project_path": str(self.project),
                 "folder_path": str(self.project), "slicing_file": before_db,
                 "job_name": "작업",
             }), \
             patch.object(self.routes, "update_project_in_db", side_effect=fail_after_final_update), \
             patch.object(self.routes, "rollback_project_3mf_replacement", side_effect=record_rollback):
            response = self.app_module.app.test_client().post(
                "/api/projects/TEST-001/files/upload", data=files,
                content_type="multipart/form-data",
            )
        self.assertEqual(response.status_code, 500)
        self.assertFalse(rollback_errors)
        self.assertEqual(self._tree_digest(self.project), before_tree)
        self.assertEqual(self._slicing_file(), before_db)
        self.assertFalse(list((self.project / "01_수신원본").glob(".*uploading")))
        self.assertFalse(list((Path(self.tmp.name) / "temp_uploads").glob("*")))

    def test_second_real_publish_failure_rolls_back_first_receipt(self):
        before_tree = self._tree_digest(self.project)
        real_replace = self.routes.replace_or_save_project_3mf
        final_replaces = 0

        def fail_second_publish(*args, **kwargs):
            nonlocal final_replaces
            original_replace = self.routes.replace_or_save_project_3mf
            # The low-level service remains real; inject only the second call.
            final_replaces += 1
            if final_replaces == 2:
                import file_service
                original_os_replace = file_service.os.replace

                def fail_target(src, dst):
                    if Path(dst).parent.name == "03_슬라이싱_3MF" and Path(dst).suffix == ".3mf" and Path(src).name.startswith("."):
                        raise OSError("injected second publish failure")
                    return original_os_replace(src, dst)

                with patch.object(file_service.os, "replace", side_effect=fail_target):
                    return real_replace(*args, **kwargs)
            return original_replace(*args, **kwargs)

        files = {"tab_key": "slicing", "files": [
            (self._valid_3mf(b"first"), "first.3mf"),
            (self._valid_3mf(b"second"), "second.3mf"),
        ]}
        with patch.object(self.routes, "DATA_DIR", self.tmp.name), \
             patch.object(self.routes, "get_project_by_no", return_value={
                 "project_no": "TEST-001", "project_path": str(self.project),
                 "folder_path": str(self.project), "slicing_file": self.old_root.name,
                 "job_name": "작업",
             }), \
             patch.object(self.routes, "replace_or_save_project_3mf", side_effect=fail_second_publish), \
             patch.object(self.routes, "update_project_in_db"):
            response = self.app_module.app.test_client().post(
                "/api/projects/TEST-001/files/upload", data=files,
                content_type="multipart/form-data",
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self._tree_digest(self.project), before_tree)
        self.assertFalse(list((self.project / "01_수신원본").glob(".*uploading")))

    def test_project_lock_is_cross_process_and_bounded(self):
        ready = multiprocessing.Event()
        release = multiprocessing.Event()
        process = multiprocessing.Process(target=_hold_project_lock, args=(self.tmp.name, ready, release))
        process.start()
        self.assertTrue(ready.wait(2))
        from file_service import ProjectBatchLockTimeout, project_batch_lock

        try:
            with self.assertRaises(ProjectBatchLockTimeout):
                with project_batch_lock("TEST-001", lock_root=self.tmp.name, timeout=0.1):
                    pass
        finally:
            release.set()
            process.join(3)
            if process.is_alive():
                process.terminate()
                process.join(3)
        self.assertEqual(process.exitcode, 0)


if __name__ == "__main__":
    unittest.main()
