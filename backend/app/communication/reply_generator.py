"""단계별 고객 응대문. 템플릿 기반이라 LLM 없이도 동작한다."""
from app.quote.schemas import Quote

_T = {
    "received": "{name}님, 문의가 접수되었습니다. 제작 조건을 확인해 견적을 보내드리겠습니다. (접수번호 {order_id})",
    "need_info": "{name}님, 견적 산출을 위해 아래 정보가 더 필요합니다: {missing}. 알려주시면 바로 견적을 보내드리겠습니다.",
    "quote": "{name}님, 견적 초안입니다.\n{lines}\n합계 {total:,}원 / 예상 완료 {ready_date}{deadline_note}\n진행을 원하시면 승인 답장을 부탁드립니다.",
    "approved": "{name}님, 제작 승인이 확인되었습니다. 결제 확인 후 제작 일정을 확정해 안내드리겠습니다. (접수번호 {order_id})",
    "started": "{name}님, 제작을 시작했습니다. 예상 완료일은 {ready_date}입니다. (접수번호 {order_id})",
    "shipped": "{name}님, 제작이 끝나 발송했습니다. 운송장 {tracking}로 배송 조회가 가능합니다.",
    "delivered": "{name}님, 배송이 완료되었습니다. 받아보신 결과물에 문제가 있으면 언제든 연락 주세요.",
}


def render_reply(stage: str, name: str = "고객", **ctx) -> str:
    return _T[stage].format(name=name, **ctx)


def render_quote_reply(quote: Quote, name: str = "고객") -> str:
    lines = [f"- {label}: {amt:,}원" for label, amt in quote.items]
    if quote.discount:
        lines.append(f"- 수량 할인: -{quote.discount:,}원")
    lines.append(f"- 배송비: {quote.shipping:,}원" if quote.shipping else "- 배송비: 무료")
    note = {True: " (희망 납기 충족)", False: " (희망 납기 초과 — 일정 협의 필요)", None: ""}[quote.meets_deadline]
    return render_reply("quote", name, lines="\n".join(lines), total=quote.total,
                        ready_date=quote.ready_date, deadline_note=note)
