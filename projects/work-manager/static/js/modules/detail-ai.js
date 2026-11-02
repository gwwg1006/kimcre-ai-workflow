/* 프로젝트 상세 AI 수정 흐름. 외부 상태는 init()으로 주입한다. */
(function registerDetailAi(window) {
    const MAX_FILES = 20;
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
    const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.csv', '.stl', '.step', '.stp', '.3mf', '.xlsx']);
    let manager;
    function init(options = {}) {
        const state = options.state || window.state;
        const api = options.api || window.API;
        const doc = options.documentRef || document;
        const toast = options.showToast || window.showToast || (() => {});
        const confirmFn = options.confirmFn || window.confirm;
        const getProject = options.getProject || (() => state?.currentProject);
        let files = [];
        let busy = false;
        let generation = 0;
        let contextProjectNo = null;

        function isActive(projectNo, requestGeneration) {
            return generation === requestGeneration && contextProjectNo === String(projectNo) && String(getProject()?.project_no || '') === String(projectNo) && doc.getElementById('modal-project-detail')?.classList.contains('active');
        }
        function ext(file) { return `.${String(file?.name || '').split('.').pop().toLowerCase()}`; }
        function validateFiles(input) {
            const incoming = Array.from(input || []);
            if (incoming.length > MAX_FILES || files.length + incoming.length > MAX_FILES) return '첨부파일은 최대 20개까지 가능합니다.';
            if (incoming.some(file => !ALLOWED_EXTENSIONS.has(ext(file)))) return '허용되지 않은 파일 형식이 포함되어 있습니다.';
            if (incoming.some(file => Number(file.size || 0) > MAX_FILE_BYTES)) return '파일 하나당 최대 25MB까지 첨부할 수 있습니다.';
            if (files.reduce((sum, file) => sum + Number(file.size || 0), 0) + incoming.reduce((sum, file) => sum + Number(file.size || 0), 0) > MAX_TOTAL_BYTES) return '첨부파일 총 용량은 100MB까지 가능합니다.';
            return null;
        }
        function renderFiles() {
            if (Array.isArray(state?.detailAiFiles) && state.detailAiFiles.length === 0 && files.length) files = [];
            const container = doc.getElementById('detail-ai-attached-chips');
            const badge = doc.getElementById('detail-ai-file-count');
            if (!container) return;
            container.replaceChildren?.();
            container.style.display = files.length ? 'flex' : 'none';
            if (badge) { badge.style.display = files.length ? 'inline' : 'none'; badge.textContent = `${files.length}개`; }
            files.forEach((file, index) => {
                const chip = doc.createElement('span'); chip.className = 'detail-ai-chip';
                const icon = doc.createElement('i'); icon.className = 'fa-solid fa-file-image';
                const label = doc.createElement('span'); label.textContent = String(file.name || '첨부파일');
                const remove = doc.createElement('button'); remove.type = 'button'; remove.dataset.detailAiAction = 'remove-file'; remove.dataset.fileIndex = String(index); remove.title = '제거';
                const close = doc.createElement('i'); close.className = 'fa-solid fa-xmark'; remove.appendChild(close);
                chip.append(icon, label, remove); container.appendChild(chip);
            });
        }
        function addFiles(input) {
            const error = validateFiles(input);
            if (error) { toast(error, 'warning'); return false; }
            const seen = new Set(files.map(file => `${file.name}:${file.size}:${file.lastModified || 0}`));
            for (const file of Array.from(input || [])) { const key = `${file.name}:${file.size}:${file.lastModified || 0}`; if (!seen.has(key)) { files.push(file); seen.add(key); } }
            if (state) state.detailAiFiles = files.slice();
            renderFiles(); return true;
        }
        function removeFile(index) { if (Number.isInteger(index) && index >= 0 && index < files.length) { files.splice(index, 1); if (state) state.detailAiFiles = files.slice(); renderFiles(); } }
        function clearAttachments() {
            files = [];
            if (state) state.detailAiFiles = [];
            const input = doc.getElementById('detail-ai-files');
            if (input) input.value = '';
        }
        function setContext(projectNo) {
            contextProjectNo = projectNo == null ? null : String(projectNo);
            generation += 1;
            busy = false;
            clearAttachments();
            renderFiles();
            return generation;
        }
        function invalidateContext() {
            contextProjectNo = null;
            generation += 1;
            busy = false;
            clearAttachments();
            renderFiles();
            return generation;
        }
        function reset() { invalidateContext(); }
        async function submit() {
            const input = doc.getElementById('detail-ai-prompt');
            const project = getProject();
            if (!input || !project || busy) return null;
            if (typeof window.isExternalAiTransferEnabled === 'function' && !window.isExternalAiTransferEnabled()) { toast('설정에서 외부 AI 전송을 허용한 뒤 다시 시도해 주세요.', 'info'); return null; }
            const message = String(input.value || '').trim();
            if (!message && !files.length) { toast('수정할 내용이나 변경 명령을 입력해주세요.', 'info'); input.focus(); return null; }
            const projectNo = project.project_no;
            if (contextProjectNo !== String(projectNo)) setContext(projectNo);
            const requestGeneration = ++generation; busy = true;
            const button = doc.getElementById('btn-detail-ai-submit'); if (button) button.disabled = true;
            const feedback = doc.getElementById('detail-ai-feedback-bubble'); const feedbackText = doc.getElementById('detail-ai-feedback-text');
            if (feedback) feedback.style.display = 'flex'; if (feedbackText) feedbackText.textContent = 'AI가 변경 제안을 분석 중입니다...';
            try {
                const formData = new FormData(); formData.append('message', message); formData.append('project_no', projectNo); formData.append('external_ai_consent', 'true');
                files.forEach(file => formData.append('files', file));
                const res = await api.modifyProjectWithAi(projectNo, formData);
                if (!isActive(projectNo, requestGeneration)) return res;
                if (!res?.success) { toast(res?.error || 'AI 수정 실패', 'error'); if (feedbackText) feedbackText.textContent = res?.error || 'AI 수정 실패'; return res; }
                if (!(res.requires_confirmation === true && res.plan_id && res.confirmation_token)) { toast('AI 변경 계획 응답이 유효하지 않습니다. 프로젝트에는 적용되지 않았습니다.', 'error'); if (feedbackText) feedbackText.textContent = '유효한 승인 계획이 없어 적용하지 않았습니다.'; return res; }
                if (feedbackText) feedbackText.textContent = res.reply || '변경 제안을 확인하고 적용 승인해 주세요.';
                if (window.AIPlanUI) window.AIPlanUI.render(res, feedback, { name: `detail:${projectNo}`, isCurrent: () => isActive(projectNo, requestGeneration), onApplied: async () => { if (!isActive(projectNo, requestGeneration)) return; await options.reload?.(projectNo); options.refresh?.(); toast('AI 변경 사항이 적용되었습니다.', 'success'); }, onError: error => toast(error?.message || 'AI 승인 계획을 적용할 수 없습니다.', 'error') });
                toast('AI 변경 제안을 확인한 뒤 적용 승인해 주세요.', 'info');
                return res;
            } catch (error) { if (isActive(projectNo, requestGeneration)) { toast('AI 수정 요청 중 오류가 발생했습니다.', 'error'); if (feedbackText) feedbackText.textContent = '오류가 발생했습니다. 다시 시도해 주세요.'; } return null; }
            finally { if (isActive(projectNo, requestGeneration)) { busy = false; if (button) button.disabled = false; } else busy = false; }
        }
        if (!doc.__detailAiActionsBound) {
            doc.addEventListener('click', event => { const action = event.target.closest?.('[data-detail-ai-action]')?.dataset.detailAiAction; if (action === 'attach') doc.getElementById('detail-ai-files')?.click(); else if (action === 'submit') submit(); else if (action === 'remove-file') removeFile(Number(event.target.closest('[data-file-index]')?.dataset.fileIndex)); else if (action === 'close-feedback') { const bubble = doc.getElementById('detail-ai-feedback-bubble'); if (bubble) bubble.style.display = 'none'; } });
            doc.addEventListener('keydown', event => { if (event.target?.id === 'detail-ai-prompt' && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
            doc.addEventListener('change', event => { if (event.target?.id === 'detail-ai-files') { addFiles(event.target.files); event.target.value = ''; } });
            doc.__detailAiActionsBound = true;
        }
        manager = { addFiles, removeFile, renderFiles, submit, reset, setContext, invalidateContext, files: () => files.slice(), isBusy: () => busy };
        return manager;
    }
    function get() { return manager || init(); }
    window.DetailAiManager = { init, get };
})(window);
