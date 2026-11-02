<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Browser Verification Policy
- **중요**: Chrome DevTools MCP 툴(크롬 브라우저 제어 및 스크린샷 캡처 등)을 사용하여 웹사이트를 열고 검증할 때는 반드시 사전에 사용자에게 먼저 동의를 구하고 진행해야 합니다. 사용자 허가 없이 임의로 브라우저 창을 열지 마십시오.

## 포트폴리오 사진 업로드 & 자동 추가 가이드 (Portfolio Image Seeding Guide)
- 사용자가 채팅창에 사진을 첨부하고 "포트폴리오에 추가해줘"라고 요청하면 다음 절차를 따릅니다:
  1. `.tempmediaStorage` 디렉토리 또는 대화 아티팩트 목록에서 사용자가 올린 최신 사진 파일(`media__*.jpg/png`)을 찾아 확인합니다.
  2. 업로드된 이미지를 분석하여 프로젝트명(Title), 카테고리(Category), 소재(Material), 제작 기간(Duration), 상세 설명(Description)을 지능적으로 정의합니다.
  3. 로컬의 `web/public/images/` 폴더에 이미지를 영문 소문자 케이스(예: `portfolio-[이름].jpg`)로 복사합니다.
  4. 로컬 JWT 토큰을 임시 발행하고 `/api/admin/portfolio` POST API를 호출하여 실서버 Vercel Blob 및 Postgres DB와 로컬 `data/db.json`에 데이터를 자동으로 업로드하고 싱크를 맞추는 seeder 스크립트를 구동합니다.
  5. 배포 명령을 실행하여 로컬 리소스 변경점들을 실서버에 반영해 싱크를 맞춥니다.

