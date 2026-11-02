import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from project_path_policy import ProjectPathPolicyError, resolve_project_root


class ProjectPathPolicyTest(unittest.TestCase):
    def test_allowed_descendant_and_completed_root(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            projects, completed = base / "projects", base / "completed"
            project = projects / "2026" / "260824-001_client_job"
            project.mkdir(parents=True)
            completed_project = completed / "2026" / "done"
            completed_project.mkdir(parents=True)
            with patch("config.PROJECTS_DIR", str(projects)), patch("config.COMPLETED_DIR", str(completed)):
                self.assertEqual(resolve_project_root(project), project.resolve())
                self.assertEqual(resolve_project_root(completed_project), completed_project.resolve())

    def test_rejects_roots_outside_prefix_and_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            projects = base / "projects"
            completed = base / "completed"
            projects.mkdir()
            completed.mkdir()
            valid = projects / "2026" / "valid"
            valid.mkdir(parents=True)
            outside = base / "outside"
            outside.mkdir()
            prefix = base / "projects2" / "bad"
            prefix.mkdir(parents=True)
            link = projects / "2026" / "link"
            link.symlink_to(outside, target_is_directory=True)
            with patch("config.PROJECTS_DIR", str(projects)), patch("config.COMPLETED_DIR", str(completed)):
                for candidate in (projects, completed, outside, prefix, link, base / "missing"):
                    with self.subTest(candidate=candidate):
                        with self.assertRaises(ProjectPathPolicyError):
                            resolve_project_root(candidate)


if __name__ == "__main__":
    unittest.main()
