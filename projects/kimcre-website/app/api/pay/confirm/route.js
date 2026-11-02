import { NextResponse } from 'next/server';
import { getQuotes, updateQuote } from '@/lib/db';
import { validateConfirm, getTossPaymentStatus, executeTossPayment } from '@/lib/payment';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

// Called from the retUrl page after the buyer authenticates in Toss Pay.
// The amount is re-read from Toss and checked against the DB before we execute.
export async function POST(request) {
  const limitResult = checkRateLimit(`pay-confirm:${getClientIp(request)}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!limitResult.allowed) return rateLimitResponse(limitResult);

  const { quoteId, orderNo } = await request.json().catch(() => ({}));
  if (typeof quoteId !== 'string' || typeof orderNo !== 'string' || !orderNo) {
    return NextResponse.json({ error: '결제 정보가 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const quote = (await getQuotes()).find((q) => q.id === quoteId);
    const status = await getTossPaymentStatus(orderNo);
    if (!status.ok) {
      return NextResponse.json({ error: status.message, code: status.code }, { status: 400 });
    }
    const { payStatus, payToken, amount } = status.data;

    const check = validateConfirm(quote, { orderId: orderNo, amount });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: quote ? 400 : 404 });
    }
    if (payStatus !== 'PAY_APPROVED') {
      return NextResponse.json({ error: '구매자 인증이 완료되지 않은 결제입니다.' }, { status: 400 });
    }

    const result = await executeTossPayment({ payToken, orderNo });
    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code }, { status: 400 });
    }

    // approvalTime is KST "YYYY-MM-DD HH:mm:ss"; fall back to now if Toss ever changes the format.
    const approved = new Date(`${String(result.data.approvalTime || '').replace(' ', 'T')}+09:00`);
    const paidAt = (Number.isNaN(approved.getTime()) ? new Date() : approved).toISOString();
    try {
      await updateQuote(quote.id, { status: '결제완료', paymentKey: payToken, paidAt });
    } catch (dbError) {
      // 토스 승인은 끝났으므로 결제 자체는 성공 — 관리자가 수동 반영할 수 있게 토큰을 남긴다
      console.error(`PAYMENT RECORD FAILED quote=${quote.id} payToken=${payToken}:`, dbError);
    }

    return NextResponse.json({ ok: true, quote: { id: quote.id, amount: quote.amount, paidAt } });
  } catch (error) {
    console.error('Failed to confirm payment:', error);
    return NextResponse.json({ error: '결제 승인 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
