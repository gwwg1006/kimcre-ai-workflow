const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeElement {
    constructor(doc, id = '') { this.ownerDocument = doc; this.id = id; this.children = []; this.dataset = {}; this.style = {}; this.classList = { add() {}, remove() {} }; this.listeners = {}; this.value = ''; this.checked = false; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    closest() { return null; }
    focus() {}
}

async function run() {
    const elements = {};
    const document = {
        listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        createElement() { return new FakeElement(this); },
        createTextNode(value) { return { nodeType: 3, textContent: String(value) }; },
        getElementById(id) { return elements[id] || null; }
    };
    for (const id of ['global-ai-prompt', 'global-ai-chat-feed', 'floating-ai-window', 'btn-global-ai-send', 'global-ai-attached-files-bar', 'global-ai-attach-count']) elements[id] = new FakeElement(document, id);
    elements['floating-ai-window'].style.display = 'none';
    elements['global-ai-prompt'].value = '상태를 알려줘';

    let rendererArgs;
    let sent = 0;
    const renderer = {
        renderUser(feed) { feed.appendChild(new FakeElement(document)); },
        renderLoading(feed) { const bubble = new FakeElement(document); feed.appendChild(bubble); return { bubble }; },
        renderAssistant(...args) { rendererArgs = args; },
        renderError() {},
        renderAttached() {},
        renderWelcome() {}
    };
    const context = {
        console,
        document,
        setTimeout,
        File: class File {},
        FormData: class FormData { append() {} },
        AbortController,
        API: { globalAiChat: async (_form, options) => { sent += 1; assert.ok(options.signal); return { success: true, reply: '<safe>', requires_confirmation: true, plan_id: 'p1', confirmation_token: 'secret', proposed_updates: { memo: 'x' }, suggested_actions: [] }; } },
        GlobalAiRenderer: renderer,
        AIPlanUI: { validAction: () => true, render(response, target) { target.appendChild(new FakeElement(document)); return response.plan_id; }, cancelContext: async () => {} },
        showToast() {},
        loadDashboard() {}
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync('static/js/modules/global-ai-commander.js', 'utf8'), context, { filename: 'global-ai-commander.js' });
    context.initGlobalAiCommander();
    await context.sendGlobalAiMessage();
    assert.equal(sent, 1);
    assert.equal(rendererArgs[1], '<safe>');
    assert.equal(rendererArgs[4].children.length, 1, 'AI plan node must reach the safe renderer');

    let resolveLate;
    context.API.globalAiChat = async () => new Promise(resolve => { resolveLate = resolve; });
    const previousRenderArgs = rendererArgs;
    elements['global-ai-prompt'].value = '닫힌 뒤 도착하는 응답';
    const late = context.sendGlobalAiMessage();
    context.toggleFloatingAiWidget(false);
    resolveLate({ success: true, reply: 'stale', suggested_actions: [] });
    await late;
    assert.equal(rendererArgs, previousRenderArgs, '닫힌 위젯의 늦은 응답은 렌더링하지 않아야 한다');

    context.handleGlobalAiFilesSelected([{ name: 'bad.gif', size: 1 }]);
    assert.equal(elements['global-ai-attached-files-bar'].children.length, 0, 'backend-disallowed extension must be rejected client-side');
    context.handleGlobalAiFilesSelected(Array.from({ length: 21 }, (_, index) => ({ name: `${index}.csv`, size: 1 })));
    assert.equal(elements['global-ai-attached-files-bar'].children.length, 0, 'file count limit must be enforced before API submission');
    console.log('global_ai_commander_contract.test.js: ok');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
