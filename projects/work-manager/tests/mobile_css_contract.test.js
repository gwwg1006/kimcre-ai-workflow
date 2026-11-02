const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('static/css/style.css', 'utf8');
const mobile = css.slice(css.lastIndexOf('@media (max-width: 390px)'));

assert.match(css, /\.nav-menu::-[\w-]+scrollbar\s*\{[^}]*display:\s*none/);
assert.match(css, /\.nav-menu\s*\{[^}]*scrollbar-width:\s*none/s);
assert.match(mobile, /#modal-new-project \.modal-card/);
assert.match(mobile, /min-width:\s*0/);
assert.match(mobile, /max-width:\s*100%/);
assert.match(mobile, /new-project-items-table[\s\S]*table-layout:\s*fixed/);
assert.match(mobile, /floating-ai-launcher-btn[\s\S]*min-width:\s*44px/);
assert.match(mobile, /launcher-text[\s\S]*display:\s*none/);
console.log('mobile_css_contract.test.js: ok');
