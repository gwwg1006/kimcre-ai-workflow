'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Plus, X } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const PAGE_LABELS = {
  '/services': '서비스',
  '/portfolio': '제작 사례',
  '/quote': '견적 요청',
  '/contact': '문의',
  '/privacy': '개인정보처리방침',
  '/refund': '환불정책',
  '/share': '파일 공유',
};

const MENU = [
  { label: '제작 사례', href: '/portfolio', className: 'bg-sage' },
  { label: '서비스', href: '/services', className: 'bg-butter' },
  { label: '견적 요청', href: '/quote', className: 'bg-ink text-paper' },
  { label: '문의', href: '/contact', className: 'bg-sand' },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('');

  // Home sections carry data-section; show the one in view next to the brand, like a breadcrumb.
  useEffect(() => {
    const targets = document.querySelectorAll('[data-section]');
    if (!targets.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setSection(visible[visible.length - 1].target.dataset.section);
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [pathname]);

  if (pathname && (pathname.startsWith('/admin') || pathname.startsWith('/kimcregpt'))) return null;

  const crumb = PAGE_LABELS[Object.keys(PAGE_LABELS).find((p) => pathname?.startsWith(p))] || (pathname === '/' ? section : '');

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-16 items-center justify-between px-3 md:px-5">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button type="button" aria-label="메뉴 열기" className="flex size-11 items-center justify-center transition-transform hover:rotate-90">
              <Plus className="size-9 stroke-[1]" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" showCloseButton={false} className="w-full gap-0 border-0 bg-background p-3 sm:max-w-none md:p-5">
            <div className="flex h-11 items-center justify-between">
              <SheetClose asChild>
                <button type="button" aria-label="메뉴 닫기" className="flex size-11 items-center justify-center">
                  <X className="size-9 stroke-[1]" />
                </button>
              </SheetClose>
              <SheetTitle className="text-sm font-normal">김명규크리에이티브</SheetTitle>
              <span className="size-11" />
            </div>
            <nav className="mt-4 grid flex-1 gap-3 md:grid-cols-4">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex flex-col justify-between rounded-md bg-sheet p-6 md:col-span-2 md:row-span-2"
              >
                <span className="font-mono text-[11px] text-muted-foreground">3D PRINT STUDIO · 성남 분당</span>
                <span className="display text-6xl md:text-8xl">홈</span>
              </Link>
              {MENU.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  onClick={() => setOpen(false)}
                  className={cn('group flex items-end justify-between rounded-md p-6 transition-[filter] hover:brightness-95', m.className)}
                >
                  <span className="display text-4xl md:text-5xl">{m.label}</span>
                  <ArrowRight className="size-6 transition-transform group-hover:translate-x-1" />
                </Link>
              ))}
              <div className="grid gap-1 rounded-md border p-6 text-sm md:col-span-4">
                <a href="mailto:kimcre3d@gmail.com" className="underline-offset-4 hover:underline">kimcre3d@gmail.com</a>
                <a href="https://open.kakao.com/o/s7JPhrzg" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">카카오톡 1:1 오픈채팅</a>
              </div>
            </nav>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="김명규크리에이티브 홈"
            className="display text-[1.9rem] leading-none tracking-[-0.04em] transition-opacity hover:opacity-60"
          >
            kimcre
          </Link>
          {crumb && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-px bg-border" />
              {crumb}
            </span>
          )}
        </div>

        <Link
          href="/quote"
          aria-label="견적 요청"
          className="flex size-11 items-center justify-center rounded-full border border-foreground text-[11px] transition-colors hover:bg-foreground hover:text-background"
        >
          견적
        </Link>
      </div>
    </header>
  );
}
