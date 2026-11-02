(function registerNewProject(window) {
    const documentBindings = new WeakMap();
    function create(options = {}) {
        const state = options.state || {};
        const doc = options.documentRef || document;
        const api = options.api || window.API;
        const toast = options.showToast || window.showToast || (() => {});
        const escape = options.escapeHtml || (value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c])));
        const pricing = options.pricing || window.Pricing;
        const partnerAdapter = options.partnerAdapter || {};
        const aiAdapter = options.aiAdapter || {};
        const confirmFn = options.confirmFn || (() => false);
        let submitting = false;
        let selectedFiles = [];
        let selectedPartner = null;
        let generation = 0;
        function el(id) { return doc.getElementById(id); }
        function rows() { return Array.from(el('new-project-items-tbody')?.querySelectorAll('tr') || []); }
        function parse(value, minimum) { return pricing.parseInteger(value, { min: minimum }); }
        function strictNumber(value, minimum) { return pricing.parseInteger(value, { min: minimum }); }
        function validateNumbers() { for (const row of rows()) { if (strictNumber(row.querySelector('.new-item-qty')?.value, 1) === null || strictNumber(row.querySelector('.new-item-price')?.value, 0) === null) return false; } return strictNumber(el('new-shipping-fee')?.value || '0', 0) !== null; }
        function calculate() {
            const data = rows().map(row => ({ quantity: row.querySelector('.new-item-qty')?.value, unitPrice: row.querySelector('.new-item-price')?.value }));
            const items = pricing.calculateItems(data); const shipping = parse(el('new-shipping-fee')?.value, 0); const taxType = el('new-tax-type')?.value || '면세';
            const amounts = shipping === null ? { total: 0, subtotal: 0, vat: 0, valid: false, error: 'invalid_shipping' } : pricing.calculateAmounts({ quoteAmount: items.subtotal, shippingFee: shipping, taxType });
            const valid = items.valid === true && amounts.valid === true && shipping !== null;
            const set = (id, value) => { if (el(id)) el(id).textContent = value; };
            const displayItems = valid ? items : { ...items, quantity: 0, subtotal: 0 };
            const displayAmounts = valid ? amounts : { ...amounts, total: 0, subtotal: 0, vat: 0 };
            if (el('new-quantity')) el('new-quantity').value = rows().length > 1 ? `${displayItems.quantity}개 (${rows().length}종)` : String(displayItems.quantity || 0);
            if (el('new-quote-amount')) el('new-quote-amount').value = displayItems.subtotal;
            set('new-items-count', rows().length); set('new-items-total-qty', `${displayItems.quantity}개`); set('new-items-total-price', `${displayItems.subtotal.toLocaleString()}원`); set('new-items-shipping-display', `${(shipping ?? 0).toLocaleString()}원`); set('new-items-grand-total', `${displayAmounts.total.toLocaleString()}원`); set('new-items-tax-info', valid ? (taxType === '과세' ? `(공급가 ${displayAmounts.subtotal.toLocaleString()}원 + VAT ${displayAmounts.vat.toLocaleString()}원 = 총 ${displayAmounts.total.toLocaleString()}원)` : '(면세)') : '금액 입력 오류: 안전한 정수 범위를 확인해 주세요.');
            return { items, amounts, shipping, taxType, valid };
        }
        function add(name = '', material = '', color = '', qty = 1, price = 0, note = '', stl = '') {
            const body = el('new-project-items-tbody'); if (!body) return;
            const quantity = strictNumber(qty, 1); const unitPrice = strictNumber(price, 0); if (quantity === null || unitPrice === null) return false;
            const row = doc.createElement('tr'); row.dataset.stl = stl || (name ? `${name}.stl` : '');
            row.innerHTML = `<td><input class="new-item-name" value="${escape(name)}" placeholder="품명 또는 파일명" required></td><td><input class="new-item-material" value="${escape(material || el('new-material')?.value || 'PLA')}"></td><td><input class="new-item-color" value="${escape(color || el('new-color')?.value || 'White')}"></td><td><input type="number" class="new-item-qty" min="1" value="${quantity}"></td><td><input type="number" class="new-item-price" min="0" value="${unitPrice}"></td><td><input class="new-item-note" value="${escape(note)}"></td><td><button type="button" class="new-item-remove" title="품목 삭제"><i class="fa-solid fa-xmark"></i></button></td>`;
            body.appendChild(row); calculate(); return true;
        }
        function renderFiles() { const list = el('new-project-file-list'); if (!list) return; list.innerHTML = selectedFiles.map((file, index) => `<div class="attached-file-card"><span class="file-card-name">${escape(file.name)}</span><button type="button" class="file-card-remove" data-new-file-action="remove" data-file-index="${index}" title="파일 제외"><i class="fa-solid fa-xmark"></i></button></div>`).join(''); const badge = el('ai-attached-count'); if (badge) { badge.textContent = `${selectedFiles.length}개 첨부됨`; badge.style.display = selectedFiles.length ? 'inline-block' : 'none'; } }
        function addFiles(files) { for (const file of Array.from(files || [])) if (!selectedFiles.some(item => item.name === file.name && item.size === file.size)) selectedFiles.push(file); state.selectedNewFiles = selectedFiles; state.aiAttachedFiles = [...selectedFiles]; renderFiles(); }
        function removeFile(index) { selectedFiles.splice(index, 1); state.selectedNewFiles = selectedFiles; state.aiAttachedFiles = [...selectedFiles]; renderFiles(); }
        function addItemsFromFiles() { const names = new Set(rows().map(row => row.querySelector('.new-item-name')?.value.trim())); selectedFiles.forEach(file => { if (!names.has(file.name)) { add(file.name); names.add(file.name); } }); }
        function collectItems() { return rows().map(row => { const quantity = strictNumber(row.querySelector('.new-item-qty')?.value, 1); const unitPrice = strictNumber(row.querySelector('.new-item-price')?.value, 0); if (quantity === null || unitPrice === null) throw new Error('invalid_item_number'); return { name: row.querySelector('.new-item-name')?.value.trim(), material: row.querySelector('.new-item-material')?.value.trim() || '', color: row.querySelector('.new-item-color')?.value.trim() || '', quantity, unit_price: unitPrice, note: row.querySelector('.new-item-note')?.value.trim() || '', original_stl: row.dataset.stl || '' }; }).filter(item => item.name); }
        function syncSelectedPartner() { if (selectedPartner || !el('new-partner-id')?.value) return; selectedPartner = (state.partners || []).find(partner => String(partner.id) === String(el('new-partner-id').value)) || null; }
        function partnerChanged() { syncSelectedPartner(); if (!selectedPartner) return; const values = { name: el('new-client-name')?.value || '', contact_name: el('new-contact-name')?.value || '', phone: el('new-phone')?.value || '', address: el('new-address')?.value || '' }; const differs = values.name !== (selectedPartner.name || selectedPartner.client_name || '') || values.contact_name !== (selectedPartner.contact_name || '') || values.phone !== (selectedPartner.phone || '') || values.address !== (selectedPartner.address || ''); const hint = el('new-partner-hint'); if (differs && hint) hint.textContent = '거래처 연결 유지 · 프로젝트 정보만 변경됨'; }
        function applyAiFields(data, expectedGeneration) { if (expectedGeneration !== undefined && expectedGeneration !== generation) return false; syncSelectedPartner(); const fields = { client_name:'new-client-name', contact_name:'new-contact-name', job_name:'new-job-name', received_date:'new-received-date', channel:'new-channel', material:'new-material', color:'new-color', quantity:'new-quantity', due_date:'new-due-date', quote_amount:'new-quote-amount', shipping_fee:'new-shipping-fee', phone:'new-phone', zipcode:'new-zipcode', address:'new-address', detail_address:'new-detail-address', tax_type:'new-tax-type', request_notes:'new-request-notes' }; Object.entries(fields).forEach(([key, id]) => { const input = el(id); if (!input || data[key] === undefined || data[key] === null || data[key] === '' || input.value) return; input.value = data[key]; }); partnerChanged(); if (aiAdapter.applyAiFields) aiAdapter.applyAiFields(data); return true; }
        function clearPartner() { selectedPartner = null; if (el('new-partner-id')) el('new-partner-id').value = ''; const hint = el('new-partner-hint'); if (hint) hint.textContent = '거래처 연결 해제됨—재선택 필요'; }
        function selectPartner(partner) { selectedPartner = partner || null; if (partnerAdapter.select) partnerAdapter.select(selectedPartner); const set = (id, value) => { const field = el(id); if (field) field.value = value ?? ''; }; if (!selectedPartner) { set('new-partner-id', ''); const hint = el('new-partner-hint'); if (hint) hint.textContent = '새 거래처로 등록하거나 기존 고객명을 직접 입력할 수 있습니다.'; return; } const phone = selectedPartner.phone || selectedPartner.phone_number || selectedPartner.contact_phone || ''; set('new-partner-id', selectedPartner.id); set('new-client-name', selectedPartner.name || selectedPartner.client_name); set('new-contact-name', selectedPartner.contact_name); set('new-phone', phone); set('new-zipcode', selectedPartner.zipcode); set('new-address', selectedPartner.address); set('new-detail-address', selectedPartner.detail_address); const hint = el('new-partner-hint'); if (hint) hint.textContent = `${selectedPartner.name} 정보를 불러왔습니다.`; }
        async function submit(event) { event?.preventDefault?.(); if (submitting) return null; if (!validateNumbers()) { toast('수량·단가·배송비를 올바른 정수로 입력해 주세요.', 'warning'); return null; } const payload = calculate(); if (!payload.valid) { toast('금액이 안전한 정수 범위를 벗어났습니다. 입력값을 줄여 주세요.', 'warning'); return null; } const form = el('form-new-project'); if (!form) return null; if (partnerAdapter.refresh) { let refreshed; try { refreshed = await partnerAdapter.refresh(); } catch (_) { toast('거래처 목록을 새로 확인하지 못했습니다. 다시 시도해 주세요.', 'error'); return null; } if (!refreshed || refreshed.success === false) { toast('거래처 목록을 새로 확인하지 못했습니다. 다시 시도해 주세요.', 'error'); return null; } } const typedName = el('new-client-name')?.value.trim() || ''; let partnerId = el('new-partner-id')?.value.trim() || ''; const duplicate = !partnerId && typedName ? (state.partners || []).find(partner => String(partner.name || '').trim().toLocaleLowerCase() === typedName.toLocaleLowerCase()) : null; if (duplicate && confirmFn(`'${duplicate.name}' 거래처가 이미 있습니다. 기존 거래처 정보를 연결할까요?`)) { const ids = ['new-contact-name', 'new-phone', 'new-zipcode', 'new-address', 'new-detail-address']; const typed = Object.fromEntries(ids.map(id => [id, el(id)?.value || ''])); selectPartner(duplicate); ids.forEach(id => { if (typed[id]) { const field = el(id); if (field) field.value = typed[id]; } }); partnerChanged(); partnerId = String(duplicate.id); } submitting = true; try { const data = new FormData(form); data.set('items', JSON.stringify(collectItems())); data.delete('files'); selectedFiles.forEach(file => data.append('files', file)); if (partnerId) data.set('partner_id', partnerId); else if (duplicate) data.set('allow_duplicate_partner', '1'); const result = await api.createProject(data); if (!result?.success) { toast(result?.error || '신규 작업 등록 실패', 'error'); return result; } toast(result.message, 'success'); reset(); window.closeModal?.('modal-new-project'); await window.loadDashboard?.(); if (result.data?.project_no) window.openProjectDetail?.(result.data.project_no); return result; } catch (error) { toast('신규 작업 등록 실패', 'error'); return null; } finally { submitting = false; } }
        function reset() { generation += 1; el('form-new-project')?.reset(); selectedFiles = []; selectedPartner = null; state.selectedNewFiles = []; state.aiAttachedFiles = []; state.aiChatHistory = []; if (el('new-partner-id')) el('new-partner-id').value = ''; if (el('new-partner-search')) el('new-partner-search').value = ''; if (el('new-partner-hint')) el('new-partner-hint').textContent = '거래처를 선택하면 연락처·배송지가 자동 입력됩니다.'; if (el('new-received-date')) el('new-received-date').value = new Date().toISOString().slice(0, 10); if (el('new-tax-type')) el('new-tax-type').value = '면세'; if (el('new-project-files')) el('new-project-files').value = ''; const feed = el('ai-chat-history'); if (feed) { feed.innerHTML = ''; feed.style.display = 'none'; } const resetBtn = el('btn-reset-ai-chat'); if (resetBtn) resetBtn.style.display = 'none'; renderFiles(); const body = el('new-project-items-tbody'); if (body) body.innerHTML = ''; add('', 'PLA', 'White'); partnerAdapter.refresh?.(); }
        const instance = { reset, add, calculate, addFiles, removeFile, renderFiles, addItemsFromFiles, submit, applyAiFields, selectPartner, clearPartner, partnerChanged, hasManualItems: () => rows().some(row => row.querySelector('.new-item-name')?.value.trim()), confirmOverwrite: message => confirmFn(message), getFiles: () => [...selectedFiles], isSubmitting: () => submitting, generation: () => generation };
        const existingBinding = documentBindings.get(doc);
        if (existingBinding) existingBinding.manager = instance;
        else {
            const dispatch = () => documentBindings.get(doc)?.manager;
            doc.addEventListener('click', event => {
                const current = dispatch(); if (!current) return;
                const target = event.target; const actionNode = target?.closest?.('[data-new-action]'); const action = actionNode?.dataset.newAction;
                const fileButton = target?.closest?.('[data-new-file-action="remove"]');
                const itemButton = target?.closest?.('.new-item-remove');
                if (fileButton) current.removeFile(Number(fileButton.dataset.fileIndex));
                else if (itemButton) { itemButton.closest('tr')?.remove(); current.calculate(); }
                else if (action === 'pick-files') doc.getElementById('new-project-files')?.click();
                else if (action === 'reset-ai') window.resetAiChat?.();
                else if (action === 'ai-analyze') window.handleAiOrderAnalysis?.();
                else if (action === 'add-item') current.add();
                else if (action === 'add-items-from-files') current.addItemsFromFiles();
                else if (target?.closest?.('#btn-open-new-project')) { current.reset(); window.openModal?.('modal-new-project'); }
            });
            const recalc = event => {
                const current = dispatch(); if (!current) return;
                const target = event.target;
                if (target?.dataset.newAction === 'calculate' || target?.matches?.('.new-item-qty, .new-item-price, #new-client-name, #new-contact-name, #new-phone, #new-address')) current.calculate();
                if (target?.id === 'new-client-name' || target?.id === 'new-contact-name' || target?.id === 'new-phone' || target?.id === 'new-address') current.partnerChanged();
            };
            doc.addEventListener('input', recalc); doc.addEventListener('change', recalc);
            documentBindings.set(doc, { manager: instance });
        }
        return instance;
    }
    let manager;
    function get() { return manager || (manager = create({ state: {}, api: window.API, documentRef: document, showToast: window.showToast, escapeHtml: window.escapeHtml, pricing: window.Pricing })); }
    window.NewProjectManager = { init: options => (manager = create(options)), get };
    window.openNewProjectModal = () => { const m = get(); m.reset(); window.openModal?.('modal-new-project'); };
    window.handleNewProjectSubmit = event => get().submit(event);
    window.addNewProjectItemRow = (...args) => get().add(...args);
    window.calculateNewProjectItemTotals = () => get().calculate();
    window.addItemsFromAttachedFiles = () => get().addItemsFromFiles();
    window.removeSelectedNewFile = index => get().removeFile(index);
    window.renderSelectedNewFiles = () => get().renderFiles();
})(window);
