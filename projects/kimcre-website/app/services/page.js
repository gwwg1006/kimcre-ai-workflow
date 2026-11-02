import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ScrollReveal from '@/components/ScrollReveal';

const printingServices = [
  {
    image: '/images/service-sla.png',
    title: 'SLA/DLP 레진 출력',
    desc: '고정밀 레진 프린팅으로 정밀도 ±0.05mm의 매끄러운 표면을 구현합니다. 시제품, 피규어, 주얼리에 적합합니다.',
    features: [
      '정밀도 ±0.05mm',
      '매끄러운 표면 품질',
      '투명/유연 소재 가능',
      '미세 디테일 구현',
    ],
  },
  {
    image: '/images/service-fdm.png',
    title: 'FDM 출력',
    desc: '열가소성 필라멘트 적층 방식으로 빠르고 경제적인 출력이 가능하며, 대형 사이즈도 제작할 수 있습니다.',
    features: [
      '다양한 소재 선택',
      '대형 출력 가능 (최대 500mm)',
      '빠른 납기',
      '경제적인 가격',
    ],
  },
  {
    image: '/images/service-sls.png',
    title: 'SLS 출력',
    desc: '나일론 분말 소결 방식으로 고강도, 복잡한 형상의 기능성 부품 제작에 적합합니다.',
    features: [
      '서포트 불필요',
      '높은 내구성',
      '복잡한 형상 제작',
      '기능성 테스트 가능',
    ],
  },
];

const materials = [
  { name: 'PLA', color: '#e8e4d8', desc: '친환경, 고정밀, 다양한 색상' },
  { name: 'ABS', color: '#2b2b2b', desc: '내열성, 내충격성, 후가공 용이' },
  { name: '레진 (Resin)', color: '#c9b8e8', desc: '초고정밀, 매끄러운 표면' },
  { name: '나일론 (PA12)', color: '#9a9a95', desc: '고강도, 유연성, 내마모성' },
  { name: 'TPU', color: '#f28c38', desc: '유연성, 탄성, 충격 흡수' },
  { name: 'PETG', color: '#7fb6c9', desc: '내화학성, 투명성, 식품 안전' },
];

const processSteps = [
  { num: 1, title: '상담 및 접수', desc: '프로젝트 요구사항을 상담합니다' },
  { num: 2, title: '데이터 검토', desc: '3D 파일을 검토하고 최적화합니다' },
  { num: 3, title: '출력 진행', desc: '최적의 방식으로 출력합니다' },
  { num: 4, title: '후가공', desc: '샌딩, 도색 등 마감 처리합니다' },
  { num: 5, title: '납품', desc: '품질 검수 후 안전하게 배송합니다' },
];

const PRINTERS = [
  {
    image: '/images/printer-h2s.png',
    badge: 'Flagship FDM',
    name: 'Bambu Lab H2S',
    desc: '라이다 센서로 첫 레이어를 검사하고 자동 보정하는 플래그십 장비. AMS로 4색 이상 다색 출력을 지원합니다.',
    specs: [
      ['빌드 사이즈', '340 × 320 × 340 mm'],
      ['최대 속도', '500 mm/s'],
      ['소재', 'PLA, PETG, ABS, ASA, TPU, PA-CF, PET-CF'],
      ['특징', '밀폐 챔버, 라이다 첫 레이어 검사, 진동 보정'],
    ],
  },
  {
    image: '/images/printer-p2s.png',
    badge: 'Production FDM',
    name: 'Bambu Lab P2S',
    desc: '강철 CoreXY 프레임으로 장시간 연속 출력에도 적층면이 균일합니다. 활성탄 필터로 출력 중 유해 가스를 걸러냅니다.',
    specs: [
      ['빌드 사이즈', '256 × 256 × 256 mm'],
      ['최대 속도', '500 mm/s'],
      ['소재', 'PLA, PETG, ABS, ASA, TPU, PA, PC'],
      ['특징', '활성탄 필터, 챔버 온도 제어, 원격 카메라'],
    ],
  },
];

const MATERIAL_PHOTOS = [
  ['/images/material-polymaker.jpg', 'Polymaker 정품 원료'],
  ['/images/material-cabinet.jpg', '밀폐 보관 중인 원료'],
  ['/images/material-dyair.jpg', 'DYAIR 필라멘트'],
  ['/images/material-dowell.jpg', 'DOWELL 3D · 고속용 원료'],
];

export const metadata = {
  title: '서비스 소개 | 김명규크리에이티브',
  description: 'SLA, FDM, SLS 3D 프린팅과 후가공, 소재, 보유 장비 안내.',
};

function SectionHead({ kicker, title, description }) {
  return (
    <ScrollReveal className="text-center">
      <p className="text-xs text-muted-foreground">{kicker}</p>
      <h2 className="display mt-3 text-[11vw] md:text-[5.5vw] lg:text-7xl">{title}</h2>
      {description && <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">{description}</p>}
    </ScrollReveal>
  );
}

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        kicker="Services"
        title="출력 방식과 소재"
        description="용도, 정밀도, 예산에 맞춰 출력 방식을 고릅니다. 정하기 어렵다면 파일만 보내주세요."
      />

      <section className="container-site py-20">
        <SectionHead kicker="Printing" title="세 가지 출력 방식" />
        <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-6">
          {printingServices.map((service, idx) => (
            <ScrollReveal key={service.title} delay={idx * 0.08}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                <Image src={service.image} alt={service.title} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
              </div>
              <p className="mt-5 font-mono text-[11px] text-muted-foreground">{String(idx + 1).padStart(2, '0')}</p>
              <h3 className="mt-1 text-xl font-medium">{service.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{service.desc}</p>
              <ul className="mt-4 divide-y border-y text-sm">
                {service.features.map((feature) => (
                  <li key={feature} className="py-2">{feature}</li>
                ))}
              </ul>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="mx-3 rounded-md bg-sheet py-20 md:mx-5">
        <div className="container-site">
          <SectionHead kicker="Materials" title="소재 안내" description="프로젝트 특성에 맞는 소재를 함께 고릅니다." />
          <div className="mt-10 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((mat) => (
              <div key={mat.name} className="flex items-center gap-5 bg-background p-6">
                <span className="size-14 shrink-0 rounded-full shadow-[inset_0_-6px_10px_rgb(0_0_0/0.25)]" style={{ background: mat.color }} />
                <div>
                  <h3 className="display text-3xl">{mat.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{mat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-site py-20">
        <SectionHead
          kicker="Raw material"
          title="출처가 분명한 정품 원료만 씁니다."
          description="Polymaker, eSUN, 덕유항공(DYAIR), DOWELL 3D 등 RoHS·REACH 규격을 통과한 원료를 사용하고, 재생 원료나 출처 불명의 필라멘트는 쓰지 않습니다."
        />
        <div className="mt-10 grid gap-10 lg:grid-cols-12">
          <dl className="divide-y border-y lg:col-span-5">
            {[
              ['물성과 내구성', '공차 정밀도와 적층 결합력이 좋아 기능성 테스트나 실제 브래킷·부품에서도 파손이 적습니다.'],
              ['색상 품질', '층간 얼룩이나 색 왜곡 없이, 다색 출력에서도 경계가 깔끔합니다.'],
              ['보관과 건조', '흡습으로 인한 스트링과 기포를 막기 위해 밀폐 보관하고 출력 전 건조 공정을 거칩니다.'],
            ].map(([t, d]) => (
              <div key={t} className="py-5">
                <dt className="font-medium">{t}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{d}</dd>
              </div>
            ))}
          </dl>
          <div className="grid grid-cols-2 gap-3 lg:col-span-7">
            {MATERIAL_PHOTOS.map(([src, alt]) => (
              <figure key={src}>
                <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  <Image src={src} alt={alt} fill sizes="(max-width: 1024px) 50vw, 25vw" className="object-cover" />
                </div>
                <figcaption className="mt-2 font-mono text-[11px] text-muted-foreground">{alt}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-3 rounded-md bg-sheet py-20 md:mx-5">
        <div className="container-site">
          <SectionHead kicker="Equipment" title="보유 장비" description="Bambu Lab 플래그십 라인으로 품질과 속도를 함께 맞춥니다." />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {PRINTERS.map((p) => (
              <ScrollReveal key={p.name} className="overflow-hidden rounded-lg border bg-background">
                <div className="relative aspect-[16/10] bg-card">
                  <Image src={p.image} alt={p.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain p-6" />
                </div>
                <div className="border-t p-6">
                  <p className="font-mono text-[11px] uppercase text-muted-foreground">{p.badge}</p>
                  <h3 className="mt-1 text-xl font-medium">{p.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
                  <dl className="mt-5 divide-y border-y text-sm">
                    {p.specs.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-3 gap-4 py-2">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="col-span-2 font-mono text-[13px]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="container-site py-20">
        <SectionHead kicker="Process" title="상담부터 납품까지 다섯 단계" />
        <ol className="mt-10 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {processSteps.map((step) => (
            <li key={step.num} className="bg-background p-6">
              <span className="font-mono text-xs text-signal">{String(step.num).padStart(2, '0')}</span>
              <h3 className="mt-6 font-medium">{step.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
            </li>
          ))}
        </ol>
        <div className="mt-20 text-center">
          <Link href="/quote" className="display group inline-flex items-baseline gap-3 text-[12vw] md:text-8xl">
            <span className="underline decoration-1 underline-offset-[0.12em] group-hover:text-signal">견적 요청하기</span>
            <ArrowUpRight className="size-[0.6em] stroke-1 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
          </Link>
        </div>
      </section>
    </>
  );
}
