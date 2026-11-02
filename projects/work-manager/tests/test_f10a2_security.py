import io
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from file_service import ProjectFileAccessError, save_project_source_files, save_uploaded_file
from request_security import same_origin_loopback
import config


class UploadSecurityTest(unittest.TestCase):
    def test_concurrent_same_basename_is_versioned_without_overwrite(self):
        with tempfile.TemporaryDirectory() as root, patch.object(config, "PROJECTS_DIR", root), patch.object(config, "COMPLETED_DIR", root):
            project = Path(root) / "projects" / "project"
            project.mkdir(parents=True)
            (project / "01_수신원본").mkdir()
            def upload(payload):
                return save_uploaded_file(
                    str(project), "received",
                    SimpleNamespace(filename="한글.stl", stream=io.BytesIO(payload)),
                )
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(upload, (b"one", b"two")))
            names = {result["filename"] for result in results}
            self.assertEqual(len(names), 2)
            self.assertEqual({(project / "01_수신원본" / name).read_bytes() for name in names}, {b"one", b"two"})

    def test_filename_portability_controls_and_reserved_names_are_rejected(self):
        with tempfile.TemporaryDirectory() as root, patch.object(config, "PROJECTS_DIR", root), patch.object(config, "COMPLETED_DIR", root):
            project = Path(root) / "projects" / "project"
            (project / "01_수신원본").mkdir(parents=True)
            for name in ("bad\x7f.stl", "bad\u0085.stl", "trailing .stl ", "CON.stl", "../escape.stl"):
                with self.subTest(name=repr(name)), self.assertRaises(ProjectFileAccessError):
                    save_uploaded_file(str(project), "received", SimpleNamespace(filename=name, stream=io.BytesIO(b"x")))

    def test_source_files_concurrent_same_basename_are_not_dropped(self):
        with tempfile.TemporaryDirectory() as root, patch.object(config, "PROJECTS_DIR", root), patch.object(config, "COMPLETED_DIR", root):
            project = Path(root) / "projects" / "project"
            project.mkdir(parents=True)
            (project / "01_수신원본").mkdir()

            def upload(payload):
                return save_project_source_files(project, [SimpleNamespace(filename="same.stl", stream=io.BytesIO(payload))])

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(upload, (b"one", b"two")))
            names = [result[0] for result in results]
            self.assertEqual(len(set(names)), 2)
            self.assertEqual({(project / "01_수신원본" / name).read_bytes() for name in names}, {b"one", b"two"})


class OriginSecurityTest(unittest.TestCase):
    def test_origin_requires_exact_loopback_scheme_host_and_port(self):
        self.assertTrue(same_origin_loopback("http://127.0.0.1:5001", "127.0.0.1:5001", "http"))
        self.assertFalse(same_origin_loopback("http://localhost:5001", "127.0.0.1:5001", "http"))
        self.assertFalse(same_origin_loopback("http://user@127.0.0.1:5001", "127.0.0.1:5001", "http"))
        self.assertFalse(same_origin_loopback("null", "127.0.0.1:5001", "http"))
        self.assertFalse(same_origin_loopback("http://127.0.0.1.:5001", "127.0.0.1:5001", "http"))
        self.assertFalse(same_origin_loopback("http://127.0.0.1:5001/path?x=1", "127.0.0.1:5001", "http", reject_suffix=True))


if __name__ == "__main__":
    unittest.main()
