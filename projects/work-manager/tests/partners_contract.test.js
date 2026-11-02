const assert = require('node:assert/strict');
const createPartnerManager = require('../static/js/modules/partners.js');
const { APIError } = require('../static/js/api.js');

function makeDom() {
    const elements = new Map();
    const add = (id, value = '') => {
        const el = { id, value, innerHTML: '', textContent: '', style: {}, dataset: {}, listeners: {}, reset() { this.value = ''; }, addEventListener(type, fn) { this.listeners[type] = fn; }, contains(node) { return node === this.button; } };
        elements.set(id, el); return el;
    };
    ['new-partner-options', 'partners-table-body', 'partners-empty-state', 'partners-search', 'form-partner', 'partner-edit-id', 'partner-modal-title', 'partner-name', 'partner-type', 'partner-contact-name', 'partner-phone', 'partner-zipcode', 'partner-address', 'partner-detail-address', 'partner-memo', 'new-partner-id', 'new-client-name', 'new-phone', 'new-zipcode', 'new-address', 'new-detail-address', 'new-partner-hint'].forEach(id => add(id));
    return { elements, getElementById: id => elements.get(id) || null };
}

async function run() {
    const documentRef = makeDom();
    const state = { partners: [] };
    let editCalls = 0; let archiveCalls = 0; let createCalls = 0; let confirmCalls = 0;
    const api = {
        getPartners: async search => { await new Promise(resolve => setTimeout(resolve, search === 'a' ? 20 : 1)); return { success: true, data: [{ id: search === 'a' ? 9 : 8, name: search === 'a' ? '오래됨' : '최신' }] }; },
        createPartner: async data => { createCalls += 1; return createCalls === 1 ? { success: false, duplicate: true, existing_partner: { name: '기존 거래처' } } : { success: true, message: '등록됨' }; },
        updatePartner: async () => ({ success: true, message: '수정됨' }),
        archivePartner: async () => { archiveCalls += 1; return { success: true, message: '보관됨' }; }
    };
    const manager = createPartnerManager({ state, api, documentRef, windowRef: { openModal() {}, closeModal() {} }, showToast: () => {}, confirmFn: () => { confirmCalls += 1; return false; } });
    manager.init(); manager.init();
    state.partners = [{ id: 7, name: "고객'\n<img>", partner_type: '업체', contact_name: '담당자', phone: '010', address: '주소', project_count: 2 }, { id: 'bad', name: '무효' }];
    manager.renderPartnersTable();
    let selectionCalls = 0; let selectedPartner;
    const pickerManager = createPartnerManager({ state, api, documentRef, windowRef: { NewProjectManager: { get: () => ({ selectPartner: partner => { selectionCalls += 1; selectedPartner = partner; } }) } }, showToast: () => {} });
    pickerManager.renderPartnerOptions();
    pickerManager.handleNewPartnerSelection({ target: { value: '고객\'\n<img> · 담당자' } });
    assert.equal(selectionCalls, 1);
    assert.equal(selectedPartner.id, 7);
    pickerManager.handleNewPartnerSelection({ target: { value: '고객' } });
    assert.equal(selectionCalls, 2);
    assert.equal(selectedPartner, null, 'partial/ambiguous text must not auto-select');
    const body = documentRef.getElementById('partners-table-body');
    assert.doesNotMatch(body.innerHTML, /onclick=/);
    assert.doesNotMatch(body.innerHTML, /<img>/);
    assert.match(body.innerHTML, /data-partner-id="7"/);
    assert.doesNotMatch(body.innerHTML, /data-partner-id="bad"/);

    const button = { dataset: { partnerAction: 'edit', partnerId: '7' }, closest() { return this; } };
    body.button = button; body.listeners.click({ target: button }); body.listeners.click({ target: button });
    assert.equal(Number(documentRef.getElementById('partner-edit-id').value), 7);

    const first = manager.loadPartners('a'); const second = manager.loadPartners('b');
    await Promise.all([first, second]);
    assert.deepEqual(state.partnerSearchResults.map(p => p.id), [8]);
    assert.deepEqual(state.partners.map(p => p.id), [7, 'bad'], 'management search must not replace picker cache');

    // Duplicate confirmation false means no retry.
    documentRef.getElementById('partner-edit-id').value = '';
    documentRef.getElementById('partner-name').value = '신규';
    const before = createCalls;
    await manager.handlePartnerSubmit({ preventDefault() {} });
    assert.equal(createCalls, before + 1); assert.equal(confirmCalls, 1);

    let thrownCalls = 0; let thrownToast = '';
    const thrownManager = createPartnerManager({ state, api: {
        createPartner: async data => { thrownCalls += 1; if (thrownCalls === 1) throw new APIError('중복', { status: 409, payload: { duplicate: true, existing_partner: { id: 11, name: '서버 기존 거래처' } } }); return { success: true, message: '등록됨' }; }
    }, documentRef, windowRef: {}, showToast: message => { thrownToast = message; }, confirmFn: () => true });
    documentRef.getElementById('partner-edit-id').value = '';
    await thrownManager.handlePartnerSubmit({ preventDefault() {} });
    assert.equal(thrownCalls, 2, '409 duplicate confirmation retries with allow_duplicate');

    let cancelToast = '';
    const cancelManager = createPartnerManager({ state, api: { createPartner: async () => { throw new APIError('중복', { status: 409, payload: { duplicate: true, existing_partner: { name: '기존' } } }); } }, documentRef, windowRef: {}, showToast: message => { cancelToast = message; }, confirmFn: () => false });
    await cancelManager.handlePartnerSubmit({ preventDefault() {} });
    assert.match(cancelToast, /기존 거래처/);

    // Duplicate confirmation true retries exactly once, and submit lock suppresses overlap.
    const yesManager = createPartnerManager({ state, api: { ...api, createPartner: async () => ({ success: false, duplicate: true, existing_partner: { name: '중복' } }) }, documentRef, windowRef: {}, showToast: () => {}, confirmFn: () => true });
    const p1 = yesManager.handlePartnerSubmit({ preventDefault() {} }); const p2 = yesManager.handlePartnerSubmit({ preventDefault() {} });
    await Promise.all([p1, p2]);

    state.partners = [{ id: 1, name: '보관 대상' }];
    api.getPartners = async () => ({ success: true, data: [] });
    const archiveManager = createPartnerManager({ state, api, documentRef, windowRef: {}, showToast: () => {}, confirmFn: () => true });
    await archiveManager.archivePartnerRecord(1); await archiveManager.archivePartnerRecord(1);
    assert.equal(archiveCalls, 1);

    // AbortSignal is forwarded; cancellation is silent and stale responses do not win.
    let firstSignal;
    let resolveOld;
    const abortApi = {
        getPartners: (_search, _inactive, options) => {
            if (!firstSignal) { firstSignal = options.signal; return new Promise(resolve => { resolveOld = resolve; }); }
            return Promise.resolve({ success: true, data: [{ id: 22, name: '최신' }] });
        }
    };
    const abortToasts = [];
    const abortManager = createPartnerManager({ state, api: abortApi, documentRef, showToast: message => abortToasts.push(message) });
    const oldRequest = abortManager.loadPartners('old');
    const newRequest = abortManager.loadPartners('new');
    resolveOld({ success: true, data: [{ id: 21, name: '늦은 응답' }] });
    await Promise.all([oldRequest, newRequest]);
    assert.equal(firstSignal.aborted, true);
    assert.deepEqual(state.partners.map(p => p.id), [22]);
    assert.equal(abortToasts.length, 0);
    assert.equal(abortManager.validId('0x10'), null);
    assert.equal(abortManager.validId('1e3'), null);
    assert.equal(abortManager.validId(' 10 '), null);
    assert.equal(abortManager.validId('-1'), null);
    assert.equal(abortManager.validId('10'), 10);
    console.log('partners_contract.test.js: ok');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
