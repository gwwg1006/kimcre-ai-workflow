/**
 * 화면별 금액 계산 adapter가 공유하는 순수 계산 모듈.
 * DOM, state, API에 의존하지 않는다.
 */
(function (root, factory) {
    const pricing = factory();
    if (typeof root !== 'undefined') root.Pricing = pricing;
    if (typeof module !== 'undefined' && module.exports) module.exports = pricing;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function parseInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
        if (typeof value === 'boolean' || value === null || value === undefined) return null;
        if (typeof value === 'number') {
            if (!Number.isSafeInteger(value)) return null;
            return value >= min && value <= max ? value : null;
        }
        const text = String(value).trim();
        if (!/^\d+$/.test(text)) return null;
        const number = Number(text);
        return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
    }

    function toInteger(value) {
        const number = parseInteger(value, { min: 0 });
        return number === null ? 0 : number;
    }

    function calculateItems(items = []) {
        let valid = true;
        let error = null;
        const lines = items.map((item) => {
            const quantity = toInteger(item.quantity ?? item.qty);
            const unitPrice = toInteger(item.unitPrice ?? item.unit_price ?? item.price);
            const total = quantity * unitPrice;
            if (!Number.isSafeInteger(total)) { valid = false; error = 'amount_overflow'; }
            return { quantity, unitPrice, total };
        });
        const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
        if (!Number.isSafeInteger(subtotal)) { valid = false; error = 'amount_overflow'; }
        return {
            lines,
            count: lines.length,
            quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
            subtotal,
            valid,
            error
        };
    }

    function calculateAmounts({
        quoteAmount = 0,
        shippingFee = 0,
        modelFee = 0,
        postProcessFee = 0,
        taxType = '면세',
        paidAmount = 0
    } = {}) {
        const quote = toInteger(quoteAmount);
        const shipping = toInteger(shippingFee);
        const model = toInteger(modelFee);
        const postProcess = toInteger(postProcessFee);
        const subtotal = quote + shipping + model + postProcess;
        const vat = taxType === '과세' ? Math.trunc(subtotal * 0.1) : 0;
        const total = subtotal + vat;
        const paid = toInteger(paidAmount);
        const valid = [subtotal, vat, total, paid].every(Number.isSafeInteger);
        return {
            quote,
            shipping,
            model,
            postProcess,
            subtotal,
            vat,
            total,
            paid,
            unpaid: Math.max(0, total - paid),
            valid,
            error: valid ? null : 'amount_overflow'
        };
    }

    return { parseInteger, toInteger, calculateItems, calculateAmounts };
});
