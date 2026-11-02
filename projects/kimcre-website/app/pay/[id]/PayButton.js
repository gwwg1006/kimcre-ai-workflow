'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PayButton({ quoteId, amount }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/pay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.checkoutPage) throw new Error(data.error || '결제를 시작하지 못했습니다.');
      window.location.href = data.checkoutPage;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6 md:p-8">
      <p className="font-medium">토스페이로 결제</p>
      <p className="mt-1 text-sm text-muted-foreground">
        버튼을 누르면 토스페이 결제 화면으로 이동합니다. 토스 앱에서 인증하면 결제가 끝나고 이 사이트로 돌아옵니다.
      </p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <Button size="lg" className="mt-6 w-full bg-[#0064ff] text-white hover:bg-[#0064ff]/90" onClick={handlePay} disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        토스페이로 {amount.toLocaleString()}원 결제하기
      </Button>
    </div>
  );
}
