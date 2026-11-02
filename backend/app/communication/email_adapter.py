import os
import smtplib
from email.message import EmailMessage


class EmailAdapter:
    """SMTP 발송 어댑터. SMTP_HOST/SMTP_USER/SMTP_PASSWORD 환경변수가 필요하다 (.env.example 참고).

    shortcut: 실제 SMTP 서버로 검증하지 않았다. 실제 연동 전에 테스트 계정으로 먼저 확인할 것.
    """

    def send(self, to: str, subject: str, body: str) -> None:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = os.environ["SMTP_USER"], to, subject
        msg.set_content(body)
        with smtplib.SMTP_SSL(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "465"))) as s:
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
            s.send_message(msg)
