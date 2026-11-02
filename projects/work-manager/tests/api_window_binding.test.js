const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
const context = {
    window,
    URLSearchParams,
    FormData,
    Error,
    fetch: async () => ({ status: 200, ok: true, text: async () => '{"success":true}' })
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'static/js/api.js'), 'utf8'), context);

assert.equal(typeof window.API?.applyAiPlan, 'function');
assert.equal(typeof window.API?.cancelAiPlan, 'function');
console.log('api_window_binding.test.js: ok');
