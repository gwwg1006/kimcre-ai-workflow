/**
 * 공통 모달 생명주기.
 * 모달 닫기는 화면 상태만 닫고 암묵적인 DB 저장은 수행하지 않는다.
 */
(function registerModalManager(window) {
    const modalStack = [];
    const openers = new Map();
    let originalBodyPadding = null;
    function bodyLock(locked) { const body = document.body; if (!body) return; if (locked) { if (originalBodyPadding !== null) { body.classList?.add?.('modal-open'); return; } originalBodyPadding = body.style.paddingRight || ''; const scrollbar = Math.max(0, (window.innerWidth || 0) - (document.documentElement?.clientWidth || 0)); body.style.paddingRight = scrollbar ? `${scrollbar}px` : originalBodyPadding; body.classList?.add?.('modal-open'); } else { body.classList?.remove?.('modal-open'); if (originalBodyPadding !== null) body.style.paddingRight = originalBodyPadding; originalBodyPadding = null; } }
    function focusable(modal) { return Array.from(modal?.querySelectorAll?.('button, [href], input, select, textarea, [tabindex]') || []).filter(node => !node.disabled && node.getAttribute?.('aria-hidden') !== 'true' && node.offsetParent !== null); }
    function focusInside(modal, backwards = false) { const nodes = focusable(modal); if (!nodes.length) { const card = modal?.querySelector?.('.modal-card'); if (card && !card.getAttribute?.('tabindex')) card.setAttribute?.('tabindex', '-1'); (card || modal)?.focus?.(); return; } (backwards ? nodes[nodes.length - 1] : nodes[0]).focus?.(); }
    function topModal() { for (let i = modalStack.length - 1; i >= 0; i -= 1) { const modal = document.getElementById(modalStack[i]); if (modal?.classList?.contains?.('active')) return modal; } return null; }
    function openModal(modalId) {
        const el = document.getElementById(modalId);
        if (!el) return;
        if (!el.classList?.contains?.('active')) { openers.set(modalId, document.activeElement); modalStack.push(modalId); }
        el.removeAttribute?.('inert');
        el.setAttribute?.('aria-hidden', 'false');
        el.classList.add('active');
        bodyLock(true);
        const focus = () => focusInside(el);
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focus);
        else setTimeout(focus, 0);
    }

    function closeModal(modalId) {
        const el = document.getElementById(modalId);
        if (!el) return;
        const wasActive = el.classList?.contains?.('active') ?? true;
        if (modalId === 'modal-project-detail' && window.AIPlanUI && typeof state !== 'undefined' && state.currentProject?.project_no) {
            window.AIPlanUI.cancelContext(`detail:${state.currentProject.project_no}`).catch(() => {});
        }
        if (modalId === 'modal-project-detail') {
            window.invalidateProjectDetailRequest?.();
            const detailAi = window.DetailAiManager?.get?.();
            const projectActions = window.ProjectActions?.get?.();
            const delivery = window.DeliveryManager?.get?.();
            const editor = window.ProjectEditor?.get?.();
            detailAi?.invalidateContext?.();
            projectActions?.invalidateContext?.();
            delivery?.invalidateContext?.();
            if (wasActive) editor?.invalidate?.();
            ['modal-edit-project-info', 'modal-estimate-gen', 'modal-stl-preview'].forEach(childId => {
                const child = document.getElementById(childId);
                if (child?.classList?.contains?.('active')) { child.classList.remove('active'); child.setAttribute?.('aria-hidden', 'true'); child.setAttribute?.('inert', ''); }
                openers.delete(childId);
                const childIndex = modalStack.indexOf(childId);
                if (childIndex >= 0) modalStack.splice(childIndex, 1);
            });
        }
        if (modalId === 'modal-edit-project-info' && wasActive) window.ProjectEditor?.get?.()?.invalidate?.();
        const parentIndex = modalStack.indexOf(modalId);
        if (parentIndex >= 0 && parentIndex < modalStack.length - 1) {
            modalStack.slice(parentIndex + 1).forEach(childId => {
                const child = document.getElementById(childId);
                child?.classList?.remove?.('active');
                child?.setAttribute?.('aria-hidden', 'true');
                child?.setAttribute?.('inert', '');
                openers.delete(childId);
            });
            modalStack.splice(parentIndex + 1);
        }
        el.classList.remove('active');
        el.setAttribute?.('aria-hidden', 'true');
        el.setAttribute?.('inert', '');
        const stackIndex = modalStack.indexOf(modalId);
        if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
        const opener = openers.get(modalId);
        openers.delete(modalId);
        const next = topModal();
        if (next) focusInside(next);
        else { if (opener && (!document.contains || document.contains(opener)) && !opener.disabled) opener.focus?.(); else document.body?.focus?.(); }
        bodyLock(modalStack.length > 0);
    }

    function handleKeydown(event) {
        const modal = topModal();
        if (!modal) return;
        if (event.key === 'Escape') { event.preventDefault?.(); closeModal(modal.id); return; }
        if (event.key !== 'Tab') return;
        const nodes = focusable(modal);
        if (!nodes.length) { event.preventDefault?.(); focusInside(modal, event.shiftKey); return; }
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        const inside = typeof modal.contains === 'function' ? modal.contains(event.target) : nodes.includes(event.target);
        if (!inside) { event.preventDefault?.(); focusInside(modal, event.shiftKey); }
        else if (event.target === last && !event.shiftKey) { event.preventDefault?.(); first.focus?.(); }
        else if (event.target === first && event.shiftKey) { event.preventDefault?.(); last.focus?.(); }
    }

    window.openModal = openModal;
    window.closeModal = closeModal;
    document.addEventListener?.('keydown', handleKeydown);
    window.ModalManager = { openModal, closeModal, topModal, stack: () => modalStack.slice() };
})(window);
