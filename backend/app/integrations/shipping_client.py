from .mock.shipping import MockShipping


def get_shipping_client():
    # 실제 택배 API를 붙일 때는 create_shipment(order_id) -> 운송장번호 인터페이스만 맞추면 된다.
    return MockShipping()
