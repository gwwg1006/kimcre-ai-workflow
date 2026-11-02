# PRINT FARM 보드

여러 대의 Bambu Lab 프린터(P2S, H2S, A2L, A1, X2D)에 걸린 출력 작업을 한 화면에서 관리하는 작업 현황 보드입니다. 프린터별 칼럼에 작업을 등록하고, 상태(출력 대기 / 출력 중 / 완료 / 오류)와 우선순위(긴급 / 보통 / 낮음)를 바꾸며 순서를 조정합니다.

- 배포: https://print-farm-board.vercel.app
- 작업 등록 시 모델명, 파일명, 수량·완료 수량, 소재, 색상, 노즐, 스크린샷 첨부
- 작업 API: `app/api/jobs` (조회·등록·수정·삭제)
- 데이터: Drizzle ORM 스키마(`db/schema.ts`)

아래는 이 프로젝트의 기반이 된 vinext 스타터의 안내문을 한국어로 옮긴 것입니다.

---

# vinext 스타터

[vinext](https://github.com/cloudflare/vinext) 위에서 동작하는 깔끔한 풀스택 스타터입니다. Cloudflare D1과 Drizzle은 선택 사항입니다.

## 사전 요구사항

- Node.js `>=22.13.0`
- `flock`, `curl`, GNU `timeout`이 있는 Linux

## Sites 수명 주기

Sites 수명 주기 CLI는 이 체크아웃을 돌려주기 전에 잠금 파일 기준으로 의존성 설치를 수행합니다. 소스는 `app/` 아래에서 수정하고, 확인하거나 공유할 만한 단위가 완성되면 체크포인트를 만드세요. 원격 Sites 빌더가 푸시된 커밋에 대해 `npm run build`를 실행합니다. 체크포인트 전에 설치나 빌드를 일상적인 절차로 반복하지 마세요.

이 스타터는 `wrangler.jsonc`를 사용하지 않습니다.

`install:ci`는 의도적으로 재시도하지 않는 단일 `npm ci`입니다. 같은 프로젝트에서 동시에 실행되는 설치를 거부하고, 이미지에 미리 채워진 npm 캐시가 있으면 `--prefer-offline`으로 사용하되 캐시에 없는 객체는 레지스트리에서 받습니다. 그렇지 않으면 `package-lock.json`에 기록된 vinext tarball 전체를 내려받아 검증하고, npm 소켓을 하나로 제한하며, 멈춘 설치는 종료합니다. `build`에는 짧은 타임아웃이 적용됩니다. 이 도우미들은 Linux와 GNU `timeout`을 대상으로 하며 macOS 네이티브 스크립트가 아닙니다.

쓰기 가능한 프로젝트 범위의 home, npm, XDG, 임시 경로가 필요한 스크립트는 `scripts/sites-env.sh`를 사용합니다. `dev`와 `start` 스크립트는 호출자의 런타임 환경을 따르며 Wrangler 로그를 체크아웃 안에 둡니다. 생성되는 `.sites-runtime/` 디렉터리는 버려도 되는 폴더이며 Git에서 무시됩니다.

## 포함된 구성

- 사이트 코드는 `app/` 아래에서 수정
- `app/chatgpt-auth.ts`: dispatch가 관리하는 선택적 ChatGPT 로그인 도우미
- `.openai/hosting.json`: 선택적 Sites D1·R2 바인딩 선언
- `vite.config.ts`: 선언된 바인딩을 로컬 개발에서 시뮬레이션
- `db/index.ts`: Cloudflare Worker 환경에서 D1 바인딩을 읽음
- `db/schema.ts`: 의도적으로 비어 있는 상태로 시작
- `examples/d1/`: 선택적 D1 예제
- `drizzle.config.ts`: 필요할 때 로컬 마이그레이션 생성을 지원

## 워크스페이스 인증 헤더

OpenAI 워크스페이스 사이트는 `oai-authenticated-user-email` 헤더에서 현재 사용자의 이메일을 읽을 수 있습니다.

SIWC(Sign in with ChatGPT)로 인증된 워크스페이스 사이트는 사용자의 SIWC 프로필에 비어 있지 않은 `name` 클레임이 있으면 `oai-authenticated-user-full-name`도 받을 수 있습니다. 전체 이름 값은 퍼센트 인코딩된 UTF-8이며 `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8` 헤더가 함께 옵니다.

전체 이름은 선택 값으로 취급하고, 없으면 이메일로 대체하세요.

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## 선택 사항: dispatch가 관리하는 ChatGPT 로그인

사이트에 선택적 또는 필수 ChatGPT 로그인이 필요하면 `app/chatgpt-auth.ts`의 도우미를 가져다 쓰세요.

- 로그인 여부에 따라 달라지는 선택적 UI에는 `getChatGPTUser()`를 사용합니다.
- 비로그인 방문자를 Sign in with ChatGPT로 보내야 하는 서버 렌더링 페이지에는 `requireChatGPTUser(returnTo)`를 사용합니다.
- 서버 컴포넌트에서는 `<a href={chatGPTSignInPath(returnTo)} target="_top">`으로 로그인을 시작합니다. 인증 도우미 모듈은 서버 전용이므로 클라이언트 컴포넌트에서 가져오지 마세요.
- `fetch`, XHR, 클라이언트 라우터, 로그인 경로를 미리 가져올 수 있는 프레임워크 링크는 사용하지 마세요. SIWC는 최상위 이동(top-level navigation)으로 시작해야 합니다.
- AuthAPI 인증 엔드포인트를 직접 요청하지 마세요. dispatch가 관리하는 `/signin-with-chatgpt` 경로가 SIWC 흐름을 시작해야 합니다.
- 브라우저 로그아웃 링크나 동작에는 `chatGPTSignOutPath(returnTo)`를 사용합니다.
- 로그인·로그아웃 후 이동할 곳은 같은 출처의 상대 경로 `returnTo`로 넘기세요. 도우미가 검증하고 안전하게 인코딩합니다.
- 요청마다 달라지는 신원 헤더에 의존하는 보호 페이지에는 `export const dynamic = "force-dynamic"`을 지정하세요.

dispatch는 `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, OAuth 쿠키, 신원 헤더 주입을 소유합니다. 이 예약된 경로에 대한 앱 라우트를 구현하지 마세요. 도우미를 가져와 호출하지 않는 라우트는 계속 익명 접근이 가능합니다.

SIWC는 신원만 확인하며 워크스페이스 소속을 증명하지 않습니다. 워크스페이스 전체 제한은 Sites 호스팅 플랫폼의 접근 정책으로 설정하거나, 서버에서 명시적인 소속·허용 목록 검사를 수행하세요.

계정 페이지, 사용자별 대시보드, 저장된 기록, 현재 ChatGPT 사용자에게 묶인 쓰기 동작에는 SIWC를 사용하고, 공개 콘텐츠는 익명으로 두세요.

## 진단 명령

- `npm run install:ci`: 잠금 파일 기준의 제한된 설치를 한 번 수행
- `npm run dev`: Vite/Vinext 개발 서버 시작
- `npm run build`: 배포 가능한 Sites 산출물 빌드
- `npm run start`: 빌드된 Vinext 앱 시작
- `npm test`: 빌드 후 렌더링된 개발 미리보기 메타데이터 검증
- `npm run db:generate`: 스키마 변경 후 Drizzle 마이그레이션 생성

빌드 명령은 원격 실패 후 대상을 좁혀 진단할 때 쓰고, 일반적인 체크포인트 절차에는 넣지 마세요.

통제된 카나리 실행에서는 `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, `SITES_BUILD_KILL_AFTER`로 타임아웃 기본값을 바꿀 수 있습니다. 타임아웃이 나면 명령이 실패하며, 도우미는 같은 설치나 빌드를 절대 재시도하지 않습니다.

## 더 알아보기

- [vinext 문서](https://github.com/cloudflare/vinext)
- [Drizzle D1 가이드](https://orm.drizzle.team/docs/get-started/d1-new)
