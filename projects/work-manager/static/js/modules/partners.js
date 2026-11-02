/** 거래처 관리 모듈. DOM/API를 주입해 검색 경쟁과 renderer를 독립적으로 검증한다. */
(function registerPartners(root, factory) {
    const api = factory;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PartnerManager = { init: api };
})(typeof window !== 'undefined' ? window : globalThis, function createPartnerManager(options = {}) {
    const state = options.state || {};
    const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : globalThis);
    const api = options.api || (typeof API !== 'undefined' ? API : null);
    const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
    const showToast = options.showToast || (() => {});
    const escapeHtml = options.escapeHtml || (value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));
    const confirmFn = options.confirmFn || (typeof confirm === 'function' ? confirm : () => false);
    const selectNewPartner = options.selectNewPartner || (partner => windowRef.NewProjectManager?.get?.().selectPartner?.(partner));
    let searchGeneration = 0;
    let searchController = null;
    let submitBusy = false;
    let archiveBusy = new Set();
    let partnerByDisplay = new Map();
    let partnerByName = new Map();
    let lastPickerSelectionKey = null;
    const bindingByDocument = new WeakMap();

    // Keep the public API's canonical `phone` field intact across the picker
    // boundary. Older records/fixtures may still use one of the aliases.
    function normalizePartner(partner) {
        if (!partner || typeof partner !== 'object') return null;
        const phone = partner.phone || partner.phone_number || partner.contact_phone || '';
        return { ...partner, phone };
    }

    function activePartners() {
        // `state.partners` is the complete picker cache. Management search
        // results live separately so searching in the sidebar cannot remove
        // options from the new-project picker.
        return (Array.isArray(state.partners) ? state.partners : [])
            .map(normalizePartner)
            .filter(partner => partner && partner.is_active !== false && partner.is_active !== 0);
    }
    function rebuildPartnerIndex() {
        partnerByDisplay = new Map(); partnerByName = new Map();
        activePartners().forEach(partner => {
            const display = String(partnerLabel(partner) || '').trim();
            const name = String(partner.name || '').trim().toLocaleLowerCase();
            if (display) partnerByDisplay.set(display, [...(partnerByDisplay.get(display) || []), partner]);
            if (name) partnerByName.set(name, [...(partnerByName.get(name) || []), partner]);
        });
    }

    function partnerLabel(partner) {
        const detail = partner.contact_name || partner.phone || partner.phone_number || partner.contact_phone || partner.address || '';
        return detail ? `${partner.name} · ${detail}` : partner.name;
    }
    function validId(value) {
        if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    }
    function renderPartnerOptions() {
        const datalist = documentRef.getElementById?.('new-partner-options');
        rebuildPartnerIndex();
        lastPickerSelectionKey = null;
        if (datalist) datalist.innerHTML = activePartners().map(p => `<option value="${escapeHtml(partnerLabel(p))}"></option>`).join('');
    }
    function renderPartnersTable() {
        const body = documentRef.getElementById?.('partners-table-body');
        const empty = documentRef.getElementById?.('partners-empty-state');
        if (!body || !empty) return;
        const partners = Array.isArray(state.partnerSearchResults)
            ? state.partnerSearchResults
            : (Array.isArray(state.partners) ? state.partners : []);
        empty.style.display = partners.length ? 'none' : 'block';
        body.innerHTML = partners.map(partner => {
            const id = validId(partner.id);
            if (!id) return '';
            const address = `${partner.address || ''} ${partner.detail_address || ''}`.trim() || '-';
            return `<tr><td><strong>${escapeHtml(partner.name || '')}</strong><small class="partner-type-label">${escapeHtml(partner.partner_type || '업체/개인')}</small></td><td>${escapeHtml(partner.contact_name || '-')}</td><td>${escapeHtml(partner.phone || '-')}</td><td>${escapeHtml(address)}</td><td>${escapeHtml(Number(partner.project_count || 0))}건</td><td class="table-actions"><button type="button" class="btn btn-ghost btn-xs" data-partner-action="edit" data-partner-id="${id}"><i class="fa-solid fa-pen"></i> 수정</button><button type="button" class="btn btn-ghost btn-xs text-danger" data-partner-action="archive" data-partner-id="${id}"><i class="fa-solid fa-box-archive"></i> 보관</button></td></tr>`;
        }).join('');
    }
    async function loadPartners(search = '') {
        const generation = ++searchGeneration;
        searchController?.abort();
        searchController = typeof AbortController === 'function' ? new AbortController() : null;
        try {
            const res = await api.getPartners(search, false, searchController ? { signal: searchController.signal } : {});
            if (generation !== searchGeneration) return res;
            if (!res.success) throw new Error(res.error || '거래처를 불러오지 못했습니다.');
            const results = (Array.isArray(res.data) ? res.data : []).map(normalizePartner).filter(Boolean);
            state.partnerSearchResults = results;
            // An empty query is also the authoritative refresh for the
            // picker cache. Non-empty management searches must not replace it.
            if (!String(search || '').trim()) {
                state.partners = results;
                renderPartnerOptions();
            } else if (!Array.isArray(state.partners) || state.partners.length === 0) {
                // Keep first-use/new-project behavior working even when the
                // user opens the management view with a search already set.
                await loadPickerPartners();
            }
            renderPartnersTable();
            return res;
        } catch (error) {
            if (error?.name === 'AbortError' || error?.kind === 'abort') return null;
            if (generation === searchGeneration) showToast('거래처 목록을 불러오지 못했습니다.', 'error');
            return null;
        }
    }
    async function loadPickerPartners() {
        if (pickerLoadPromise) return pickerLoadPromise;
        pickerLoadPromise = (async () => {
            try {
                const res = await api.getPartners('', false, {});
                if (res?.success) {
                    state.partners = (Array.isArray(res.data) ? res.data : []).map(normalizePartner).filter(Boolean);
                    renderPartnerOptions();
                }
                return res;
            } finally { pickerLoadPromise = null; }
        })();
        return pickerLoadPromise;
    }
    function findPartner(id) {
        const valid = validId(id); if (!valid) return null;
        return [...(Array.isArray(state.partnerSearchResults) ? state.partnerSearchResults : []), ...(state.partners || [])]
            .find(p => validId(p.id) === valid) || null;
    }
    function openPartnerForm(partnerId = null) {
        const form = documentRef.getElementById?.('form-partner'); if (!form) return;
        form.reset(); const partner = findPartner(partnerId);
        const set = (id, value) => { const el = documentRef.getElementById?.(id); if (el) el.value = value ?? ''; };
        set('partner-edit-id', partner?.id || '');
        const title = documentRef.getElementById?.('partner-modal-title'); if (title) title.textContent = partner ? '거래처 수정' : '거래처 등록';
        const legacyType = partner?.partner_type === '업체/개인' ? '미분류' : (partner?.partner_type || '미분류');
        set('partner-name', partner?.name); set('partner-type', legacyType); set('partner-contact-name', partner?.contact_name); set('partner-phone', partner?.phone); set('partner-zipcode', partner?.zipcode); set('partner-address', partner?.address); set('partner-detail-address', partner?.detail_address); set('partner-memo', partner?.memo);
        windowRef.openModal?.('modal-partner');
    }
    function formData() {
        const value = id => documentRef.getElementById?.(id)?.value?.trim?.() || '';
        return { name: value('partner-name'), partner_type: documentRef.getElementById?.('partner-type')?.value || '미분류', contact_name: value('partner-contact-name'), phone: value('partner-phone'), zipcode: value('partner-zipcode'), address: value('partner-address'), detail_address: value('partner-detail-address'), memo: value('partner-memo') };
    }
    function duplicatePayload(value) {
        const payload = value?.payload || value;
        if (!payload || typeof payload !== 'object' || !payload.duplicate) return null;
        return payload.existing_partner || payload.data?.existing_partner || null;
    }
    function duplicateMessage(partner) {
        return partner?.name ? `'${partner.name}' 거래처가 이미 있습니다.` : '동일한 거래처가 이미 있습니다.';
    }
    async function handlePartnerSubmit(event) {
        event?.preventDefault?.(); if (submitBusy) return; submitBusy = true;
        try {
            const id = validId(documentRef.getElementById?.('partner-edit-id')?.value); const data = formData();
            let res;
            try {
                res = id ? await api.updatePartner(id, data) : await api.createPartner(data);
            } catch (error) {
                const existing = error?.status === 409 ? duplicatePayload(error) : null;
                if (!existing) throw error;
                if (id) { showToast(`${duplicateMessage(existing)} 기존 거래처를 확인해 주세요.`, 'warning'); return null; }
                if (!confirmFn(`${duplicateMessage(existing)} 별도 거래처로 등록할까요?`)) { showToast('기존 거래처를 선택하거나 거래처 정보를 수정해 주세요.', 'warning'); return null; }
                data.allow_duplicate = true;
                res = await api.createPartner(data);
            }
            const existing = duplicatePayload(res);
            if (!res?.success && !id && existing && confirmFn(`${duplicateMessage(existing)} 별도 거래처로 등록할까요?`)) {
                data.allow_duplicate = true; res = await api.createPartner(data);
            } else if (!res?.success && !id && existing) {
                showToast('기존 거래처를 선택하거나 거래처 정보를 수정해 주세요.', 'warning'); return null;
            }
            if (!res?.success) { showToast(res?.error || '거래처 저장에 실패했습니다.', 'error'); return res; }
            windowRef.closeModal?.('modal-partner'); await loadPartners(documentRef.getElementById?.('partners-search')?.value?.trim?.() || ''); showToast(res.message, 'success'); return res;
        } catch (error) { showToast('거래처 저장에 실패했습니다.', 'error'); return null; }
        finally { submitBusy = false; }
    }
    async function archivePartnerRecord(partnerId) {
        const id = validId(partnerId); const partner = findPartner(id);
        if (!id || !partner || archiveBusy.has(id) || !confirmFn(`'${partner.name}' 거래처를 보관 처리할까요? 기존 프로젝트 정보는 유지됩니다.`)) return null;
        archiveBusy.add(id);
        try { const res = await api.archivePartner(id); if (res.success) { await loadPartners(documentRef.getElementById?.('partners-search')?.value?.trim?.() || ''); showToast(res.message, 'success'); } else showToast(res.error || '거래처 보관에 실패했습니다.', 'error'); return res; }
        catch (error) { showToast('거래처 보관에 실패했습니다.', 'error'); return null; } finally { archiveBusy.delete(id); }
    }
    function handleNewPartnerSelection(event) {
        rebuildPartnerIndex();
        const value = event?.target?.value?.trim?.() || '';
        const displayMatches = partnerByDisplay.get(value) || [];
        const nameMatches = partnerByName.get(value.toLocaleLowerCase()) || [];
        const partner = displayMatches.length === 1 ? displayMatches[0] : (nameMatches.length === 1 ? nameMatches[0] : null);
        const selectionKey = `${value}\u0000${partner?.id ?? ''}`;
        if (selectionKey === lastPickerSelectionKey) return;
        lastPickerSelectionKey = selectionKey;
        selectNewPartner(partner);
    }
    function handleTableClick(event) {
        const button = event.target?.closest?.('[data-partner-action]');
        if (!button) return;
        const id = validId(button.dataset.partnerId);
        if (button.dataset.partnerAction === 'edit') openPartnerForm(id);
        else if (button.dataset.partnerAction === 'archive') archivePartnerRecord(id);
    }
    function bind() {
        if (bindingByDocument.has(documentRef)) { bindingByDocument.get(documentRef).manager = manager; }
        else bindingByDocument.set(documentRef, { manager });
        const dispatch = () => bindingByDocument.get(documentRef)?.manager;
        const form = documentRef.getElementById?.('form-partner');
        if (form && !form.__partnerSubmitDispatcher) { form.addEventListener('submit', event => dispatch()?.handlePartnerSubmit(event)); form.__partnerSubmitDispatcher = true; }
        const search = documentRef.getElementById?.('partners-search');
        if (search && !search.__partnerSearchDispatcher) { search.addEventListener('input', event => dispatch()?.loadPartners(event.target.value.trim())); search.__partnerSearchDispatcher = true; }
        const picker = documentRef.getElementById?.('new-partner-search');
        if (picker && !picker.__partnerPickerDispatcher) { const handler = event => dispatch()?.handleNewPartnerSelection(event); picker.addEventListener('input', handler); picker.addEventListener('change', handler); picker.__partnerPickerDispatcher = true; }
        const body = documentRef.getElementById?.('partners-table-body');
        if (body && !body.__partnerTableDispatcher) { body.addEventListener('click', event => dispatch()?.handleTableClick?.(event)); body.__partnerTableDispatcher = true; }
        if (bindingByDocument.get(documentRef).bound) return;
        bindingByDocument.get(documentRef).bound = true;
    }
    function refreshBindings() { bind(); return manager; }
    function init() { return refreshBindings(); }
    let pickerLoadPromise = null;
    const manager = { init, bind, refreshBindings, loadPartners, loadPickerPartners, renderPartnerOptions, renderPartnersTable, partnerLabel, normalizePartner, handleNewPartnerSelection, handleTableClick, openPartnerForm, handlePartnerSubmit, archivePartnerRecord, validId };
    return manager;
});
