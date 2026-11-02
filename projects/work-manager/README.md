# 김명규크리에이티브 작업관리 웹

로컬 작업관리용 Flask + SQLite 웹 애플리케이션이다. 프로젝트·품목·거래처를 SQLite에 저장하고, Markdown/Excel은 동기화 projection으로 관리한다.

## 정상 실행

```bash
./run.sh
```

기본 주소는 `http://127.0.0.1:5001`이다. 기본 실행은 loopback에만 바인딩하며 Flask debug/reloader와 startup 전체 sync를 사용하지 않는다. `GET /api/health`로 HTTP 기동 상태를 확인하고, 필요한 동기화는 화면의 동기화 동작으로 명시적으로 실행한다.

### Mac 앱처럼 실행

`~/Applications/김명규크리에이티브 작업관리.app`을 더블클릭하면 서버가 없을 때만 macOS 사용자 실행 관리에 등록해 백그라운드로 시작하고, 준비 확인 후 기본 브라우저에서 웹앱을 연다. Finder에서 실행해도 터미널 창에 종속되지 않으며, 중복 실행은 새 서버를 만들지 않는다. 로그는 `~/Library/Logs/김명규크리에이티브 작업관리/server.log`에 남는다.

서버를 끌 때는 웹앱 왼쪽 아래의 전원 버튼을 누른 뒤 확인한다. 이 버튼은 현재 작업관리 서버만 종료하며, 다른 Python/Flask 서버는 건드리지 않는다. 다시 사용하려면 시작 앱을 다시 실행하면 된다. 로그인 시 자동 실행되는 항목은 아니다.

현재 제품은 인증 없는 로컬 앱이므로 비루프백 `APP_HOST`는 허용하지 않는다. `ENABLE_CORS`를 켜더라도 명시된 loopback origin만 사용해야 하며 `*`는 허용되지 않는다.

정적 자산 URL에는 파일의 수정시각(ns)과 크기가 query version으로 붙는다. 따라서 CSS/JS를 수정한 뒤 브라우저를 새로고침하면 새 자산 URL을 사용하며, 자산 반영을 위해 서버를 재실행할 필요가 없다. 개발 템플릿은 자동 재로딩 설정을 사용한다.

## 거래처·프로젝트 연결

`/api/partners`가 거래처 마스터의 조회·등록·수정·보관 API다. 화면의 `PartnerManager`가 목록을 검색하고, 선택 결과를 주입된 `NewProjectManager` singleton에 전달해 고객명·담당자·연락처·우편번호·주소를 신규 프로젝트 폼에 채운다. 프로젝트에는 `partner_id`와 등록 당시 고객정보 snapshot을 함께 저장한다. 이후 프로젝트에서 연락처나 주소를 수정해도 거래처 마스터는 자동 변경되지 않는다.

## 배송 상태와 파일 배치

택배사와 운송장번호는 프로젝트에 저장하고, 목록·상세 응답의 `tracking_url`은 저장된 courier/tracking 필드로 재생성한다. 현재 기본 택배사는 한진택배이며, 한진 조회 어댑터가 공식 결과 페이지 URL과 최신 상태·일시·위치를 연결한다. 외부 한진 사이트에 대한 실시간 조회 성공은 격리 테스트에서 검증하지 않았다.

파일 배치는 프로젝트별 cross-process lock 안에서 전체 첨부를 staging한다. 3MF는 receipt/보상 경로로 교체하고, DB의 slicing 정보는 배치 단위로 갱신하며, non-3MF 파일과 동기화 작업도 실패 시 요청이 만든 항목만 되돌린다. 기존 파일·백업·운영 데이터는 identity/경로 검증 없이는 삭제하지 않는다.

## 격리 E2E 실행

```bash
bash scripts/run_e2e_server.sh
```

launcher는 임시 격리 base, 전용 DB/data/projects/completed/operations 경로, loopback, 별도 포트를 설정한다. `KMC_E2E_MODE=1`에서는 모든 변경 가능 경로가 전용 base 아래인지 검증하고 외부 서비스와 운영 projection을 차단한다.

차단 대상은 외부 AI, 한진 조회, Finder/Bambu 실행, Excel/PDF 외부 변환, 운영대장 sync다. launcher가 출력한 임시 루트는 검토를 위해 자동 삭제하지 않는다.

## 안전 경계

- API 변경 요청의 Origin/Referer는 exact same-origin loopback만 허용한다.
- 요청 전체는 110MB, 신규 첨부는 최대 20개·파일 25MB·총 100MB다.
- 업로드 파일명은 안전 basename/allowlist/canonical containment/symlink 검사를 통과해야 하며 기존 파일을 덮어쓰지 않는다.
- raw 응답은 tab key와 basename으로만 파일을 찾고, 위험 형식은 attachment와 `nosniff`를 사용한다.
- AI 변경은 preview 후 명시 승인하는 계획 흐름이며 confirmation token 원문은 URL/body/DOM/localStorage/log에 저장하지 않는다.
- SQLite가 source of truth이고, Markdown/Excel projection 실패는 attempts/lease/CAS/flock 기반 outbox가 재시도한다.

## 검증

```bash
PYTHONDONTWRITEBYTECODE=1 ./.venv/bin/python -m unittest discover -s tests -q
for f in $(rg --files -g '*.js' static tests | sort); do node --check "$f"; done
node --test tests/*.test.js
bash -n run.sh scripts/dependency_stamp.sh tests/dependency_stamp_contract.sh
bash tests/dependency_stamp_contract.sh
git diff --check
```

테스트 수는 변경될 수 있으므로 아래 명령을 기준으로 검증한다. 테스트는 임시 fixture와 격리 DB/폴더를 사용한다. 실제 외부 AI·한진·Excel/PDF/macOS 앱 연동은 계약 테스트만으로 검증되지 않으며 E2E에서는 의도적으로 비활성화된다.

`run.sh`는 macOS용 `.venv`를 처음 만들거나 `requirements.txt`/`constraints.txt`가 변경된 경우에만 설치한다. 설치 성공 후에만 `.venv/.dependency-stamp`를 원자적으로 갱신하며, 평상시 실행에는 네트워크 설치를 하지 않는다. 검증된 direct dependency pin은 `constraints.txt`에 있다.

구조와 API의 상세 맵은 [`docs/CODEMAP.md`](docs/CODEMAP.md), 데이터 경계와 알고리즘은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), AI 작업 범위·속도·승인 계약은 [`docs/AI_AGENT_OPERATIONS.md`](docs/AI_AGENT_OPERATIONS.md)를 참조한다.

---

> 공개용 저장소입니다. 실제 사업자 정보(등록번호, 대표자, 주소, 연락처, 계좌)와 도장 이미지, 견적 엑셀 템플릿은 제거했고 가상 값으로 바꿨습니다. 견적서 PDF의 공급자 정보는 `pdf_service.py`에서 본인 정보로 교체해서 쓰세요.
