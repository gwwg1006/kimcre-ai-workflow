'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const COLUMNS = [
  [
    ['견적·제작 문의', 'kimcre3d@gmail.com', 'mailto:kimcre3d@gmail.com'],
    ['카카오톡', '1:1 오픈채팅', 'https://open.kakao.com/o/s7JPhrzg'],
  ],
  [
    ['작업실', '경기도 성남시 분당구'],
    ['운영 시간', '평일 09:00–18:00 · 토 예약제'],
  ],
  [
    ['스마트스토어', 'smartstore.naver.com/bamboo3d', 'https://smartstore.naver.com/bamboo3d'],
    ['파일 공유', 'kimcre.shop/share', '/share'],
  ],
];

export default function Footer() {
  const pathname = usePathname();
  if (pathname && (pathname.startsWith('/admin') || pathname.startsWith('/kimcregpt'))) return null;

  return (
    // Home ends on a dark section, so the footer frame continues it instead of leaving a white gap.
    <footer className={pathname === '/' ? 'bg-ink px-3 pb-3 md:px-5 md:pb-5' : 'mt-24 px-3 pb-3 md:px-5 md:pb-5'}>
      <div className="overflow-hidden rounded-md bg-slate text-ink">
        <div className="grid gap-8 p-6 text-sm md:grid-cols-3 md:p-8">
          {COLUMNS.map((col, i) => (
            <dl key={i} className="space-y-4">
              {col.map(([label, value, href]) => (
                <div key={label}>
                  <dt className="text-ink/55">{label}</dt>
                  <dd>
                    {href ? (
                      <Link
                        href={href}
                        className="underline-offset-4 hover:underline"
                        {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {value}
                      </Link>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
        <p
          aria-hidden="true"
          className="display text-outline px-4 pb-4 text-center text-[24vw] leading-[0.85] tracking-[-0.06em] select-none"
        >
          kimcre
        </p>
        <div className="flex flex-col gap-2 border-t border-ink/15 px-6 py-4 text-xs text-ink/60 sm:flex-row sm:justify-between md:px-8">
          <span>Built to be held ™</span>
          <span className="flex gap-5">
            <Link href="/refund" className="hover:text-ink">환불정책</Link>
            <Link href="/privacy" className="hover:text-ink">개인정보처리방침</Link>
            <span>© {new Date().getFullYear()} 김명규크리에이티브</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
