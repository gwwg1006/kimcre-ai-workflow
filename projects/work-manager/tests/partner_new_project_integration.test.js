const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const createPartnerManager = require('../static/js/modules/partners.js');

class FakeElement {
    constructor(id) {
        this.id = id;
        this.value = '';
        this.textContent = '';
        this.innerHTML = '';
        this.dataset = {};
        this.style = {};
        this.listeners = {};
        this.children = [];
    }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    querySelectorAll(selector) { return selector === 'tr' ? this.children : []; }
    querySelector() { return null; }
    appendChild(child) { this.children.push(child); }
    reset() { this.value = ''; }
}

function makeDocument() {
    const nodes = new Map();
    const ids = [
        'new-project-items-tbody', 'new-project-file-list', 'new-project-files',
        'btn-open-new-project', 'new-partner-options', 'new-partner-search',
        'new-partner-id', 'new-client-name', 'new-contact-name', 'new-phone', 'new-zipcode',
        'new-address', 'new-detail-address', 'new-partner-hint',
        'form-new-project', 'new-shipping-fee', 'new-tax-type',
        'partners-table-body', 'partners-empty-state', 'partners-search', 'form-partner'
    ];
    ids.forEach(id => nodes.set(id, new FakeElement(id)));
    nodes.get('new-shipping-fee').value = '0';
    nodes.get('new-tax-type').value = '면세';
    return {
        nodes,
        getElementById: id => nodes.get(id) || null,
        addEventListener() {}
    };
}

const documentRef = makeDocument();
const state = { partners: [], selectedNewFiles: [], aiAttachedFiles: [], aiChatHistory: [] };
const windowRef = { API: {}, showToast() {}, openModal() {}, closeModal() {} };
const pricing = {
    parseInteger(value, options = {}) { const number = Number(value); return Number.isSafeInteger(number) && number >= (options.min || 0) ? number : null; },
    calculateItems() { return { quantity: 0, subtotal: 0, valid: true }; },
    calculateAmounts() { return { subtotal: 0, total: 0, vat: 0, valid: true }; }
};
vm.runInNewContext(fs.readFileSync('static/js/modules/new-project.js', 'utf8'), {
    window: windowRef,
    document: documentRef,
    console,
    Date,
    FormData: class {}
});
const newProject = windowRef.NewProjectManager.init({ state, api: windowRef.API, documentRef, pricing, showToast() {} });
let selectionCalls = 0;
const selectPartner = newProject.selectPartner;
newProject.selectPartner = partner => { selectionCalls += 1; selectPartner(partner); };

let requestOptions;
const api = {
    getPartners: async (_search, _includeInactive, options) => {
        requestOptions = options;
        return {
            success: true,
            data: [{
                id: 1,
                name: 'E2E테스트거래처',
                contact_name: '테스트담당',
                phone: '010-0000-0000',
                zipcode: '12345',
                address: '테스트로 1',
                detail_address: '101호',
                is_active: true
            }]
        };
    }
};
const partnerWindow = { NewProjectManager: { get: () => newProject } };
const partners = createPartnerManager({ state, api, documentRef, windowRef: partnerWindow, selectNewPartner: partner => newProject.selectPartner(partner), showToast() {} });
partners.init();

(async () => {
    await partners.loadPartners('');
    assert.ok(requestOptions?.signal, 'loadPartners must use the API request path with an AbortSignal');
    const picker = documentRef.nodes.get('new-partner-search');
    picker.value = 'E2E테스트거래처 · 테스트담당';
    for (const handler of picker.listeners.input || []) handler({ target: picker });
    for (const handler of picker.listeners.change || []) handler({ target: picker });

    assert.equal(selectionCalls, 1, 'input/change for one datalist choice must select once');
    assert.equal(String(documentRef.nodes.get('new-partner-id').value), '1');
    assert.equal(documentRef.nodes.get('new-client-name').value, 'E2E테스트거래처');
    assert.equal(documentRef.nodes.get('new-contact-name').value, '테스트담당');
    assert.equal(documentRef.nodes.get('new-phone').value, '010-0000-0000');
    assert.equal(documentRef.nodes.get('new-zipcode').value, '12345');
    assert.equal(documentRef.nodes.get('new-address').value, '테스트로 1');
    assert.equal(documentRef.nodes.get('new-detail-address').value, '101호');
    console.log('partner_new_project_integration.test.js: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
