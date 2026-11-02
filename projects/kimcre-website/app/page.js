import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import InstantQuote from '@/components/InstantQuote';
import Backdrop from '@/components/Backdrop';
import { Tilt } from '@/components/ScrollMotion';
import { PhotoCycle, UnderlineLink } from '@/components/HomeEffects';

import { getPortfolios } from '@/lib/db';

// Portfolio work changes through the admin, so serve the homepage from ISR
// and refresh it on demand after a portfolio mutation.
export const revalidate = 3600;

// Cropped and colour-graded studio photos (scripts/grade-backdrops.mjs).
const PHOTO = {
  mat: '/images/bg/mat.jpg',
  lattice: '/images/bg/lattice.jpg',
  tags: '/images/bg/tags.jpg',
  stand: '/images/bg/stand.jpg',
  shelf: '/images/bg/shelf.jpg',
};

const SERVICES = ['SLA/DLP 레진 출력', 'FDM 출력', 'SLS 나일론 출력', '후가공·도색', '3D 모델링', '소량 양산'];

const MATERIALS = [
  ['PLA', '#e8e4d8'],
  ['PETG', '#7fb6c9'],
  ['ABS', '#2b2b2b'],
  ['TPU', '#f28c38'],
  ['Resin', '#c9b8e8'],
  ['PA12', '#9a9a95'],
];

const CLIENTS = ['서울대학교', '연세대학교', '고려대학교', 'KAIST', '한국공학대학교', '전북대학교', 'LG전자', '서울아산병원', '서울성모병원', '용인시청'];

export default async function Home() {
  let portfolios = [];
  try {
    portfolios = await getPortfolios();
  } catch (err) {
    console.error('Failed to fetch portfolios on home page:', err);
  }
  const works = portfolios.slice(0, 6).map((item) => ({
    ...item,
    cover: (Array.isArray(item.image) ? item.image[0] : item.image) || '/images/hero-bg.png',
  }));

  return (
    <>
      {/* Hero — full-bleed studio photos with the headline over them */}
      <section data-section="소개" className="relative isolate flex h-[calc(100svh-4rem)] min-h-[560px] flex-col justify-end overflow-hidden px-4 pb-10 text-paper md:px-8 md:pb-14">
        <PhotoCycle images={[PHOTO.mat, PHOTO.lattice, PHOTO.tags, PHOTO.stand]} className="absolute inset-0 -z-20" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/85 via-ink/50 to-ink/10 md:via-ink/30" />
        <h1 className="display text-[13vw] [text-shadow:0_2px_28px_rgb(0_0_0/0.5)] md:text-[8.2vw]">
          {[
            <>아이디어를</>,
            <><UnderlineLink href="/portfolio">손에 쥐는</UnderlineLink> 부품으로</>,
            <>만드는 <UnderlineLink href="/services">스튜디오</UnderlineLink></>,
          ].map((line, i) => (
            <span key={i} className="block overflow-hidden pb-[0.06em]">
              <span className="rise block" style={{ animationDelay: `${0.12 * i}s` }}>{line}</span>
            </span>
          ))}
        </h1>
        <div className="mt-8 flex flex-col gap-6 border-t border-paper/25 pt-6 md:flex-row md:items-end md:justify-between">
          <p className="max-w-md text-paper/85 md:text-lg">
            파일 하나면 시작합니다.
            <br />
            서울대 연구실 시제품도, LG전자 부품도 이 작업대 위에서 나왔습니다.
          </p>
          <Link href="/quote" className="group inline-flex items-center gap-2 text-lg underline decoration-1 underline-offset-4">
            파일 보내기 <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      <div>
        {/* Statement on an index card that settles as it scrolls in */}
        <Backdrop src={PHOTO.tags} dim="bg-ink/35" data-section="하는 일" className="sticky top-16 z-10 px-3 py-24 md:px-5 md:py-32">
          <Tilt>
            <div className="sheet px-10 py-16 md:px-24 md:py-28">
              <p className="display mx-auto max-w-5xl text-center text-[8.5vw] leading-[1.08] md:text-[4.6vw]">
                레진으로 뽑을지, <UnderlineLink href="/services">필라멘트</UnderlineLink>로 뽑을지는 고민하지 마세요. 어디에 쓸지만 알려주시면 방식은 저희가 정합니다.
              </p>
            </div>
          </Tilt>
        </Backdrop>

        {/* Work as a numbered parts plate */}
        <Backdrop src={PHOTO.lattice} dim="bg-ink/70" data-section="제작 사례" className="relative z-20 px-3 py-28 md:px-5">
          <h2 className="display text-center text-[11vw] text-paper md:text-[6vw]">최근에 만든 것들</h2>
          <div className="mx-auto mt-12 max-w-6xl rounded-md bg-sand p-4 md:p-10">
            <div className="grid grid-cols-2 gap-3 rounded-sm bg-paper p-3 md:grid-cols-3 md:gap-5 md:p-6">
              {works.map((w, i) => (
                <Link key={w.id} href={`/portfolio?id=${w.id}`} className="group relative block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-muted">
                    <Image
                      src={w.cover}
                      alt={w.title}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <span className="absolute -top-2 -left-2 flex size-7 items-center justify-center rounded-full bg-background font-mono text-[11px] shadow">
                    {i + 1}
                  </span>
                </Link>
              ))}
            </div>
            <ol className="mt-6 grid gap-x-8 gap-y-2 text-sm md:grid-cols-3">
              {works.map((w, i) => (
                <li key={w.id} className="flex gap-3 border-t border-ink/15 pt-2">
                  <span className="font-mono text-[11px] text-ink/60">{String(i + 1).padStart(2, '0')}</span>
                  <Link href={`/portfolio?id=${w.id}`} className="hover:underline">
                    {w.title} <span className="text-ink/50">— {w.material}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-8 text-center">
            <Link href="/portfolio" className="inline-flex items-center gap-1 text-sm text-paper underline underline-offset-4">
              제작 사례 전체 보기 <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </Backdrop>

        {/* Studio desk on grid paper */}
        <Backdrop src={PHOTO.stand} dim="bg-ink/50" data-section="스튜디오" className="relative z-20 px-3 py-28 md:px-5">
          <h2 className="display text-center text-[11vw] text-paper md:text-[6vw]">작업실과 손님들</h2>
          <div className="mt-12 p-2 md:p-12">
            <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-12 md:gap-8">
              <div className="flex flex-col items-center justify-between rounded-[28px] bg-[#b4b4b1] p-6 shadow-[inset_0_2px_0_rgb(255_255_255/0.5),0_20px_40px_-20px_rgb(0_0_0/0.5)] md:col-span-4 md:-rotate-2">
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-ink">
                  <span className="font-mono text-4xl text-[#7dff9b]">24h</span>
                </div>
                <p className="mt-5 text-center text-sm">파일을 보내면 24시간 안에<br />방식과 견적을 알려드립니다.</p>
              </div>

              <div className="rounded-sm bg-ink px-8 py-10 text-center text-paper shadow-2xl md:col-span-5 md:row-span-2 md:rotate-1">
                <p className="display text-6xl">KIMCRE</p>
                <p className="mt-6 text-xs text-paper/50">납품처</p>
                <ul className="display mt-3 text-2xl leading-[1.15] md:text-4xl">
                  {CLIENTS.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>

              <div className="relative aspect-square overflow-hidden rounded-[28px] bg-background shadow-xl md:col-span-3 md:rotate-3">
                <Image src="/images/printer-h2s.png" alt="Bambu Lab H2S" fill sizes="25vw" className="object-contain p-6" />
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-[28px] bg-butter p-5 shadow-[0_20px_40px_-24px_rgb(0_0_0/0.45)] md:col-span-4 md:-rotate-1">
                {[
                  ['10년+', '제작 경력'],
                  ['1,500+', '완료 프로젝트'],
                  ['±0.05', '레진 정밀도 mm'],
                ].map(([v, l]) => (
                  <div key={l} className="flex aspect-square flex-col items-center justify-center rounded-full border border-ink/40 text-center">
                    <span className="display text-2xl md:text-[2.2vw]">{v}</span>
                    <span className="mt-1 text-[10px] text-ink/70">{l}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-[28px] bg-background p-5 shadow-xl md:col-span-3 md:rotate-2">
                <p className="text-xs text-muted-foreground">소재 견본</p>
                <ul className="mt-4 grid grid-cols-3 gap-3">
                  {MATERIALS.map(([name, color]) => (
                    <li key={name} className="flex flex-col items-center gap-1.5">
                      <span className="size-10 rounded-full shadow-[inset_0_-4px_8px_rgb(0_0_0/0.25)]" style={{ background: color }} />
                      <span className="font-mono text-[10px]">{name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Backdrop>
      </div>

      <div>
        {/* Services on a green card */}
        <Backdrop src={PHOTO.shelf} dim="bg-ink/60" data-section="서비스" className="sticky top-16 z-30 px-3 py-24 md:px-5 md:py-32">
          <Tilt>
            <div className="sheet bg-sage px-10 py-16 md:py-24">
              <p className="text-center text-xs text-ink/60">무엇을 하나요</p>
              <ul className="display mt-6 text-center text-[11vw] leading-[1.02] md:text-[6.2vw]">
                {SERVICES.map((s) => (
                  <li key={s}>
                    <Link href="/services" className="transition-colors hover:text-ink/50">{s}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </Tilt>
        </Backdrop>

        {/* Start a project */}
        <section data-section="견적" className="relative z-40 bg-ink px-3 py-28 text-paper md:px-5">
          <div className="mx-auto grid max-w-[1400px] items-center gap-12 lg:grid-cols-2">
            <Link href="/quote" className="group display block text-[18vw] leading-[0.9] lg:text-[9vw]">
              새<br />프로젝트<br />
              <span className="underline decoration-1 underline-offset-[0.1em] group-hover:text-signal">시작하기</span>
            </Link>
            <InstantQuote />
          </div>
        </section>
      </div>
    </>
  );
}
