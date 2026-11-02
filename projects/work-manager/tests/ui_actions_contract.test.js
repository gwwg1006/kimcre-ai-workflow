const assert = require('node:assert/strict');
const fs = require('node:fs');

const template = fs.readFileSync('templates/index.html', 'utf8');
const app = fs.readFileSync('static/js/app.js', 'utf8');
const nav = template.match(/<button[^>]*id="nav-ai-commander"[^>]*>/)?.[0] || '';
assert.doesNotMatch(nav, /data-ui-action="focus-ai"/);
assert.match(app, /viewName === 'ai-commander'/);
assert.match(app, /focusGlobalAiCommander/);
console.log('ui_actions_contract.test.js: ok');
