# 작업관리웹 코드 지도

최신 구조의 기능별 진입점과 경계를 정리한 인덱스다. 경로는 저장소 루트 기준이며 운영 경로·고객 정보는 문서에 기록하지 않는다.

## 런타임과 백엔드 경계

```text
 app.py (Flask runtime, 130 lines)
 ├─ routes/system.py     화면·health·stats·전체 sync
 ├─ routes/projects.py   프로젝트 CRUD·상태·sync-pending
 ├─ routes/files.py      파일 목록·업로드·raw·외부 앱 열기
 ├─ routes/partners.py   거래처 CRUD/archive
 ├─ routes/estimates.py  견적/명세서 생성
 ├─ routes/delivery.py   배송 조회·갱신
 └─ routes/ai.py         AI parse/preview/apply/cancel/global
       ↓
services: project_service.py, file_service.py, sync_service.py,
          estimate_service.py, delivery_service.py, ai_service.py,
          ai_contracts.py (versioned prompts + JSON Schemas),
          .agents/agents/kmc-operations/agent.md (read-only lightweight worker),
           ai_plan_service.py, ai_apply_service.py, pdf_service.py
       ↓
 project_path_policy.py (DB project_path trust boundary)
       ↓
 repositories: projects.py, partners.py, ai_plans.py, sync_jobs.py
       ↓
 db.py → SQLite (migrations.py가 스키마 생성/보강)
```

`app.py`는 약 130 lines의 Blueprint 등록, loopback host 검증, 요청 크기 제한, same-origin guard, 413 응답, 선택적 startup sync 조립 지점이다. 서비스는 로컬 loopback 실행만 지원하며 업무 로직은 route/service/repository로 내려간다. `database.py`는 기존 import 호환용 facade다.

템플릿의 `static_asset_url()`은 정적 파일의 `mtime_ns`와 크기를 version query로 붙인다. CSS/JS 변경은 브라우저 새로고침으로 반영되며, 정적 자산 변경만으로 서버 재실행을 요구하지 않는다.

## 프론트엔드 모듈과 로드 순서

`templates/index.html`의 스크립트 순서는 `api.js → ai-plan-ui → ui-utils/modal → AI/detail/editor → renderer/actions → global AI → project-detail/file-manager → pricing/dashboard/estimate/partners/detail-items/new-project/project-actions/delivery → app.js`다. `pricing.js`는 계산기이며 DOM 없는 순수 함수와 `window.Pricing`/Node export를 제공한다.

| 영역 | 소유 모듈 | app.js 계약 |
|---|---|---|
| 대시보드 | `modules/dashboard.js` | 기존 `loadDashboard`, `loadProjects`, `renderProjects` wrapper |
| 신규 프로젝트 | `modules/new-project.js` | `openNewProjectModal`, submit/items/files wrapper |
| 상세 기본정보/상태 | `modules/project-editor.js` | 전역 호환 wrapper만 유지 |
| 상세 품목 | `modules/detail-items.js` + `pricing.js` | 계산/save wrapper |
| 상세 표시/탭 | `modules/project-detail.js` | 상세 open/render wrapper |
| 파일 | `modules/file-manager.js` | 안전한 `{tabKey,name}` token 위임 |
| 거래처 | `modules/partners.js` | load/form/search wrapper; 선택 결과를 주입된 `NewProjectManager` singleton에 전달 |
| 견적 | `modules/estimate.js` | 견적 모달/계산 wrapper |
| 배송 | `modules/delivery.js` | 배송 modal/tracking wrapper |
| AI 신규/상세/global | `ai-assistant.js`, `detail-ai.js`, `global-ai-commander.js`, `ai-plan-ui.js` | 기존 send/open wrapper |
| 공통 UI | `ui-utils.js`, `modal.js`, `ui-actions.js` | 토스트·모달·대시보드 액션 |

`app.js`는 전역 `state`와 초기화/호환 wrapper를 보유하며 현재 550 lines다. 기능 listener는 각 manager의 delegated binding이 소유하고 초기화는 재호출 가능해야 한다.

`static/css/style.css`는 desktop grid에서 1320/960/768/640px breakpoint로 1열 reflow를 제공하고, focus-visible 및 reduced-motion 규칙을 공통 적용한다.

## 주요 HTTP API

| 기능 | API |
|---|---|
| 대시보드 | `GET /api/projects`, `GET /api/stats`, `GET /api/health` |
| 프로젝트 | `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/<no>`, `POST /status`, `/complete`, `/delete` |
| 파일 | `GET /files`, `POST /files/upload`, `/open`, `/rename`, `/version-bump`, `/delete`, `GET /files/raw` |
| 거래처 | `GET/POST /api/partners`, `PUT/DELETE /api/partners/<id>` |
| 견적/배송 | `POST /api/projects/<no>/estimate/generate`, `GET /api/delivery/pending`, `POST /api/delivery/update`, `POST /api/delivery/track` |
| AI | `POST /api/ai/parse-order`, `/api/ai/global-chat`, `/api/projects/<no>/ai-modify`, plan `POST apply`/`DELETE cancel`; `ai_contracts.py` task scope/schema/prompt → `ai_service.py` bounded runtime → `ai_plan_service.py` preview → `ai_apply_service.py` validation/apply |
| Outbox | `POST /api/projects/sync-pending`, `POST /api/sync` |

JSON 변경 요청은 공통 요청 경계에서 Origin/Referer가 있으면 exact same-origin loopback만 허용한다. multipart는 파일별 allowlist·basename·symlink·개수/크기 검증을 통과해야 한다. 공개 파일 식별자는 `tab_key + filename` 또는 허용 상대 경로이며 절대경로를 반환하지 않는다.

## 저장소·파일 경계

- SQLite `projects`, `project_items`, `partners`, `ai_plans`, `sync_jobs`가 업무 source of truth다. `projects.version`은 화면의 `expected_version`과 대조하는 낙관적 잠금 revision이며, 서버는 `BEGIN IMMEDIATE`로 프로젝트 read/merge/write를 직렬화한다.
- `projects`에는 `partner_id`와 당시 고객명·담당자·연락처·주소(`contact_name` 포함) snapshot이 있고, `partners`에는 archive/duplicate 판정용 master 정보가 있다. `ai_plans`는 preview proposal·fingerprint·token hash/CAS 상태를, `sync_jobs`는 projection outbox와 lease를 보관한다.
- DB의 `project_path`는 `project_path_policy.resolve_project_root()`를 거쳐 `PROJECTS_DIR` 또는 `COMPLETED_DIR`의 실제 하위 프로젝트인지 확인한다. root 자체·외부 경로·프로젝트 symlink는 파일/견적/sync projection 전에 거부한다.
- 프로젝트 폴더는 config의 `PROJECTS_DIR` 아래 표준 7개 폴더를 사용한다: `00_작업정보`, `01_수신원본`, `02_모델수정`, `03_슬라이싱_3MF`, `04_출력검수`, `05_견적거래`, `06_배송`.
- Markdown/Excel은 projection이며 sync outbox가 재시도한다. 일반 `/api/sync`와 startup sync는 DB→projection만 수행하고, legacy 파일/엑셀→DB import는 별도 복구 절차다. `sync_jobs`는 attempts 상한, lease token CAS, flock projection lock, heartbeat를 사용한다.
- 거래처는 master(`partners`)로 관리하고 프로젝트에는 연결 당시의 고객명·연락처·배송주소 snapshot을 보존한다. 프로젝트 수정은 snapshot만 바꾸며 master를 암묵적으로 덮어쓰지 않는다.
- AI 작업은 `order_intake`, `project_change_preview`, `operations_control` 계약으로 분리된다. JSON Schema 출력만 수용하고, 전체 시간 예산·일시 오류 재시도·동시성 제한·프로세스 그룹 종료를 `ai_service.py`에서 관리한다.
- AI 변경은 preview/confirmation token/apply/cancel 단계이며 토큰은 메모리에만 보관하고 공개 저장·로그·DOM에 넣지 않는다. 세부 운영 기준은 `docs/AI_AGENT_OPERATIONS.md`를 따른다.
- 신규 업로드는 최대 20개, 파일 25MB, 요청 총량 100MB 정책을 적용한다. 프로젝트별 `project_batch_lock`이 프로세스 간 배치를 직렬화하고, staging/3MF receipt/DB snapshot 기반으로 요청이 만든 파일만 보상한다.
- 배송은 저장된 courier/tracking 필드로 공식 조회 링크를 재생성하고, 한진 어댑터가 조회 결과의 상태·일시·위치를 저장한다. 외부 한진·Excel/PDF/Gemini 실서비스는 격리 테스트에서 호출하지 않는다.
- `KMC_E2E_MODE=1`에서는 전용 base 하위 경로만 사용하고 AI·Excel/PDF·배송 외부 조회·Finder/Bambu·운영대장 sync를 차단한다.
- `config.py`는 `KMC_BASE_DIR`, `KMC_PROJECTS_DIR`, `KMC_COMPLETED_DIR`, `KMC_OPERATIONS_FILE`, `KMC_DATA_DIR`, `KMC_DB_PATH`를 지원하며, `constraints.txt`와 `run.sh`/`scripts/run_e2e_server.sh`가 실행 의존성과 격리 실행 기준을 정의한다.

## 검증 기준

견적 PDF는 `estimate_service.py → pdf_service.py`에서 Microsoft Excel의 `save_workbook_as` 명령으로 내보낸다. 파일 열기는 macOS Alias 참조를 사용하고, 앱 내부 템플릿을 우선 사용한다. LibreOffice/HTML 대체 출력을 사용하지 않으며 실패는 서버 로그에 기록한다.

테스트 수는 고정하지 않고 `PYTHONDONTWRITEBYTECODE=1 ./.venv/bin/python -m unittest discover -s tests -q`, `node --test tests/*.test.js`, 전체 JS `node --check`, `git diff --check` 명령으로 확인한다. 라이브 한진 조회, Excel/PDF 변환, Gemini 및 macOS 외부 앱 실행은 계약 테스트에 포함되지 않으며 E2E에서도 차단된다.

## 변경 전 확인 위치

계산은 `pricing.js`, DB 쓰기는 해당 repository/service, 경로 검증은 `file_service.py`, 요청 계약은 해당 route와 `request_security.py`, 스키마는 `migrations.py`를 먼저 확인한다. 기능 변경 후 관련 Python unittest, Node contract test, `node --check`, `git diff --check`를 실행한다.
