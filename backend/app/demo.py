"""처음부터 끝까지 한 번 돌아가는 데모: 문의 -> 비식별 -> 요구사항 -> 견적 -> 응대 -> 상태 -> 배송.

실행:  cd backend && python -m app.demo [--today YYYY-MM-DD] [--file ../data/examples/inquiry_example.txt]
"""
import argparse
from datetime import date
from pathlib import Path

from app.communication.reply_generator import render_quote_reply, render_reply
from app.integrations.notification_client import get_notifier
from app.integrations.openai_client import polish
from app.integrations.shipping_client import get_shipping_client
from app.llm.local_parser import parse_requirements
from app.llm.pii_filter import split_pii
from app.orders.state import LABEL, Order
from app.quote.calculator import calculate_quote

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "data" / "examples" / "inquiry_example.txt"


def step(title: str) -> None:
    print(f"\n=== {title} ===")


def run(inquiry: str, today: date, order_id: str = "ORD-DEMO-001") -> dict:
    notifier, shipping = get_notifier(), get_shipping_client()
    order = Order(order_id)

    step("1. 문의 입력 (원문, 로컬에만 존재)")
    print(inquiry)

    step("2. 로컬: 개인정보 분리")
    pii = split_pii(inquiry)
    print(pii.redacted)
    print("분리된 항목(로컬 보관):", {k: len(v) for k, v in pii.found.items()})
    customer = (pii.found.get("NAME") or ["고객"])[0]
    contact = (pii.found.get("EMAIL") or pii.found.get("PHONE") or ["unknown"])[0]

    step("3. 로컬: 제작 요구사항 추출 (비식별 텍스트만 입력)")
    req, engine = parse_requirements(pii.redacted, today)
    print(f"엔진: {engine}\n{req}")

    def send(stage: str, subject: str, body: str) -> None:
        # 외부 LLM에는 이름이 [NAME]으로 가려진 문장만 나가고, 실제 이름은 로컬에서 다시 채운다.
        text, mode = polish(body)
        notifier.send(contact, subject, text.replace("[NAME]", customer))
        print(f"\n[{stage}] (문장 다듬기: {mode})\n{text.replace('[NAME]', customer)}")

    step("4. 접수 확인 / 추가 정보 요청")
    send("접수 확인", "문의 접수", render_reply("received", "[NAME]", order_id=order.id))
    if req.missing():
        send("추가 정보 요청", "추가 정보 요청", render_reply("need_info", "[NAME]", missing=", ".join(req.missing())))
        return {"order": order, "requirements": req, "quote": None, "outbox": getattr(notifier, "outbox", [])}

    step("5. 견적 생성 + 고객 응답문")
    quote = calculate_quote(req, today)
    print(f"합계 {quote.total:,}원 / 납기 {quote.ready_date} / 가정: {quote.assumptions}")
    order.advance("QUOTED")
    send("견적 전달", "견적 안내", render_quote_reply(quote, "[NAME]"))

    step("6. 승인 -> 제작 -> 배송 (주문 상태 변경)")
    order.advance("APPROVED")
    send("제작 승인 확인", "제작 승인", render_reply("approved", "[NAME]", order_id=order.id))
    order.advance("IN_PRODUCTION")
    send("제작 시작", "제작 시작", render_reply("started", "[NAME]", order_id=order.id, ready_date=quote.ready_date))
    order.advance("SHIPPED")
    tracking = shipping.create_shipment(order.id)
    send("발송 안내", "발송 안내", render_reply("shipped", "[NAME]", tracking=tracking))
    order.advance("DELIVERED")
    send("배송 완료 안내", "배송 완료", render_reply("delivered", "[NAME]"))

    step("7. 주문 상태 이력")
    for status, ts in order.history:
        print(f"{ts}  {LABEL[status]}")
    return {"order": order, "requirements": req, "quote": quote, "outbox": getattr(notifier, "outbox", [])}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", type=Path, default=DEFAULT_FILE)
    ap.add_argument("--today", type=date.fromisoformat, default=date.today())
    a = ap.parse_args()
    run(a.file.read_text(encoding="utf-8"), a.today)
