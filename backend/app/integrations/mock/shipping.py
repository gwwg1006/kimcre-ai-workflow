import hashlib


class MockShipping:
    """택배사 API 대용. 주문 id로 항상 같은 가짜 운송장을 만든다."""

    def create_shipment(self, order_id: str) -> str:
        return "MOCK" + hashlib.sha1(order_id.encode()).hexdigest()[:10].upper()
