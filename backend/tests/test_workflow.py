import json
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from app import demo
from app.llm import local_parser
from app.llm.pii_filter import split_pii
from app.orders.state import Order
from app.quote.calculator import add_business_days, calculate_quote
from app.quote.schemas import OrderRequirements

EX = Path(__file__).resolve().parents[2] / "data" / "examples"
TODAY = date(2026, 11, 2)  # 월요일
INQUIRY = (EX / "inquiry_example.txt").read_text(encoding="utf-8")


class PiiTest(unittest.TestCase):
    def test_redacts_all_personal_data(self):
        r = split_pii(INQUIRY)
        for secret in ("홍길동", "010-1234-5678", "gildong@example.com", "월드컵북로"):
            self.assertNotIn(secret, r.redacted)
        self.assertEqual(r.found["NAME"], ["홍길동"])
        self.assertIn("[ADDRESS]", r.redacted)


class ParserTest(unittest.TestCase):
    def test_rules_match_example_order(self):
        req = local_parser.parse_rules(split_pii(INQUIRY).redacted, TODAY)
        expected = json.loads((EX / "order_example.json").read_text(encoding="utf-8"))
        for k, v in expected.items():
            self.assertEqual(getattr(req, k), v, k)

    def test_missing_quantity_is_reported(self):
        self.assertEqual(local_parser.parse_rules("PLA로 케이스 출력 부탁드려요", TODAY).missing(), ["quantity"])

    def test_llm_failure_falls_back_to_rules(self):
        with mock.patch.dict("os.environ", {"LOCAL_LLM": "ollama"}), \
             mock.patch.object(local_parser, "_ollama_generate", side_effect=ConnectionError):
            _, engine = local_parser.parse_requirements("PLA 4개", TODAY)
        self.assertEqual(engine, "rules")

    def test_llm_result_is_used_and_gaps_filled(self):
        fake = json.dumps({"material": "petg", "quantity": None, "post_processing": "bogus", "description": "요약"})
        with mock.patch.dict("os.environ", {"LOCAL_LLM": "ollama"}), \
             mock.patch.object(local_parser, "_ollama_generate", return_value=fake):
            req, engine = local_parser.parse_requirements("PLA 4개", TODAY)
        self.assertEqual((engine, req.material, req.quantity, req.post_processing), ("ollama(local)", "PETG", 4, "none"))


class QuoteTest(unittest.TestCase):
    def test_example_quote_numbers(self):
        # 소재 35*60*4=8,400 + 장비 2,000*12h=24,000 = 32,400 + 배송 3,500
        q = calculate_quote(OrderRequirements(material="PLA", quantity=4, deadline="2026-11-15"), TODAY)
        self.assertEqual((q.total, q.discount, q.shipping), (35900, 0, 3500))
        self.assertEqual((q.lead_days, q.ready_date, q.meets_deadline), (3, "2026-11-05", True))

    def test_volume_discount_free_shipping_and_post_processing(self):
        q = calculate_quote(OrderRequirements(material="ABS", quantity=10, post_processing="sanding"), TODAY)
        self.assertEqual(q.discount, round((45 * 60 * 10 + 2000 * 30 + 3000 * 10) * 0.10 / 100) * 100)
        self.assertEqual(q.shipping, 0)

    def test_deadline_too_tight(self):
        q = calculate_quote(OrderRequirements(quantity=4, deadline="2026-11-03"), TODAY)
        self.assertFalse(q.meets_deadline)

    def test_quantity_required(self):
        with self.assertRaises(ValueError):
            calculate_quote(OrderRequirements(), TODAY)

    def test_business_days_skip_weekend(self):
        self.assertEqual(add_business_days(date(2026, 11, 6), 1), date(2026, 11, 9))  # 금 -> 월


class OrderStateTest(unittest.TestCase):
    def test_cannot_skip_steps(self):
        o = Order("x")
        with self.assertRaises(ValueError):
            o.advance("SHIPPED")
        o.advance("QUOTED")
        self.assertEqual(o.status, "QUOTED")


class DemoTest(unittest.TestCase):
    def test_end_to_end_keeps_pii_out_of_external_text(self):
        sent_to_external: list[str] = []

        def spy(text):
            sent_to_external.append(text)
            return text, "mock"

        with mock.patch.object(demo, "polish", spy), mock.patch("builtins.print"):
            out = demo.run(INQUIRY, TODAY)
        self.assertEqual(out["order"].status, "DELIVERED")
        self.assertEqual(len(out["outbox"]), 6)
        blob = "\n".join(sent_to_external)
        for secret in ("홍길동", "010-1234-5678", "gildong@example.com", "월드컵북로"):
            self.assertNotIn(secret, blob)
        self.assertIn("홍길동", out["outbox"][0]["body"])  # 로컬에서 이름이 복원된다


if __name__ == "__main__":
    unittest.main()
