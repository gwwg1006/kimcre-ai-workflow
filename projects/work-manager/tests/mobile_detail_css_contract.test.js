const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('static/css/style.css', 'utf8');
const mobile = css.slice(css.lastIndexOf('@media (max-width: 480px)'));

assert.match(mobile, /#modal-project-detail[\s\S]*min-width:\s*0/);
assert.match(mobile, /detail-header-title-row[\s\S]*flex-wrap:\s*wrap/);
assert.match(mobile, /status-control-bar[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(mobile, /detail-ai-input-wrap[\s\S]*flex-wrap:\s*wrap/);
assert.match(mobile, /detail-ai-actions[\s\S]*width:\s*100%/);
assert.match(mobile, /detail-3col-layout[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(mobile, /detail-items-table-wrapper[\s\S]*overflow-x:\s*auto/);
assert.match(mobile, /detail-items-table-wrapper[\s\S]*overflow-y:\s*hidden/);
assert.match(mobile, /files-tab-header[\s\S]*flex-wrap:\s*wrap/);

const tabletStart = css.lastIndexOf('@media (min-width: 641px) and (max-width: 900px)');
assert.notEqual(tabletStart, -1, 'tablet detail media query exists');
const tablet = css.slice(tabletStart);
assert.match(tablet, /detail-modal-body[\s\S]*display:\s*block/);
assert.match(tablet, /detail-3col-layout[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(tablet, /detail-items-table-wrapper[\s\S]*overflow-x:\s*auto/);
assert.match(tablet, /detail-items-table-wrapper[\s\S]*overflow-y:\s*visible/);
assert.match(tablet, /tab-files-list[\s\S]*max-height:\s*none/);
assert.match(css, /detail-split-layout\.detail-3col-layout[\s\S]*min-height:\s*max-content/);
assert.match(css, /detail-split-layout\.detail-3col-layout[\s\S]*grid-auto-rows:\s*max-content/);
console.log('mobile_detail_css_contract.test.js: ok');
