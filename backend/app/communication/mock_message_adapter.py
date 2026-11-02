class MockMessageAdapter:
    """실제 발송 없이 outbox에만 쌓는다. 카카오톡·메일 연동 전 데모와 테스트용."""

    def __init__(self):
        self.outbox: list[dict] = []

    def send(self, to: str, subject: str, body: str) -> None:
        self.outbox.append({"to": to, "subject": subject, "body": body})
