'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ConfirmPayment({ quoteId, orderNo }) {
  const sent = useRef(false);
  const [state, setState] = useState({ status: 'pending' });

  useEffect(() => {
    // Strict Mode runs effects twice in dev; the confirm call must only go out once.
    if (sent.current) return;
    sent.current = true;
    fetch('/api/pay/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, orderNo }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '결제 승인에 실패했습니다.');
        setState({ status: 'done', quote: data.quote });
      })
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [quoteId, orderNo]);

  if (state.status === 'pending') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 결제를 승인하는 중입니다. 창을 닫지 마세요.
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="w-full max-w-md">
        <p className="kicker">Payment</p>
        <h1 className="display mt-3 text-5xl">결제를 완료하지 못했습니다</h1>
        <p className="mt-3 text-destructive">{state.message}</p>
        <p className="mt-2 text-sm text-muted-foreground">승인되지 않은 결제는 청구되지 않습니다.</p>
        <div className="mt-8 flex gap-2">
          <Button asChild><Link href={`/pay/${quoteId}`}>다시 시도</Link></Button>
          <Button asChild variant="outline"><Link href="/contact">문의하기</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
        <Check className="size-5" />
      </div>
      <h1 className="display mt-5 text-5xl">결제가 완료되었습니다</h1>
      <p className="mt-2 text-muted-foreground">확인 후 바로 제작을 시작하고, 진행 상황을 연락드리겠습니다.</p>
      <dl className="mt-8 divide-y border-y text-sm">
        <div className="flex justify-between py-3">
          <dt className="text-muted-foreground">결제 금액</dt>
          <dd className="font-mono">{state.quote.amount.toLocaleString()}원</dd>
        </div>
        <div className="flex justify-between py-3">
          <dt className="text-muted-foreground">결제 일시</dt>
          <dd className="font-mono text-xs">{new Date(state.quote.paidAt).toLocaleString('ko-KR')}</dd>
        </div>
      </dl>
      <Button asChild variant="outline" className="mt-8"><Link href="/">홈으로</Link></Button>
    </div>
  );
}
