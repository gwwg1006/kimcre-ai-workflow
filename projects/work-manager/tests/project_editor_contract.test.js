const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function dom() {
    const values = {};
    const listeners = {};
    const documentRef = { listeners, __projectEditorActionsBound: false, getElementById(id) { return values[id] || null; }, addEventListener(type, fn) { listeners[type] = fn; } };
    for (const id of ['edit-client-name','edit-contact-name','edit-job-name','edit-received-date','edit-channel','edit-due-date','edit-material','edit-color','edit-quantity','edit-shipping-fee','edit-model-fee','edit-tax-type','edit-phone','edit-zipcode','edit-address','edit-detail-address','edit-request-notes','edit-memo']) values[id] = { value: '' };
    values['btn-save-project-info'] = { disabled: false }; values['detail-prod-status'] = { value: '접수' }; values['detail-pay-status'] = { value: '미청구' }; values['detail-deliv-status'] = { value: '미정' };
    return { documentRef, values };
}
async function run() {
    const { documentRef, values } = dom();
    const state = { currentProject: { project_no: '260824-001', client_name: 'old', job_name: 'job', quantity: 1, shipping_fee: 0, model_fee: 0, quote_amount: 100, post_process_fee: 0, paid_amount: 0, tax_type: '면세', prod_status: '접수', pay_status: '미청구', deliv_status: '미정' } };
    let saveCalls = 0; let resolveSave;
    const pricing = { parseInteger(value, opts) { if (!/^\d+$/.test(String(value))) return null; const n = Number(value); return Number.isSafeInteger(n) && n >= (opts.min || 0) ? n : null; }, calculateAmounts({ quoteAmount, shippingFee, modelFee, postProcessFee, paidAmount }) { const subtotal = quoteAmount + shippingFee + modelFee + postProcessFee; const valid = [subtotal, paidAmount].every(Number.isSafeInteger); return { valid, total: subtotal, unpaid: Math.max(0, subtotal - paidAmount) }; } };
    const api = { updateProject: async () => { saveCalls += 1; return new Promise(resolve => { resolveSave = resolve; }); }, updateStatus: async (no, type, value) => ({ success: true, data: { ...state.currentProject, project_no: no, [type]: value } }) };
    const context = { window: {}, document: documentRef, console }; context.window = context;
    vm.runInNewContext(fs.readFileSync('static/js/modules/project-editor.js', 'utf8'), context, { filename: 'project-editor.js' });
    const manager = context.ProjectEditor.init({ state, api, pricing, documentRef, showToast() {}, calculate: () => ({ totals: { valid: true }, amount: { valid: true } }), render(project) { state.currentProject = project; } });
    manager.fill();
    values['edit-quantity'].value = '2'; values['edit-shipping-fee'].value = '0'; values['edit-model-fee'].value = '10';
    const one = manager.save({ preventDefault() {} }); const two = manager.save({ preventDefault() {} });
    assert.equal(saveCalls, 1); manager.setContext(state.currentProject.project_no); resolveSave({ success: true, data: { ...state.currentProject, quantity: 2 } }); await Promise.all([one, two]);
    assert.equal(state.currentProject.quantity, 1);
    values['detail-prod-status'].value = '악성 상태'; await manager.updateStatus('prod_status', '악성 상태'); assert.equal(state.currentProject.prod_status, '접수');
    values['edit-quantity'].value = '2.5'; const invalid = await manager.save({ preventDefault() {} }); assert.equal(invalid, null);
    assert.equal(await manager.updateTaxType('비과세'), null);
    assert.equal(await manager.updateShipping('1.5'), null);
    values['edit-quantity'].value = '2'; values['edit-phone'].value = ''; values['edit-address'].value = '';
    const clearApi = { updateProject: async (no, data) => { assert.equal(data.phone, ''); assert.equal(data.address, ''); return { success: true, data: { ...state.currentProject, ...data } }; }, updateStatus: api.updateStatus };
    const latest = context.ProjectEditor.init({ state, api: clearApi, pricing, documentRef, showToast() {} });
    await latest.save({ preventDefault() {} });
    values['edit-client-name'].value = '';
    assert.equal(await latest.save({ preventDefault() {} }), null);
    values['edit-client-name'].value = 'old';
    values['edit-quantity'].value = '999999999999999999999999999';
    assert.equal(await latest.save({ preventDefault() {} }), null);
    assert.equal(await documentRef.listeners.submit({ target: { id: 'form-edit-project-info' }, preventDefault() {} }), null);
    console.log('project_editor_contract.test.js: ok');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
