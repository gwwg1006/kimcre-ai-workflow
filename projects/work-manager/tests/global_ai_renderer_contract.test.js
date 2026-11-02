const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(doc) { return { ownerDocument: doc, children: [], dataset: {}, style: {}, classList: { add() {}, remove() {} }, appendChild(node) { this.children.push(node); node.parentNode = this; }, append(...nodes) { nodes.forEach(node => this.appendChild(node)); }, replaceChildren(...nodes) { this.children = []; this.append(...nodes); }, setAttribute() {} }; }
const doc = { createElement: () => element(doc), createTextNode: value => ({ textContent: String(value), nodeType: 3 }) };
const context = { window: {}, document: doc }; context.window = context;
vm.runInNewContext(fs.readFileSync('static/js/modules/global-ai-renderer.js', 'utf8'), context, { filename: 'global-ai-renderer.js' });
const renderer = context.GlobalAiRenderer;
assert.equal(renderer.projectPattern.test('260824-1000'), true);
assert.equal(renderer.projectPattern.test('260824-00x'), false);
const target = element(doc);
renderer.renderAssistant(target, '<img onerror="alert(1)"> [x](javascript:alert(1))', [{ type: 'open_project', project_no: '260824-1000', label: '"<unsafe>' }], () => true);
assert.equal(target.innerHTML, undefined);
const textValues = [];
function collect(node) { if (node?.nodeType === 3) textValues.push(node.textContent); (node?.children || []).forEach(collect); }
collect(target);
assert.ok(textValues.some(value => value.includes('<img onerror=')));
assert.ok(textValues.some(value => value.includes('javascript:')));
const bar = element(doc); renderer.renderAttached(bar, element(doc), [{ name: '"<bad>.stl', size: 1 }]);
assert.equal(bar.innerHTML, undefined);
assert.equal(bar.children[0].children[0].children[0].textContent, '"<bad>.stl');
console.log('global_ai_renderer_contract.test.js: ok');
