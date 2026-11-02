/** Dashboard query, filtering and project-list rendering. */
(function (root, factory) {
    const DashboardManager = factory();
    if (typeof root !== 'undefined') root.DashboardManager = DashboardManager;
    if (typeof module !== 'undefined' && module.exports) module.exports = DashboardManager;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const delegatedDocuments = new WeakMap();

    function createManager({ state, api, showToast, escapeHtml, documentRef = document, actions = {} } = {}) {
        if (!state || !api || !showToast || !escapeHtml) throw new Error('DashboardManager.init requires state, api, showToast and escapeHtml');
        let projectsController = null;
        let projectsGeneration = 0;
        let statsController = null;
        let statsGeneration = 0;
        let dashboardGeneration = 0;

        function action(name, ...args) {
            if (typeof actions[name] === 'function') return actions[name](...args);
            if (typeof window !== 'undefined' && typeof window[name] === 'function') return window[name](...args);
            return undefined;
        }

        function bindDelegation() {
            if (typeof documentRef.addEventListener !== 'function') return;
            const handler = (event) => {
                const target = event.target?.closest?.('[data-dashboard-action]');
                if (!target) return;
                const root = target.closest('#projects-grid, #projects-table-body');
                if (!root) return;
                const projectNo = target.dataset.projectNo || root.dataset.projectNo;
                const actionName = target.dataset.dashboardAction;
                if (!projectNo || !actionName) return;
                if (actionName !== 'detail') event.stopPropagation();
                if (actionName === 'detail') action('openProjectDetail', projectNo);
                else if (actionName === '3mf') action('openProject3MF', projectNo);
                else if (actionName === 'folder') action('openProjectFolder', projectNo);
                else if (actionName === 'delete') action('confirmDeleteProject', projectNo, target.dataset.clientName || '', target.dataset.jobName || '', event);
            };
            const keyHandler = (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const target = event.target?.closest?.('[data-dashboard-action]');
                if (!target || target.dataset.dashboardAction !== 'detail') return;
                event.preventDefault();
                const projectNo = target.dataset.projectNo;
                if (projectNo) action('openProjectDetail', projectNo);
            };
            const current = { click: handler, keydown: keyHandler };
            const existing = delegatedDocuments.get(documentRef);
            if (existing) {
                existing.current = current;
                return;
            }
            const record = { current };
            documentRef.addEventListener('click', event => record.current.click(event));
            documentRef.addEventListener('keydown', event => record.current.keydown(event));
            delegatedDocuments.set(documentRef, record);
        }
        bindDelegation();

        function isProjectCompleted(p) {
            return p.overall_status === '완료' || (p.prod_status === '제작 완료' && p.pay_status === '입금 완료' && p.deliv_status === '배송 완료');
        }

        function getStatusBadgeClass(status) {
            if (['접수', '미청구', '미정'].includes(status)) return 'gray';
            if (['슬라이싱', '출력 중', '검수'].includes(status)) return 'blue';
            if (['견적 대기', '견적 발송', '입금 대기', '부분 입금', '예약 필요', '예약 완료', '발송'].includes(status)) return 'orange';
            if (['제작 완료', '입금 완료', '배송 완료', '완료'].includes(status)) return 'green';
            if (['문제 발생', '재출력'].includes(status)) return 'red';
            return 'gray';
        }

        function createProjectCardHTML(p) {
            const completed = isProjectCompleted(p);
            const urgent = !completed && p.due_date && new Date(p.due_date) <= new Date(Date.now() + 86400000 * 2);
            const no = escapeHtml(String(p.project_no || ''));
            const client = escapeHtml(String(p.client_name || ''));
            const job = escapeHtml(String(p.job_name || ''));
            const due = escapeHtml(String(p.due_date || '납기 미정'));
            const prod = escapeHtml(String(p.prod_status || ''));
            const pay = escapeHtml(String(p.pay_status || ''));
            const deliv = escapeHtml(String(p.deliv_status || ''));
            const meta = escapeHtml(`${p.material || '소재 미정'} ${p.color || ''} · ${p.quantity || '1'}`);
            const amount = Number(p.total_amount || 0);
            return `
        <article class="project-card ${completed ? 'is-completed' : ''}" role="button" tabindex="0" data-dashboard-action="detail" data-project-no="${no}" aria-label="${client} ${job} 상세 열기">
            <div class="card-top"><span class="card-project-no ${completed ? 'completed-no' : ''}">${no}</span>
                ${completed ? '<span class="card-completed-badge"><i class="fa-solid fa-circle-check"></i> 전체 완료</span>' : `<span class="card-due-date ${urgent ? 'urgent' : ''}"><i class="fa-regular fa-clock"></i> ${due}</span>`}
            </div>
            <div class="card-main"><span class="card-client"><i class="fa-regular fa-user"></i> ${client}</span><h3 class="card-job-name">${job}</h3></div>
            <div class="status-badge-row"><span class="status-badge ${getStatusBadgeClass(p.prod_status)}"><i class="fa-solid fa-cube"></i> ${prod}</span><span class="status-badge ${getStatusBadgeClass(p.pay_status)}"><i class="fa-solid fa-credit-card"></i> ${pay}</span><span class="status-badge ${getStatusBadgeClass(p.deliv_status)}"><i class="fa-solid fa-truck"></i> ${deliv}</span></div>
            <div class="card-meta-info"><span class="card-meta-spec" title="${meta}">${meta}</span><span class="card-amount">${Number.isFinite(amount) ? amount.toLocaleString() : '0'}원</span></div>
            <div class="card-actions"><button class="btn btn-outline btn-xs" data-dashboard-action="3mf" data-project-no="${no}" aria-label="${job} 3MF 열기" title="Bambu Studio에서 3MF 열기"><i class="fa-solid fa-cube text-primary"></i> 3MF</button><button class="btn btn-outline btn-xs" data-dashboard-action="detail" data-project-no="${no}"><i class="fa-solid fa-circle-info"></i> 상세</button><button class="btn btn-outline btn-xs" data-dashboard-action="folder" data-project-no="${no}" aria-label="${job} Finder 폴더 열기" title="Finder 열기"><i class="fa-solid fa-folder-open"></i> 폴더</button></div>
        </article>`;
        }

        function createProjectTableRowHTML(p) {
            const completed = isProjectCompleted(p);
            const no = escapeHtml(String(p.project_no || ''));
            const client = escapeHtml(String(p.client_name || ''));
            const job = escapeHtml(String(p.job_name || ''));
            const prod = escapeHtml(String(p.prod_status || ''));
            const pay = escapeHtml(String(p.pay_status || ''));
            const deliv = escapeHtml(String(p.deliv_status || ''));
            const due = escapeHtml(String(p.due_date || '-'));
            const amount = Number(p.total_amount || 0);
            return `<tr class="${completed ? 'is-completed-row' : ''}" data-dashboard-action="detail" data-project-no="${no}" tabindex="0" style="cursor:pointer;"><td class="font-bold ${completed ? 'text-success' : 'text-primary'}">${no}</td><td>${client}</td><td class="font-bold">${job}</td><td><span class="status-badge ${getStatusBadgeClass(p.prod_status)}">${prod}</span></td><td><span class="status-badge ${getStatusBadgeClass(p.pay_status)}">${pay}</span></td><td><span class="status-badge ${getStatusBadgeClass(p.deliv_status)}">${deliv}</span></td><td class="font-bold">${Number.isFinite(amount) ? amount.toLocaleString() : '0'}원</td><td>${completed ? '<span class="text-success"><i class="fa-solid fa-check"></i> 완료</span>' : due}</td><td><div style="display: flex; gap: 4px; align-items: center;"><button class="btn btn-outline btn-xs" data-dashboard-action="3mf" data-project-no="${no}" title="Bambu Studio에서 3MF 열기"><i class="fa-solid fa-cube text-primary"></i> 3MF</button><button class="btn btn-ghost btn-xs" data-dashboard-action="folder" data-project-no="${no}" title="Finder 열기"><i class="fa-solid fa-folder-open"></i></button><button class="btn btn-ghost btn-xs text-danger" data-dashboard-action="delete" data-project-no="${no}" data-client-name="${client}" data-job-name="${job}" title="프로젝트 삭제"><i class="fa-solid fa-trash-can"></i></button></div></td></tr>`;
        }

        function renderProjects() {
            const grid = documentRef.getElementById('projects-grid');
            const table = documentRef.getElementById('projects-table-body');
            const empty = documentRef.getElementById('empty-state');
            if (!grid || !table || !empty) return;
            if (state.projects.length === 0) {
                grid.innerHTML = ''; table.innerHTML = ''; empty.style.display = 'block'; return;
            }
            empty.style.display = 'none';
            const orderedProjects = [...state.projects].sort((a, b) => {
                const diff = Number(isProjectCompleted(a)) - Number(isProjectCompleted(b));
                return diff || (b.project_no || '').localeCompare(a.project_no || '');
            });
            if (state.viewMode === 'grid') grid.innerHTML = orderedProjects.map(createProjectCardHTML).join('');
            else table.innerHTML = orderedProjects.map(createProjectTableRowHTML).join('');
        }

        function applyViewMode() {
            const btn = documentRef.getElementById('btn-view-mode-toggle');
            if (btn) {
                btn.innerHTML = state.viewMode === 'grid' ? '<i class="fa-solid fa-table-cells-large"></i>' : '<i class="fa-solid fa-list"></i>';
                btn.setAttribute('aria-label', state.viewMode === 'grid' ? '테이블 보기로 전환' : '카드 보기로 전환');
            }
            const grid = documentRef.getElementById('projects-grid');
            const table = documentRef.getElementById('projects-table-wrapper');
            if (grid) grid.style.display = state.viewMode === 'grid' ? 'grid' : 'none';
            if (table) table.style.display = state.viewMode === 'table' ? 'block' : 'none';
        }

        async function loadStats() {
            if (statsController) statsController.abort();
            const generation = ++statsGeneration;
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            statsController = controller;
            try {
                const res = await api.getStats(controller ? { signal: controller.signal } : undefined);
                if (generation !== statsGeneration || !res || !res.success) {
                    if (generation === statsGeneration && res && !res.success) showToast(res.error || '통계 정보를 불러오지 못했습니다.', 'error');
                    return res;
                }
                state.stats = res.data;
                const values = [['stat-total', 'total_count'], ['stat-in-progress', 'in_progress'], ['stat-waiting', 'waiting_print'], ['stat-printing', 'printing'], ['stat-deliv-needed', 'deliv_needed'], ['stat-pay-pending', 'pay_pending'], ['stat-completed', 'completed'], ['nav-total-count', 'total_count'], ['nav-waiting-count', 'waiting_print'], ['nav-printing-count', 'printing'], ['nav-delivery-count', 'deliv_needed']];
                values.forEach(([id, key]) => { const el = documentRef.getElementById(id); if (el) el.textContent = res.data[key]; });
                return res;
            } catch (error) {
                if (generation !== statsGeneration || error?.name === 'AbortError' || error?.kind === 'abort' || error?.isAbortError) return null;
                console.error('Failed to load stats:', error);
                showToast('통계 정보를 불러오지 못했습니다.', 'error');
                return null;
            } finally {
                if (statsGeneration === generation && statsController === controller) statsController = null;
            }
        }

        async function loadProjects() {
            if (projectsController) projectsController.abort();
            projectsController = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const controller = projectsController;
            const generation = ++projectsGeneration;
            try {
                const options = projectsController ? { signal: projectsController.signal } : undefined;
                const res = await api.getProjects(state.filters, options);
                if (generation !== projectsGeneration || !res || !res.success) {
                    if (generation === projectsGeneration && res && !res.success) showToast(res.error || '프로젝트 목록을 불러오지 못했습니다.', 'error');
                    return res;
                }
                state.projects = res.data;
                renderProjects();
                return res;
            } catch (error) {
                if (generation !== projectsGeneration || error?.name === 'AbortError' || error?.kind === 'abort' || error?.isAbortError) return;
                console.error('Failed to load projects:', error);
                showToast('프로젝트 목록을 불러오지 못했습니다.', 'error');
                return null;
            } finally {
                if (projectsGeneration === generation && projectsController === controller) projectsController = null;
            }
        }

        async function loadDashboard() {
            const generation = ++dashboardGeneration;
            const result = await Promise.all([loadStats(), loadProjects()]);
            return generation === dashboardGeneration ? result : null;
        }

        // All external invalidation/mutation paths use this single entry
        // point so list and stats are revalidated together.
        function revalidate() { return loadDashboard(); }

        function applyQuickFilter(filterType) {
            state.filters = { search: '', prod_status: '', pay_status: '', deliv_status: '', overall_status: '' };
            ['filter-prod-status', 'filter-pay-status', 'filter-deliv-status'].forEach(id => {
                const el = documentRef.getElementById(id);
                if (el) el.value = '';
            });
            const search = documentRef.getElementById('global-search');
            if (search) search.value = '';
            const clear = documentRef.getElementById('btn-clear-search');
            if (clear) clear.style.display = 'none';
            if (filterType === 'in_progress') state.filters.overall_status = '진행 중';
            else if (filterType === 'waiting') state.filters.prod_status = '접수,슬라이싱,견적 대기';
            else if (filterType === 'printing') state.filters.prod_status = '출력 중';
            else if (filterType === 'delivery_needed') state.filters.deliv_status = '예약 필요';
            else if (filterType === 'payment_pending') state.filters.pay_status = '견적 발송,입금 대기,부분 입금';
            else if (filterType === 'completed') state.filters.overall_status = '완료';
            loadProjects();
        }

        return { loadDashboard, revalidate, loadStats, loadProjects, renderProjects, applyViewMode, applyQuickFilter, createProjectCardHTML, createProjectTableRowHTML };
    }
    return { init: createManager };
});
