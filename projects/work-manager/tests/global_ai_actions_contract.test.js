const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const listeners = {};
const deliveryField = { scrollIntoViewCalls: 0, focusCalls: 0, scrollIntoView() { this.scrollIntoViewCalls += 1; }, focus() { this.focusCalls += 1; } };
const documentRef = {
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    getElementById(id) { return id === 'detail-tracking-no' ? deliveryField : null; },
    querySelectorAll() { return []; }
};
const state = { currentProject: null };
const events = [];
const context = { window: {}, document: documentRef, state, console, showToast: message => events.push(['toast', message]) };
context.window = context;
context.openProjectDetail = async projectNo => { events.push(['detail', projectNo]); state.currentProject = { project_no: projectNo }; return { success: true, data: state.currentProject }; };
context.openProject3MF = projectNo => events.push(['3mf', projectNo]);
context.openEstimateModal = docType => events.push(['estimate', docType]);
context.openNewProjectModal = () => events.push(['new']);
vm.runInNewContext(fs.readFileSync('static/js/modules/global-ai-commander.js', 'utf8'), context, { filename: 'global-ai-commander.js' });

async function click(type, projectNo) {
    const button = { dataset: { globalAiAction: type, ...(projectNo ? { projectNo } : {}) }, closest(selector) { return selector === '[data-global-ai-action]' ? this : null; } };
    await Promise.all((listeners.click || []).map(listener => listener({ target: button, preventDefault() {} })));
}

(async () => {
    await click('generate_estimate', '260824-001');
    assert.deepEqual(events.slice(0, 2), [['detail', '260824-001'], ['estimate', 'integrated']]);
    await click('open_delivery', '260824-001');
    assert.equal(deliveryField.scrollIntoViewCalls, 1);
    assert.equal(deliveryField.focusCalls, 1);
    await click('open_3mf', '260824-001');
    assert.deepEqual(events[3], ['3mf', '260824-001']);
    await click('new_project');
    assert.deepEqual(events[4], ['new']);
    await click('generate_estimate');
    assert.equal(events.at(-1)[0], 'toast');
    console.log('global_ai_actions_contract.test.js: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
