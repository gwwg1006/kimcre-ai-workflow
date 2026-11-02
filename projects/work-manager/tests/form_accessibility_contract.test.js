const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('templates/index.html', 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'template control ids must be unique');
for (const match of html.matchAll(/<label\b([^>]*)>/g)) {
  const attrs = match[1];
  const target = attrs.match(/\bfor="([^"]+)"/);
  if (target) assert.ok(ids.includes(target[1]), `label target must exist: ${target[1]}`);
}

const requiredLabels = {
  'new-partner-search': '거래처 선택',
  'new-client-name': '고객명',
  'new-contact-name': '담당자',
  'new-phone': '고객 연락처',
  'detail-ai-prompt': '상세 프로젝트 AI 수정 요청',
  'detail-tracking-no': '운송장번호',
  'est-recipient': '수령인 / 고객명',
  'est-address': '배송 주소'
};
for (const [id, name] of Object.entries(requiredLabels)) {
  assert.match(html, new RegExp(`<label[^>]*for="${id}"[^>]*>${name}</label>`), `${id} must have its accessible label`);
}
for (const id of ['new-ai-consent', 'detail-ai-consent', 'global-ai-consent']) {
  assert.doesNotMatch(html, new RegExp(`\\bid="${id}"\\b`), `${id} consent checkbox must not be rendered in AI panels`);
}
assert.match(html, /id="setting-ai-external-enabled"/);
for (const id of ['global-search', 'detail-prod-status', 'detail-pay-status', 'detail-deliv-status']) {
  assert.match(html, new RegExp(`for="${id}"`), `${id} must have a label target`);
}
assert.match(html, /id="global-ai-file-input"[^>]*aria-label="전체 AI 첨부파일"/);
assert.match(html, /id="new-project-files"[^>]*aria-label="신규 프로젝트 첨부파일"/);
assert.match(html, /id="partners-search"[^>]*aria-label="거래처 검색"/);
console.log('form_accessibility_contract.test.js: ok');
