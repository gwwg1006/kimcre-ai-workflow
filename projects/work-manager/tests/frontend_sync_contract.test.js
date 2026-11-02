const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = name => fs.readFileSync(`static/js/modules/${name}`, 'utf8');
const items = read('detail-items.js');
const ai = read('ai-assistant.js');
const files = read('file-manager.js');
const delivery = read('delivery.js');
const editor = read('project-editor.js');

assert.match(items, /pendingProjects/);
assert.match(items, /String\(current\?\.project_no/);
assert.match(ai, /analysisController/);
assert.match(ai, /requestGeneration !== analysisGeneration/);
assert.match(ai, /applied !== true/);
assert.match(files, /record\.projectNo/);
assert.match(files, /state\.currentProject\?\.project_no.*projectNo/);
assert.match(delivery, /busyProjects/);
assert.match(delivery, /if \(!project \|\| saving \|\| tracking\)/);
assert.match(editor, /operationSequences/);
assert.doesNotMatch(editor, /requestGeneration !== generation/);

console.log('frontend_sync_contract.test.js: ok');
