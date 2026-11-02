import tempfile
from concurrent.futures import ThreadPoolExecutor
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import file_service
import config


class Replace3mfServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self._projects_patch = patch.object(config, "PROJECTS_DIR", self.temp.name)
        self._completed_patch = patch.object(config, "COMPLETED_DIR", self.temp.name)
        self._projects_patch.start(); self._completed_patch.start()
        self.addCleanup(self._projects_patch.stop)
        self.addCleanup(self._completed_patch.stop)
        self.root = Path(self.temp.name) / "project"
        self.root.mkdir()
        self.slicing = self.root / "03_슬라이싱_3MF"
        self.slicing.mkdir()
        self.source = Path(self.temp.name) / "incoming.3mf"
        with zipfile.ZipFile(self.source, "w") as archive:
            archive.writestr("3D/3dmodel.model", "model")

    def tearDown(self):
        self.temp.cleanup()

    def test_valid_replace_is_atomic_and_preserves_raw_with_warnings_key(self):
        old = self.slicing / "P01_작업_v01.3mf"
        old.write_bytes(b"old")
        result = file_service.replace_or_save_project_3mf(
            str(self.root), str(self.source), "original.3mf", {"job_name": "작업"}
        )
        self.assertTrue(result["success"])
        self.assertFalse(result["rollback"])
        self.assertTrue(result["warnings"] == [])
        self.assertEqual(len(list(self.slicing.glob("*.3mf"))), 1)
        self.assertTrue((self.slicing / "_backup" / result["backup_files"][0]).exists())
        self.assertTrue((self.root / "01_수신원본" / "original.3mf").exists())

    def test_direct_service_original_filename_uses_common_safe_validation(self):
        result = file_service.replace_or_save_project_3mf(str(self.root), str(self.source), "bad\x7f.3mf")
        self.assertTrue(result["success"])
        self.assertIsNone(result["raw_saved"])
        self.assertTrue(result["warnings"])
        self.assertFalse((self.root / "01_수신원본" / "bad\x7f.3mf").exists())

    def test_invalid_or_symlink_source_and_project_are_rejected(self):
        with self.assertRaises(ValueError):
            file_service.replace_or_save_project_3mf(str(self.root), str(self.source.with_suffix(".stl")))
        bad = Path(self.temp.name) / "bad.3mf"
        bad.write_bytes(b"not zip")
        with self.assertRaises(ValueError):
            file_service.replace_or_save_project_3mf(str(self.root), str(bad))
        link = Path(self.temp.name) / "source-link.3mf"
        link.symlink_to(self.source)
        with self.assertRaises(ValueError):
            file_service.replace_or_save_project_3mf(str(self.root), str(link))
        project_link = Path(self.temp.name) / "project-link"
        project_link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(FileNotFoundError):
            file_service.replace_or_save_project_3mf(str(project_link), str(self.source))

    def test_missing_model_entry_and_internal_symlinks_are_rejected(self):
        simple = Path(self.temp.name) / "simple.3mf"
        with zipfile.ZipFile(simple, "w") as archive:
            archive.writestr("other.txt", "x")
        with self.assertRaises(ValueError):
            file_service.replace_or_save_project_3mf(str(self.root), str(simple))
        link = self.slicing / "linked.3mf"
        link.symlink_to(self.source)
        with self.assertRaises(ValueError):
            file_service.replace_or_save_project_3mf(str(self.root), str(self.source))
        link.unlink()
        backup = self.slicing / "_backup"
        backup.mkdir()
        backup_link = backup / "linked.3mf"
        backup_link.symlink_to(self.source)
        with self.assertRaises(ValueError):
            file_service.replace_or_save_project_3mf(str(self.root), str(self.source))

    def test_initial_copy_failure_keeps_existing_state_and_no_temp(self):
        old = self.slicing / "old_v01.3mf"
        old.write_bytes(b"old")
        with patch.object(file_service, "_copy_source_no_follow", side_effect=OSError("copy failed")):
            with self.assertRaises(OSError):
                file_service.replace_or_save_project_3mf(str(self.root), str(self.source))
        self.assertEqual(old.read_bytes(), b"old")
        self.assertFalse(any(p.name.startswith(".") and p.suffix == ".tmp" for p in self.slicing.iterdir()))

    def test_second_backup_move_failure_restores_first_move(self):
        first = self.slicing / "first_v01.3mf"
        second = self.slicing / "second_v01.3mf"
        first.write_bytes(b"first")
        second.write_bytes(b"second")
        real_replace = file_service.os.replace
        def fail_second(src, dst):
            if Path(src).resolve() == second.resolve() and Path(dst).parent.name == "_backup":
                raise OSError("move failed")
            return real_replace(src, dst)
        with patch.object(file_service.os, "replace", side_effect=fail_second):
            with self.assertRaises(OSError):
                file_service.replace_or_save_project_3mf(str(self.root), str(self.source))
        self.assertEqual(first.read_bytes(), b"first")
        self.assertEqual(second.read_bytes(), b"second")
        backup = self.slicing / "_backup"
        self.assertFalse(any(p.suffix.lower() == ".3mf" for p in backup.iterdir()))
        self.assertFalse(any(p.name.startswith(".") and p.suffix == ".tmp" for p in self.slicing.iterdir()))

    def test_move_or_replace_failure_restores_root_files_and_temp(self):
        old = self.slicing / "P01_작업_v01.3mf"
        old.write_bytes(b"old")
        original_replace = file_service.os.replace
        calls = []

        def fail_final(src, dst):
            calls.append((Path(src), Path(dst)))
            if Path(dst).resolve() == (self.slicing / "P01_작업_v02.3mf").resolve():
                raise OSError("replace failed")
            return original_replace(src, dst)

        with patch.object(file_service.os, "replace", side_effect=fail_final):
            with self.assertRaises(OSError):
                file_service.replace_or_save_project_3mf(str(self.root), str(self.source))
        self.assertEqual(old.read_bytes(), b"old")
        self.assertFalse(any(p.name.startswith(".") and p.suffix == ".tmp" for p in self.slicing.iterdir()))

    def test_repeated_replace_uses_unique_backup_names(self):
        old = self.slicing / "P01_작업_v01.3mf"
        old.write_bytes(b"old")
        first = file_service.replace_or_save_project_3mf(str(self.root), str(self.source))
        second = file_service.replace_or_save_project_3mf(str(self.root), str(self.source))
        self.assertNotEqual(first["backup_files"], second["backup_files"])

    def test_raw_copy_failure_keeps_success_and_reports_warning(self):
        real_copy = file_service._copy_source_no_follow
        calls = [0]
        def fail_raw(src, dst):
            calls[0] += 1
            if calls[0] == 2:
                raise OSError("raw copy failed")
            return real_copy(src, dst)
        with patch.object(file_service, "_copy_source_no_follow", side_effect=fail_raw):
            result = file_service.replace_or_save_project_3mf(str(self.root), str(self.source), "raw.3mf")
        self.assertTrue(result["success"])
        self.assertIsNone(result["raw_saved"])
        self.assertTrue(result["warnings"])
        self.assertEqual(len([p for p in self.slicing.glob("*.3mf") if not p.name.startswith(".")]), 1)
        self.assertFalse(any(p.name.startswith(".") and p.suffix == ".tmp" for p in self.slicing.iterdir()))

    def test_public_route_result_does_not_expose_absolute_path(self):
        old = self.slicing / "P01_작업_v01.3mf"
        old.write_bytes(b"old")
        result = file_service.replace_or_save_project_3mf(str(self.root), str(self.source), "raw.3mf")
        self.assertNotIn("/", result["filename"])
        self.assertNotIn("/", result["folder"])

    def test_receipt_is_opt_in_relative_and_raw_is_retained(self):
        old = self.slicing / "P01_작업_v01.3mf"
        old.write_bytes(b"old")
        basic = file_service.replace_or_save_project_3mf(str(self.root), str(self.source), "raw.3mf")
        self.assertNotIn("_rollback_receipt", basic)
        receipt_result = file_service.replace_or_save_project_3mf(
            str(self.root), str(self.source), "raw-2.3mf", {"job_name": "작업"}, include_rollback_receipt=True
        )
        receipt = receipt_result["_rollback_receipt"]
        self.assertEqual(receipt["version"], 1)
        self.assertTrue(receipt["nonce"])
        self.assertEqual(receipt["target_filename"], receipt_result["filename"])
        self.assertTrue(receipt["raw_retained"])
        self.assertNotIn(str(self.root), str(receipt))
        for name in [receipt["target_filename"], receipt["raw_saved"], *receipt["backup_files"], *receipt["backup_files"].values()]:
            self.assertEqual(Path(name).name, name)
            self.assertNotIn("/", name)
            self.assertNotIn("\\", name)

    def test_receipt_rejects_unsafe_filename_generation(self):
        result = file_service.replace_or_save_project_3mf(
            str(self.root), str(self.source), "raw.3mf", include_rollback_receipt=True
        )
        self.assertNotIn("/", result["_rollback_receipt"]["target_filename"])

    def test_receipt_rollback_restores_old_bytes_and_retains_new_recovery(self):
        old = self.slicing / "P01_작업_v01.3mf"
        old.write_bytes(b"old-bytes")
        result = file_service.replace_or_save_project_3mf(
            str(self.root), str(self.source), "raw.3mf", {"job_name": "작업"}, include_rollback_receipt=True
        )
        rollback = file_service.rollback_project_3mf_replacement(str(self.root), result["_rollback_receipt"])
        self.assertTrue(rollback["success"])
        self.assertEqual(old.read_bytes(), b"old-bytes")
        self.assertTrue(any(p.name.startswith("rolled_back_") for p in (self.slicing / "_backup").iterdir()))

    def test_request_receipt_empty_root_removes_new_target_and_raw(self):
        result = file_service.replace_or_save_project_3mf(
            str(self.root), str(self.source), "raw.3mf", {"job_name": "작업"},
            include_rollback_receipt=True, created_by_request=True,
        )
        receipt = result["_rollback_receipt"]
        self.assertTrue(receipt["created_by_request"])
        self.assertTrue((self.slicing / result["filename"]).exists())
        self.assertTrue((self.root / "01_수신원본" / "raw.3mf").exists())
        rollback = file_service.rollback_project_3mf_replacement(str(self.root), receipt)
        self.assertTrue(rollback["success"])
        self.assertFalse((self.slicing / result["filename"]).exists())
        self.assertFalse((self.root / "01_수신원본" / "raw.3mf").exists())

    def test_request_receipt_existing_root_restores_hash_and_removes_new_files(self):
        old = self.slicing / "P01_작업_v01.3mf"
        old.write_bytes(b"old-before")
        result = file_service.replace_or_save_project_3mf(
            str(self.root), str(self.source), "raw.3mf", {"job_name": "작업"},
            include_rollback_receipt=True, created_by_request=True,
        )
        file_service.rollback_project_3mf_replacement(str(self.root), result["_rollback_receipt"])
        self.assertEqual(old.read_bytes(), b"old-before")
        self.assertEqual([p for p in self.slicing.glob("*.3mf")], [old])
        self.assertFalse((self.root / "01_수신원본" / "raw.3mf").exists())

    def test_request_receipt_identity_mismatch_does_not_delete(self):
        result = file_service.replace_or_save_project_3mf(
            str(self.root), str(self.source), "raw.3mf", {"job_name": "작업"},
            include_rollback_receipt=True, created_by_request=True,
        )
        target = self.slicing / result["filename"]
        target.write_bytes(b"tampered")
        with self.assertRaises(file_service.ThreeMFReplaceError) as context:
            file_service.rollback_project_3mf_replacement(str(self.root), result["_rollback_receipt"])
        self.assertIn("rollback_identity_mismatch", context.exception.cleanup_failures)
        self.assertTrue(target.exists())
        self.assertTrue((self.root / "01_수신원본" / "raw.3mf").exists())

    def test_receipt_rollback_rejects_tampered_paths(self):
        old = self.slicing / "old_v01.3mf"
        old.write_bytes(b"old")
        result = file_service.replace_or_save_project_3mf(str(self.root), str(self.source), include_rollback_receipt=True)
        receipt = dict(result["_rollback_receipt"])
        receipt["target_filename"] = "../outside.3mf"
        with self.assertRaises(file_service.ThreeMFReplaceError):
            file_service.rollback_project_3mf_replacement(str(self.root), receipt)

    def test_raw_directory_symlink_does_not_write_outside_project(self):
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        (self.root / "01_수신원본").symlink_to(outside, target_is_directory=True)
        result = file_service.replace_or_save_project_3mf(str(self.root), str(self.source), "raw.3mf")
        self.assertTrue(result["success"])
        self.assertTrue(result["warnings"])
        self.assertFalse((outside / "raw.3mf").exists())

    def test_duplicate_raw_name_is_versioned_without_overwrite(self):
        raw_dir = self.root / "01_수신원본"
        raw_dir.mkdir()
        existing = raw_dir / "raw.3mf"
        existing.write_bytes(b"keep")
        result = file_service.replace_or_save_project_3mf(str(self.root), str(self.source), "raw.3mf")
        self.assertEqual(existing.read_bytes(), b"keep")
        self.assertEqual(result["raw_saved"], "raw_v02.3mf")

    def test_zip_uncompressed_limit_is_enforced(self):
        large = Path(self.temp.name) / "large.3mf"
        with zipfile.ZipFile(large, "w") as archive:
            archive.writestr("3D/3dmodel.model", "0123456789")
        with patch.object(file_service, "MAX_3MF_ENTRY_UNCOMPRESSED", 5):
            with self.assertRaises(ValueError):
                file_service.replace_or_save_project_3mf(str(self.root), str(large))

    def test_concurrent_replacements_are_serialized_and_versioned(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: file_service.replace_or_save_project_3mf(str(self.root), str(self.source)), range(2)))
        self.assertEqual({result["filename"] for result in results}, {"P01_작업_v01.3mf", "P01_작업_v02.3mf"})

    def test_secondary_rollback_failure_has_safe_contract(self):
        old = self.slicing / "P01_작업_v01.3mf"
        old.write_bytes(b"old")
        original_replace = file_service.os.replace
        def fail_restore(src, dst):
            if Path(src).parent.name == "_backup" and Path(dst).name == old.name:
                raise OSError("restore failed")
            if Path(dst).name == "P01_작업_v02.3mf":
                raise OSError("final replace failed")
            return original_replace(src, dst)
        with patch.object(file_service.os, "replace", side_effect=fail_restore):
            with self.assertRaises(file_service.ThreeMFReplaceError) as caught:
                file_service.replace_or_save_project_3mf(str(self.root), str(self.source))
        error = caught.exception
        self.assertTrue(error.rollback_failures)
        self.assertTrue(all("/" not in name and "\\" not in name for name in error.rollback_failures))
        self.assertNotIn(str(self.root), str(error))


if __name__ == "__main__":
    unittest.main()
