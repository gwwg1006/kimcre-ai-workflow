const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('static/js/modules/project-actions.js', 'utf8');
function make(options = {}) {
    const root = { confirm: () => true, openModal() {} };
    vm.runInContext(source, vm.createContext({ window: root, console }));
    const state = options.state || { currentProject: { project_no: '260824-001', client_name: '고객', job_name: '작업' } };
    const actions = root.ProjectActions.init({ state, api: options.api, confirmFn: options.confirmFn || (() => true), documentRef: options.documentRef, loadSTLModel: options.loadSTLModel });
    return { actions, state, root };
}

test('complete/delete lock duplicate calls and stale responses do not mutate current project', async () => {
    let resolveComplete; let completeCalls = 0; let deleteCalls = 0;
    const api = {
        completeProject: () => { completeCalls += 1; return new Promise(resolve => { resolveComplete = resolve; }); },
        deleteProject: async () => { deleteCalls += 1; return { success: true }; }, openProject3MF: async () => ({ success: true }), openFile() {}
    };
    const { actions, state } = make({ api });
    const first = actions.complete(); const duplicate = actions.complete(); assert.equal(completeCalls, 1); assert.equal(await duplicate, null);
    state.currentProject = { project_no: '260824-002', client_name: '다른 고객', job_name: '다른 작업' };
    resolveComplete({ success: true, data: { project_no: '260824-001' } }); await first;
    assert.equal(state.currentProject.project_no, '260824-002');
    state.currentProject = { project_no: '260824-003', client_name: '삭제 고객', job_name: '삭제 작업' };
    const d1 = actions.deleteProject('260824-003', '삭제 고객', '삭제 작업'); const d2 = actions.deleteProject('260824-003', '삭제 고객', '삭제 작업');
    assert.equal(await d2, null); await d1; assert.equal(deleteCalls, 1);
});

test('delete stale response and same-number reopen are ignored', async () => {
    let resolveDelete; let refreshes = 0;
    const api = { completeProject: async () => ({}), openProject3MF: async () => ({}), openFile() {}, deleteProject: () => new Promise(resolve => { resolveDelete = resolve; }) };
    const state = { currentProject: { project_no: '260824-010', client_name: '고객', job_name: '작업' } };
    const { actions } = make({ api, state });
    actions.setContext('260824-010'); const request = actions.deleteProject('260824-010', '고객', '작업');
    actions.setContext('260824-010'); resolveDelete({ success: true }); await request; assert.equal(state.currentProject.project_no, '260824-010'); assert.equal(refreshes, 0);
});

test('error unlocks complete for retry and 3MF lock prevents duplicate open', async () => {
    let completeCalls = 0; let openCalls = 0; let fail = true;
    const api = { completeProject: async () => { completeCalls += 1; if (fail) { fail = false; throw new Error('x'); } return { success: true, data: {} }; }, openProject3MF: async () => { openCalls += 1; await new Promise(resolve => setTimeout(resolve, 5)); return { success: true }; }, deleteProject: async () => ({ success: true }), openFile() {} };
    const { actions } = make({ api });
    await actions.complete(); await actions.complete(); assert.equal(completeCalls, 2);
    await Promise.all([actions.open3mf('260824-001'), actions.open3mf('260824-001')]); assert.equal(openCalls, 1);
});

test('preview uses exact openFile contract and prevents duplicate system opens', async () => {
    let openCalls = 0; let resolveOpen;
    const calls = []; const button = {};
    const documentRef = { getElementById: id => id === 'btn-open-stl-system' ? button : { textContent: '' } };
    const api = { completeProject: async () => ({}), deleteProject: async () => ({}), openProject3MF: async () => ({}), openFile: (...args) => { openCalls += 1; calls.push(args); return new Promise(resolve => { resolveOpen = resolve; }); } };
    let resolvePreview; let previewCalls = 0;
    const { actions } = make({ api, documentRef, loadSTLModel: () => { previewCalls += 1; return new Promise(resolve => { resolvePreview = resolve; }); } });
    const preview1 = actions.preview('03_슬라이싱_3MF', 'part.stl'); const preview2 = actions.preview('03_슬라이싱_3MF', 'part.stl'); assert.equal(await preview2, null); assert.equal(previewCalls, 1);
    resolvePreview(); await preview1; button.onclick(); button.onclick(); assert.equal(openCalls, 1);
    resolveOpen({ success: true }); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls[0], ['260824-001', '03_슬라이싱_3MF', 'part.stl', false]);
});

test('invalid project number is rejected and dashboard delete wrapper delegates', async () => {
    let calls = 0; const api = { deleteProject: async () => { calls += 1; return { success: true }; }, completeProject: async () => ({}), openProject3MF: async () => ({}), openFile() {} };
    const { actions } = make({ api }); assert.equal(await actions.deleteProject('../etc'), null); assert.equal(calls, 0);
});

test('invalidateContext blocks a late response after detail close', async () => {
    let resolve; let refreshes = 0;
    const api = { completeProject: () => new Promise(r => { resolve = r; }), deleteProject: async () => ({}), openProject3MF: async () => ({}), openFile() {} };
    const state = { currentProject: { project_no: '260824-020', client_name: '고객', job_name: '작업' } };
    const { actions } = make({ api, state });
    actions.setContext('260824-020');
    const request = actions.complete();
    actions.invalidateContext();
    resolve({ success: true, data: { project_no: '260824-020' } });
    await request;
    assert.equal(refreshes, 0);
    assert.equal(state.currentProject.project_no, '260824-020');
});

console.log('project_actions_contract.test.js: ok');
