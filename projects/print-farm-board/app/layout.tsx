import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRINT FARM — 작업 현황",
  description: "3D 프린터별 출력 작업 현황과 대기열을 관리합니다.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
