"""데모용 가격 규칙. 실제 사업 원가표가 아니며, 숫자는 모두 예시값이다."""

MATERIAL_PER_GRAM = {  # 원/g
    "PLA": 35, "PETG": 40, "ABS": 45, "ASA": 55, "TPU": 60, "NYLON": 90, "RESIN": 120,
}
DEFAULT_MATERIAL = "PLA"

MACHINE_PER_HOUR = 2000  # 장비 사용료 원/시간
PRINTERS = 2             # 동시 가동 장비 수
HOURS_PER_DAY = 16       # 장비 하루 가동 시간

POST_PROCESSING = {  # (개당 비용, 추가 소요 영업일)
    "none": (0, 0),
    "sanding": (3000, 1),
    "painting": (8000, 2),
}

VOLUME_DISCOUNT = [(30, 0.15), (10, 0.10), (5, 0.05)]  # (최소 수량, 할인율) 큰 수량부터

SHIPPING_FEE = 3500
FREE_SHIPPING_OVER = 50000

BUFFER_DAYS = 1    # 검수·포장
SHIPPING_DAYS = 1  # 택배
ROUND_TO = 100
