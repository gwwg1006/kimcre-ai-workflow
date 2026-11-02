const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('static/js/modules/new-project.js', 'utf8');
const app = fs.readFileSync('static/js/app.js', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');
assert.match(source, /data-new-file-action/);
assert.doesNotMatch(source, /onclick=/);
assert.match(source, /data\.delete\('files'\)/);
assert.match(source, /data\.append\('files', file\)/);
assert.match(source, /isSubmitting/);
assert.match(source, /clearPartner/);
assert.match(source, /pricing\.calculateAmounts/);
assert.doesNotMatch(source, /customer_snapshot/);
assert.match(source, /generation/);
assert.doesNotMatch(app, /legacy implementation retained/);
assert.doesNotMatch(app, /new-item-(?:name|material|color|qty|price)[^>]*oninput=/);
assert.match(template, /data-new-action="(?:add-item|add-items-from-files|calculate)"/);
assert.match(template, /name="contact_name" id="new-contact-name"/);
assert.match(source, /contact_name:'new-contact-name'/);

// Execute the manager with a tiny fake DOM: overflow must stop createProject,
// while the submit lock allows one request and a failed request can retry.
(async () => {
const vm = require('node:vm');
const managerSource = source;
class FakeElement {
  constructor(id) { this.id = id; this.value = ''; this.textContent = ''; this.innerHTML = ''; this.dataset = {}; this.listeners = {}; this.children = []; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  querySelectorAll(selector) { return selector === 'tr' ? this.children : []; }
  querySelector(selector) { return this.fields?.[selector] || null; }
  appendChild(child) { this.children.push(child); }
  reset() { this.value = ''; }
}
function makeDoc() {
  const nodes = new Map();
  const ids = ['new-project-items-tbody', 'form-new-project', 'new-shipping-fee', 'new-tax-type', 'new-project-file-list', 'new-client-name', 'new-contact-name', 'new-partner-id', 'new-partner-search', 'new-phone', 'new-zipcode', 'new-address', 'new-detail-address', 'new-partner-hint'];
  ids.forEach(id => nodes.set(id, new FakeElement(id)));
  nodes.get('new-shipping-fee').value = '0'; nodes.get('new-tax-type').value = '면세';
  const doc = { getElementById: id => nodes.get(id) || null, createElement: tag => { const e = new FakeElement(tag); e.fields = { '.new-item-name': new FakeElement('name'), '.new-item-qty': new FakeElement('qty'), '.new-item-price': new FakeElement('price'), '.new-item-material': new FakeElement('material'), '.new-item-color': new FakeElement('color'), '.new-item-note': new FakeElement('note') }; return e; }, addEventListener() {} };
  return { doc, nodes };
}
function runManager(pricing, api, state = { partners: [] }, confirmFn = () => false, refresh) {
  const { doc, nodes } = makeDoc();
  const sandboxWindow = { API: api, Pricing: pricing, showToast() {}, closeModal() {}, loadDashboard() {}, openProjectDetail() {} };
  const fieldNames = { 'new-client-name': 'client_name', 'new-contact-name': 'contact_name', 'new-phone': 'phone', 'new-zipcode': 'zipcode', 'new-address': 'address', 'new-detail-address': 'detail_address' };
  vm.runInNewContext(managerSource, { window: sandboxWindow, document: doc, FormData: class { constructor() { this.values = Object.entries(fieldNames).map(([id, name]) => [name, nodes.get(id)?.value || '']); } set(k, v) { this.values = this.values.filter(([key]) => key !== k); this.values.push([k, v]); } delete(k) { this.values = this.values.filter(([key]) => key !== k); } append(k, v) { this.values.push([k, v]); } } });
  const manager = sandboxWindow.NewProjectManager.init({ state, api, documentRef: doc, pricing, showToast() {}, confirmFn, partnerAdapter: refresh ? { refresh } : {} });
  manager.add('part', 'PLA', 'White', 1, 1);
  const row = nodes.get('new-project-items-tbody').children[0];
  row.fields['.new-item-name'].value = 'part'; row.fields['.new-item-qty'].value = '1'; row.fields['.new-item-price'].value = '1';
  return { manager, nodes };
}
let calls = 0;
const overflowPricing = { parseInteger: (v, opts = {}) => Number(v) >= (opts.min || 0) ? Number(v) : null, toInteger: v => Number(v) || 0, calculateItems: () => ({ quantity: 1, subtotal: Number.MAX_SAFE_INTEGER + 1, valid: false, error: 'amount_overflow' }), calculateAmounts: () => ({ subtotal: 0, total: 0, vat: 0, valid: false, error: 'amount_overflow' }) };
const overflowRun = runManager(overflowPricing, { createProject: async () => { calls += 1; return { success: true }; } });
assert.equal(await overflowRun.manager.submit({ preventDefault() {} }), null);
assert.equal(calls, 0, 'overflow must not call createProject');
let responses = [{ success: false, error: 'temporary' }, { success: true, message: 'ok', data: { project_no: '260824-001' } }];
const validPricing = { parseInteger: (v, opts = {}) => Number(v) >= (opts.min || 0) ? Number(v) : null, toInteger: v => Number(v) || 0, calculateItems: () => ({ quantity: 1, subtotal: 1, valid: true, error: null }), calculateAmounts: () => ({ subtotal: 1, total: 1, vat: 0, valid: true, error: null }) };
let refreshCalls = 0; let refreshCreateCalls = 0;
const refreshRun = runManager(validPricing, { createProject: async () => { refreshCreateCalls += 1; return { success: true }; } }, { partners: [] }, () => false, async () => { refreshCalls += 1; throw new Error('offline'); });
await refreshRun.manager.submit({ preventDefault() {} });
assert.equal(refreshCalls, 1); assert.equal(refreshCreateCalls, 0, 'partner refresh failure must stop createProject');
const retryApi = { createProject: async () => { calls += 1; return responses.shift(); } };
const retryRun = runManager(validPricing, retryApi);
const first = retryRun.manager.submit({ preventDefault() {} });
assert.equal(await retryRun.manager.submit({ preventDefault() {} }), null, 'double submit is locked');
await first; await retryRun.manager.submit({ preventDefault() {} });
assert.equal(calls, 2, 'failed submit can retry exactly once');
let captured;
const fileRun = runManager(validPricing, { createProject: async data => { captured = data; return { success: true, message: 'ok' }; } });
fileRun.manager.addFiles([{ name: 'part.stl', size: 10 }, { name: 'part.stl', size: 10 }, { name: 'part.stl', size: 11 }]);
await fileRun.manager.submit({ preventDefault() {} });
assert.equal(captured.values.filter(([key]) => key === 'files').length, 2, 'same name+size is deduped, revised size is retained');
const yesRun = runManager(validPricing, { createProject: async data => { captured = data; return { success: true }; } }, { partners: [{ id: 7, name: 'Same', contact_name: '담당 기본값', phone: '010-기본', zipcode: '12345', address: '기본 주소', detail_address: '기본 상세' }] }, () => true);
yesRun.nodes.get('new-client-name').value = 'Same'; yesRun.nodes.get('new-partner-id').value = '';
yesRun.nodes.get('new-phone').value = '프로젝트 전화';
await yesRun.manager.submit({ preventDefault() {} });
assert.deepEqual(captured.values.find(([key]) => key === 'partner_id'), ['partner_id', '7'], 'duplicate confirm yes links partner');
assert.deepEqual(captured.values.find(([key]) => key === 'contact_name'), ['contact_name', '담당 기본값'], 'duplicate link fills empty contact snapshot');
assert.deepEqual(captured.values.find(([key]) => key === 'phone'), ['phone', '프로젝트 전화'], 'duplicate link preserves project phone');
const injectedConfirm = runManager(validPricing, { createProject: async () => ({ success: true }) }, {}, () => true);
assert.equal(injectedConfirm.manager.confirmOverwrite('overwrite'), true, 'AI overwrite uses injected manager confirmation');
const selected = runManager(validPricing, { createProject: async () => ({ success: true }) }, { partners: [{ id: 17, name: '거래처', phone: '010', zipcode: '123', address: '도로', detail_address: '101호' }] });
selected.manager.selectPartner(selected.manager ? { id: 17, name: '거래처', contact_name: '담당자', phone_number: '010-0000-0000', zipcode: '123', address: '도로', detail_address: '101호' } : null);
assert.equal(String(selected.nodes.get('new-partner-id').value), '17');
assert.equal(selected.nodes.get('new-client-name').value, '거래처');
assert.equal(selected.nodes.get('new-phone').value, '010-0000-0000');
assert.equal(selected.nodes.get('new-contact-name').value, '담당자');
assert.equal(selected.nodes.get('new-detail-address').value, '101호');
assert.match(selected.nodes.get('new-partner-hint').textContent, /정보를 불러왔습니다/);
selected.nodes.get('new-contact-name').value = '프로젝트 담당자';
selected.manager.partnerChanged();
assert.equal(String(selected.nodes.get('new-partner-id').value), '17', 'project snapshot edits keep partner connection');
assert.match(selected.nodes.get('new-partner-hint').textContent, /연결 유지/);
console.log('new_project_contract.test.js: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
