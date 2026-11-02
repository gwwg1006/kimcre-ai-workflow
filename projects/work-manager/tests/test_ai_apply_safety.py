import unittest

from ai_apply_service import validate_proposal


class AiApplySafetyTest(unittest.TestCase):
    def test_global_multi_project_mutation_is_rejected_before_apply(self):
        proposal = {
            "executed_updates": [
                {"project_no": "260824-001", "fields": {"memo": "a"}},
                {"project_no": "260824-002", "fields": {"memo": "b"}},
            ],
            "file_operations": [],
        }
        projects = {"260824-001": {"project_no": "260824-001"}, "260824-002": {"project_no": "260824-002"}}
        with self.assertRaises(ValueError):
            validate_proposal("global", proposal, projects, set())

    def test_contact_name_is_an_allowed_project_update(self):
        proposal = {
            "updated_fields": {"contact_name": "담당자"},
            "executed_updates": [], "file_operations": [],
        }
        self.assertTrue(validate_proposal("project", proposal, {"260824-001": {"project_no": "260824-001"}}, set()))


if __name__ == "__main__":
    unittest.main()
