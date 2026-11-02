const assert = require('node:assert/strict');
const DashboardManager = require('../static/js/modules/dashboard.js');
const { API } = require('../static/js/api.js');

function domStub() {
    const elements = new Map();
    const listeners = new Map();
    return {
        add(id) {
            const element = { id, style: {}, innerHTML: '', textContent: '', setAttribute() {} };
            elements.set(id, element);
            return element;
        },
        getElementById(id) { return elements.get(id) || null; },
        addEventListener(type, handler) { listeners.set(type, handler); },
        dispatch(type, event) { listeners.get(type)?.(event); }
    };
}

async function run() {
    const state = { projects: [], stats: {}, filters: { search: '' }, viewMode: 'grid' };
    const dom = domStub();
    ['projects-grid', 'projects-table-body', 'empty-state'].forEach(id => dom.add(id));
    let statsStarted = false;
    let projectsStarted = false;
    let releaseStats;
    let releaseProjects;
    const api = {
        getStats: () => { statsStarted = true; return new Promise(resolve => { releaseStats = resolve; }); },
        getProjects: () => { projectsStarted = true; return new Promise(resolve => { releaseProjects = resolve; }); }
    };
    const manager = DashboardManager.init({ state, api, showToast: () => assert.fail('unexpected toast'), escapeHtml: String, documentRef: dom });
    const dashboardPromise = manager.loadDashboard();
    assert.equal(statsStarted, true);
    assert.equal(projectsStarted, true);
    releaseStats({ success: true, data: { total_count: 1 } });
    releaseProjects({ success: true, data: [] });
    await dashboardPromise;

    let detailCalls = 0;
    const safeDom = domStub();
    const safeManager = DashboardManager.init({
        state: { projects: [], stats: {}, filters: {}, viewMode: 'grid' },
        api,
        showToast: () => {},
        escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'),
        documentRef: safeDom,
        actions: { openProjectDetail: () => { detailCalls += 1; } }
    });
    const malicious = safeManager.createProjectCardHTML({ project_no: "q'\"><x", client_name: "고객'", job_name: '작업"', total_amount: 1 });
    assert.equal(malicious.includes('onclick='), false);
    assert.equal(malicious.includes("q'\"><x"), false);
    const actionTarget = { dataset: { dashboardAction: 'detail', projectNo: 'safe-1' }, closest: selector => selector === '[data-dashboard-action]' ? actionTarget : { dataset: {}, matches: () => true } };
    safeDom.dispatch('click', { target: actionTarget, stopPropagation() {} });
    assert.equal(detailCalls, 1);
    const nestedButton = { dataset: { dashboardAction: '3mf', projectNo: 'safe-1' }, closest: () => nestedButton };
    safeDom.dispatch('keydown', { key: 'Enter', target: nestedButton, preventDefault() {} });
    safeDom.dispatch('keydown', { key: ' ', target: nestedButton, preventDefault() {} });
    assert.equal(detailCalls, 1);
    let latestDetailCalls = 0;
    DashboardManager.init({
        state: { projects: [], stats: {}, filters: {}, viewMode: 'grid' }, api,
        showToast: () => {}, escapeHtml: String, documentRef: safeDom,
        actions: { openProjectDetail: () => { latestDetailCalls += 1; } }
    });
    safeDom.dispatch('click', { target: actionTarget, stopPropagation() {} });
    assert.equal(detailCalls, 1);
    assert.equal(latestDetailCalls, 1);

    let firstResolve;
    let secondResolve;
    const signals = [];
    const latestState = { projects: [], stats: {}, filters: { search: '' }, viewMode: 'grid' };
    const latestApi = {
        getStats: async () => ({ success: true, data: {} }),
        getProjects: (_filters, options) => {
            signals.push(options?.signal);
            return signals.length === 1
                ? new Promise(resolve => { firstResolve = resolve; })
                : new Promise(resolve => { secondResolve = resolve; });
        }
    };
    const latestManager = DashboardManager.init({ state: latestState, api: latestApi, showToast: () => assert.fail('aborted request toasted'), escapeHtml: String, documentRef: dom });
    const first = latestManager.loadProjects();
    const second = latestManager.loadProjects();
    assert.equal(signals.length, 2);
    assert.equal(signals[0].aborted, true);
    secondResolve({ success: true, data: [{ project_no: 'new' }] });
    firstResolve({ success: true, data: [{ project_no: 'old' }] });
    await Promise.all([first, second]);
    assert.deepEqual(latestState.projects.map(p => p.project_no), ['new']);

    let rejectOld;
    let resolveFresh;
    let projectCalls = 0;
    let projectToasts = 0;
    const errorState = { projects: [{ project_no: 'kept' }], stats: {}, filters: {}, viewMode: 'grid' };
    const errorApi = {
        getProjects: (_filters, _options) => (++projectCalls === 1
            ? new Promise((_resolve, reject) => { rejectOld = reject; })
            : new Promise(resolve => { resolveFresh = resolve; }))
    };
    const errorManager = DashboardManager.init({ state: errorState, api: errorApi, showToast: () => { projectToasts += 1; }, escapeHtml: String, documentRef: dom });
    const oldError = errorManager.loadProjects();
    const freshSuccess = errorManager.loadProjects();
    resolveFresh({ success: true, data: [{ project_no: 'fresh' }] });
    rejectOld(new Error('late network failure'));
    await Promise.all([oldError, freshSuccess]);
    assert.deepEqual(errorState.projects.map(p => p.project_no), ['fresh']);
    assert.equal(projectToasts, 0);

    const currentError = new Promise((_resolve, reject) => { setImmediate(() => reject(new Error('current network failure'))); });
    const currentErrorManager = DashboardManager.init({ state: errorState, api: { getProjects: () => currentError }, showToast: () => { projectToasts += 1; }, escapeHtml: String, documentRef: dom });
    await currentErrorManager.loadProjects();
    assert.equal(projectToasts, 1);

    let statsFirstResolve;
    let statsSecondResolve;
    let statsCalls = 0;
    const statsState = { projects: [], stats: {}, filters: {}, viewMode: 'grid' };
    const statsApi = {
        getStats: (_options) => (++statsCalls === 1
            ? new Promise(resolve => { statsFirstResolve = resolve; })
            : new Promise(resolve => { statsSecondResolve = resolve; })),
        getProjects: async () => ({ success: true, data: [] })
    };
    const statsManager = DashboardManager.init({ state: statsState, api: statsApi, showToast: () => assert.fail('stale stats toasted'), escapeHtml: String, documentRef: dom });
    const staleStats = statsManager.loadStats();
    const freshStats = statsManager.loadStats();
    statsSecondResolve({ success: true, data: { total_count: 2 } });
    statsFirstResolve({ success: true, data: { total_count: 1 } });
    await Promise.all([staleStats, freshStats]);
    assert.equal(statsState.stats.total_count, 2);

    let capturedOptions;
    const originalFetch = global.fetch;
    global.fetch = async (_url, options) => { capturedOptions = options; return { status: 200, ok: true, text: async () => '{"success":true,"data":[]}' }; };
    const controller = new AbortController();
    await API.getProjects({ search: 'x' }, { signal: controller.signal });
    assert.equal(capturedOptions.signal, controller.signal);
    await API.getStats(); // Existing one-argument call remains valid.
    global.fetch = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    await assert.rejects(API.getProjects({}), error => error.kind === 'abort' && error.isAbortError === true);
    global.fetch = originalFetch;
    console.log('dashboard_contract.test.js: ok');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
