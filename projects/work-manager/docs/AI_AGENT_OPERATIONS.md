# AI 에이전트 운영 표준

작업관리웹의 AI는 자율 실행기가 아니라 **읽기 전용 분석기 + 승인 기반 변경 제안기**로 운영한다. AI 응답을 신뢰 경계 안으로 가정하지 않고, 구조화·검증·승인을 거쳐야만 실제 상태가 바뀐다.

## 작업 범위

| 계약 | 용도 | 읽기 범위 | 변경 권한 |
|---|---|---|---|
| `order_intake` | 신규 주문 폼 추출 | 사용자 메시지, 현재 폼, 최근 대화, 첨부 | 없음; 폼 후보만 반환 |
| `project_change_preview` | 단일 프로젝트 수정 제안 | 해당 프로젝트, 메시지, 첨부 | 없음; preview plan만 생성 |
| `operations_control` | 전체 현황 질의/단일 프로젝트 제안 | 최대 250건의 축약 상태 + 전체 통계 | 없음; 한 프로젝트 preview만 생성 |

여러 프로젝트를 한번에 변경하거나 대상이 불명확한 요청은 변경 제안을 비우고 확인 요청으로 끝내야 한다. 실제 변경은 `preview → confirmation token → allowlist/fingerprint 재검증 → apply`를 통과한 경우에만 수행한다.

## 실행 파이프라인

```text
입력 검증/길이 제한
  → 신뢰하지 않는 context JSON으로 직렬화
  → 작업별 버전 프롬프트 + JSON Schema
  → 격리 cwd / sandbox / plan mode / low effort / Flash model
  → 전체 시간 예산 내 실행
  → 일시 장애만 1회 짧은 backoff 재시도
  → 구조화 응답 재검증
  → 질의 응답 또는 승인 대기 preview
```

- 프롬프트와 스키마는 `ai_contracts.py`에서 버전 관리한다.
- `.agents/agents/kmc-operations/agent.md`는 읽기 전용 `view_file`만 허용하고 스킬·서브에이전트·쉘·웹을 제외한 전용 경량 에이전트다.
- `ai_service.py`는 실행 예산, 재시도, 동시성, 프로세스 종료, 응답 검증을 담당한다.
- 첨부파일은 실제 업로드 파일의 canonical 부모 디렉터리만 읽기 경계로 제공한다.
- 자유 텍스트나 에이전트 진행 문구는 실패 처리하며 화면에 노출하지 않는다.
- 파일·대화·프로젝트 필드는 모두 신뢰하지 않는 데이터로 라벨하며, 파일 안의 지시를 시스템 지시로 실행하지 않는다.

## 속도·자원 기본값

- 기본 모델이 빈 응답 또는 일시 장애를 반환하면 같은 요청 계약으로 저지연 대체 모델을 한 번만 시도한다. `KMC_AI_FALLBACK_MODEL`로 변경하거나 비워 비활성화할 수 있다.
- CLI 자체의 print-timeout은 전체 요청 예산보다 앞서 종료해 서버가 프로세스 정리와 안전한 오류 응답을 보장한다. 재시도용 최소 시간은 `KMC_AI_RETRY_MIN_BUDGET_SECONDS`(기본 15초), 종료 여유는 `KMC_AI_CLI_SHUTDOWN_RESERVE_SECONDS`(기본 10초)다.

| 항목 | 기본값 | 환경변수 |
|---|---:|---|
| 신규 접수 전체 제한 | 75초 | `KMC_AI_PARSE_TIMEOUT_SECONDS` |
| 단일 수정 전체 제한 | 60초 | `KMC_AI_MODIFY_TIMEOUT_SECONDS` |
| 전체 관제 전체 제한 | 45초 | `KMC_AI_GLOBAL_TIMEOUT_SECONDS` |
| 최대 시도 | 2회 | `KMC_AI_MAX_ATTEMPTS` |
| 동시 실행 | 2개 | `KMC_AI_MAX_CONCURRENT_REQUESTS` |
| 전용 에이전트 | `kmc-operations` | `KMC_AI_AGENT` |
| 모델 / 추론 강도 | Gemini 3.8 Flash Low / low | `KMC_AI_MODEL`, `KMC_AI_REASONING_EFFORT` |

타임아웃은 시도당이 아니라 요청 전체 예산이다. 429, 502–504, high traffic, 일시적 연결 오류만 재시도하고 잘못된 모델·스키마·입력은 즉시 실패한다. 타임아웃이나 예외에서는 해당 호출이 만든 새 프로세스 그룹만 TERM 후 bounded KILL로 종료한다.

## 안전한 오류 계약

- `AI_TIMEOUT` → HTTP 504
- `AI_UNAVAILABLE` → HTTP 503
- `AI_INVALID_OUTPUT` → HTTP 502

외부 실행기의 stderr, 로컬 절대경로, 고객 데이터는 API 오류 응답으로 반환하지 않는다. 실제 AI 서비스 호출은 외부 전송 설정이 허용된 경우에만 시작한다.
