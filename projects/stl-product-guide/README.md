# STL 기반 상품 안내서 자동 생성기

3D 프린팅 제품 출고 시 택배 상자에 동봉할 수 있는 상품 안내서를 일관된 규격으로 빠르고 손쉽게 제작할 수 있는 로컬 웹 애플리케이션입니다.

---

## 🌟 주요 기능

1. **로컬 완결형 처리 (Zero-Network / Complete Privacy)**
   - STL 3D 파일 및 고객/주문 정보는 외부 서버로 일체 전송되지 않으며 100% 사용자의 브라우저 내에서만 처리됩니다.
2. **다중 STL 지원 & 2개 동시 처리 큐**
   - ASCII 및 Binary STL을 최대 20개까지 한 번에 드래그 앤 드롭으로 추가할 수 있습니다.
   - 백그라운드 큐(동시 2개)로 파싱 및 썸네일 캡처를 수행하여 대량 파일 추가 시에도 UI가 멈추지 않습니다.
3. **Three.js 기반 3D 인터랙티브 뷰어 & 썸네일 캡처**
   - 뷰포트에서 마우스로 모델을 자유롭게 회전·확대할 수 있습니다 (Pan 비활성화로 모델 이탈 방지).
   - 사선(Isometric), 정면(Front), 우측(Right), 상단(Top) 뷰 프리셋 지원.
   - `현재 보기 적용` 버튼을 통해 1200×900px 고해상도 대표 이미지를 즉시 생성하여 안내서에 반영합니다.
4. **드래그 앤 드롭 상품 순서 정렬 & 편집**
   - `@dnd-kit` 기반 드래그 정렬 및 키보드 위/아래 이동 지원.
   - 상품명 (최대 80자, 파일명 자동 가공) 및 수량 (1~999) 인라인 편집.
5. **A4 정밀 레이아웃 & 실시간 미리보기**
   - A4 세로 (210mm × 297mm) 규격, 2열 × 3행 (페이지당 6개) 자동 분할.
   - 상품명 길이에 따른 지능형 폰트 자동 스케일링 (18pt → 10pt).
   - 머리말(문서 제목, 고객명/출고일) 및 꼬리말(페이지 번호) 자동 생성.
6. **안전한 출력 사전 검증 & PDF/인쇄 연동**
   - 오류가 있거나 이미지 처리가 미완료된 상품을 조용히 누락시키지 않고, 사전 검증을 통해 명확한 안내를 제공합니다.
   - `PDF 저장 / 인쇄` 버튼을 통해 OS 인쇄 대화상자를 호출하여 종이 인쇄 또는 PDF 저장 지원.
7. **IndexedDB 자동 저장 & 복원**
   - 800ms 디바운스로 로컬 IndexedDB에 자동 저장되며, 새로고침 시 최근 작업을 원활하게 복원합니다.

---

## 🛠️ 기술 스택

- **Frontend**: React 19, TypeScript (Strict Mode), Vite
- **3D Graphics**: Three.js, STLLoader, OrbitControls
- **State Management**: Zustand
- **Local Persistence**: Dexie (IndexedDB)
- **Drag & Drop**: @dnd-kit/core, @dnd-kit/sortable
- **Testing**: Vitest, React Testing Library, Playwright
- **Styling**: Standard CSS (Responsive & @media print A4 rules)

---

## 🚀 시작하기

### 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173`으로 접속합니다.

### 프로덕션 빌드

```bash
npm run build
```

### 단위 및 통합 테스트 실행

```bash
npm run test
```

### E2E 테스트 실행

```bash
npm run test:e2e
```

---

## 📋 A4 출력 안내

- 브라우저 인쇄 대화상자에서 다음 설정을 권장합니다:
  - **용지 크기**: A4
  - **방향**: 세로 (Portrait)
  - **여백**: 없음 (None)
  - **배경 그래픽 인쇄**: 활성화 (기본 적용)
  - **대상**: 프린터 또는 `PDF로 저장`
