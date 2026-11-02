import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getQuotes } from '@/lib/db';
import PayButton from './PayButton';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: '결제 | 김명규크리에이티브',
  robots: { index: false, follow: false },
};

function maskName(name = '') {
  return name.length <= 1 ? name : `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name.length > 2 ? name.at(-1) : ''}`;
}

export default async function PayPage({ params }) {
  const { id } = await params;
  const quote = (await getQuotes()).find((q) => q.id === id);
  if (!quote) notFound();

  const orderName = `3D 프린팅 제작 (${quote.method || '맞춤 제작'} · ${quote.quantity}개)`.slice(0, 100);
  const payable = quote.status === '결제대기' && Number.isInteger(quote.amount);

  return (
    <section className="container-site grid gap-12 py-12 md:py-16 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <p className="kicker">Payment</p>
        <h1 className="display mt-3 text-6xl md:text-7xl">견적 결제</h1>
        <dl className="mt-8 divide-y border-y text-sm">
          {[
            ['주문자', maskName(quote.name)],
            ['품목', orderName],
            ['소재', quote.material || '협의'],
            ['견적 번호', <span key="id" className="font-mono text-xs">{quote.id}</span>],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 py-3">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        {Number.isInteger(quote.amount) && (
          <div className="mt-6 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">결제 금액</span>
            <span className="display text-5xl">{quote.amount.toLocaleString()}원</span>
          </div>
        )}
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          금액이나 내용이 다르다면 결제하지 마시고{' '}
          <Link href="/contact" className="underline underline-offset-2">문의</Link>해 주세요.
          <br />
          주문제작 상품으로, 제작 착수 후에는 취소가 제한됩니다.{' '}
          <Link href="/refund" target="_blank" className="underline underline-offset-2">환불정책 보기</Link>
        </p>
      </div>

      <div className="lg:col-span-7">
        {payable ? (
          <PayButton quoteId={quote.id} amount={quote.amount} />
        ) : (
          <div className="rounded-lg border bg-card p-8">
            <p className="font-medium">
              {quote.status === '결제완료' ? '이미 결제가 완료된 견적입니다.' : '아직 결제할 수 있는 상태가 아닙니다.'}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {quote.status === '결제완료'
                ? `결제 일시: ${quote.paidAt ? new Date(quote.paidAt).toLocaleString('ko-KR') : '-'}`
                : '견적이 확정되면 결제 링크를 메일로 보내드립니다.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
