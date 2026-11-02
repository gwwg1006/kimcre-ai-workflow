import { NextResponse } from 'next/server';
import { getQuotes } from '@/lib/db';
import { createTossPayment } from '@/lib/payment';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request) {
  const limitResult = checkRateLimit(`pay-create:${getClientIp(request)}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limitResult.allowed) return rateLimitResponse(limitResult);

  const { quoteId } = await request.json().catch(() => ({}));
  if (typeof quoteId !== 'string') {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const quote = (await getQuotes()).find((q) => q.id === quoteId);
    if (!quote) return NextResponse.json({ error: '해당 견적을 찾을 수 없습니다.' }, { status: 404 });
    if (quote.status !== '결제대기' || !Number.isInteger(quote.amount)) {
      return NextResponse.json({ error: '결제 가능한 상태가 아닙니다.' }, { status: 400 });
    }

    // Amount always comes from the DB, never from the browser.
    const origin = new URL(request.url).origin;
    const result = await createTossPayment({
      orderNo: `${quote.id}_${Date.now()}`,
      amount: quote.amount,
      productDesc: `3D 프린팅 제작 (${quote.method || '맞춤 제작'} ${quote.quantity}개)`.slice(0, 100),
      retUrl: `${origin}/pay/${quote.id}/success`,
      retCancelUrl: `${origin}/pay/${quote.id}/fail`,
    });
    if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: 400 });

    return NextResponse.json({ checkoutPage: result.data.checkoutPage });
  } catch (error) {
    console.error('Failed to create Toss Pay payment:', error);
    return NextResponse.json({ error: '결제를 시작하지 못했습니다.' }, { status: 500 });
  }
}
