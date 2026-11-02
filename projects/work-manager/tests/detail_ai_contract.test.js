const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const detailSource = fs.readFileSync('static/js/modules/detail-ai.js', 'utf8');
const templateSource = fs.readFileSync('templates/index.html', 'utf8');
const configSource = fs.readFileSync('config.py', 'utf8');

assert.match(detailSource, /['\"]\.csv['\"]/);
assert.doesNotMatch(detailSource, /['\"]\.gif['\"]/);
assert.match(templateSource, /detail-ai-files[^>]+accept="[^"]*\.csv/);
assert.doesNotMatch(configSource, /AI_PLAN_ALLOWED_EXTENSIONS[\s\S]*?['\"]\.gif['\"]/);

function makeDom() {
    const values = {};
    const modal = { classList: { contains: () => true } };
    const container = { style: {}, replaceChildren() { this.children = []; }, appendChild(child) { (this.children ||= []).push(child); } };
    const listeners = {};
    const documentRef = { __detailAiActionsBound: false, listeners, getElementById(id) { return id === 'modal-project-detail' ? modal : values[id] || null; }, createElement() { return { dataset: {}, style: {}, classList: { add() {} }, append() {}, appendChild() {} }; }, addEventListener(type, fn) { listeners[type] = fn; } };
    values['detail-ai-prompt'] = { value: '' }; values['detail-ai-files'] = { value: '' }; values['detail-ai-attached-chips'] = container; values['detail-ai-file-count'] = { style: {}, textContent: '' }; values['btn-detail-ai-submit'] = { disabled: false }; values['detail-ai-feedback-bubble'] = { style: {} }; values['detail-ai-feedback-text'] = { textContent: '' };
    return documentRef;
}

async function run() {
    const documentRef = makeDom();
    const state = { currentProject: { project_no: '260824-001' }, detailAiFiles: [] };
    let calls = 0; let resolve; let reject; let rejectNext = false; let captured;
    const api = { modifyProjectWithAi: async (_projectNo, formData) => {
        calls += 1; captured = formData;
        if (rejectNext) { rejectNext = false; throw new Error('temporary'); }
        return new Promise((r, j) => { resolve = r; reject = j; });
    } };
    class FormDataFake { constructor() { this.parts = []; } append(name, value) { this.parts.push([name, value]); } }
    let rendered = 0;
    const context = { window: {}, document: documentRef, FormData: FormDataFake, console, confirm: () => true,
        AIPlanUI: { render(response, target, options) { rendered += 1; assert.equal(response.plan_id, 'p1'); assert.equal(options.name, 'detail:260824-001'); assert.ok(target); return response.plan_id; } } };
    context.window = context;
    vm.runInNewContext(fs.readFileSync('static/js/modules/detail-ai.js', 'utf8'), context, { filename: 'detail-ai.js' });
    const manager = context.DetailAiManager.init({ state, api, documentRef, showToast() {} });
    manager.setContext('260824-001');
    const file = { name: '<xss>.png', size: 10, lastModified: 1 };
    assert.equal(manager.addFiles([file]), true);
    assert.equal(documentRef.getElementById('detail-ai-attached-chips').children.length, 1);
    documentRef.getElementById('detail-ai-prompt').value = '변경';
    const first = manager.submit(); const second = manager.submit();
    assert.equal(calls, 1);
    resolve({ success: true, requires_confirmation: true, plan_id: 'p1', confirmation_token: 't1', reply: '<unsafe>' });
    await Promise.all([first, second]);
    assert.equal(rendered, 1, 'valid preview must be registered with AIPlanUI');
    assert.deepEqual(captured.parts.map(([name, value]) => [name, value?.name || value]), [
        ['message', '변경'], ['project_no', '260824-001'], ['external_ai_consent', 'true'], ['files', '<xss>.png']
    ]);
    documentRef.listeners.keydown({ target: documentRef.getElementById('detail-ai-prompt'), key: 'Enter', shiftKey: true, preventDefault() { this.prevented = true; } });
    assert.equal(calls, 1);

    rejectNext = true;
    documentRef.getElementById('detail-ai-prompt').value = '재시도';
    assert.equal(await manager.submit(), null);
    assert.equal(calls, 2, 'failed request must unlock retry');
    documentRef.getElementById('detail-ai-prompt').value = '성공 재시도';
    const retry = manager.submit();
    assert.equal(calls, 3);
    resolve({ success: true, requires_confirmation: true, plan_id: 'p2', confirmation_token: 't2' });
    await retry;

    documentRef.getElementById('detail-ai-prompt').value = '오래된 요청';
    const late = manager.submit();
    assert.equal(calls, 4);
    manager.invalidateContext();
    manager.setContext('260824-001');
    documentRef.getElementById('detail-ai-prompt').value = '새 화면';
    const renderedBeforeLate = rendered;
    resolve({ success: true, requires_confirmation: true, plan_id: 'late', confirmation_token: 'late-token' });
    await late;
    assert.equal(rendered, renderedBeforeLate, 'close/reopen must ignore late detail AI response');
    console.log('detail_ai_contract.test.js: ok');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
