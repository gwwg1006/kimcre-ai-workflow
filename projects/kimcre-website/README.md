# 김명규크리에이티브 웹사이트

Next.js 16 기반의 3D 프린팅 포트폴리오, 견적 접수, 파일 공유 및 관리자 대시보드입니다.

## 필수 환경변수

`.env.example`을 참고해 로컬은 `.env.local`, 배포는 Vercel 프로젝트 환경변수에 설정하세요.

- `SESSION_SECRET`: 32자 이상의 임의 문자열. `openssl rand -base64 48`로 생성할 수 있습니다.
- `ADMIN_PASSWORD`: 12자 이상의 고유한 관리자 비밀번호.
- `POSTGRES_URL`: Vercel Postgres 연결 문자열.
- `BLOB_READ_WRITE_TOKEN`: 50MB 견적 파일 직접 업로드에 필요한 Vercel Blob 토큰.
- `GMAIL_USER`, `GMAIL_APP_PASSWORD`: 견적 알림 메일 발송용.

`SESSION_SECRET`이 없거나 너무 짧은 상태와 `ADMIN_PASSWORD`가 없거나 12자 미만인 상태에서는 인증이 안전하게 거부됩니다.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
