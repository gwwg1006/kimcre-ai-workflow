// 토스페이(간편결제 단독) API. 기본값은 토스페이 개발 문서의 공개 테스트 키 — 운영은 Vercel env TOSS_PAY_API_KEY.
const TOSS_PAY_API_KEY = process.env.TOSS_PAY_API_KEY || 'sk_test_w5lNQylNqa5lNQe013Nq';
const TOSS_PAY_API = 'https://pay.toss.im/api/v2';

/**
 * 결제 승인 요청이 해당 견적과 일치하는지 검증
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateConfirm(quote, { orderId, amount }) {
  if (!quote) return { ok: false, error: '해당 견적을 찾을 수 없습니다.' };
  if (quote.status !== '결제대기') return { ok: false, error: '결제 가능한 상태가 아닙니다.' };
  if (typeof orderId !== 'string' || !orderId.startsWith(`${quote.id}_`)) {
    return { ok: false, error: '주문 정보가 견적과 일치하지 않습니다.' };
  }
  if (!Number.isInteger(quote.amount) || Number(amount) !== quote.amount) {
    return { ok: false, error: '결제 금액이 견적 금액과 일치하지 않습니다.' };
  }
  return { ok: true };
}

async function tossPay(path, body) {
  const res = await fetch(`${TOSS_PAY_API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: TOSS_PAY_API_KEY, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.code !== 0) {
    return { ok: false, code: data.errorCode || 'UNKNOWN_ERROR', message: data.msg || '토스페이 요청에 실패했습니다.' };
  }
  return { ok: true, data };
}

/**
 * 토스페이 결제 생성 — 구매자를 보낼 checkoutPage를 돌려준다.
 * autoExecute=false: 구매자 인증 후 서버가 금액을 다시 확인하고 직접 승인한다.
 */
export function createTossPayment({ orderNo, amount, productDesc, retUrl, retCancelUrl }) {
  return tossPay('payments', { orderNo, amount, amountTaxFree: 0, productDesc, retUrl, retCancelUrl, autoExecute: false });
}

/** 주문번호로 결제 상태 조회 (payStatus, amount, payToken 등) */
export function getTossPaymentStatus(orderNo) {
  return tossPay('status', { orderNo });
}

/** 구매자 인증(PAY_APPROVED)이 끝난 결제를 최종 승인 */
export function executeTossPayment({ payToken, orderNo }) {
  return tossPay('execute', { payToken, orderNo });
}
