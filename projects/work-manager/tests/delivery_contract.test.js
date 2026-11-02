const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeDom() {
    const values = { 'detail-tracking-no': { value: '1234567890' }, 'detail-courier': { value: '' }, 'btn-track-delivery': { disabled: false, textContent: '상태 조회' } };
    const links = { classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute(name) { if (name === 'href') this.href = ''; }, textContent: '', href: '' };
    const panel = { hidden: true };
    return { getElementById(id) { return values[id] || (id === 'detail-tracking-link' ? links : id === 'detail-tracking-result' ? panel : { }); }, values, links, panel };
}

async function run() {
    const documentRef = makeDom();
    let updateCalls = 0;
    let trackCalls = 0;
    let resolveUpdate;
    const state = { currentProject: { project_no: '260824-001', deliv_status: '예약 필요' } };
    const api = {
        updateDelivery: () => { updateCalls += 1; return new Promise(resolve => { resolveUpdate = resolve; }); },
        trackDelivery: async payload => { trackCalls += 1; return { success: true, data: { project: { project_no: payload.project_no }, deliv_status: '배송 중' } }; }
    };
    const context = { window: {}, document: documentRef, URL, navigator: { clipboard: { writeText: async () => {} } }, console };
    context.window = context;
    vm.runInNewContext(fs.readFileSync('static/js/modules/delivery.js', 'utf8'), context, { filename: 'delivery.js' });
    const manager = context.DeliveryManager.init({ state, api, documentRef, showToast() {}, openProjectDetail: async () => {}, loadProjects: async () => {}, loadStats: async () => {}, renderProjectDetailContent() {} });

    const first = manager.handleSaveTrackingNo();
    const second = manager.handleSaveTrackingNo();
    assert.equal(updateCalls, 1);
    resolveUpdate({ success: true });
    await Promise.all([first, second]);

    manager.setContext('260824-001');
    const staleSave = manager.handleSaveTrackingNo();
    manager.invalidateContext();
    resolveUpdate({ success: true });
    await staleSave;

    documentRef.values['detail-tracking-no'].value = 'bad-value';
    await manager.handleTrackDelivery();
    assert.equal(trackCalls, 0);
    documentRef.values['detail-tracking-no'].value = '1234567890';
    assert.equal(manager.officialUrl('1234567890', ''), 'https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=1234567890');
    documentRef.values['detail-courier'].value = '한진택배';
    documentRef.values['detail-tracking-no'].value = '537442940344';
    manager.updateTrackingLinkFromFields();
    assert.equal(documentRef.links.href, 'https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=537442940344');
    assert.equal(documentRef.values['btn-track-delivery'].disabled, false, 'reload fields rebuild the official link');
    assert.equal(manager.updateTrackingLink('javascript:alert(1)'), '');
    assert.equal(manager.updateTrackingLink('https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblnumText2=1234567890'), '');
    assert.equal(manager.updateTrackingLink('https://evil.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblnumText2=1234567890'), '');
    assert.equal(manager.updateTrackingLink('http://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblnumText2=1234567890'), '');
    assert.equal(manager.updateTrackingLink('https://user:pass@www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblnumText2=1234567890'), '');
    assert.equal(documentRef.links.href, '');
    await manager.handleTrackDelivery();
    assert.equal(trackCalls, 1);
    assert.equal(documentRef.values['btn-track-delivery'].disabled, false);
    console.log('delivery_contract.test.js: ok');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
