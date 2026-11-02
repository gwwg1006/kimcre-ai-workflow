/* 프로젝트 기본 정보와 상태 변경. 외부 의존성은 init()으로 주입한다. */
(function registerProjectEditor(window) {
    const STATUS = {
        prod_status: new Set(['접수', '슬라이싱', '견적 대기', '출력 중', '검수', '제작 완료']),
        pay_status: new Set(['미청구', '견적 발송', '입금 대기', '부분 입금', '입금 완료']),
        deliv_status: new Set(['예약 필요', '예약 완료', '발송', '배송 완료', '미정'])
    };
    let manager;
    function init(options = {}) {
        const state = options.state || window.state;
        const api = options.api || window.API;
        const doc = options.documentRef || document;
        const toast = options.showToast || window.showToast || (() => {});
        const pricing = options.pricing || window.Pricing;
        let saving = false;
        const statusBusy = new Set();
        let contextGeneration = 0;
        const operationSequences = new Map();
        let contextProjectNo = null;
        const validProject = value => /^\d{6}-\d{3}$/.test(String(value || ''));
        const current = () => state?.currentProject || null;
        const isCurrent = no => String(current()?.project_no || '') === String(no)
            && (!contextProjectNo || String(contextProjectNo) === String(no));
        function value(id) { return doc.getElementById(id)?.value ?? ''; }
        function setContext(projectNo) {
            if (!validProject(projectNo)) return false;
            contextProjectNo = String(projectNo);
            contextGeneration += 1;
            return true;
        }
        function fill() {
            const p = current(); if (!p) return;
            setContext(p.project_no);
            const values = { 'edit-client-name': p.client_name, 'edit-contact-name': p.contact_name, 'edit-job-name': p.job_name, 'edit-received-date': p.received_date, 'edit-channel': p.channel ?? '카카오톡', 'edit-due-date': p.due_date, 'edit-material': p.material ?? 'PLA', 'edit-color': p.color, 'edit-quantity': p.quantity ?? '1', 'edit-shipping-fee': p.shipping_fee ?? 3500, 'edit-model-fee': p.model_fee ?? 0, 'edit-tax-type': p.tax_type ?? '면세', 'edit-phone': p.phone, 'edit-zipcode': p.zipcode, 'edit-address': p.address, 'edit-detail-address': p.detail_address, 'edit-request-notes': p.request_notes, 'edit-memo': p.memo };
            Object.entries(values).forEach(([id, val]) => { const el = doc.getElementById(id); if (el) el.value = val ?? ''; });
            options.openModal?.('modal-edit-project-info');
        }
        function restoreStatus(type, fallback) {
            if (!current()) return;
            const el = doc.getElementById(`detail-${type}`);
            if (el) el.value = current()[type] ?? fallback ?? '';
        }
        function collect() {
            const p = current() || {};
            const quantity = pricing?.parseInteger?.(value('edit-quantity'), { min: 1 });
            const shipping = pricing?.parseInteger?.(value('edit-shipping-fee'), { min: 0 });
            const model = pricing?.parseInteger?.(value('edit-model-fee'), { min: 0 });
            const quote = pricing?.parseInteger?.(p.quote_amount ?? 0, { min: 0 });
            const postProcess = pricing?.parseInteger?.(p.post_process_fee ?? 0, { min: 0 });
            const paid = pricing?.parseInteger?.(p.paid_amount ?? 0, { min: 0 });
            const taxType = value('edit-tax-type');
            if ([quantity, shipping, model, quote, postProcess, paid].some(item => item === null || item === undefined)
                || !['면세', '과세'].includes(taxType)) return { error: '수량과 금액은 올바른 정수로 입력해 주세요.' };
            const amounts = pricing?.calculateAmounts?.({ quoteAmount: quote, shippingFee: shipping, modelFee: model, postProcessFee: postProcess, taxType, paidAmount: paid });
            if (!amounts || amounts.valid !== true) return { error: '금액이 너무 크거나 올바르지 않습니다.' };
            const clientName = value('edit-client-name').trim();
            const jobName = value('edit-job-name').trim();
            if (!clientName || !jobName) return { error: '고객명과 작업명은 필수입니다.' };
            return { client_name: clientName, contact_name: value('edit-contact-name').trim(), job_name: jobName, received_date: value('edit-received-date'), channel: value('edit-channel'), due_date: value('edit-due-date'), material: value('edit-material'), color: value('edit-color').trim(), quantity, shipping_fee: shipping, model_fee: model, tax_type: taxType, phone: value('edit-phone').trim(), zipcode: value('edit-zipcode').trim(), address: value('edit-address').trim(), detail_address: value('edit-detail-address').trim(), request_notes: value('edit-request-notes').trim(), memo: value('edit-memo').trim() };
        }
        async function save(event) {
            event?.preventDefault();
            const p = current(); if (!p || saving || !validProject(p.project_no)) return null;
            const data = collect(); if (data.error) { toast(data.error, 'warning'); return null; }
            const projectNo = p.project_no; const requestContext = contextGeneration; const requestSequence = (operationSequences.get('save') || 0) + 1; operationSequences.set('save', requestSequence); saving = true;
            const button = doc.getElementById('btn-save-project-info'); if (button) button.disabled = true;
            try {
                const res = await api.updateProject(projectNo, { ...data, expected_version: p.version });
                if (!isCurrent(projectNo) || requestContext !== contextGeneration || requestSequence !== operationSequences.get('save')) return res;
                if (res?.success && res.data) { state.currentProject = res.data; options.closeModal?.('modal-edit-project-info'); options.render?.(res.data); await options.refreshProjects?.(); await options.refreshStats?.(); toast('프로젝트 기본 정보가 성공적으로 수정되었습니다.', 'success'); return res; }
                toast(res?.error || '수정에 실패했습니다.', 'error'); return res;
            } catch (_) { if (isCurrent(projectNo) && requestContext === contextGeneration && requestSequence === operationSequences.get('save')) toast('프로젝트 정보 저장 중 오류가 발생했습니다.', 'error'); return null; }
            finally { saving = false; if (button) button.disabled = false; }
        }
        async function updateStatus(type, val) {
            const p = current(); if (!p || !STATUS[type]?.has(val) || statusBusy.has(type) || !validProject(p.project_no)) return null;
            const projectNo = p.project_no; const previous = p[type]; const requestContext = contextGeneration; const requestSequence = (operationSequences.get(type) || 0) + 1; operationSequences.set(type, requestSequence); statusBusy.add(type);
            try {
                const res = await api.updateStatus(projectNo, type, val, p.version);
                if (!isCurrent(projectNo) || requestContext !== contextGeneration || requestSequence !== operationSequences.get(type)) { restoreStatus(type, previous); return res; }
                if (res?.success && res.data) { state.currentProject = res.data; options.render?.(res.data); await options.refreshProjects?.(); await options.refreshStats?.(); toast(`상태가 '${val}'(으)로 변경되었습니다.`, 'success'); return res; }
                restoreStatus(type, previous); toast(res?.error || '상태 변경 실패', 'error'); return res;
            } catch (_) { if (isCurrent(projectNo) && requestContext === contextGeneration && requestSequence === operationSequences.get(type)) { restoreStatus(type, previous); toast('상태 변경 실패', 'error'); } return null; }
            finally { statusBusy.delete(type); }
        }
        async function updateTaxType(taxType) {
            const p = current(); if (!p || !['면세', '과세'].includes(taxType) || statusBusy.has('tax_type') || !validProject(p.project_no)) return null;
            const projectNo = p.project_no; const previous = p.tax_type || '면세'; const requestContext = contextGeneration; const requestSequence = (operationSequences.get('tax_type') || 0) + 1; operationSequences.set('tax_type', requestSequence); statusBusy.add('tax_type');
            try {
                const res = await api.updateProject(projectNo, { tax_type: taxType, expected_version: p.version });
                if (!isCurrent(projectNo) || requestContext !== contextGeneration || requestSequence !== operationSequences.get('tax_type')) return res;
                if (res?.success && res.data) { state.currentProject = res.data; options.render?.(res.data); await options.refreshProjects?.(); await options.refreshStats?.(); toast(`과세 구분이 '${taxType}'(으)로 변경되었습니다.`, 'success'); return res; }
                const el = doc.getElementById('detail-tax-type-select'); if (el) el.value = previous; toast(res?.error || '과세 구분 변경에 실패했습니다.', 'error'); return res;
            } catch (_) { if (isCurrent(projectNo) && requestContext === contextGeneration && requestSequence === operationSequences.get('tax_type')) { const el = doc.getElementById('detail-tax-type-select'); if (el) el.value = previous; toast('과세 구분 변경 중 오류가 발생했습니다.', 'error'); } return null; }
            finally { statusBusy.delete('tax_type'); }
        }
        async function updateShipping(value) {
            const p = current(); if (!p || statusBusy.has('shipping_fee') || !validProject(p.project_no)) return null;
            const fee = pricing?.parseInteger?.(value, { min: 0 });
            const calculated = options.calculate?.();
            if (fee === null || fee === undefined || calculated?.totals?.valid === false || calculated?.amount?.valid === false) { toast('배송비와 금액을 올바른 정수로 입력해 주세요.', 'warning'); return null; }
            const projectNo = p.project_no; const previous = p.shipping_fee ?? 0; const requestContext = contextGeneration; const requestSequence = (operationSequences.get('shipping_fee') || 0) + 1; operationSequences.set('shipping_fee', requestSequence); statusBusy.add('shipping_fee');
            try {
                const res = await api.updateProject(projectNo, { shipping_fee: fee, expected_version: p.version });
                if (!isCurrent(projectNo) || requestContext !== contextGeneration || requestSequence !== operationSequences.get('shipping_fee')) return res;
                if (res?.success && res.data) { state.currentProject = res.data; options.render?.(res.data); await options.refreshProjects?.(); await options.refreshStats?.(); toast(`배송비가 ${fee.toLocaleString()}원으로 수정되었습니다.`, 'success'); return res; }
                const el = doc.getElementById('detail-shipping-fee-input'); if (el) el.value = previous; toast(res?.error || '배송비 수정에 실패했습니다.', 'error'); return res;
            } catch (_) { if (isCurrent(projectNo) && requestContext === contextGeneration && requestSequence === operationSequences.get('shipping_fee')) { const el = doc.getElementById('detail-shipping-fee-input'); if (el) el.value = previous; toast('배송비 수정 중 오류가 발생했습니다.', 'error'); } return null; }
            finally { statusBusy.delete('shipping_fee'); }
        }
        if (!doc.__projectEditorActionsBound) {
            doc.addEventListener('submit', event => { if (event.target?.id === 'form-edit-project-info') return doc.__projectEditorManager?.()?.save(event); return undefined; });
            doc.addEventListener('change', event => { const type = event.target?.dataset?.projectEditorStatus; if (type) return doc.__projectEditorManager?.()?.updateStatus(type, event.target.value); return undefined; });
            doc.__projectEditorActionsBound = true;
        }
        manager = { fill, save, updateStatus, updateTaxType, updateShipping, setContext, invalidate: () => { contextGeneration += 1; contextProjectNo = null; }, isSaving: () => saving };
        doc.__projectEditorManager = () => manager;
        return manager;
    }
    function get() { return manager || init(); }
    window.ProjectEditor = { init, get };
})(window);
