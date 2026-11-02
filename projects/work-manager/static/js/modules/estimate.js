/**
 * 견적서·거래명세서 모달과 품목 합계 계산.
 * 실제 발행은 API.generateEstimate()에 위임하고, 문서 생성은 사용자가 제출할 때만 수행한다.
 */
(function registerEstimateManager(window) {
    let isSubmitting = false;
    let estimateDelegationBound = false;

    function toggleEstimateDropdown(event) {
        if (event) event.stopPropagation();
        const menu = document.getElementById('estimate-dropdown-menu');
        if (!menu) return;
        const isActive = menu.classList.contains('active');
        closeAllDropdowns();
        if (!isActive) menu.classList.add('active');
    }

    function closeEstimateDropdown() {
        const menu = document.getElementById('estimate-dropdown-menu');
        if (menu) menu.classList.remove('active');
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu-list').forEach(el => el.classList.remove('active'));
    }

    function bindEstimateDelegation() {
        if (estimateDelegationBound) return;
        estimateDelegationBound = true;
        document.addEventListener('click', (event) => {
            const node = event.target.closest('[data-estimate-action]');
            if (!node && !event.target.closest('.dropdown-wrapper')) closeAllDropdowns();
            if (!node) return;
            const action = node.dataset.estimateAction;
            if (action === 'remove-item') { node.closest('tr')?.remove(); calculateEstimateTotals(); }
            else if (action === 'add-item') addEstimateItemRow();
            else if (action === 'doc-type') { selectEstimateDocType(node.dataset.docType); closeEstimateDropdown(); }
            else if (action === 'close') closeModal(node.dataset.modalId);
        });
        document.addEventListener('input', (event) => {
            if (event.target.closest('#estimate-items-tbody') || event.target.id === 'est-shipping-fee') calculateEstimateTotals();
        });
        document.addEventListener('change', (event) => {
            if (event.target.id === 'est-tax-type') calculateEstimateTotals();
        });
        document.getElementById('form-generate-estimate')?.addEventListener('submit', handleEstimateGenerate);
    }

    function selectEstimateDocType(docType) {
        const hiddenInput = document.getElementById('est-doc-type');
        if (hiddenInput) hiddenInput.value = docType;

        document.querySelectorAll('.doc-type-card').forEach(card => {
            const isSelected = card.dataset.type === docType;
            card.classList.toggle('active', isSelected);
            const radio = card.querySelector('input[type="radio"]');
            if (radio) radio.checked = isSelected;
        });

        const submitBtn = document.getElementById('btn-submit-estimate');
        if (!submitBtn) return;
        if (docType === 'integrated') {
            submitBtn.innerHTML = '<i class="fa-solid fa-layer-group"></i> 통합 발행 (견적서 + 거래명세서 2개 파일 생성)';
        } else if (docType === 'estimate') {
            submitBtn.innerHTML = '<i class="fa-solid fa-file-invoice"></i> 제품견적서 생성 (단독 1개 파일)';
        } else if (docType === 'delivery') {
            submitBtn.innerHTML = '<i class="fa-solid fa-receipt"></i> 거래명세서 생성 (단독 1개 파일)';
        }
    }

    function openEstimateModal(docType = 'integrated') {
        if (!state.currentProject) return;
        const p = state.currentProject;
        selectEstimateDocType(docType);

        document.getElementById('est-recipient').value = p.client_name || '';
        document.getElementById('est-contact').value = p.phone || '';
        document.getElementById('est-address').value = `${p.address || ''} ${p.detail_address || ''}`.trim();
        document.getElementById('est-shipping-fee').value = p.shipping_fee !== undefined && p.shipping_fee !== null ? p.shipping_fee : 3500;
        document.getElementById('est-tax-type').value = p.tax_type || '면세';
        document.getElementById('est-date').value = new Date().toISOString().split('T')[0];

        const tbody = document.getElementById('estimate-items-tbody');
        tbody.innerHTML = '';
        if (p.items && p.items.length > 0) {
            p.items.forEach(item => {
                const unitPrice = item.unit_price !== undefined && item.unit_price !== null && item.unit_price > 0
                    ? item.unit_price : (p.items.length === 1 ? (p.quote_amount || 0) : 0);
                addEstimateItemRow(item.name, item.material || p.material, item.color || p.color, item.quantity, unitPrice);
            });
        } else {
            addEstimateItemRow(p.job_name, p.material || 'PETG', p.color || 'White', p.quantity || 1, p.quote_amount || 0);
        }
        calculateEstimateTotals();
        openModal('modal-estimate-gen');
    }

    function addEstimateItemRow(name = '', material = '', color = '', qty = 1, price = 0) {
        const tbody = document.getElementById('estimate-items-tbody');
        if (!tbody) return;
        const tr = document.createElement('tr');
        const input = (className, value, type = 'text', extra = {}) => {
            const el = document.createElement('input');
            el.type = type; el.className = className; el.value = String(value ?? '');
            Object.entries(extra).forEach(([key, val]) => el.setAttribute(key, val));
            return el;
        };
        const cell = (child, className = '') => { const td = document.createElement('td'); if (className) td.className = className; td.appendChild(child); return td; };
        tr.appendChild(cell(input('item-name', name, 'text', { placeholder: '품명', required: 'required' })));
        tr.appendChild(cell(input('item-material', material, 'text', { placeholder: '소재' })));
        tr.appendChild(cell(input('item-color', color, 'text', { placeholder: '색상' })));
        tr.appendChild(cell(input('item-qty', qty, 'number', { min: '1' })));
        tr.appendChild(cell(input('item-price', price, 'number', { step: '1' })));
        const total = document.createElement('td'); total.className = 'item-total-cell font-bold'; total.style.verticalAlign = 'middle'; total.textContent = '0원'; tr.appendChild(total);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-ghost btn-xs text-danger'; remove.dataset.estimateAction = 'remove-item'; remove.setAttribute('aria-label', '품목 삭제'); remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        tr.appendChild(cell(remove));
        tbody.appendChild(tr);
        calculateEstimateTotals();
    }

    function calculateEstimateTotals() {
        const rows = document.querySelectorAll('#estimate-items-tbody tr');
        const itemTotals = Pricing.calculateItems(Array.from(rows).map(tr => ({
            quantity: tr.querySelector('.item-qty').value,
            unitPrice: tr.querySelector('.item-price').value
        })));
        if (!itemTotals.valid) {
            const totalDisplay = document.getElementById('est-total-display');
            if (totalDisplay) totalDisplay.textContent = '금액을 확인해 주세요.';
            return { valid: false, error: itemTotals.error };
        }
        const subtotal = itemTotals.subtotal;
        itemTotals.lines.forEach((line, index) => {
            rows[index].querySelector('.item-total-cell').textContent = `${line.total.toLocaleString()}원`;
        });

        const shippingFee = Pricing.toInteger(document.getElementById('est-shipping-fee').value);
        const taxType = document.getElementById('est-tax-type')?.value || '면세';
        const isTaxable = taxType === '과세';
        const amounts = Pricing.calculateAmounts({ quoteAmount: subtotal, shippingFee, taxType });
        if (!amounts.valid) {
            const totalDisplay = document.getElementById('est-total-display');
            if (totalDisplay) totalDisplay.textContent = '금액을 확인해 주세요.';
            return { valid: false, error: amounts.error };
        }
        const vat = amounts.vat;
        const grandTotal = amounts.total;

        const subDisplay = document.getElementById('est-subtotal-display');
        const shpDisplay = document.getElementById('est-shipping-display');
        const vatWrap = document.getElementById('est-vat-wrap');
        const vatDisplay = document.getElementById('est-vat-display');
        const totDisplay = document.getElementById('est-total-display');
        const taxBadge = document.getElementById('est-tax-badge');
        if (subDisplay) subDisplay.textContent = `${subtotal.toLocaleString()}원`;
        if (shpDisplay) shpDisplay.textContent = `${shippingFee.toLocaleString()}원`;
        if (vatWrap && vatDisplay) {
            vatWrap.style.display = isTaxable ? 'inline' : 'none';
            if (isTaxable) vatDisplay.textContent = `${vat.toLocaleString()}원`;
        }
        if (totDisplay) totDisplay.textContent = `${grandTotal.toLocaleString()}원`;
        if (taxBadge) {
            taxBadge.textContent = isTaxable ? '(과세 VAT 10% 포함)' : '(면세)';
            taxBadge.style.color = isTaxable ? '#38bdf8' : 'var(--text-dim)';
        }
    }

    async function handleEstimateGenerate(event) {
        event.preventDefault();
        if (!state.currentProject || isSubmitting) return;
        const requestedProjectNo = state.currentProject.project_no;
        const rows = document.querySelectorAll('#estimate-items-tbody tr');
        const items = Array.from(rows).map(tr => ({
            name: tr.querySelector('.item-name').value,
            material: tr.querySelector('.item-material').value,
            color: tr.querySelector('.item-color').value,
            quantity: Pricing.parseInteger(tr.querySelector('.item-qty').value, { min: 1 }),
            price: Pricing.parseInteger(tr.querySelector('.item-price').value, { min: 0 })
        }));
        const allowedDocs = new Set(['integrated', 'estimate', 'delivery']);
        const docType = document.getElementById('est-doc-type').value;
        const shippingFee = Pricing.parseInteger(document.getElementById('est-shipping-fee').value, { min: 0 });
        const itemTotals = Pricing.calculateItems(items.map(item => ({ quantity: item.quantity, unitPrice: item.price })));
        const amounts = Pricing.calculateAmounts({ quoteAmount: itemTotals.subtotal, shippingFee, taxType: document.getElementById('est-tax-type').value });
        if (!allowedDocs.has(docType) || shippingFee === null || !items.every(item => item.quantity !== null && item.price !== null) || !itemTotals.valid || !amounts.valid) {
            showToast('문서 유형과 품목 수량·단가를 확인해 주세요.', 'error');
            return;
        }
        const payload = {
            doc_type: docType,
            convert_pdf: document.getElementById('est-convert-pdf').checked,
            recipient: document.getElementById('est-recipient').value,
            contact: document.getElementById('est-contact').value,
            address: document.getElementById('est-address').value,
            shipping_fee: shippingFee,
            tax_type: document.getElementById('est-tax-type').value,
            date: document.getElementById('est-date').value,
            items,
            expected_version: state.currentProject?.version,
        };

        const btn = document.getElementById('btn-submit-estimate');
        isSubmitting = true;
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 엑셀 및 PDF 생성 중...';
        try {
            const res = await API.generateEstimate(requestedProjectNo, payload);
            if (res.success) {
                showToast(res.message, 'success');
                if (state.currentProject?.project_no === requestedProjectNo) {
                    closeModal('modal-estimate-gen');
                    await openProjectDetail(requestedProjectNo);
                }
                loadDashboard();
            } else showToast(res.error, 'error');
        } catch (e) {
            showToast('견적서 생성 실패', 'error');
        } finally {
            isSubmitting = false;
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }

    window.toggleEstimateDropdown = toggleEstimateDropdown;
    window.closeEstimateDropdown = closeEstimateDropdown;
    window.closeAllDropdowns = closeAllDropdowns;
    window.selectEstimateDocType = selectEstimateDocType;
    window.openEstimateModal = openEstimateModal;
    window.addEstimateItemRow = addEstimateItemRow;
    window.calculateEstimateTotals = calculateEstimateTotals;
    window.handleEstimateGenerate = handleEstimateGenerate;
    bindEstimateDelegation();
})(window);
