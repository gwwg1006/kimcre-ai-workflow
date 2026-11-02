const assert = require('node:assert/strict');
const Pricing = require('../static/js/modules/pricing.js');

assert.equal(Pricing.parseInteger('12abc'), null);
assert.equal(Pricing.parseInteger('12'), 12);
assert.equal(Pricing.parseInteger('12.0'), null);
assert.equal(Pricing.parseInteger(12.0), 12);
assert.equal(Pricing.parseInteger(true), null);
assert.equal(Pricing.parseInteger(Number.POSITIVE_INFINITY), null);
assert.equal(Pricing.parseInteger(Number.MAX_SAFE_INTEGER + 1), null);
assert.equal(Pricing.parseInteger(0), 0);
assert.equal(Pricing.toInteger('12abc'), 0);
assert.equal(Pricing.toInteger(-10), 0);
assert.equal(Pricing.toInteger(Number.NaN), 0);

const items = Pricing.calculateItems([
    { quantity: 2, unitPrice: 1250 },
    { quantity: 3, unit_price: 999 },
    { quantity: -1, price: 500 }
]);
assert.deepEqual(items, {
    lines: [
        { quantity: 2, unitPrice: 1250, total: 2500 },
        { quantity: 3, unitPrice: 999, total: 2997 },
        { quantity: 0, unitPrice: 500, total: 0 }
    ],
    count: 3,
    quantity: 5,
    subtotal: 5497,
    valid: true,
    error: null
});

assert.deepEqual(Pricing.calculateAmounts({
    quoteAmount: 5497,
    shippingFee: 0,
    taxType: '면세'
}), {
    quote: 5497, shipping: 0, model: 0, postProcess: 0,
    subtotal: 5497, vat: 0, total: 5497, paid: 0, unpaid: 5497, valid: true, error: null
});

assert.deepEqual(Pricing.calculateAmounts({
    quoteAmount: 1001,
    shippingFee: 1,
    modelFee: 7,
    postProcessFee: 1,
    taxType: '과세',
    paidAmount: 500
}), {
    quote: 1001, shipping: 1, model: 7, postProcess: 1,
    subtotal: 1010, vat: 101, total: 1111, paid: 500, unpaid: 611, valid: true, error: null
});

// Backend parity: int(subtotal * 0.1), i.e. truncate rather than round.
const truncation = Pricing.calculateAmounts({ quoteAmount: 1005, taxType: '과세' });
assert.equal(truncation.vat, 100);
assert.equal(truncation.total, 1105);

const overflow = Pricing.calculateAmounts({ quoteAmount: Number.MAX_SAFE_INTEGER, shippingFee: 1 });
assert.equal(overflow.valid, false);
assert.equal(overflow.error, 'amount_overflow');
const lineOverflow = Pricing.calculateItems([{ quantity: Number.MAX_SAFE_INTEGER, unitPrice: 2 }]);
assert.equal(lineOverflow.valid, false);
assert.equal(lineOverflow.error, 'amount_overflow');

const fullyPaid = Pricing.calculateAmounts({ quoteAmount: 1000, taxType: '면세', paidAmount: 2000 });
assert.equal(fullyPaid.unpaid, 0);

console.log('pricing_contract.test.js: ok');
