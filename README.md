# MakerFlow AI

3D 프린팅·시제품 제작 의뢰를 **문의 접수 → 견적 → 제작 → 배송**까지 연결하는 AI 워크플로우 (해커톤 데모)

## 이 저장소에 포함된 프로젝트

| 프로젝트 | 위치 | 설명 |
|---|---|---|
| MakerFlow AI (핵심 데모) | `backend/`, `data/`, `docs/` | 문의 → 개인정보 분리 → 견적 → 응대 → 배송 흐름 (아래 설명) |
| 홈페이지 | [`projects/kimcre-website`](projects/kimcre-website) | 김명규크리에이티브 견적·결제 웹사이트 (Next.js) |
| 작업관리 | [`projects/work-manager`](projects/work-manager) | 작업·견적서·AI 보조를 다루는 내부 관리 웹앱 (Python) · [원본 저장소](https://github.com/gwwg1006/creative-work-manager) |
| 견적서 에이전트 | [`projects/quote-agent`](projects/quote-agent) | 견적서 자동 작성 에이전트 (Python) |
| Bambu 3MF 네임플레이트 | [`projects/modelmaker`](projects/modelmaker) | Bambu Lab 멀티컬러 3MF 생성기 (Vite) · [원본 저장소](https://github.com/gwwg1006/modelmaker) |
| 프린트팜 보드 | [`projects/print-farm-board`](projects/print-farm-board) | 프린터 작업 현황 보드 · [원본 저장소](https://github.com/gwwg1006/print-farm-board) |
| 상품 안내서 생성기 | [`projects/stl-product-guide`](projects/stl-product-guide) | STL 파일로 출고용 상품 안내서(A4)를 만드는 로컬 웹앱 (React, Three.js) · [원본 저장소](https://github.com/gwwg1006/stl-product-guide) |

`projects/` 아래는 각 프로젝트의 스냅샷입니다. 실제 고객 자료, 견적서 출력물, 도장 이미지, 키와 `.env`는 제외했고 연락처·사업자번호는 가상 값으로 바꿨습니다.

## 문제

제작 문의를 받을 때마다 요구사항 정리, 견적 산출, 고객 응대, 작업 일정 관리가 반복된다.

## 해결 방법

- 자연어 문의에서 제작 조건(소재·수량·색상·후가공·납기) 자동 추출
- 규칙 기반 견적 초안 (소재비, 장비 사용료, 후가공, 수량 할인, 배송비, 예상 납기)
- 단계별 고객 응대문 생성 (접수 / 추가 정보 요청 / 견적 / 승인 / 제작 시작 / 발송 / 배송 완료)
- 주문 상태 관리와 배송 안내

## 개인정보 보호

고객 개인정보와 문의 원문은 **로컬에서만** 처리한다. 외부 LLM은 선택 사항이며, 쓰더라도 이름이 가려진 응대문만 보낸다. 자세한 경계는 [docs/architecture.md](docs/architecture.md), [docs/privacy.md](docs/privacy.md).

## 실행

필요한 것은 Python 3.10 이상뿐이다 (외부 패키지 없음, API 키 없이 mock 모드로 동작).

```bash
cd backend
python3 -m app.demo --today 2026-11-02
```

테스트:

```bash
cd backend
python3 -m unittest discover -s tests -t .
```

출력 예시는 [docs/demo-scenario.md](docs/demo-scenario.md).

## 선택 기능

| 기능 | 켜는 법 | 상태 |
|---|---|---|
| 로컬 LLM 추출 | Ollama 실행 후 `LOCAL_LLM=ollama` | 응답 처리는 테스트로 검증, 실제 Ollama 서버로는 미검증. 실패 시 규칙 파서로 자동 전환 |
| 외부 LLM 문장 다듬기 | `OPENAI_API_KEY` | 실제 API로 미검증 |
| 메일 발송 | `NOTIFY_MODE=email` + SMTP 설정 | 실제 SMTP로 미검증 |

설정 항목은 `.env.example` 참고.

## 구조

```text
backend/app/
├── llm/            pii_filter, local_parser, prompts/
├── quote/          calculator, pricing_rules, schemas
├── communication/  reply_generator, email_adapter, mock_message_adapter
├── orders/         state
├── integrations/   openai_client, shipping_client, notification_client, mock/
└── demo.py
data/examples/      가상 문의·주문·고객 데이터
docs/               architecture, privacy, demo-scenario
```

## 현재 범위와 한계

- 웹 화면(frontend), REST API(FastAPI), Docker, RAG는 아직 없다. 흐름은 CLI 데모로 확인한다.
- 가격 규칙과 개당 무게·출력 시간은 데모용 가정이다. 실제로는 슬라이서 결과를 `OrderRequirements`에 넣는다.
- 배송은 mock이다.

## 라이선스

MIT
