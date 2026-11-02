(function registerUiActions(window) {
    const prompts = { today: '오늘 마감인 작업과 현재 출력 중인 프로젝트 요약해줘', unpaid: '현재 미수금 및 입금 대기 목록 정리해줘', delivery: '배송 예약이 필요하거나 발송 대기 중인 건 보여줘', sales: '이번 주 수주 현황 및 총 매출 통계 브리핑해줘', slicing: '슬라이싱 대기 중이거나 3MF 필요한 프로젝트 알려줘' };
    function init() {
        if (document.__uiActionsBound) return;
        document.__uiActionsBound = true;
        document.addEventListener('click', event => {
            const el = event.target.closest?.('[data-ui-action]'); if (!el) return;
            const action = el.dataset.uiAction;
            if (action === 'focus-ai') window.focusGlobalAiCommander?.();
            else if (action === 'new-project') window.openNewProjectModal?.();
            else if (action === 'close-modal') window.closeModal?.(el.dataset.modalId);
            else if (action === 'estimate-menu') window.toggleEstimateDropdown?.(event);
            else if (action === 'estimate') { window.openEstimateModal?.(el.dataset.docType); window.closeEstimateDropdown?.(); }
            else if (action === 'reset-global-ai') window.resetGlobalAiChat?.();
            else if (action === 'close-global-ai') window.toggleFloatingAiWidget?.(false);
            else if (action === 'global-ai-prompt' && prompts[el.dataset.prompt]) window.applyGlobalAiPrompt?.(prompts[el.dataset.prompt]);
            else if (action === 'toggle-global-ai') window.toggleFloatingAiWidget?.();
        });
    }
    window.UiActions = { init };
    document.addEventListener('DOMContentLoaded', init);
})(window);
