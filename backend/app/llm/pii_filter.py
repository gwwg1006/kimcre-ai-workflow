"""문의 원문에서 개인정보를 분리한다. LLM에는 redacted 텍스트만 전달된다.

shortcut: 정규식 기반 휴리스틱이라 모든 한국어 이름·주소를 잡지 못한다.
실서비스에서는 NER 모델이나 로컬 LLM 2차 검사를 추가한다.
"""
import re
from dataclasses import dataclass, field

_CITY = "서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주"
_PATTERNS = [
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")),
    ("PHONE", re.compile(r"0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}")),
    ("ADDRESS", re.compile(rf"(?:{_CITY})[^\n]*?(?:로|길|동)\s?\d+(?:-\d+)?(?:\s?\d+동)?(?:\s?\d+호)?")),
    ("NAME", re.compile(r"(?:이름|성함)\s*[:은는]?\s*([가-힣]{2,4})")),
    ("NAME", re.compile(r"저는\s*([가-힣]{2,4})(?:입니다|이에요|예요|이고)")),
    ("NAME", re.compile(r"([가-힣]{2,4})\s*드림")),
]


@dataclass
class PIIResult:
    redacted: str
    found: dict[str, list[str]] = field(default_factory=dict)  # 로컬에만 보관


def split_pii(text: str) -> PIIResult:
    found: dict[str, list[str]] = {}
    for kind, pat in _PATTERNS:
        def repl(m: re.Match, kind=kind) -> str:
            value = m.group(1) if kind == "NAME" else m.group(0)
            found.setdefault(kind, []).append(value)
            return m.group(0).replace(value, f"[{kind}]")
        text = pat.sub(repl, text)
    return PIIResult(redacted=text, found=found)
