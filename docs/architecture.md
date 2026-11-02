# 아키텍처

```text
고객 문의 원문
   │                         ┌────────── 로컬 영역 (외부 전송 없음) ──────────┐
   ▼                         │                                              │
[pii_filter] 이름·전화·메일·주소 분리 ──▶ 개인정보는 로컬 메모리에만 보관      │
   │ 비식별 텍스트                                                           │
   ▼                                                                        │
[local_parser] 제작 조건 추출 (Ollama 또는 규칙 파서) ──▶ OrderRequirements   │
   │                                                                        │
   ▼                                                                        │
[calculator] 소재비·장비 사용료·후가공·할인·배송비·납기 ──▶ Quote             │
   │                                                                        │
   ▼                                                                        │
[reply_generator] 단계별 응대문 (이름은 [NAME] 자리표시자)                    │
   │                                                                        │
   ├─ [NAME]만 가려진 문장 ──▶ (선택) openai_client 문장 다듬기 ◀── 외부 경계 ┘
   │
   ▼  로컬에서 [NAME] -> 실제 이름 복원
[notifier] mock / SMTP ──▶ 고객
   │
   ▼
[orders.state] 접수 → 견적 전달 → 제작 승인 → 제작 중 → 배송 중 → 배송 완료
   │
   ▼
[shipping_client] 운송장 발급 (현재 mock)
```

## 외부 경계

| 데이터 | 로컬 LLM/코드 | 외부 API |
|---|---|---|
| 문의 원문 | O | X |
| 이름·전화·메일·주소 | O | X |
| 비식별 요구사항·견적 금액 | O | 문장 다듬기에 한해 O |

## 모듈

| 경로 | 역할 |
|---|---|
| `backend/app/llm/` | 개인정보 분리, 요구사항 추출, 프롬프트 |
| `backend/app/quote/` | 가격 규칙(데모값), 견적 계산, 스키마 |
| `backend/app/communication/` | 응대문 템플릿, 메일/모의 발송 어댑터 |
| `backend/app/orders/` | 주문 상태 전이 |
| `backend/app/integrations/` | OpenAI, 배송, 알림 어댑터와 mock |
| `backend/app/demo.py` | 전체 흐름 데모 |
