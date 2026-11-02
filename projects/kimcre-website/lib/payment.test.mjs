import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfirm } from './payment.js';

const quote = { id: 'q_1_abc', status: '결제대기', amount: 35000 };

test('정상 요청은 통과', () => {
  assert.deepEqual(validateConfirm(quote, { orderId: 'q_1_abc_1700000000', amount: '35000' }), { ok: true });
});

test('금액 불일치는 거절', () => {
  assert.equal(validateConfirm(quote, { orderId: 'q_1_abc_1', amount: 100 }).ok, false);
});

test('다른 견적의 orderId는 거절', () => {
  assert.equal(validateConfirm(quote, { orderId: 'q_2_xyz_1', amount: 35000 }).ok, false);
  // 접두사만 같은 다른 id도 막는지 (q_1_abc vs q_1_abcd)
  assert.equal(validateConfirm(quote, { orderId: 'q_1_abcd_1', amount: 35000 }).ok, false);
});

test('이미 결제된 견적은 거절', () => {
  assert.equal(validateConfirm({ ...quote, status: '결제완료' }, { orderId: 'q_1_abc_1', amount: 35000 }).ok, false);
});

test('견적 없음은 거절', () => {
  assert.equal(validateConfirm(undefined, { orderId: 'q_1_abc_1', amount: 35000 }).ok, false);
});
