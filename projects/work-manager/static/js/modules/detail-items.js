(function registerDetailItems(window) {
    const documentBindings = new WeakMap();
    const materials = ['PLA', 'PETG', 'ABS', 'TPU', 'PC', 'PLA-CF', 'PETG-CF', 'PA-CF'];
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c])); }
    function init(options = {}) {
        const doc = options.documentRef || document;
        const getProject = options.getProject || (() => options.state?.currentProject || window.state?.currentProject);
        const setProject = options.setProject || (project => { if (options.state) options.state.currentProject = project; else if (window.state) window.state.currentProject = project; });
        const api = options.api || window.API;
        const toast = options.showToast || window.showToast || (() => {});
        const pricing = options.pricing || window.Pricing;
        const pendingProjects = new Set();
        function tbody() { return doc.getElementById('detail-items-tbody'); }
        function rows() { return Array.from(tbody()?.querySelectorAll('.detail-item-row') || []); }
        function values() { return rows().map(row => ({
            name: row.querySelector('.d-item-name')?.value.trim() || '',
            material: row.querySelector('.d-item-material')?.value || 'PLA',
            color: row.querySelector('.d-item-color')?.value.trim() || '',
            quantity: pricing.parseInteger(row.querySelector('.d-item-qty')?.value, { min: 1 }),
            unit_price: pricing.parseInteger(row.querySelector('.d-item-price')?.value, { min: 0 })
        })).filter(item => item.name); }
        function calculate() {
            const items = rows().map(row => ({ quantity: row.querySelector('.d-item-qty')?.value, unitPrice: row.querySelector('.d-item-price')?.value }));
            const totals = pricing.calculateItems(items);
            const project = getProject() || {};
            const shipping = pricing.parseInteger(doc.getElementById('detail-shipping-fee-input')?.value ?? project.shipping_fee, { min: 0 });
            const taxType = doc.getElementById('detail-tax-type-select')?.value || project.tax_type || '면세';
            const amount = pricing.calculateAmounts({ quoteAmount: totals.subtotal, shippingFee: shipping, modelFee: project.model_fee, postProcessFee: project.post_process_fee, taxType, paidAmount: project.paid_amount });
            const set = (id, text) => { const el = doc.getElementById(id); if (el) el.textContent = text; };
            set('detail-items-count', rows().length);
            set('detail-items-total-qty', `${totals.quantity}개`);
            set('detail-items-total-price', `${totals.subtotal.toLocaleString()}원`);
            set('d-quote-amount', `${totals.subtotal.toLocaleString()}원`);
            set('d-total-amount', `${amount.total.toLocaleString()}원 (${taxType})`);
            set('d-paid-amount', `${amount.paid.toLocaleString()}원`);
            set('d-unpaid-amount', `${amount.unpaid.toLocaleString()}원`);
            return { items: values(), totals, amount, shipping, taxType };
        }
        function add(name = '', material = 'PLA', color = 'White', quantity = 1, unitPrice = 0, note = '') {
            const body = tbody(); if (!body) return;
            const row = doc.createElement('tr'); row.className = 'detail-item-row';
            const selected = materials.includes(material) ? material : 'PLA';
            row.innerHTML = `<td><input class="form-control d-item-name" value="${esc(name)}" placeholder="품명/파일명"></td><td><select class="form-control d-item-material">${materials.map(item => `<option value="${item}" ${item === selected ? 'selected' : ''}>${item}</option>`).join('')}</select></td><td><input class="form-control d-item-color" value="${esc(color)}"></td><td><input type="number" class="form-control d-item-qty" min="1" value="${Math.max(1, pricing.toInteger(quantity))}"></td><td><input type="number" class="form-control d-item-price" value="${pricing.toInteger(unitPrice)}"></td><td><button type="button" class="btn btn-ghost btn-xs text-danger detail-item-remove" title="삭제"><i class="fa-solid fa-trash-can"></i></button></td>`;
            body.appendChild(row); calculate();
        }
        async function save(silent = false) {
            const project = getProject(); if (!project) return null;
            const projectNo = String(project.project_no || '');
            if (!projectNo || pendingProjects.has(projectNo)) return null;
            const payload = calculate(); if (!payload.items.length || !payload.totals.valid || !payload.amount.valid || payload.items.some(item => item.quantity === null || item.unit_price === null) || payload.shipping === null) { if (!silent) toast('수량·단가·배송비를 올바른 정수로 입력해 주세요.', 'warning'); return null; }
            pendingProjects.add(projectNo);
            try {
                const res = await api.updateProject(projectNo, {
                    items: payload.items, shipping_fee: payload.shipping, tax_type: payload.taxType,
                    expected_version: project.version,
                });
                const current = getProject();
                if (res?.success && res.data) {
                    // A response for project A must never replace the detail state for project B.
                    if (String(current?.project_no || '') === projectNo) {
                        setProject(res.data); options.refresh?.(res.data);
                    }
                    if (!silent) toast('품목을 저장했습니다.', 'success');
                    return res;
                }
                if (!silent && String(current?.project_no || '') === projectNo) toast(res?.error || '품목 저장에 실패했습니다.', 'error');
                return res;
            }
            catch (error) { if (!silent) toast('품목 저장 중 오류가 발생했습니다.', 'error'); return null; }
            finally { pendingProjects.delete(projectNo); }
        }
        const instance = { add, render, calculate, save, values, isSaving: () => pendingProjects.has(String(getProject()?.project_no || '')) };
        function render(items) { const body = tbody(); if (!body) return; body.innerHTML = ''; const list = items?.length ? items : [{ name: getProject()?.job_name || '', material: getProject()?.material || 'PLA', color: getProject()?.color || 'White', quantity: getProject()?.quantity || 1, unit_price: getProject()?.quote_amount || 0 }]; list.forEach(item => add(item.name, item.material, item.color, item.quantity, item.unit_price, item.note)); calculate(); }
        const existingBinding = documentBindings.get(doc);
        if (existingBinding) existingBinding.manager = instance;
        else {
            const dispatch = () => documentBindings.get(doc)?.manager;
            doc.addEventListener('click', event => {
                const current = dispatch(); if (!current) return;
                const target = event.target;
                const button = target?.closest?.('.detail-item-remove');
                if (button && doc.getElementById('detail-items-tbody')?.contains?.(button)) {
                    const body = doc.getElementById('detail-items-tbody');
                    if (body.querySelectorAll('.detail-item-row').length <= 1) return toast('최소 1개 이상의 품목이 있어야 합니다.', 'warning');
                    button.closest('.detail-item-row')?.remove(); current.calculate(); return;
                }
                const action = target?.closest?.('[data-detail-items-action]')?.dataset.detailItemsAction;
                if (action === 'add') current.add(); else if (action === 'save') current.save(false);
            });
            const recalc = event => {
                const current = dispatch(); if (!current) return;
                const target = event.target;
                if (target?.matches?.('.d-item-name, .d-item-material, .d-item-color, .d-item-qty, .d-item-price') || target?.dataset.detailItemsAction === 'shipping' || target?.dataset.detailItemsAction === 'tax') current.calculate();
                if (event.type === 'change' && target?.dataset.detailItemsAction === 'tax') window.handleQuickTaxTypeUpdate?.(target.value);
                else if (event.type === 'change' && target?.dataset.detailItemsAction === 'shipping') window.handleQuickShippingFeeUpdate?.(target.value);
            };
            doc.addEventListener('input', recalc); doc.addEventListener('change', recalc);
            documentBindings.set(doc, { manager: instance });
        }
        manager = instance;
        return instance;
    }
    let manager;
    function getManager() { return manager || (manager = init()); }
    window.DetailItemsManager = { init, get: getManager };
    window.renderDetailItems = items => getManager().render(items);
    window.addDetailItemRow = (...args) => getManager().add(...args);
    window.calculateDetailItemTotals = () => getManager().calculate();
    window.saveDetailItems = silent => getManager().save(silent);
    window.removeDetailItemRow = button => button?.closest('.detail-item-row')?.querySelector('.detail-item-remove')?.click();
})(window);
