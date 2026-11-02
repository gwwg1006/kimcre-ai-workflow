(function registerProjectActions(root) {
    function create(options = {}) {
        const state = options.state || {};
        const api = options.api || root.API;
        const doc = options.documentRef || root.document;
        const confirmFn = options.confirmFn || root.confirm || (() => false);
        const toast = options.showToast || (() => {});
        const renderDetail = options.renderProjectDetailContent || (() => {});
        const refresh = options.refresh || (async () => {});
        const closeModal = options.closeModal || (() => {});
        const loadSTLModel = options.loadSTLModel || (() => {});
        const locks = new Set();
        let contextGeneration = 0;
        const validProjectNo = value => typeof value === 'string' && /^\d{6}-\d{3,}$/.test(value.trim());
        const context = projectNo => state.currentProject?.project_no === projectNo && contextGeneration === projectNo;
        const current = (projectNo, generation = contextGeneration) => state.currentProject?.project_no === projectNo && contextGeneration === generation;
        const setContext = projectNo => { if (validProjectNo(projectNo)) contextGeneration += 1; return contextGeneration; };
        const invalidateContext = () => { contextGeneration += 1; return contextGeneration; };
        const begin = key => locks.has(key) ? false : (locks.add(key), true);
        const end = key => locks.delete(key);

        async function complete() {
            const project = state.currentProject; const projectNo = project?.project_no; const generation = contextGeneration;
            if (!validProjectNo(projectNo) || !begin(`complete:${projectNo}`)) return null;
            try {
                if (!confirmFn(`'${project.client_name} - ${project.job_name}' 작업을 완료 처리하시겠습니까?\n(제작 완료, 배송 완료, 입금 완료로 일괄 갱신됩니다)`)) return null;
                const res = await api.completeProject(projectNo, project.version);
                if (!current(projectNo, generation)) return res;
                if (res.success && res.data) { toast('프로젝트가 완료 처리되었습니다 (입금 완료 및 미수금 0원 정산).', 'success'); renderDetail(res.data); await refresh(); }
                else toast(res.error || '완료 처리 실패', 'error');
                return res;
            } catch (error) { if (current(projectNo, generation)) toast('완료 처리 중 오류 발생', 'error'); return null; }
            finally { end(`complete:${projectNo}`); }
        }

        async function deleteProject(projectNo, clientName = '', jobName = '', event = null) {
            if (event?.stopPropagation) event.stopPropagation();
            const generation = contextGeneration;
            if (!validProjectNo(projectNo) || !begin(`delete:${projectNo}`)) return null;
            try {
                const title = clientName && jobName ? `[${projectNo}] ${clientName} - ${jobName}` : `[${projectNo}]`;
                if (!confirmFn(`정말 이 프로젝트를 삭제하시겠습니까?\n\n${title}\n\n* 주의: 프로젝트 폴더 및 파일, 데이터베이스 기록, 운영대장 내역이 함께 삭제됩니다.`)) return null;
                const res = await api.deleteProject(projectNo, true);
                if (!current(projectNo, generation)) return res;
                if (res.success) { toast(res.message || '프로젝트가 삭제되었습니다.', 'success'); closeModal('modal-project-detail'); state.currentProject = null; await refresh(); }
                else toast(res.error || '프로젝트 삭제 실패', 'error');
                return res;
            } catch (error) { if (current(projectNo, generation)) toast('프로젝트 삭제 중 오류가 발생했습니다.', 'error'); return null; }
            finally { end(`delete:${projectNo}`); }
        }

        async function open3mf(projectNo) {
            if (!validProjectNo(projectNo) || !begin(`3mf:${projectNo}`)) return null;
            try { toast('Bambu Studio에서 3MF 슬라이싱 파일을 여는 중...', 'info'); const res = await api.openProject3MF(projectNo); if (res.success) toast(res.message || '3MF 파일을 열었습니다.', 'success'); else toast(res.error || '3MF 파일 열기 실패', 'error'); return res; }
            catch (error) { toast('3MF 파일을 여는 중 오류가 발생했습니다.', 'error'); return null; }
            finally { end(`3mf:${projectNo}`); }
        }

        async function preview(tabKey, filename) {
            const projectNo = state.currentProject?.project_no;
            if (!validProjectNo(projectNo) || typeof tabKey !== 'string' || typeof filename !== 'string' || !tabKey || !filename || !begin(`preview:${projectNo}:${tabKey}:${filename}`)) return null;
            try {
                const nameEl = doc.getElementById?.('stl-preview-filename'); if (nameEl) nameEl.textContent = filename;
                const openButton = doc.getElementById?.('btn-open-stl-system');
                if (openButton) openButton.onclick = () => {
                    const key = `openfile:${projectNo}:${tabKey}:${filename}`;
                    if (!current(projectNo) || !begin(key)) return;
                    Promise.resolve(api.openFile(projectNo, tabKey, filename, false)).finally(() => end(key));
                };
                root.openModal?.('modal-stl-preview');
                const rawUrl = `/api/projects/${encodeURIComponent(projectNo)}/files/raw?tab_key=${encodeURIComponent(tabKey)}&filename=${encodeURIComponent(filename)}`;
                await Promise.resolve(loadSTLModel(rawUrl, filename));
                return rawUrl;
            } finally { end(`preview:${projectNo}:${tabKey}:${filename}`); }
        }
        return { complete, deleteProject, open3mf, preview, setContext, invalidateContext, isLocked: key => locks.has(key) };
    }
    let manager;
    root.ProjectActions = { init: options => (manager = create(options)), get: () => manager };
})(window);
