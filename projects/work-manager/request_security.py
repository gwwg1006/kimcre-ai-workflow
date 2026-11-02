"""공통 로컬 요청 경계."""
from urllib.parse import urlsplit

from flask import current_app, jsonify, request


_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _authority(value, scheme, reject_suffix=False):
    """Return a normalized loopback authority, rejecting ambiguous URLs."""
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"}:
            return None
        if parsed.username is not None or parsed.password is not None or not parsed.hostname:
            return None
        if reject_suffix and (parsed.path or parsed.query or parsed.fragment):
            return None
        hostname = parsed.hostname.lower()
        if hostname not in _LOOPBACK_HOSTS:
            return None
        port = parsed.port
        if port is None:
            port = 443 if parsed.scheme.lower() == "https" else 80
        if not 1 <= port <= 65535:
            return None
        return hostname, port, parsed.scheme.lower()
    except (TypeError, ValueError):
        return None


def same_origin_loopback(origin, request_host, request_scheme, *, reject_suffix=False):
    """Validate exact loopback scheme/host/port; absent Origin is CLI-compatible."""
    if not origin:
        return True
    origin_authority = _authority(origin, request_scheme, reject_suffix=reject_suffix)
    if not origin_authority:
        return False
    try:
        host = urlsplit(f"{request_scheme}://{request_host}")
        if host.username is not None or host.password is not None or not host.hostname:
            return False
        hostname = host.hostname.lower()
        if hostname not in _LOOPBACK_HOSTS:
            return False
        port = host.port or (443 if request_scheme == "https" else 80)
    except (TypeError, ValueError):
        return False
    return origin_authority == (hostname, port, request_scheme)


def validate_unsafe_request():
    """Origin/Referer가 제시된 변경 요청은 정확한 same-origin만 허용한다."""
    max_length = current_app.config.get("MAX_CONTENT_LENGTH")
    if max_length and request.content_length is not None and request.content_length > max_length:
        return jsonify({"success": False, "error": "요청 크기 제한을 초과했습니다."}), 413
    if request.method in {"GET", "HEAD", "OPTIONS"} or not request.path.startswith("/api/"):
        return None
    expected_scheme = "https" if request.is_secure else "http"
    for header_name in ("Origin", "Referer"):
        value = request.headers.get(header_name)
        if not value:
            continue
        if not same_origin_loopback(
            value, request.host, expected_scheme, reject_suffix=(header_name == "Origin")
        ):
            return jsonify({"success": False, "error": "허용되지 않은 요청 출처입니다."}), 403
    return None
