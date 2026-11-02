/**
 * 김명규크리에이티브 작업관리 시스템 - API 클라이언트 모듈
 */

class APIError extends Error {
    constructor(message, { status = 0, serverError = null, payload = null, kind = 'http', cause = null } = {}) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.serverError = serverError;
        this.payload = payload;
        this.kind = kind;
        this.cause = cause;
        this.isNetworkError = kind === 'network';
        this.isParseError = kind === 'invalid-response';
        this.isAbortError = kind === 'abort';
    }
}

async function requestJson(url, options = {}) {
    let response;
    const requestOptions = { ...options };
    if (options.headers) requestOptions.headers = { ...options.headers };
    try {
        response = await fetch(url, requestOptions);
    } catch (cause) {
        if (cause?.name === 'AbortError') {
            throw new APIError('요청이 취소되었습니다.', { kind: 'abort', cause });
        }
        throw new APIError(`서버와의 통신에 실패했습니다: ${cause.message || '네트워크 오류'}`, { kind: 'network', cause });
    }
    if (response.status === 204) return null;

    let rawText = '';
    let payload;
    try {
        rawText = await response.text();
        payload = rawText ? JSON.parse(rawText) : null;
    } catch (cause) {
        if (!response.ok) {
            throw new APIError(`서버 오류 (${response.status})`, { status: response.status, serverError: rawText || null, payload: null, cause });
        }
        throw new APIError(`서버 응답을 읽을 수 없습니다 (${response.status})`, { status: response.status, serverError: rawText || null, payload: null, kind: 'invalid-response', cause });
    }
    if (!response.ok) {
        const serverError = payload && typeof payload === 'object'
            ? (payload.error || payload.message || payload.detail || payload)
            : payload;
        throw new APIError(typeof serverError === 'string' ? serverError : `서버 오류 (${response.status})`, {
            status: response.status,
            serverError,
            payload
        });
    }
    return payload;
}

const API = {
    async getStats(options = {}) {
        return requestJson('/api/stats', options);
    },

    async getProjects(filters = {}, options = {}) {
        const params = new URLSearchParams();
        if (filters.search) params.append('search', filters.search);
        if (filters.prod_status) params.append('prod_status', filters.prod_status);
        if (filters.pay_status) params.append('pay_status', filters.pay_status);
        if (filters.deliv_status) params.append('deliv_status', filters.deliv_status);
        if (filters.overall_status) params.append('overall_status', filters.overall_status);

        return requestJson(`/api/projects?${params.toString()}`, options);
    },

    async getProjectDetail(projectNo, options = {}) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}`, options);
    },

    async getNextProjectNo(dateStr) {
        const url = dateStr ? `/api/projects/next-no?date=${encodeURIComponent(dateStr)}` : '/api/projects/next-no';
        return requestJson(url);
    },

    async getPartners(search = '', includeInactive = false, options = {}) {
        if (includeInactive && typeof includeInactive === 'object') {
            options = includeInactive;
            includeInactive = false;
        }
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (includeInactive) params.append('include_inactive', 'true');
        return requestJson(`/api/partners?${params.toString()}`, options);
    },

    async createPartner(data) {
        return requestJson('/api/partners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    async updatePartner(partnerId, data) {
        return requestJson(`/api/partners/${encodeURIComponent(partnerId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    async archivePartner(partnerId) {
        return requestJson(`/api/partners/${encodeURIComponent(partnerId)}`, { method: 'DELETE' });
    },

    async createProject(formData) {
        return requestJson('/api/projects', {
            method: 'POST',
            body: formData
        });
    },

    async updateProject(projectNo, data) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    async updateStatus(projectNo, statusType, statusVal, expectedVersion = undefined) {
        const body = { status_type: statusType, status_val: statusVal };
        if (Number.isInteger(expectedVersion) && expectedVersion > 0) body.expected_version = expectedVersion;
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    },

    async completeProject(projectNo, expectedVersion = undefined) {
        const body = Number.isInteger(expectedVersion) && expectedVersion > 0
            ? JSON.stringify({ expected_version: expectedVersion })
            : undefined;
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/complete`, {
            method: 'POST',
            ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {})
        });
    },

    async deleteProject(projectNo, deleteFiles = true) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delete_files: deleteFiles })
        });
    },

    async openProjectFolder(projectNo) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/open-folder`, {
            method: 'POST'
        });
    },

    async openProject3MF(projectNo) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/open-3mf`, {
            method: 'POST'
        });
    },

    async openFile(projectNo, tabKey, filename, reveal = false) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/files/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tab_key: tabKey, filename: filename, reveal: reveal })
        });
    },

    async uploadFiles(projectNo, tabKey, fileList) {
        const formData = new FormData();
        formData.append('tab_key', tabKey);
        for (let i = 0; i < fileList.length; i++) {
            formData.append('files', fileList[i]);
        }
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/files/upload`, {
            method: 'POST',
            body: formData
        });
    },

    async renameFile(projectNo, tabKey, oldName, newName) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/files/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tab_key: tabKey, old_name: oldName, new_name: newName })
        });
    },

    async bumpFileVersion(projectNo, tabKey, filename) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/files/version-bump`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tab_key: tabKey, filename: filename })
        });
    },

    async deleteFile(projectNo, tabKey, filename) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/files/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tab_key: tabKey, filename: filename })
        });
    },

    async generateEstimate(projectNo, data) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/estimate/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    async getPendingDeliveries() {
        return requestJson('/api/delivery/pending');
    },

    async updateDelivery(data) {
        return requestJson('/api/delivery/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    async trackDelivery(data) {
        return requestJson('/api/delivery/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    async parseOrderWithAi(formData) {
        return requestJson('/api/ai/parse-order', {
            method: 'POST',
            body: formData
        });
    },

    async modifyProjectWithAi(projectNo, formData) {
        return requestJson(`/api/projects/${encodeURIComponent(projectNo)}/ai-modify`, {
            method: 'POST',
            body: formData
        });
    },

    async globalAiChat(formData, options = {}) {
        return requestJson('/api/ai/global-chat', { ...options, method: 'POST', body: formData });
    },

    async applyAiPlan(planId, token) {
        return requestJson(`/api/ai/plans/${encodeURIComponent(planId)}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-AI-Confirmation-Token': token },
            body: '{}'
        });
    },

    async cancelAiPlan(planId, token) {
        return requestJson(`/api/ai/plans/${encodeURIComponent(planId)}`, {
            method: 'DELETE',
            headers: { 'X-AI-Confirmation-Token': token }
        });
    },

    async syncAll() {
        return requestJson('/api/sync', { method: 'POST' });
    },

    async shutdownServer() {
        return requestJson('/api/system/shutdown', { method: 'POST' });
    }
};

if (typeof window !== 'undefined') {
    // Classic scripts can resolve the top-level `API` binding internally, but
    // modular UI code calls it through `window.API`. Expose the same client on
    // the window so approval/cancellation flows use one shared API object.
    window.API = API;
    window.APIError = APIError;
    window.requestJson = requestJson;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API, APIError, requestJson };
}
