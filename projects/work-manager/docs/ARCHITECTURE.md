# 작업관리웹 아키텍처

## 1. 계층 구조

```text
Browser SPA (index.html + modules + api.js)
        │ JSON/FormData, same-origin loopback
        ▼
Flask app.py (runtime/guards/Blueprint registration)
        ▼
routes/ (HTTP validation and safe serialization)
        ▼
services/ (business transactions, filesystem and external adapters)
        ├── project_path_policy.py (canonical project root boundary)
        ▼
repositories/ + db.py + migrations.py
        ▼
SQLite source of truth
        ├── Markdown projection
        └── Excel/배송/외부 AI adapters (환경에 따라 차단 가능)
```

`app.py`는 약 130 lines 규모의 조립 지점이다. 기본 host는 loopback이며 비루프백 `APP_HOST`는 기동 시 거부된다. API 변경 요청은 Origin/Referer가 제시되면 요청 host와 exact same-origin인지 검사하고, 전체 요청은 110MB 제한을 넘으면 안전한 413 JSON으로 끝난다. 현재 실행 경로는 로컬 loopback 전용이다.

템플릿은 모든 CSS/JS를 `static_asset_url()`로 로드한다. 이 helper는 파일의 `mtime_ns`와 크기를 version query에 포함하므로 자산 수정 후 새로고침만으로 캐시가 갱신된다. 정적 자산 변경을 위해 서버를 재실행할 필요는 없다.

## 2. 데이터와 트랜잭션

SQLite의 `projects`, `project_items`, `partners`, `ai_plans`, `sync_jobs`가 업무 source of truth다. `projects.version`은 낙관적 잠금 revision이다. 화면은 상세 조회에서 받은 `expected_version`을 변경 요청에 포함하며, 서버는 `BEGIN IMMEDIATE` 안에서 read/merge/write를 직렬화하고 이전 revision이면 409 conflict를 반환한다. `migrations.init_db()`는 테이블/컬럼/index를 조건부로 생성하고 기존 프로젝트의 거래처 승격을 반복 가능하게 수행한다. 거래처 동일명 check-and-insert/update는 `BEGIN IMMEDIATE` 안에서 처리한다.

프로젝트 생성은 입력 검증 → 표준 폴더/파일 staging → SQLite 기록의 순서로 진행되며, 첨부 저장이나 초기 3MF/DB 단계가 실패하면 생성된 파일·폴더를 보상 정리한다. 파일 접근은 canonical containment, 표준 tab, 안전 basename, symlink 거부를 적용한다. 업로드는 최대 20개, 파일 25MB, 총 100MB이며 기존 파일을 덮어쓰지 않고 버전명을 만든다.

거래처 master는 `partners`에 보관하고, 프로젝트 생성 시 `partner_id`와 당시 고객명·담당자·연락처·배송주소 snapshot(`contact_name` 포함)을 함께 기록한다. `PartnerManager → NewProjectManager` 연결은 선택 시 신규 폼을 자동 입력하지만, 프로젝트별 수정은 snapshot에만 반영되어 거래처 master를 변경하지 않는다. 동일명 duplicate는 API에서 기존 거래처 선택 또는 명시적 신규 등록으로 분기하고, archive된 master와 기존 프로젝트 snapshot은 보존한다.

DB에 있는 `project_path`는 모든 mutable entrypoint가 `project_path_policy.resolve_project_root()`로 재검증한다. 허용된 두 root는 config에서 동적으로 읽고 canonical 비교하며, root 자체·외부 sibling/prefix 경로·삭제된 경로·프로젝트 디렉터리 symlink는 403/404 안전 오류로 끝난다. 표준 프로젝트 폴더는 `10_프로젝트/<연도>/<번호_고객_작업>/` 아래 7개 탭으로 유지한다.

## 3. Projection outbox

DB 변경과 Markdown/Excel projection은 하나의 분산 원자 트랜잭션으로 주장하지 않는다. 변경 후 `sync_jobs`에 `upsert`/`delete` 작업을 enqueue하고 처리기가 projection을 수행한다.

일반 UI의 `POST /api/sync`와 선택적 startup sync는 이 outbox를 소비하는 **DB → Markdown/Excel 단방향** 작업이다. 기존 파일·엑셀에서 DB로 되가져오는 legacy import는 일상 동기화에 포함하지 않으며, 별도 복구/이관 절차에서만 사용한다.

- `attempts < 5`만 자동 claim하며 최종 만료 작업은 `failed/attempt_limit`이 된다.
- manual retry는 failed 작업을 명시적으로 pending/attempts=0으로 되돌린다.
- worker claim은 `BEGIN IMMEDIATE`, 생성순서, lease token/owner를 사용한다.
- 완료/실패는 `id + status + lease_token` CAS라서 늦은 worker가 새 owner를 덮지 않는다.
- projection 전체 구간은 bounded flock(기본 30초)으로 직렬화한다.
- heartbeat는 독립 SQLite connection과 짧은 busy timeout으로 lease를 연장한다.
- projection side effect가 끝난 뒤 lease를 잃거나 `mark_done` CAS가 실패하면 `superseded`로 반환하고 `mark_failed`로 새 owner를 오염시키지 않는다. 작업은 open 상태로 남아 새 owner가 최종 상태를 확인한다.
- legacy NULL lease만 migration에서 pending으로 재큐잉하며, 정상 non-NULL UTC lease는 startup에서 초기화하지 않는다.

파일 업로드 배치도 프로젝트별 cross-process lock을 사용한다. 모든 첨부를 staging한 뒤 3MF replacement receipt, DB의 단일 slicing snapshot, 요청 생성 non-3MF 목록을 추적하며, 실패 시 reverse compensation으로 이번 요청 자산만 복구한다. pre-existing 파일·backup은 canonical 경로와 identity 검증 없이는 삭제하지 않는다.

## 4. AI preview/apply/cancel

AI parse/global/detail 요청은 외부 전송 동의가 없으면 중단된다. `ai_contracts.py`는 신규 접수·단일 프로젝트 변경·전체 관제를 독립된 버전 계약과 JSON Schema로 분리한다. context는 길이를 제한한 신뢰하지 않는 JSON으로 직렬화되며, 파일 내의 지시는 시스템 지시로 처리하지 않는다.

`ai_service.py`는 Flash/low 기본 프로필, 작업별 45–75초 전체 시간 예산, 일시 장애만 재시도, 최대 2개 동시 실행, 격리 cwd, sandbox/plan mode를 적용한다. 타임아웃·예외에서는 호출별 process group을 bounded TERM/KILL로 종료한다. 자유 텍스트·부분 JSON·에이전트 진행 문구는 fail-closed 처리한다.

변경 가능 응답은 preview plan으로 저장하고, 서버는 짧은 TTL과 confirmation token hash를 관리한다.

```text
preview → proposed updates/file ops 요약
        → 사용자 승인 + X-AI-Confirmation-Token
        → allowlist/fingerprint 재검증
        → apply 또는 cancel
```

토큰 원문은 승인 응답에서 1회 전달되어 메모리 UI store에서만 사용하고, 저장소에는 hash/CAS 상태만 남긴다. apply는 재조회한 proposal·fingerprint를 검증하고 프로젝트별 lock을 sorted 순서로 획득한 뒤 mutation한다. apply 실패나 파일 교체 실패에는 staged 파일 cleanup/보상 계약이 적용된다. E2E에서는 외부 AI와 AI apply를 차단한다.

작업 범위, 시간 예산, 환경변수, 오류 계약은 [`AI_AGENT_OPERATIONS.md`](AI_AGENT_OPERATIONS.md)에 정의한다.

## 5. 파일 교체와 공개 응답

3MF 교체는 프로젝트/`03_슬라이싱_3MF`/`_backup`/`01_수신원본`의 canonical containment와 symlink 거부를 검증한다. ZIP entry 수·개별/총 비압축 크기·압축비를 제한하고, 기존 파일은 backup/version으로 보존한다. public JSON에는 절대경로·프로젝트 루트·사용자명이 들어가지 않는다.

raw 파일은 `tab_key + filename`으로 서버가 경로를 재구성한다. 업로드 batch는 request-private staging, project batch lock, 3MF receipt/identity 및 DB 이전값을 추적한다. `publish_no_replace`는 같은 filesystem staging 후 hard-link로 최종 파일을 만들며 기존 파일을 덮어쓰지 않는다. HTML/SVG/JS 등 위험 형식은 inline 대신 attachment로 내려가며 `X-Content-Type-Options: nosniff`를 설정한다.

배송 응답은 DB의 `courier`와 `tracking_no`에서 `tracking_url`을 재생성한다. 한진 adapter는 공식 결과 페이지와 최신 상태·일시·위치를 연결하고, 저장된 배송 상태·시간·위치는 다음 상세/목록 조회에서도 유지된다. 외부 한진 사이트 자체의 실시간 응답은 격리 검증 대상이 아니다.

## 6. 프론트엔드 소유권

`app.js`는 550 lines의 전역 state/init/호환 wrapper다. 대시보드, 신규 등록, 상세 editor/items, file manager, partners, estimate, delivery, AI는 각 `static/js/modules/*.js` manager가 listener와 업무 로직을 소유한다. 템플릿의 script는 API와 manager를 먼저 로드하고 app.js를 마지막에 로드한다. `pricing.js`는 신규/상세/견적의 DOM 없는 단일 계산기다.

각 manager는 재초기화 시 최신 의존성을 사용하고, generation/AbortController/프로젝트별 lock으로 늦은 응답과 중복 클릭을 무시한다. `BroadcastChannel('kmc-project-state')`를 지원하는 브라우저에서는 다른 탭의 프로젝트 변경을 무효화하고 상세·목록·통계를 재검증한다. 동적 HTML은 escape 및 data-action delegation을 사용하며 서버 콘텐츠가 inline JavaScript로 실행되지 않는다.

`style.css`는 좁은 화면에서 주요 grid/modal/detail 영역을 1열로 재배치하고, `focus-visible`과 `prefers-reduced-motion`을 존중한다. 기능 모듈은 이 반응형 레이아웃을 전제로 하되 상태·데이터 로직을 CSS에 의존하지 않는다.

## 7. E2E 격리와 운영 보호

`scripts/run_e2e_server.sh`는 임시 base와 `KMC_*` 경로를 만들고 `KMC_E2E_MODE=1`, loopback, 별도 포트, `STARTUP_SYNC=0`으로 기동한다. config는 projects/completed/data/DB/operations 경로의 canonical containment와 alias 위험을 검증한다. E2E에서는 AI, Excel/PDF, 한진 조회, Finder/Bambu, 운영대장 sync를 fail-safe 차단한다.

정상 live 외부 AI·한진·Excel/PDF/macOS 앱 연동은 계약 테스트 통과만으로 검증된 것으로 간주하지 않는다. 운영 데이터 보호가 필요한 테스트는 임시 fixture와 격리 DB/폴더만 사용한다. `constraints.txt`에 고정된 의존성 설치와 `scripts/run_e2e_server.sh`의 별도 포트 실행을 사용하며 운영 DB·운영대장·고객 파일은 테스트 대상이 아니다.

테스트 수는 고정된 문서 수치로 관리하지 않고 README의 검증 명령을 실행해 확인한다. Excel/PDF/Gemini/한진 실서비스는 계약 테스트에 포함되지 않는다.

## 8. 검증 명령

```bash
PYTHONDONTWRITEBYTECODE=1 ./.venv/bin/python -m unittest discover -s tests -q
for f in $(rg --files -g '*.js' static tests | sort); do node --check "$f"; done
node --test tests/*.test.js
git diff --check
```
