const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeDom() {
    const listeners = {};
    const container = {
        innerHTML: '',
        listeners,
        addEventListener(type, handler) { listeners[type] = handler; },
        contains(node) { return node === this._button; }
    };
    const documentRef = { getElementById(id) { return id === 'tab-files-container' ? container : null; } };
    return { container, documentRef };
}

async function run() {
    const { container, documentRef } = makeDom();
    let openCalls = 0;
    const context = {
        document: documentRef,
        state: { currentTab: 'received', currentProject: { project_no: '260824-001', tabs: { received: { files: [{
            path: "/tmp/secret/'\\\n<svg onload=alert(1)>",
            name: "bad'\\\n<svg onload=alert(1)>", ext: '.stl', category: 'other', formatted_size: '1 KB', mtime: 'today'
        }] } } } },
        escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); },
        API: { openFile: async () => { openCalls += 1; return { success: true }; } },
        previewSTL() {},
        handleBumpVersion() {},
        handleDeleteFile() {},
        console
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync('static/js/modules/file-manager.js', 'utf8'), context, { filename: 'file-manager.js' });
    context.renderProjectFiles();
    assert.equal(container.innerHTML.includes('onclick='), false);
    assert.equal(container.innerHTML.includes(context.state.currentProject.tabs.received.files[0].path), false);
    assert.equal(container.innerHTML.includes('bad'), true);
    assert.equal(container.__fileManagerActions.size, 1);
    const token = [...container.__fileManagerActions.keys()][0];
    const button = { dataset: { fileAction: 'open', fileToken: token }, closest() { return this; } };
    container._button = button;
    const event = { type: 'click', target: button, preventDefault() {} };
    container.listeners.click(event);
    container.listeners.click(event);
    await Promise.resolve();
    assert.equal(openCalls, 1);

    // Re-render is idempotent: one delegated listener and a fresh action map.
    context.state.currentProject.tabs.received.files[0].path = '/new/private/path.3mf';
    context.state.currentProject.tabs.received.files[0].ext = '.3mf';
    context.renderProjectFiles();
    assert.equal(Object.keys(container.listeners).sort().join(','), 'click,keydown');
    assert.equal(container.innerHTML.includes('/new/private/path.3mf'), false);

    // A missing token must be a no-op.
    const missing = { dataset: { fileAction: 'open', fileToken: 'missing' }, closest() { return this; } };
    container._button = missing;
    container.listeners.click({ type: 'click', target: missing, preventDefault() {} });
    await Promise.resolve();
    assert.equal(openCalls, 1);
    console.log('file_manager_contract.test.js: ok');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
