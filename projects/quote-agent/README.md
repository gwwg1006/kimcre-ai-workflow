# 3D 프린팅 견적서 및 거래명세서 자동 생성 엔진

이 프로젝트는 3D 프린팅 슬라이싱 결과를 바탕으로 Microsoft Excel 형식의 제품견적서, 거래명세서 및 통합견적명세서를 자동 생성하는 코어 엔진입니다.

---

## 📂 디렉토리 구조 (Directory Structure)

```text
📁 견적서(에이전트)
├── 📁 .agents/               # 에이전트 전용 규칙 보관소 (자동 인식)
│   └── AGENTS.md            # openpyxl 시트 복제 및 인쇄 레이아웃 제어 규칙
├── 📁 .venv/                 # Python 가상 환경 (openpyxl 등 설치됨)
├── 📁 src/                   # [Core] 파이썬 소스 코드 보관 폴더
│   ├── create_estimate.py   # 견적서/명세서 생성 핵심 실행 파이썬 스크립트
│   └── bridge_galileo.py    # 외부 프로그램 연동용 브릿지 스크립트 (백업)
├── 📁 출력파일/               # 프로그램 실행 시 최종 생성되는 엑셀 결과물(.xlsx) 저장 폴더
├── 📁 scratch/               # 개발/테스트용 스크립트 및 테스트 더미 파일 보관소
├── 📄 .gitignore            # Git 관리 제외 항목 정의 파일 (pycache, venv 등 무시)
├── 📄 agent.md              # 사용자 및 에이전트가 공유하는 개발/환경 가이드 규칙
└── 📄 requirements.txt      # 프로젝트 의존 라이브러리 목록
```

---

## 🔑 주요 파일 설명

### 1. `src/create_estimate.py`
- 핵심 견적서 작성 프로그램입니다. JSON 데이터를 입력받아 `제품견적서`, `거래명세서`, 또는 둘이 합쳐진 `통합견적명세서` 엑셀 파일을 빌드합니다.
- 16개 이상의 아이템이 들어올 경우 레이아웃 깨짐을 방지하기 위해 **16개 단위로 자동 시트 분할(Paging) 기입**하는 로직이 적용되어 있습니다.
- 모든 시트 복제 시 **인쇄 영역(Print Area) 설정 및 A4 한 페이지 맞춤(Fit to Page)** 설정을 강제 삽입하여 인쇄 배율이 꼬이는 오류를 원천 차단합니다.

### 2. `agent.md` & `.agents/AGENTS.md`
- 에이전트와 사용자의 개발 약속을 기록해 둔 문서입니다.
- **템플릿 파일 보관 규칙:** 모든 원본 양식 파일은 macOS Excel 템플릿 기본 폴더(`~/Library/Group Containers/UBF8T346G9.Office/User Content.localized/Templates.localized`)에 두어, 프로그램이 동적으로 이를 불러오도록 설계되었습니다. (사용자가 엑셀로 직접 템플릿을 수정하면 즉각 프로그램에 반영됩니다.)
- **openpyxl 인쇄 설정 규칙:** 동적 시트 복제 시 인쇄 배율 및 영역 설정 유실 버그를 방지하기 위한 상세 가이드가 포함되어 있습니다.

---

## 🛠️ 실행 방법

### 가상환경 활성화
```bash
source .venv/bin/activate
```

### 통합견적명세서 단독 생성 예시
```bash
python3 src/create_estimate.py --type integrated --file scratch/test_estimate.json
```
*(출력 결과물은 `출력파일/` 디렉토리에 자동 저장됩니다.)*
