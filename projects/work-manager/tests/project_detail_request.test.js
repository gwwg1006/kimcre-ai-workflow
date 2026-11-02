const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
    return {
        value: '', textContent: '', innerHTML: '', style: {},
        classList: { add() {}, remove() {}, contains() { return false; } },
        querySelector() { return null; }, querySelectorAll() { return []; },
        setAttribute() {}, removeAttribute() {}, focus() {}
    };
}

const nodes = new Map();
const documentRef = {
    __projectDetailActionsBound: false,
    addEventListener() {},
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }
};
const state = { currentProject: null, detailAiFiles: [] };
const pending = new Map();
const toasts = [];
const opened = [];
const context = {
    window: {}, document: documentRef, state, console, URL, AbortController,
    escapeHtml: value => String(value ?? ''), renderDetailItems() {}, updateTabBadges() {},
    renderProjectFiles() {}, renderDetailAiAttachedChips() {}, closeModal() {},
    openModal: id => opened.push(id), showToast: message => toasts.push(message),
    ProjectActions: { get: () => ({ setContext() {} }) },
    ProjectEditor: { get: () => ({ setContext() {} }) },
    DeliveryManager: { get: () => ({ setContext() {} }) },
    DetailAiManager: { get: () => ({ setContext() {} }) }
};
context.window = context;
context.API = {
    getProjectDetail(no, options) {
        return new Promise((resolve, reject) => pending.set(no, { resolve, reject, signal: options.signal }));
    }
};
vm.runInNewContext(fs.readFileSync('static/js/modules/project-detail.js', 'utf8'), context, { filename: 'project-detail.js' });

const project = no => ({ project_no: no, client_name: no, job_name: '작업', items: [] });

(async () => {
    const first = context.openProjectDetail('260824-001');
    const second = context.openProjectDetail('260824-002');
    assert.equal(pending.get('260824-001').signal.aborted, true);
    pending.get('260824-002').resolve({ success: true, data: project('260824-002') });
    await second;
    pending.get('260824-001').resolve({ success: true, data: project('260824-001') });
    await first;
    assert.equal(state.currentProject.project_no, '260824-002');
    assert.deepEqual(opened, ['modal-project-detail']);

    const closed = context.openProjectDetail('260824-003');
    context.invalidateProjectDetailRequest();
    assert.equal(pending.get('260824-003').signal.aborted, true);
    pending.get('260824-003').resolve({ success: true, data: project('260824-003') });
    await closed;
    assert.equal(state.currentProject.project_no, '260824-002');
    assert.deepEqual(opened, ['modal-project-detail']);

    const aborted = context.openProjectDetail('260824-004');
    pending.get('260824-004').reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    await aborted;
    assert.equal(toasts.length, 0);

    const failed = context.openProjectDetail('260824-005');
    pending.get('260824-005').reject(new Error('offline'));
    await failed;
    assert.equal(toasts.length, 1);
    const mismatch = context.openProjectDetail('260824-006');
    pending.get('260824-006').resolve({ success: true, data: project('260824-007') });
    await mismatch;
    assert.equal(state.currentProject.project_no, '260824-002');
    assert.equal(toasts.length, 2);
    console.log('project_detail_request.test.js: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
