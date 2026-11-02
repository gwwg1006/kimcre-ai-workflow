import unittest
from unittest.mock import patch

import delivery_service


class DeliveryContractTest(unittest.TestCase):
    def test_courier_aliases_and_unknown_values(self):
        self.assertEqual(delivery_service.normalize_courier("hanjin"), "한진택배")
        self.assertEqual(delivery_service.normalize_courier("CJ"), "CJ대한통운")
        self.assertEqual(delivery_service.normalize_courier("우체국"), "우체국택배")
        for value in ("unknown", "x\n", "x" * 41):
            with self.assertRaises(ValueError):
                delivery_service.normalize_courier(value)

    def test_tracking_number_contract(self):
        self.assertEqual(delivery_service.normalize_tracking_no("1234-5678 9012"), "123456789012")
        self.assertEqual(delivery_service.normalize_tracking_no(""), "")
        for value in ("123", "123456789x", "123456789012345", "javascript:1"):
            with self.assertRaises(ValueError):
                delivery_service.normalize_tracking_no(value)

    def test_changing_tracking_clears_old_result(self):
        with patch.object(delivery_service, "update_project_in_db", return_value={}) as update:
            delivery_service.update_delivery_info("260824-001", {"tracking_no": "1234567890"})
        payload = update.call_args.args[1]
        self.assertEqual(payload["tracking_no"], "1234567890")
        for field in ("tracking_status_text", "tracking_latest_date", "tracking_latest_time", "tracking_latest_location", "tracking_checked_at"):
            self.assertIsNone(payload[field])

    def test_clearing_tracking_removes_tracking_url(self):
        project = {"courier": "한진택배", "tracking_no": "1234567890"}
        delivery_service.attach_tracking_url(project)
        self.assertTrue(project["tracking_url"])
        project["tracking_no"] = ""
        delivery_service.attach_tracking_url(project)
        self.assertEqual(project["tracking_url"], "")

    def test_non_hanjin_has_no_official_url(self):
        self.assertEqual(delivery_service.get_tracking_url("CJ대한통운", "1234567890"), "")
        self.assertIn("www.hanjin.co.kr", delivery_service.get_tracking_url("한진택배", "1234567890"))

    def test_legacy_invalid_tracking_is_safe_for_display(self):
        project = {"courier": "한진택배", "tracking_no": "abc-123"}
        self.assertEqual(delivery_service.get_tracking_url("한진택배", "abc-123"), "")
        self.assertEqual(delivery_service.attach_tracking_url(project)["tracking_url"], "")

    def test_untrusted_tracking_result_fields_are_ignored(self):
        with patch.object(delivery_service, "update_project_in_db", return_value={}) as update:
            delivery_service.update_delivery_info(
                "260824-001",
                {"tracking_no": "1234567890", "tracking_status_text": "forged", "extra": "ignored"},
            )
        payload = update.call_args.args[1]
        self.assertIsNone(payload["tracking_status_text"])
        self.assertNotIn("extra", payload)


if __name__ == "__main__":
    unittest.main()
