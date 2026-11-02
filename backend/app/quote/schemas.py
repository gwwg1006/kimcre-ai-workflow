from dataclasses import dataclass, field


@dataclass
class OrderRequirements:
    """비식별 제작 요구사항. 개인정보는 여기에 들어오지 않는다."""
    material: str | None = None
    quantity: int | None = None
    color: str | None = None
    post_processing: str = "none"
    deadline: str | None = None  # ISO 날짜 (YYYY-MM-DD)
    description: str = ""
    # 데모용 추정치. 실제로는 슬라이서(Bambu Studio 등)의 결과를 넣는다.
    weight_g_per_unit: float = 60.0
    print_hours_per_unit: float = 3.0

    def missing(self) -> list[str]:
        return [f for f in ("quantity",) if getattr(self, f) is None]


@dataclass
class Quote:
    items: list[tuple[str, int]] = field(default_factory=list)  # (항목명, 금액)
    discount: int = 0
    shipping: int = 0
    total: int = 0
    lead_days: int = 0
    ready_date: str = ""
    meets_deadline: bool | None = None
    assumptions: list[str] = field(default_factory=list)
