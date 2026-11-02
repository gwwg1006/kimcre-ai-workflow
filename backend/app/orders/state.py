from dataclasses import dataclass, field
from datetime import datetime

FLOW = ["RECEIVED", "QUOTED", "APPROVED", "IN_PRODUCTION", "SHIPPED", "DELIVERED"]
LABEL = {"RECEIVED": "접수", "QUOTED": "견적 전달", "APPROVED": "제작 승인", "IN_PRODUCTION": "제작 중",
         "SHIPPED": "배송 중", "DELIVERED": "배송 완료"}


@dataclass
class Order:
    id: str
    status: str = "RECEIVED"
    history: list[tuple[str, str]] = field(default_factory=list)

    def __post_init__(self):
        self.history.append((self.status, datetime.now().isoformat(timespec="seconds")))

    def advance(self, to: str) -> None:
        if to not in FLOW or FLOW.index(to) != FLOW.index(self.status) + 1:
            raise ValueError(f"{self.status} -> {to} 전환은 허용되지 않습니다")
        self.status = to
        self.history.append((to, datetime.now().isoformat(timespec="seconds")))
