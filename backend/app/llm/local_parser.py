"""비식별 문의 텍스트 -> OrderRequirements.

LOCAL_LLM=ollama 이면 로컬 Ollama(기본 localhost:11434)로 추출하고,
서버가 없거나 응답이 이상하면 규칙 기반 파서로 자동 전환한다. 어느 경우든 외부로 나가지 않는다.
"""
import json
import os
import re
import urllib.request
from datetime import date
from pathlib import Path

from app.quote.schemas import OrderRequirements

PROMPT = (Path(__file__).parent / "prompts" / "extract_order_requirements.txt").read_text(encoding="utf-8")

_MATERIALS = [("PETG", "PETG"), ("NYLON", "NYLON"), ("나일론", "NYLON"), ("RESIN", "RESIN"), ("레진", "RESIN"),
              ("PLA", "PLA"), ("ABS", "ABS"), ("ASA", "ASA"), ("TPU", "TPU")]
_COLORS = [("검정", "black"), ("블랙", "black"), ("black", "black"), ("흰", "white"), ("화이트", "white"), ("white", "white"),
           ("회색", "gray"), ("그레이", "gray"), ("빨강", "red"), ("레드", "red"), ("파랑", "blue"), ("블루", "blue")]
_SUBJECT = re.compile(r"((?:[가-힣A-Za-z0-9]+\s)?[가-힣A-Za-z0-9]*(?:케이스|모형|부품|브라켓|거치대)(?:\s?시제품)?|[가-힣A-Za-z0-9]*시제품)")


def _first(text: str, table: list[tuple[str, str]]) -> str | None:
    low = text.lower()
    return next((v for k, v in table if k.lower() in low), None)


def _deadline(text: str, today: date) -> str | None:
    if m := re.search(r"(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})", text):
        return date(int(m[1]), int(m[2]), int(m[3])).isoformat()
    if m := re.search(r"(\d{1,2})월\s*(\d{1,2})일", text):
        d = date(today.year, int(m[1]), int(m[2]))
        return (d if d >= today else d.replace(year=today.year + 1)).isoformat()
    return None


def parse_rules(redacted: str, today: date | None = None) -> OrderRequirements:
    today = today or date.today()
    qty = re.search(r"(\d+)\s*(?:개|세트|set|ea|pcs)", redacted, re.I)
    if re.search(r"후가공\s*(?:은|는)?\s*(?:없|필요\s*없)", redacted):
        post = "none"
    elif re.search(r"사포|샌딩", redacted):
        post = "sanding"
    elif re.search(r"도색|페인트", redacted):
        post = "painting"
    else:
        post = "none"
    subject = _SUBJECT.search(redacted)
    return OrderRequirements(
        material=_first(redacted, _MATERIALS),
        quantity=int(qty[1]) if qty else None,
        color=_first(redacted, _COLORS),
        post_processing=post,
        deadline=_deadline(redacted, today),
        description=subject[1].strip() if subject else redacted.strip()[:40],
    )


def _ollama_generate(prompt: str) -> str:
    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    body = json.dumps({"model": os.environ.get("OLLAMA_MODEL", "qwen2.5:7b"), "prompt": prompt,
                       "stream": False, "format": "json"}).encode()
    req = urllib.request.Request(f"{host}/api/generate", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read())["response"]


def parse_with_llm(redacted: str, today: date | None = None) -> OrderRequirements:
    data = json.loads(_ollama_generate(PROMPT.replace("{inquiry}", redacted)))
    base = parse_rules(redacted, today)  # LLM이 비운 값은 규칙 결과로 채운다
    qty = data.get("quantity")
    return OrderRequirements(
        material=(data.get("material") or "").upper() or base.material,
        quantity=qty if isinstance(qty, int) and qty > 0 else base.quantity,
        color=data.get("color") or base.color,
        post_processing=data.get("post_processing") if data.get("post_processing") in ("none", "sanding", "painting") else base.post_processing,
        deadline=data.get("deadline") or base.deadline,
        description=data.get("description") or base.description,
    )


def parse_requirements(redacted: str, today: date | None = None) -> tuple[OrderRequirements, str]:
    """(요구사항, 사용한 엔진 이름)"""
    if os.environ.get("LOCAL_LLM") == "ollama":
        try:
            return parse_with_llm(redacted, today), "ollama(local)"
        except Exception as e:  # 연결 실패·JSON 오류 모두 규칙 파서로 대체
            print(f"[local_parser] Ollama 사용 불가({type(e).__name__}), 규칙 파서로 대체")
    return parse_rules(redacted, today), "rules"
