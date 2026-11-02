const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadUi() {
    const listeners = {};
    const document = {
        addEventListener(type, fn) { listeners[type] = fn; },
        querySelectorAll() { return []; },
        createElement() { return { innerHTML: '', insertAdjacentHTML() {} }; }
    };
    const context = { window: {}, document, CSS: { escape: value => value }, console };
    context.window.window = context.window;
    context.window.API = { applyAiPlan: async () => ({ success: true }), cancelAiPlan: async () => ({ success: true }) };
    vm.runInNewContext(fs.readFileSync('static/js/modules/ai-plan-ui.js', 'utf8'), context);
    return { ui: context.window.AIPlanUI, context };
}

async function run() {
    const appSource = fs.readFileSync('static/js/app.js', 'utf8');
    const globalSource = fs.readFileSync('static/js/modules/global-ai-commander.js', 'utf8');
    assert.doesNotMatch(appSource, /state\.currentProject\s*=\s*updatedProj/);
    assert.match(appSource, /AI 변경 제안을 확인할 수 없는 응답입니다/);
    assert.doesNotMatch(globalSource, /btn-remove-chip[^\n]*onclick=/);
    assert.match(globalSource, /function renderSafeFallback/);
    assert.doesNotMatch(globalSource, /insertAdjacentHTML/);
    const { ui, context } = loadUi();
    const response = { requires_confirmation: true, plan_id: 'p1', confirmation_token: 'secret', proposed_updates: { memo: 'x' } };
    const target = { html: '', insertAdjacentHTML(_position, value) { this.html += value; } };
    assert.equal(ui.render(response, target), 'p1');
    assert.match(target.html, /아직 적용 안 됨/);
    assert.doesNotMatch(target.html, /secret/);
    assert.doesNotMatch(target.html, /onclick|onerror|javascript:/i);
    assert.equal(ui.validAction({ type: 'open_project', project_no: '260824-001' }), true);
    assert.equal(ui.validAction({ type: 'open_project', project_no: 'bad' }), false);
    assert.equal(ui.validAction({ type: 'run_script', project_no: '260824-001' }), false);
    assert.equal(ui.size(), 1);
    assert.equal(Object.prototype.hasOwnProperty.call(ui, 'plans'), false);
    assert.equal(target.html.includes('secret'), false);
    ui.clear('p1');
    assert.equal(ui.size(), 0);

    ui.register({ requires_confirmation: true, plan_id: 'p2', confirmation_token: 't2' }, { name: 'detail:260824-001' });
    context.window.API.applyAiPlan = async () => ({ success: false, error: 'temporary' });
    assert.equal(await ui.apply('p2'), null);
    assert.equal(ui.size(), 1, 'HTTP 200 success:false must retain retry state');
    context.window.API.applyAiPlan = async () => ({ success: true, status: 'applied', partial: true, warnings: ['one'] });
    const partial = await ui.apply('p2');
    assert.equal(partial.success, true);
    assert.equal(ui.size(), 0);

    ui.register({ requires_confirmation: true, plan_id: 'global', confirmation_token: 'g' }, 'global');
    ui.register({ requires_confirmation: true, plan_id: 'detail', confirmation_token: 'd' }, 'detail:260824-002');
    await ui.cancelContext('global');
    assert.equal(ui.size(), 1, 'global reset must not clear detail plans');
    ui.clearAll();

    let resolveApply;
    let appliedCallback = 0;
    context.window.API.applyAiPlan = () => new Promise(resolve => { resolveApply = resolve; });
    let current = true;
    ui.register({ requires_confirmation: true, plan_id: 'late', confirmation_token: 'late-token' }, {
        name: 'detail:late', isCurrent: () => current, onApplied: () => { appliedCallback += 1; }
    });
    const latePromise = ui.apply('late');
    current = false;
    resolveApply({ success: true, status: 'applied' });
    await latePromise;
    assert.equal(appliedCallback, 0, 'late response must not invoke a closed-context callback');
    console.log('ai_plan_ui_contract.test.js: ok');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
