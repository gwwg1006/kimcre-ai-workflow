"""외부 LLM(OpenAI)은 응대문 문장 다듬기에만 쓰고, 개인정보가 없는 텍스트만 보낸다.

OPENAI_API_KEY가 없으면 호출 없이 원문을 그대로 돌려준다(mock 모드).
shortcut: 실제 API로 검증하지 않았다. 모델명은 OPENAI_MODEL로 지정한다.
"""
import json
import os
import urllib.request


def polish(text: str) -> tuple[str, str]:
    """(다듬은 텍스트, 사용한 모드)"""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return text, "mock"
    body = json.dumps({
        "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": "고객 안내문을 정중하고 간결한 한국어로 다듬어라. 금액·날짜·번호·[이름] 같은 표시는 절대 바꾸지 마라."},
            {"role": "user", "content": text},
        ],
    }).encode()
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", body,
                                 {"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read())["choices"][0]["message"]["content"], "openai"
