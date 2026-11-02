import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import QuoteForm from '@/components/QuoteForm';

export const metadata = {
  title: '견적 요청 | 김명규크리에이티브',
  description: '3D 프린팅 견적을 요청해보세요. 빠르고 정확한 견적을 보내드립니다.',
};

const STEPS = [
  ['요청 접수', '양식과 파일을 보내주세요.'],
  ['검토·연락', '영업일 기준 24시간 안에 연락드립니다.'],
  ['견적 확정', '상담 후 최종 금액을 안내합니다.'],
  ['결제·제작', '메일로 받은 링크에서 토스페이로 결제하면 제작을 시작합니다.'],
];

export default function QuotePage() {
  return (
    <>
      <PageHeader
        kicker="Quote"
        title="견적 요청"
        description="만들고 싶은 것을 알려주세요. 파일이 없어도 설명과 사진만으로 시작할 수 있습니다."
      />
      <section className="container-site grid gap-12 py-12 md:py-16 lg:grid-cols-12">
        <div className="sheet py-10 pr-6 pl-14 md:py-12 md:pr-12 md:pl-20 lg:col-span-8 [&_[data-slot=select-trigger]]:bg-background [&_input]:bg-background [&_textarea]:bg-background">
          <QuoteForm />
        </div>
        <aside className="lg:col-span-4">
          <div className="sticky top-24 space-y-8">
            <div className="rounded-[28px] bg-butter p-6 shadow-[0_20px_40px_-24px_rgb(0_0_0/0.45)] lg:rotate-1">
              <p className="display text-3xl">진행 순서</p>
              <ol className="mt-4 border-t border-ink/20">
                {STEPS.map(([title, desc], i) => (
                  <li key={title} className="flex gap-4 border-b border-ink/20 py-4">
                    <span className="font-mono text-xs text-ink/60">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-0.5 text-sm text-ink/70">{desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="text-sm">
              <p className="kicker">Contact</p>
              <a href="mailto:kimcre3d@gmail.com" className="mt-3 block underline-offset-4 hover:underline">kimcre3d@gmail.com</a>
              <p className="mt-1 text-muted-foreground">이메일 문의도 24시간 안에 답변드립니다.</p>
              <Link href="/refund" className="mt-3 inline-block text-muted-foreground underline underline-offset-2">환불정책</Link>
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}
