import { NextResponse } from 'next/server';
import { getQuotes, updateQuote } from '@/lib/db';
import { verifyAdminToken } from '@/lib/auth';
import { sendPaymentRequest } from '@/lib/email';

// Helper to check authentication
function checkAuth(request) {
  const token = request.cookies.get('admin_session')?.value;
  return verifyAdminToken(token);
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const quotes = await getQuotes();
    // Sort by createdAt descending
    const sortedQuotes = [...quotes].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return NextResponse.json(sortedQuotes);
  } catch (error) {
    console.error('Failed to get quotes:', error);
    return NextResponse.json(
      { error: '데이터를 가져오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status, adminNotes, amount, requestPayment } = body;

    if (!id) {
      return NextResponse.json({ error: '아이디가 필요합니다.' }, { status: 400 });
    }

    if (amount !== undefined && !(Number.isInteger(amount) && amount >= 100 && amount <= 10_000_000)) {
      return NextResponse.json({ error: '금액은 100원 이상 10,000,000원 이하의 정수여야 합니다.' }, { status: 400 });
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (amount !== undefined) updates.amount = amount;

    if (requestPayment === true) {
      const current = (await getQuotes()).find((q) => q.id === id);
      if (!current) {
        return NextResponse.json({ error: '해당 견적을 찾을 수 없습니다.' }, { status: 404 });
      }
      if (current.status === '결제완료') {
        return NextResponse.json({ error: '이미 결제가 완료된 견적입니다.' }, { status: 409 });
      }
      if (!Number.isInteger(amount ?? current.amount)) {
        return NextResponse.json({ error: '결제 요청에는 금액이 필요합니다.' }, { status: 400 });
      }
      updates.status = '결제대기';
    }

    const updated = await updateQuote(id, updates);
    if (!updated) {
      return NextResponse.json({ error: '해당 견적을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (requestPayment === true) {
      try {
        await sendPaymentRequest(updated);
      } catch (mailError) {
        console.error('Failed to send payment request email:', mailError);
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update quote:', error);
    return NextResponse.json(
      { error: '업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
