/* Preview/approval UI. Tokens stay in this in-memory store and never enter DOM or storage. */
(function registerAiPlanUI(window) {
    const plans = new Map();
    const applying = new Set();
    const projectPattern = /^\d{6}-\d{3,}$/;

    function escape(value) {
        const text = String(value ?? '');
        return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function safeSummary(response) {
        const updates = response?.proposed_updates;
        const files = response?.proposed_file_ops;
        const parts = [];
        if (updates && typeof updates === 'object') {
            const count = Array.isArray(updates) ? updates.length : Object.keys(updates).length;
            if (count) parts.push(`수정 제안 ${count}건`);
        }
        if (Array.isArray(files) && files.length) parts.push(`파일 작업 ${files.length}건`);
        return parts.length ? parts.join(' · ') : '변경 제안 내용을 확인해 주세요.';
    }

    function register(response, context = {}) {
        if (!response?.requires_confirmation || !response.plan_id || !response.confirmation_token) return null;
        plans.set(response.plan_id, { token: response.confirmation_token, context: typeof context === 'string' ? context : (context.name || 'global'), callbacks: typeof context === 'object' ? context : {} });
        return response.plan_id;
    }

    function clear(planId) { plans.delete(planId); }
    function clearAll() { plans.clear(); }
    function terminalStatus(status) { return [403, 404, 409, 410].includes(Number(status)); }
    function resultState(result) {
        const nested = result?.result && typeof result.result === 'object' ? result.result : result;
        return {
            partial: nested?.partial === true || nested?.status === 'partial',
            failed: nested?.status === 'failed' || result?.status === 'failed',
            warningCount: Array.isArray(nested?.warnings) ? nested.warnings.length : 0,
            failureCount: Array.isArray(nested?.failures) ? nested.failures.length : 0,
            cached: nested?.cached === true || result?.cached === true
        };
    }
    function updateCard(planId, text, className) {
        const selector = `[data-ai-plan-id="${CSS.escape(planId)}"]`;
        document.querySelectorAll(selector).forEach(el => {
            const card = el.closest('.ai-plan-preview');
            if (card) { card.textContent = text; card.classList.add(className); }
        });
    }
    async function cancelContext(context) {
        const entries = Array.from(plans.entries()).filter(([, entry]) => entry.context === context);
        entries.forEach(([id]) => clear(id));
        const pending = entries.map(([id, entry]) => window.API.cancelAiPlan(id, entry.token).catch(() => null));
        return Promise.allSettled(pending);
    }
    async function cancelAll() {
        const contexts = new Set(Array.from(plans.values()).map(entry => entry.context));
        return Promise.allSettled(Array.from(contexts, context => cancelContext(context)));
    }

    function render(response, target, context = {}) {
        const planId = register(response, context);
        if (!planId || !target) return '';
        const summary = safeSummary(response);
        const html = `<div class="ai-plan-preview" data-ai-plan-id="${escape(planId)}" role="status">
            <span class="ai-plan-badge">아직 적용 안 됨</span>
            <span class="ai-plan-summary">${escape(summary)}</span>
            <button type="button" class="btn btn-primary btn-xs ai-plan-apply" data-ai-plan-id="${escape(planId)}">적용 승인</button>
            <button type="button" class="btn btn-ghost btn-xs ai-plan-cancel" data-ai-plan-id="${escape(planId)}">취소</button>
        </div>`;
        target.insertAdjacentHTML('beforeend', html);
        return planId;
    }

    async function apply(planId) {
        const entry = plans.get(planId);
        if (!entry || applying.has(planId)) return;
        applying.add(planId);
        const buttons = document.querySelectorAll(`[data-ai-plan-id="${CSS.escape(planId)}"]`);
        buttons.forEach(button => { if (button.classList.contains('ai-plan-apply')) button.disabled = true; });
        try {
            const result = await window.API.applyAiPlan(planId, entry.token);
            if (!result || result.success !== true) {
                const failedOutcome = resultState(result || {});
                if (failedOutcome.failed || failedOutcome.partial || failedOutcome.warningCount || failedOutcome.failureCount) {
                    clear(planId);
                    if (typeof entry.callbacks.isCurrent !== 'function' || entry.callbacks.isCurrent()) {
                        updateCard(planId, failedOutcome.failed ? '적용 실패 — 확인 필요' : '일부만 처리됨 — 확인 필요', 'is-warning');
                    }
                    return null;
                }
                const error = Object.assign(new Error('AI 승인 결과가 유효하지 않습니다.'), { status: result?.status || 0, serverError: result });
                throw error;
            }
            const outcome = resultState(result);
            clear(planId);
            const isCurrent = typeof entry.callbacks.isCurrent !== 'function' || entry.callbacks.isCurrent();
            if (!isCurrent) return result;
            if (outcome.failed || outcome.partial || outcome.warningCount || outcome.failureCount) {
                updateCard(planId, outcome.failed ? '적용 실패 — 확인 필요' : '일부만 처리됨 — 확인 필요', 'is-warning');
            } else {
                updateCard(planId, outcome.cached ? '이미 적용됨 (저장된 결과)' : '적용 완료', 'is-complete');
            }
            if (!outcome.failed && !outcome.partial && !outcome.warningCount && !outcome.failureCount
                && typeof entry.callbacks.onApplied === 'function') await entry.callbacks.onApplied(result);
            return result;
        } catch (error) {
            if (terminalStatus(error.status)) clear(planId);
            const message = error.status === 403 ? 'AI 승인 토큰이 유효하지 않습니다.'
                : error.status === 404 ? 'AI 승인 계획을 찾을 수 없습니다.'
                : error.status === 409 ? 'AI 승인 계획이 이미 처리 중이거나 적용할 수 없는 상태입니다.'
                : error.status === 410 ? 'AI 승인 계획이 만료되었거나 취소되었습니다.'
                : error.status >= 500 ? 'AI 승인 처리 중 서버 오류가 발생했습니다.'
                : (error.message || 'AI 승인 계획을 적용할 수 없습니다.');
            if (typeof entry.callbacks.isCurrent !== 'function' || entry.callbacks.isCurrent()) {
                if (typeof entry.callbacks.onError === 'function') entry.callbacks.onError({ ...error, message });
                else if (typeof window.showToast === 'function') window.showToast(message, 'error');
            }
            return null;
        } finally { applying.delete(planId); }
    }

    async function cancel(planId, options = {}) {
        const entry = plans.get(planId);
        if (!entry || applying.has(planId)) return;
        applying.add(planId);
        if (options.clearFirst) clear(planId);
        try {
            const result = await window.API.cancelAiPlan(planId, entry.token);
            if (!result || result.success !== true) throw Object.assign(new Error('AI 승인 계획 취소에 실패했습니다.'), { status: result?.status || 0 });
            clear(planId);
            if (options.updateCard === false) return result;
            document.querySelectorAll(`[data-ai-plan-id="${CSS.escape(planId)}"]`).forEach(el => {
                const card = el.closest('.ai-plan-preview');
                if (card) { card.textContent = '적용 취소됨'; card.classList.add('is-cancelled'); }
            });
            return result;
        } catch (error) {
            if (terminalStatus(error.status)) clear(planId);
            if (typeof entry.callbacks.isCurrent !== 'function' || entry.callbacks.isCurrent()) {
                if (typeof entry.callbacks.onError === 'function') entry.callbacks.onError(error);
                else if (typeof window.showToast === 'function') window.showToast(error.message || 'AI 승인 계획을 취소할 수 없습니다.', 'error');
            }
            return null;
        } finally { applying.delete(planId); }
    }

    function validAction(action) {
        if (!action || typeof action !== 'object' || typeof action.type !== 'string') return false;
        if (!['open_project', 'open_3mf', 'generate_estimate', 'open_delivery', 'new_project'].includes(action.type)) return false;
        return !action.project_no || projectPattern.test(action.project_no);
    }

    document.addEventListener('click', event => {
        const applyButton = event.target.closest('.ai-plan-apply');
        if (applyButton) { event.preventDefault(); apply(applyButton.dataset.aiPlanId); return; }
        const cancelButton = event.target.closest('.ai-plan-cancel');
        if (cancelButton) { event.preventDefault(); cancel(cancelButton.dataset.aiPlanId); }
    });

    window.AIPlanUI = { register, render, apply, cancel, cancelAll, cancelContext, clear, clearAll, safeSummary, validAction, size: () => plans.size };
})(window);
