import os

from app.communication.email_adapter import EmailAdapter
from app.communication.mock_message_adapter import MockMessageAdapter


def get_notifier():
    """NOTIFY_MODE=email 이면 SMTP, 그 외에는 mock."""
    return EmailAdapter() if os.environ.get("NOTIFY_MODE") == "email" else MockMessageAdapter()
