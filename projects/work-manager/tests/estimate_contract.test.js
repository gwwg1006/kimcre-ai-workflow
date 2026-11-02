const assert = require('node:assert/strict');
const fs = require('node:fs');
const Pricing = require('../static/js/modules/pricing.js');

const estimate = fs.readFileSync('static/js/modules/estimate.js', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');
const modal = template.slice(template.indexOf('id="modal-estimate-gen"'), template.indexOf('id="modal-stl-preview"'));

assert.match(estimate, /let isSubmitting = false/);
assert.match(estimate, /if \(!state\.currentProject \|\| isSubmitting\) return/);
assert.match(estimate, /Pricing\.parseInteger/);
assert.match(estimate, /const requestedProjectNo = state\.currentProject\.project_no/);
assert.match(estimate, /API\.generateEstimate\(requestedProjectNo/);
assert.match(estimate, /state\.currentProject\?\.project_no === requestedProjectNo/);
assert.doesNotMatch(estimate, /parseInt\(/);
assert.doesNotMatch(estimate, /value=\"\$\{/);
assert.match(estimate, /estimateDelegationBound/);
assert.doesNotMatch(modal, /oninput=|onclick=/);
assert.match(modal, /data-estimate-action="close"/);
assert.match(modal, /data-estimate-action="doc-type"/);

const hostile = "x'\"\n<img src=x onerror=alert(1)>";
assert.equal(Pricing.parseInteger(hostile), null);
assert.equal(Pricing.parseInteger(-1, { min: 0 }), null);
assert.equal(Pricing.parseInteger(1.5, { min: 0 }), null);
assert.equal(Pricing.parseInteger(0, { min: 0 }), 0);
assert.equal(Pricing.calculateAmounts({ quoteAmount: 1005, shippingFee: 0, taxType: '과세' }).total, 1105);
assert.equal(Pricing.calculateItems([{ quantity: Number.MAX_SAFE_INTEGER, unitPrice: 2 }]).valid, false);

console.log('estimate_contract.test.js: ok');
