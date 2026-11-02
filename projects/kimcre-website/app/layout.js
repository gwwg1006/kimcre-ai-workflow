import { Geist_Mono, Instrument_Serif, Noto_Serif_KR } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Toaster } from '@/components/ui/sonner';

const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
const serifLatin = Instrument_Serif({ weight: '400', subsets: ['latin'], variable: '--font-serif-latin' });
// Korean glyphs come from Google's unicode-range slices, so no subset preload.
const serifKr = Noto_Serif_KR({ weight: ['300', '400', '500'], preload: false, variable: '--font-serif-kr' });

export const metadata = {
  title: '김명규크리에이티브 | 3D 프린팅 서비스',
  description:
    '고품질 3D 프린팅 서비스 - 시제품 제작, 소량 생산, 맞춤 제작까지. 김명규크리에이티브가 아이디어를 현실로 만들어 드립니다.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  verification: {
    google: 'AfXhv6ozwnBd1HRWNegfB3tWEJenCoX-RE2HiLU8cnE',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${mono.variable} ${serifLatin.variable} ${serifKr.variable}`}>
      <body>
        <Header />
        <main className="overflow-x-clip">{children}</main>
        <Footer />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
