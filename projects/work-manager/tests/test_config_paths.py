import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]


class ConfigPathContractTest(unittest.TestCase):
    def run_config(self, env):
        code = (
            "import config, json; print(json.dumps({k: getattr(config, k) for k in "
            "('BASE_DIR','PROJECTS_DIR','COMPLETED_DIR','OPERATIONS_FILE','DATA_DIR','DB_PATH','DISABLE_EXTERNAL_SERVICES')}))"
        )
        result = subprocess.run(
            [sys.executable, "-c", code], cwd=REPO, env=env,
            text=True, capture_output=True, check=False,
        )
        return result

    def test_e2e_overrides_are_contained_and_defaults_remain_without_env(self):
        with tempfile.TemporaryDirectory() as root:
            env = os.environ.copy()
            env.update({
                "KMC_E2E_MODE": "1", "KMC_BASE_DIR": root,
                "KMC_PROJECTS_DIR": str(Path(root) / "projects"),
                "KMC_COMPLETED_DIR": str(Path(root) / "completed"),
                "KMC_OPERATIONS_FILE": str(Path(root) / "ops.xlsx"),
                "KMC_DATA_DIR": str(Path(root) / "data"),
                "KMC_DB_PATH": str(Path(root) / "data" / "app.db"),
            })
            result = self.run_config(env)
            self.assertEqual(result.returncode, 0, result.stderr)
            paths = json.loads(result.stdout)
            self.assertTrue(paths["DISABLE_EXTERNAL_SERVICES"])
            base = os.path.realpath(root)
            for path in (paths[name] for name in ("BASE_DIR", "PROJECTS_DIR", "COMPLETED_DIR", "OPERATIONS_FILE", "DATA_DIR", "DB_PATH")):
                self.assertEqual(os.path.commonpath((base, os.path.realpath(path))), base)

        env = os.environ.copy()
        for key in ("KMC_E2E_MODE", "KMC_BASE_DIR", "KMC_PROJECTS_DIR", "KMC_COMPLETED_DIR",
                    "KMC_OPERATIONS_FILE", "KMC_DATA_DIR", "KMC_DB_PATH"):
            env.pop(key, None)
        result = self.run_config(env)
        self.assertEqual(result.returncode, 0, result.stderr)
        paths = json.loads(result.stdout)
        self.assertEqual(paths["BASE_DIR"], os.path.expanduser("~/사업"))
        self.assertTrue(paths["DB_PATH"].endswith("/작업관리웹/data/app.db"))

    def test_e2e_rejects_missing_or_unsafe_base(self):
        env = os.environ.copy()
        env.update({"KMC_E2E_MODE": "1", "KMC_BASE_DIR": "/"})
        result = self.run_config(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("KMC_E2E_MODE", result.stderr)

        with tempfile.TemporaryDirectory() as root:
            env = os.environ.copy()
            env.update({"KMC_E2E_MODE": "1", "KMC_BASE_DIR": root,
                        "KMC_DB_PATH": "/tmp/outside-kmc-e2e.db"})
            result = self.run_config(env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("DB_PATH", result.stderr)

    def test_e2e_rejects_overlapping_mutable_roots(self):
        with tempfile.TemporaryDirectory() as root:
            env = os.environ.copy()
            env.update({
                "KMC_E2E_MODE": "1", "KMC_BASE_DIR": root,
                "KMC_PROJECTS_DIR": str(Path(root) / "same"),
                "KMC_COMPLETED_DIR": str(Path(root) / "same"),
                "KMC_DATA_DIR": str(Path(root) / "same"),
                "KMC_OPERATIONS_FILE": str(Path(root) / "ops.xlsx"),
                "KMC_DB_PATH": str(Path(root) / "same" / "app.db"),
            })
            result = self.run_config(env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("must not overlap", result.stderr)

    def test_e2e_does_not_import_operating_estimate_source(self):
        with tempfile.TemporaryDirectory() as root:
            env = os.environ.copy()
            env.update({
                "KMC_E2E_MODE": "1", "KMC_BASE_DIR": root,
                "KMC_PROJECTS_DIR": str(Path(root) / "projects"),
                "KMC_COMPLETED_DIR": str(Path(root) / "completed"),
                "KMC_DATA_DIR": str(Path(root) / "data"),
                "KMC_OPERATIONS_FILE": str(Path(root) / "ops.xlsx"),
                "KMC_DB_PATH": str(Path(root) / "data" / "app.db"),
            })
            result = self.run_config({**env, "PYTHONWARNINGS": "ignore"})
            self.assertEqual(result.returncode, 0, result.stderr)
            source_check = subprocess.run(
                [sys.executable, "-c", "import estimate_service; print(estimate_service.ESTIMATE_SRC_DIR)"],
                cwd=REPO, env=env, text=True, capture_output=True, check=False,
            )
            self.assertEqual(source_check.returncode, 0, source_check.stderr)
            self.assertEqual(source_check.stdout.strip().splitlines()[-1], "None")


if __name__ == "__main__":
    unittest.main()
