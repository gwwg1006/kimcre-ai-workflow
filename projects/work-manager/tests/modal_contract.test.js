const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let active = true;
const modal = { classList: { add() { active = true; }, remove() { active = false; }, contains() { return active; } }, querySelector() { return null; }, _triggerElement: null };
const context = {
    document: { activeElement: null, getElementById(id) { return id === 'modal-project-detail' ? modal : null; } },
    state: { currentProject: { project_no: '260824-001' } },
    AIPlanUI: { cancelContext: async () => {} },
    ProjectActions: { get: () => ({ invalidateContext: () => { context.invalidated = true; } }) },
    ProjectEditor: { get: () => ({ invalidate: () => { context.editorInvalidations = (context.editorInvalidations || 0) + 1; } }) },
    saveDetailItems: () => { throw new Error('implicit save'); },
    setTimeout,
    console
};
context.window = context;
vm.runInNewContext(fs.readFileSync('static/js/modules/modal.js', 'utf8'), context, { filename: 'modal.js' });
context.closeModal('modal-project-detail');
assert.equal(typeof context.openModal, 'function');
assert.equal(context.invalidated, true);
assert.equal(context.editorInvalidations, 1);
context.closeModal('modal-project-detail');
assert.equal(context.editorInvalidations, 1);
console.log('modal_contract.test.js: ok');
