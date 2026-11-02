const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function modal(id, controls) {
    let active = false;
    const attrs = {};
    const classList = { add() { active = true; }, remove() { active = false; }, contains() { return active; } };
    return {
        id, classList, controls,
        querySelectorAll() { return controls; }, querySelector(selector) { return selector === '.modal-card' ? this.card : null; },
        setAttribute(name, value) { attrs[name] = value; }, removeAttribute(name) { delete attrs[name]; },
        getAttribute(name) { return attrs[name]; }, focus() { documentRef.activeElement = this; }
    };
}

function control(name) { return { name, disabled: false, offsetParent: {}, focus() { documentRef.activeElement = this; }, getAttribute() { return null; } }; }
const opener = control('opener');
const outside = control('outside');
const first = control('first'); const last = control('last');
const nestedFirst = control('nested-first');
const main = modal('modal-main', [first, last]); const nested = modal('modal-nested', [nestedFirst]);
const nodes = new Map([['modal-main', main], ['modal-nested', nested]]);
const listeners = {};
const bodyClasses = new Set();
const body = { style: {}, classList: { add(name) { bodyClasses.add(name); }, remove(name) { bodyClasses.delete(name); } }, focus() {} };
const documentRef = {
    activeElement: opener, body, documentElement: { clientWidth: 390 },
    addEventListener(type, fn) { listeners[type] = fn; },
    getElementById(id) { return nodes.get(id) || null; },
    contains() { return true; }
};
const context = { window: {}, document: documentRef, console, setTimeout };
context.window = context;
vm.runInNewContext(fs.readFileSync('static/js/modules/modal.js', 'utf8'), context);

(async () => {
    context.openModal('modal-main');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(main.getAttribute('aria-hidden'), 'false');
    assert.equal(bodyClasses.has('modal-open'), true);
    assert.equal(documentRef.activeElement, first);
    const lockedPadding = body.style.paddingRight;
    context.openModal('modal-nested');
    assert.equal(body.style.paddingRight, lockedPadding);
    context.closeModal('modal-nested');
    assert.equal(body.style.paddingRight, lockedPadding);
    documentRef.activeElement = outside;
    listeners.keydown({ key: 'Tab', target: outside, preventDefault() { this.prevented = true; } });
    assert.equal(documentRef.activeElement, first);
    listeners.keydown({ key: 'Tab', target: last, preventDefault() { this.prevented = true; } });
    assert.equal(documentRef.activeElement, first);
    context.openModal('modal-nested');
    assert.equal(context.ModalManager.stack().join(','), 'modal-main,modal-nested');
    context.closeModal('modal-main');
    assert.equal(documentRef.activeElement, opener);
    assert.equal(context.ModalManager.stack().length, 0);
    assert.equal(nested.getAttribute('aria-hidden'), 'true');
    assert.equal(bodyClasses.has('modal-open'), false);
    assert.equal(main.getAttribute('aria-hidden'), 'true');
    console.log('modal_accessibility_contract.test.js: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
