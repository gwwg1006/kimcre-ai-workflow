import math
from datetime import date, timedelta

from . import pricing_rules as R
from .schemas import OrderRequirements, Quote


def _round(n: float) -> int:
    return int(round(n / R.ROUND_TO) * R.ROUND_TO)


def add_business_days(start: date, days: int) -> date:
    # shortcut: 주말만 제외, 공휴일은 반영하지 않음. 실서비스에서는 휴일 캘린더로 교체.
    d = start
    while days > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            days -= 1
    return d


def calculate_quote(req: OrderRequirements, today: date | None = None) -> Quote:
    if req.quantity is None or req.quantity < 1:
        raise ValueError("quantity가 필요합니다")
    today = today or date.today()
    q = Quote()

    material = (req.material or R.DEFAULT_MATERIAL).upper()
    if req.material is None:
        q.assumptions.append(f"소재 미지정: {material}로 가정")
    per_gram = R.MATERIAL_PER_GRAM[material]
    post_cost, post_days = R.POST_PROCESSING[req.post_processing]

    total_hours = req.print_hours_per_unit * req.quantity
    q.items = [
        (f"소재비 ({material} {req.weight_g_per_unit:g}g x {req.quantity})", _round(per_gram * req.weight_g_per_unit * req.quantity)),
        (f"장비 사용료 ({total_hours:g}h)", _round(R.MACHINE_PER_HOUR * total_hours)),
    ]
    if post_cost:
        q.items.append((f"후가공 ({req.post_processing})", _round(post_cost * req.quantity)))
    q.assumptions.append(f"개당 {req.weight_g_per_unit:g}g / {req.print_hours_per_unit:g}h 추정 (슬라이서 결과로 대체 가능)")

    subtotal = sum(a for _, a in q.items)
    rate = next((r for n, r in R.VOLUME_DISCOUNT if req.quantity >= n), 0)
    q.discount = _round(subtotal * rate)
    q.shipping = 0 if subtotal - q.discount >= R.FREE_SHIPPING_OVER else R.SHIPPING_FEE
    q.total = subtotal - q.discount + q.shipping

    print_days = math.ceil(total_hours / (R.PRINTERS * R.HOURS_PER_DAY))
    q.lead_days = print_days + post_days + R.BUFFER_DAYS + R.SHIPPING_DAYS
    ready = add_business_days(today, q.lead_days)
    q.ready_date = ready.isoformat()
    if req.deadline:
        q.meets_deadline = ready <= date.fromisoformat(req.deadline)
    return q
