const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeDom() {
  const listeners = {};
  const panel = { attrs: {}, innerHTML: '', __fileManagerDelegation: true, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener() {}, tabIndex: -1 };
  const name = { textContent: '' };
  const buttons = ['received', 'modified', 'slicing', 'qc', 'estimate', 'delivery'].map(tab => ({
    dataset: { tab }, id: `detail-file-tab-${tab}`, attrs: {}, classList: { values: new Set(), toggle(k, on) { on ? this.values.add(k) : this.values.delete(k); } },
    tabIndex: -1, disabled: false, style: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] || null; },
    focus() { this.focused = true; }, closest() { return this; }
  }));
  const header = { __fileTabsBound: false, listeners, addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, contains(node) { return buttons.includes(node); }, querySelectorAll() { return buttons; } };
  const container = { innerHTML: '', __fileManagerDelegation: true, addEventListener() {}, contains() { return true; } };
  const documentRef = {
    querySelector(selector) { return selector === '.files-tab-header' ? header : null; },
    querySelectorAll() { return buttons; },
    getElementById(id) { return id === 'tab-files-container' ? panel : id === 'current-tab-name' ? name : id === 'tab-badge-received' ? { textContent: '' } : null; }
  };
  return { documentRef, header, buttons, panel, name, container, listeners };
}

const dom = makeDom();
const context = {
  document: dom.documentRef,
  state: { currentTab: 'received', currentProject: { project_no: '260824-001', tabs: { received: { files: [] }, modified: { files: [] } } } },
  API: {}, showToast() {}, getTabFolderKorean: tab => tab, escapeHtml: String,
  window: null, console
};
context.window = context;
vm.runInNewContext(fs.readFileSync('static/js/modules/file-manager.js', 'utf8'), context, { filename: 'file-manager.js' });

assert.equal(dom.header.listeners.click.length, 1);
assert.equal(dom.buttons[0].attrs['aria-selected'], 'true');
assert.equal(dom.buttons[0].tabIndex, 0);
assert.equal(dom.panel.attrs.role, 'tabpanel');

dom.header.listeners.click[0]({ type: 'click', target: dom.buttons[1], preventDefault() {}, stopImmediatePropagation() {} });
assert.equal(context.state.currentTab, 'modified');
assert.equal(dom.buttons[0].attrs['aria-selected'], 'false');
assert.equal(dom.buttons[1].attrs['aria-selected'], 'true');
assert.equal(dom.buttons[1].tabIndex, 0);
assert.equal(dom.panel.attrs['aria-labelledby'], 'detail-file-tab-modified');

dom.header.listeners.keydown[0]({ type: 'keydown', key: 'ArrowRight', target: dom.buttons[1], preventDefault() {} });
assert.equal(context.state.currentTab, 'slicing');
assert.equal(dom.buttons[2].focused, true);
dom.header.listeners.keydown[0]({ type: 'keydown', key: 'Home', target: dom.buttons[2], preventDefault() {} });
assert.equal(context.state.currentTab, 'received');
assert.equal(dom.buttons[0].tabIndex, 0);
console.log('file_tabs_accessibility_contract.test.js: ok');
