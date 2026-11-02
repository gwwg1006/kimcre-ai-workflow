const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('static/js/app.js', 'utf8');
const newProject = fs.readFileSync('static/js/modules/new-project.js', 'utf8');
const partners = fs.readFileSync('static/js/modules/partners.js', 'utf8');
const globalAi = fs.readFileSync('static/js/modules/global-ai-commander.js', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');

assert.match(app, /__appEventsBound/);
assert.doesNotMatch(app, /btn-open-new-project[^\n]*addEventListener/);
assert.match(newProject, /documentBindings|dispatcher/);
assert.doesNotMatch(template, /id="btn-open-new-project"[^>]*onclick=/);
assert.doesNotMatch(template, /id="form-partner"[^>]*onsubmit=/);
assert.match(partners, /bindingByDocument|Dispatcher/);
assert.doesNotMatch(template, /id="global-ai-prompt"[^>]*onkeydown=/);
assert.doesNotMatch(template, /id="global-ai-file-input"[^>]*onchange=/);
assert.doesNotMatch(template, /id="btn-global-ai-send"[^>]*onclick=/);
assert.match(globalAi, /__globalAiActionsBound/);
assert.match(globalAi, /global-ai-file-input.*addEventListener\('change'/s);
assert.match(globalAi, /btn-global-ai-send.*addEventListener\('click'/s);
assert.match(globalAi, /handleGlobalAiKeyDown/);
console.log('event_ownership_contract.test.js: ok');
