import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: '결제 실패 | 김명규크리에이티브',
  robots: { index: false, follow: false },
};

// Toss Pay sends the buyer here (retCancelUrl) when they back out; Toss cancels the payment itself.
export default async function PayFailPage({ params }) {
  const { id } = await params;

  return (
    <section className="container-site flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-md">
        <p className="kicker">Payment</p>
        <h1 className="display mt-3 text-5xl">
          결제가 취소되었습니다
        </h1>
        <p className="mt-3 text-muted-foreground">결제되지 않았습니다. 다시 시도하시거나 문의해 주세요.</p>
        <div className="mt-8 flex gap-2">
          <Button asChild><Link href={`/pay/${encodeURIComponent(id)}`}>다시 결제하기</Link></Button>
          <Button asChild variant="outline"><Link href="/contact">문의하기</Link></Button>
        </div>
      </div>
    </section>
  );
}
