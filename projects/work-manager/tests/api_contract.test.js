const assert = require('node:assert/strict');
const { API, APIError } = require('../static/js/api.js');

function response(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => body
    };
}

async function expectApiError(promise, expected) {
    await assert.rejects(promise, (error) => {
        assert.ok(error instanceof APIError);
        for (const [key, value] of Object.entries(expected)) assert.equal(error[key], value);
        return true;
    });
}

async function run() {
    const originalFetch = global.fetch;
    try {
        global.fetch = async () => response(200, '{"success":true,"data":{"id":1}}');
        assert.deepEqual(await API.getStats(), { success: true, data: { id: 1 } });

        global.fetch = async () => response(204, '');
        assert.equal(await API.completeProject('260824-001'), null);

        global.fetch = async () => response(400, '{"error":"입력값이 잘못되었습니다."}');
        await expectApiError(API.getStats(), { status: 400, serverError: '입력값이 잘못되었습니다.', kind: 'http' });

        global.fetch = async () => response(409, '{"duplicate":true,"existing_partner":{"id":7,"name":"기존 거래처"}}');
        await assert.rejects(API.createPartner({ name: '기존 거래처' }), error => {
            assert.equal(error.status, 409);
            assert.equal(error.serverError.duplicate, true);
            assert.equal(error.payload.existing_partner.id, 7);
            return true;
        });

        global.fetch = async () => response(500, 'upstream unavailable');
        await expectApiError(API.getStats(), { status: 500, serverError: 'upstream unavailable', kind: 'http' });

        global.fetch = async () => { throw new Error('offline'); };
        await expectApiError(API.getStats(), { status: 0, kind: 'network', isNetworkError: true });

        let captured;
        global.fetch = async (_url, options) => {
            captured = options;
            return response(200, '{"success":true}');
        };
        const formData = new FormData();
        formData.append('files', new Blob(['x']), 'sample.stl');
        await API.createProject(formData);
        assert.equal(captured.method, 'POST');
        assert.ok(captured.body instanceof FormData);
        assert.equal(captured.headers, undefined);
        assert.equal(captured.body.get('files').name, 'sample.stl');

        let applyCalls = 0;
        global.fetch = async (url, options) => {
            applyCalls += 1;
            assert.match(url, /\/api\/ai\/plans\/p1\/apply$/);
            assert.equal(options.headers['X-AI-Confirmation-Token'], 'memory-only');
            assert.equal(options.body, '{}');
            return response(200, '{"success":true,"status":"applied"}');
        };
        await API.applyAiPlan('p1', 'memory-only');
        assert.equal(applyCalls, 1);

        global.fetch = async (url, options) => {
            assert.equal(url, '/api/system/shutdown');
            assert.equal(options.method, 'POST');
            return response(200, '{"success":true}');
        };
        assert.equal((await API.shutdownServer()).success, true);

        const signal = new AbortController().signal;
        global.fetch = async (_url, options) => {
            assert.equal(options.signal, signal);
            return response(200, '{"success":true,"data":[]}');
        };
        await API.getPartners('고객', false, { signal });
        await API.getProjectDetail('260824-001', { signal });
    } finally {
        global.fetch = originalFetch;
    }
}

run().then(() => console.log('api_contract.test.js: ok'));
