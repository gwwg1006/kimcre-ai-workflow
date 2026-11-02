/**
 * 김명규크리에이티브 작업관리 시스템 - 메인 프론트엔드 컨트롤러
 */

let state = {
    currentView: 'dashboard',
    viewMode: 'grid', // 'grid' | 'table'
    filters: {
        search: '',
        prod_status: '',
        pay_status: '',
        deliv_status: '',
        overall_status: ''
    },
    projects: [],
    partners: [],
    partnerSearchResults: [],
    stats: {},
    currentProject: null,
    currentTab: 'received',
    selectedNewFiles: [],
    aiAttachedFiles: [],
    aiChatHistory: [],
    detailAiFiles: []
};
let dashboardManager;
let partnerManager;
let detailItemsManager;
let newProjectManager;
let deliveryManager;
let projectActions;
let detailAiManager;
let projectEditor;
const AI_EXTERNAL_ENABLED_KEY = 'aiExternalTransferEnabled';
const PROJECT_INVALIDATION_CHANNEL = 'kmc-project-state';
let projectStateChannel = null;

function projectNumbersFrom(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(projectNumbersFrom);
    if (typeof value === 'string' || typeof value === 'number') return [String(value)];
    if (typeof value !== 'object') return [];
    return [value.project_no, value.projectNo, value.data?.project_no, value.data?.projectNo]
        .flatMap(projectNumbersFrom).filter(Boolean);
}

function broadcastProjectInvalidation(projectNos = [], reason = 'mutation') {
    if (!projectStateChannel) return;
    const unique = [...new Set(projectNumbersFrom(projectNos))];
    try { projectStateChannel.postMessage({ type: 'projects-invalidated', projectNos: unique, reason, at: Date.now() }); } catch (_) { /* unsupported/closed channel */ }
}

async function refreshProjectState(projectNos = []) {
    const affected = new Set(projectNumbersFrom(projectNos));
    const currentNo = String(state.currentProject?.project_no || '');
    // A missing list means the mutation may have touched any project (for
    // example an AI plan), so revalidate the open detail conservatively.
    const refreshDetail = currentNo && (!affected.size || affected.has(currentNo))
        ? openProjectDetail(currentNo)
        : Promise.resolve();
    await Promise.all([loadDashboard(), refreshDetail]);
}

function installProjectStateSync() {
    if (typeof BroadcastChannel === 'function' && !projectStateChannel) {
        try {
            projectStateChannel = new BroadcastChannel(PROJECT_INVALIDATION_CHANNEL);
            projectStateChannel.addEventListener('message', event => {
                const message = event?.data;
                if (message?.type !== 'projects-invalidated') return;
                refreshProjectState(message.projectNos || []).catch(error => console.warn('상태 재검증 실패:', error));
            });
        } catch (_) { projectStateChannel = null; }
    }
    if (API.__projectStateSyncInstalled) return;
    API.__projectStateSyncInstalled = true;
    // Mutations made in this tab announce themselves to other tabs. Existing
    // module-level refreshes remain in place, so this wrapper does not add a
    // second local refresh request.
    ['createProject', 'updateProject', 'updateStatus', 'completeProject', 'deleteProject', 'generateEstimate', 'updateDelivery', 'trackDelivery', 'applyAiPlan', 'syncAll'].forEach(method => {
        if (typeof API[method] !== 'function') return;
        const original = API[method];
        API[method] = async function (...args) {
            const result = await original.apply(this, args);
            if (result?.success !== false) {
                const ids = method === 'syncAll' || method === 'applyAiPlan' ? [] : [args[0], result];
                broadcastProjectInvalidation(ids, method);
            }
            return result;
        };
    });
}

function isExternalAiTransferEnabled() {
    return localStorage.getItem(AI_EXTERNAL_ENABLED_KEY) !== 'false';
}

function openAiSettings() {
    const toggle = document.getElementById('setting-ai-external-enabled');
    if (toggle) toggle.checked = isExternalAiTransferEnabled();
    openModal('modal-ai-settings');
}

function saveAiSettings() {
    const toggle = document.getElementById('setting-ai-external-enabled');
    localStorage.setItem(AI_EXTERNAL_ENABLED_KEY, toggle?.checked === true ? 'true' : 'false');
    closeModal('modal-ai-settings');
    showToast(toggle?.checked === true ? '외부 AI 전송을 허용했습니다.' : '외부 AI 전송을 차단했습니다.', 'success');
}

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', () => {
    installProjectStateSync();
    detailItemsManager = window.DetailItemsManager?.init({ state, api: API, documentRef: document, showToast, refresh: (project) => { state.currentProject = project; } });
    deliveryManager = window.DeliveryManager?.init({ state, api: API, documentRef: document, showToast, openProjectDetail, loadProjects, loadStats, loadDashboard, renderProjectDetailContent });
    detailAiManager = window.DetailAiManager?.init({ state, api: API, documentRef: document, showToast, confirmFn: window.confirm, reload: openProjectDetail, refresh: () => { loadProjects(); loadStats(); } });
    projectEditor = window.ProjectEditor?.init({ state, api: API, documentRef: document, pricing: Pricing, showToast, openModal, closeModal, render: renderProjectDetailContent, refreshProjects: loadProjects, refreshStats: loadStats, calculate: () => detailItemsManager?.calculate() });
    newProjectManager = window.NewProjectManager?.init({ state, api: API, documentRef: document, showToast, escapeHtml, pricing: Pricing, confirmFn: window.confirm, partnerAdapter: { select: partner => { const field = document.getElementById('new-partner-id'); if (field) field.value = partner?.id || ''; }, refresh: () => getPartnerManager()?.loadPartners?.() } });
    projectActions = window.ProjectActions?.init({ state, api: API, documentRef: document, confirmFn: window.confirm, showToast, renderProjectDetailContent, refresh: loadDashboard, closeModal, loadSTLModel });
    initTheme();
    getPartnerManager()?.init();
    dashboardManager = DashboardManager.init({
        state, api: API, showToast, escapeHtml,
        actions: {
            openProjectDetail,
            openProject3MF,
            openProjectFolder: (projectNo) => API.openProjectFolder(projectNo),
            confirmDeleteProject
        }
    });
    applyViewMode();
    bindEvents();
    loadDashboard();
});

window.refreshProjectState = refreshProjectState;

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.className = savedTheme;
    state.viewMode = localStorage.getItem('projectViewMode') || 'grid';
    updateThemeIcon(savedTheme);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
        btn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.className = newTheme;
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

// --- 이벤트 바인딩 ---
function bindEvents() {
    if (document.__appEventsBound) return;
    document.__appEventsBound = true;
    document.getElementById('btn-open-ai-settings')?.addEventListener('click', openAiSettings);
    document.getElementById('btn-save-ai-settings')?.addEventListener('click', saveAiSettings);
    // 1. 테마 토글
    document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('btn-shutdown-server')?.addEventListener('click', handleShutdownServer);

    // 2. 사이드바 네비게이션
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
        });
    });

    // 3. 글로벌 검색
    const searchInput = document.getElementById('global-search');
    const clearBtn = document.getElementById('btn-clear-search');
    const debouncedLoadProjects = debounce(loadProjects, 250);
    searchInput?.addEventListener('input', (e) => {
        state.filters.search = e.target.value.trim();
        clearBtn.style.display = state.filters.search ? 'block' : 'none';
        debouncedLoadProjects();
    });
    clearBtn?.addEventListener('click', () => {
        searchInput.value = '';
        state.filters.search = '';
        clearBtn.style.display = 'none';
        loadProjects();
    });

    // 4. 필터 셀렉트
    document.getElementById('filter-prod-status')?.addEventListener('change', (e) => {
        state.filters.prod_status = e.target.value;
        loadProjects();
    });
    document.getElementById('filter-pay-status')?.addEventListener('change', (e) => {
        state.filters.pay_status = e.target.value;
        loadProjects();
    });
    document.getElementById('filter-deliv-status')?.addEventListener('change', (e) => {
        state.filters.deliv_status = e.target.value;
        loadProjects();
    });
    document.getElementById('btn-reset-filters')?.addEventListener('click', resetFilters);

    // 5. 요약 카드 클릭 필터링
    document.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const filterType = card.dataset.filter;
            applyQuickFilter(filterType);
        });
    });

    // 6. 뷰 모드 전환 (그리드/테이블)
    document.getElementById('btn-view-mode-toggle')?.addEventListener('click', toggleViewMode);

    // 7. 신규 작업 모달 열기 버튼

    // 8. 동기화 버튼
    document.getElementById('btn-sync-all')?.addEventListener('click', handleSyncAll);

    // 8-1. 거래처 관리
    document.getElementById('btn-add-partner')?.addEventListener('click', () => openPartnerForm());
    const newProjectForm = document.getElementById('form-new-project');
    newProjectForm?.addEventListener('submit', handleNewProjectSubmit);

    // 9. 파일 탭 전환
    document.querySelectorAll('.file-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.currentTab = tab.dataset.tab;
            document.getElementById('current-tab-name').textContent = getTabFolderKorean(state.currentTab);
            renderProjectFiles();
        });
    });

    // 10. 신규 작업 통합 파일 드롭존
    setupDropzone('new-project-dropzone', 'new-project-files', (files) => {
        addFilesToNewProject(files);
    });

    // 10-1. 클립보드 이미지 붙여넣기 (Cmd + V / Ctrl + V)
    document.addEventListener('paste', (e) => {
        const newProjModal = document.getElementById('modal-new-project');
        const detailModal = document.getElementById('modal-project-detail');

        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        const items = clipboardData.items;
        const imageFiles = [];

        if (items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type && item.type.indexOf('image') !== -1) {
                    const blob = item.getAsFile();
                    if (blob) {
                        const now = new Date();
                        const pad = (n) => String(n).padStart(2, '0');
                        const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
                        const ext = blob.type.split('/')[1] || 'png';
                        const filename = `clipboard_${timeStr}.${ext}`;
                        const file = new File([blob], filename, { type: blob.type });
                        imageFiles.push(file);
                    }
                }
            }
        }

        if (imageFiles.length > 0) {
            // 1) 신규 작업 등록 모달이 열려 있는 경우
            if (newProjModal && newProjModal.classList.contains('active')) {
                addFilesToNewProject(imageFiles);
                showToast(`클립보드 이미지(${imageFiles.map(f => f.name).join(', ')})가 첨부되었습니다!`, 'success');
            }
            // 2) 프로젝트 상세 모달이 열려 있는 경우
            else if (detailModal && detailModal.classList.contains('active') && state.currentProject) {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.id === 'detail-ai-prompt' || activeEl.closest('.detail-ai-modifier-card'))) {
                    handleDetailAiFilesSelected(imageFiles);
                    showToast(`클립보드 이미지(${imageFiles.map(f => f.name).join(', ')})가 AI 수정 첨부파일로 추가되었습니다.`, 'success');
                } else {
                    handleTabFileUpload(imageFiles);
                    showToast(`클립보드 이미지가 '${getTabFolderKorean(state.currentTab)}' 탭에 업로드되었습니다.`, 'success');
                }
            }
        }
    });

    // 11. 탭 파일 드롭존
    setupDropzone('tab-file-dropzone', 'tab-file-input', (files) => {
        if (!state.currentProject) return;
        handleTabFileUpload(files);
    });

    // Finder 폴더 열기
    document.getElementById('btn-open-in-finder')?.addEventListener('click', () => {
        if (state.currentProject) {
            API.openProjectFolder(state.currentProject.project_no)
                .then(res => {
                    if (res.success) showToast('Finder에서 프로젝트 폴더를 열었습니다.', 'info');
                    else showToast(res.error, 'error');
                });
        }
    });

    // 13-1. 기본 정보 수정 모달 열기
    document.getElementById('btn-edit-project-info')?.addEventListener('click', handleOpenEditProjectInfoModal);

    // 13-2. 3MF 파일 열기 (Bambu Studio)
    document.getElementById('btn-open-3mf')?.addEventListener('click', handleOpenCurrentProject3MF);

    // 14. 프로젝트 완료 처리
    document.getElementById('btn-complete-project')?.addEventListener('click', handleCompleteProject);

    // 14-1. 프로젝트 삭제 처리
    document.getElementById('btn-delete-project')?.addEventListener('click', handleDeleteCurrentProject);

    // 15. 로지아이 주소 복사
    document.getElementById('btn-copy-logii-address')?.addEventListener('click', handleCopyLogiiAddress);

    // 16. 운송장번호 저장
    document.getElementById('btn-save-tracking')?.addEventListener('click', handleSaveTrackingNo);
    document.getElementById('btn-track-delivery')?.addEventListener('click', handleTrackDelivery);
    document.getElementById('detail-tracking-no')?.addEventListener('input', updateTrackingLinkFromFields);
    document.getElementById('detail-courier')?.addEventListener('change', updateTrackingLinkFromFields);

    // 17. 견적서 모달 열기
    document.getElementById('btn-open-estimate-modal')?.addEventListener('click', openEstimateModal);

    // 18. 3D 뷰어 카메라 리셋
    document.getElementById('btn-reset-camera')?.addEventListener('click', resetSTLCamera);

    // 19. AI 프롬프트: Enter로 분석, Shift+Enter로 줄바꿈
    document.getElementById('ai-order-prompt')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAiOrderAnalysis();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const activeModals = document.querySelectorAll('.modal-overlay.active');
        if (activeModals.length > 0) {
            // 가장 위에 떠 있는(마지막으로 열린) 모달부터 닫기
            const topmostModal = activeModals[activeModals.length - 1];
            closeModal(topmostModal.id);
        }
    });
}

// --- 뷰 전환 ---
function switchView(viewName) {
    state.currentView = viewName;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });

    const titleEl = document.getElementById('current-view-title');
    const subEl = document.getElementById('current-view-subtitle');
    const summarySection = document.getElementById('summary-section');
    const filterToolbar = document.getElementById('project-filter-toolbar');
    const projectsContainer = document.querySelector('.projects-container');
    const partnersView = document.getElementById('partners-view');

    resetFilters(false);
    const isPartnersView = viewName === 'partners';
    if (filterToolbar) filterToolbar.style.display = isPartnersView ? 'none' : '';
    if (projectsContainer) projectsContainer.style.display = isPartnersView ? 'none' : '';
    if (partnersView) partnersView.style.display = isPartnersView ? 'block' : 'none';

    if (viewName === 'dashboard') {
        titleEl.textContent = '실시간 작업 현황판';
        subEl.textContent = '김명규크리에이티브의 수주, 출력, 견적, 배송 현황을 한눈에 관리합니다.';
        summarySection.style.display = 'grid';
        state.filters.overall_status = '진행 중';
    } else if (viewName === 'all-projects') {
        titleEl.textContent = '전체 작업 목록';
        subEl.textContent = '진행 중 및 완료된 모든 작업의 히스토리를 조회합니다.';
        summarySection.style.display = 'none';
        state.filters.overall_status = '';
    } else if (viewName === 'print-waiting') {
        titleEl.textContent = '슬라이싱 및 출력 대기 작업';
        subEl.textContent = '접수 후 모델 검토 및 3MF 슬라이싱 작업이 필요한 목록입니다.';
        summarySection.style.display = 'none';
        state.filters.prod_status = '접수,슬라이싱,견적 대기';
    } else if (viewName === 'printing') {
        titleEl.textContent = '현재 출력 중인 작업';
        subEl.textContent = '3D 프린터에서 가동 및 제작 진행 중인 프로젝트입니다.';
        summarySection.style.display = 'none';
        state.filters.prod_status = '출력 중';
    } else if (viewName === 'delivery') {
        titleEl.textContent = '배송 및 발송 관리';
        subEl.textContent = '로지아이 택배 예약 및 발송 처리가 필요한 작업 목록입니다.';
        summarySection.style.display = 'none';
        state.filters.deliv_status = '예약 필요';
    } else if (viewName === 'payment') {
        titleEl.textContent = '입금 및 정산 관리';
        subEl.textContent = '견적서 발송 후 입금 대기 중이거나 정산이 필요한 목록입니다.';
        summarySection.style.display = 'none';
        state.filters.pay_status = '견적 발송,입금 대기,부분 입금';
    } else if (viewName === 'completed') {
        titleEl.textContent = '완료 작업 보관함';
        subEl.textContent = '제작, 배송, 입금이 모두 완료된 프로젝트 기록입니다.';
        summarySection.style.display = 'none';
        state.filters.overall_status = '완료';
    } else if (viewName === 'partners') {
        titleEl.textContent = '거래처 관리';
        subEl.textContent = '거래처 기본정보를 관리하고 신규 프로젝트에 빠르게 불러옵니다.';
        summarySection.style.display = 'none';
        loadPartners();
        return;
    } else if (viewName === 'ai-commander') {
        titleEl.textContent = '통합 AI 관제 센터';
        subEl.textContent = 'Gemini 3.7 Flash AI가 전체 프로젝트를 실시간으로 모니터링하고 제어합니다.';
        summarySection.style.display = 'grid';
        state.filters.overall_status = '';
        if (typeof focusGlobalAiCommander === 'function') {
            setTimeout(focusGlobalAiCommander, 100);
        }
    }

    loadProjects();
}

function resetFilters(reload = true) {
    state.filters = { search: '', prod_status: '', pay_status: '', deliv_status: '', overall_status: '' };
    document.getElementById('filter-prod-status').value = '';
    document.getElementById('filter-pay-status').value = '';
    document.getElementById('filter-deliv-status').value = '';
    const searchInput = document.getElementById('global-search');
    if (searchInput) searchInput.value = '';
    document.getElementById('btn-clear-search').style.display = 'none';
    if (reload) loadProjects();
}

function getPartnerManager() {
    if (!partnerManager && window.PartnerManager) partnerManager = window.PartnerManager.init({ state, api: API, documentRef: document, showToast, escapeHtml, confirmFn: window.confirm, selectNewPartner: partner => newProjectManager?.selectPartner?.(partner) });
    return partnerManager;
}
function partnerLabel(partner) { return getPartnerManager()?.partnerLabel(partner) || ''; }
function renderPartnerOptions() { return getPartnerManager()?.renderPartnerOptions(); }

function loadPartners(search = '') { const manager = getPartnerManager(); manager?.refreshBindings?.(); return manager?.loadPartners(search); }

function renderPartnersTable() { return getPartnerManager()?.renderPartnersTable(); }

function handleNewPartnerSelection(event) { return getPartnerManager()?.handleNewPartnerSelection(event); }

function openPartnerForm(partnerId = null) { return getPartnerManager()?.openPartnerForm(partnerId); }

function handlePartnerSubmit(event) { return getPartnerManager()?.handlePartnerSubmit(event); }

function archivePartnerRecord(partnerId) { return getPartnerManager()?.archivePartnerRecord(partnerId); }

function handleQuickTaxTypeUpdate(taxType) { return getProjectEditor()?.updateTaxType(taxType); }
function handleQuickShippingFeeUpdate(value) { return getProjectEditor()?.updateShipping(value); }
// --- 프로젝트 기본 정보 직접 수정 모달 핸들러 ---
function getProjectEditor() { return projectEditor || window.ProjectEditor?.get(); }
function handleSaveProjectInfo(event) { return getProjectEditor()?.save(event); }
function handleOpenEditProjectInfoModal() { return getProjectEditor()?.fill(); }
// --- 프로젝트 상세 AI 스마트 수정 어시스턴트 (Gemini 3.7 Flash) ---
function getDetailAiManager() { return detailAiManager || window.DetailAiManager?.get(); }
function handleDetailAiFilesSelected(files) { return getDetailAiManager()?.addFiles(files); }
function removeDetailAiFile(index) { return getDetailAiManager()?.removeFile(index); }
function renderDetailAiAttachedChips() { return getDetailAiManager()?.renderFiles(); }
function handleDetailAiModify() { return getDetailAiManager()?.submit(); }
// AI 변경 제안을 확인할 수 없는 응답입니다 — 실제 처리는 DetailAiManager가 담당한다.
// --- 빠른 상태 변경 ---
function handleQuickStatusChange(statusType, statusVal) { return getProjectEditor()?.updateStatus(statusType, statusVal); }
// --- 프로젝트 완료 처리 ---
async function handleCompleteProject() {
    return projectActions?.complete?.() || null;
}

// --- 프로젝트 삭제 처리 ---
async function handleDeleteCurrentProject() {
    return projectActions?.deleteProject?.(state.currentProject?.project_no, state.currentProject?.client_name, state.currentProject?.job_name) || null;
}

async function confirmDeleteProject(projectNo, clientName = '', jobName = '', event = null) {
    return projectActions?.deleteProject?.(projectNo, clientName, jobName, event) || null;
}

// --- 3MF 파일 열기 (Bambu Studio) ---
async function handleOpenCurrentProject3MF() {
    return projectActions?.open3mf?.(state.currentProject?.project_no) || null;
}

async function openProject3MF(projectNo) {
    return projectActions?.open3mf?.(projectNo) || null;
}

// --- 3D STL 미리보기 ---
function previewSTL(tabKey, filename) {
    return projectActions?.preview?.(tabKey, filename) || null;
}

/* 배송 구현은 static/js/modules/delivery.js에 있고, 이 함수들은 기존 전역 계약을 보존하는 wrapper다. */
function getDeliveryManager() { return deliveryManager || window.DeliveryManager?.get(); }
function handleCopyLogiiAddress(...args) { return getDeliveryManager()?.handleCopyLogiiAddress(...args); }
function updateTrackingLink(...args) { return getDeliveryManager()?.updateTrackingLink(...args); }
function renderTrackingResult(...args) { return getDeliveryManager()?.renderTrackingResult(...args); }
function updateTrackingLinkFromFields(...args) { return getDeliveryManager()?.updateTrackingLinkFromFields(...args); }
function handleSaveTrackingNo(...args) { return getDeliveryManager()?.handleSaveTrackingNo(...args); }
function handleTrackDelivery(...args) { return getDeliveryManager()?.handleTrackDelivery(...args); }

// --- 신규 작업 등록 및 다중 품목 관리 ---
function addNewProjectItemRow(name = '', material = '', color = '', qty = 1, price = 0, note = '', stl = '') {
    if (window.NewProjectManager?.get) return window.NewProjectManager.get().add(name, material, color, qty, price, note, stl);
    return undefined;
}

function calculateNewProjectItemTotals() {
    if (window.NewProjectManager?.get) return window.NewProjectManager.get().calculate();
    return undefined;
}

function addItemsFromAttachedFiles() {
    if (window.NewProjectManager?.get) return window.NewProjectManager.get().addItemsFromFiles();
    return undefined;
}

async function openNewProjectModal() {
    if (window.NewProjectManager?.get) { const manager = window.NewProjectManager.get(); manager.reset(); openModal('modal-new-project'); return; }
}

function renderSelectedNewFiles() {
    if (window.NewProjectManager?.get) return window.NewProjectManager.get().renderFiles();
    return undefined;
}

function removeSelectedNewFile(index) {
    if (window.NewProjectManager?.get) return window.NewProjectManager.get().removeFile(index);
    return undefined;
}

async function handleNewProjectSubmit(event) {
    if (window.NewProjectManager?.get) return window.NewProjectManager.get().submit(event);
}

// --- 전체 동기화 ---
async function handleSyncAll() {
    const btn = document.getElementById('btn-sync-all');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i>';
    try {
        const res = await API.syncAll();
        if (res.success) {
            showToast(res.message, 'success');
            await loadDashboard();
        } else {
            showToast(res.error, 'error');
        }
    } catch (e) {
        showToast('동기화 중 오류 발생', 'error');
    } finally {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
    }
}

async function handleShutdownServer() {
    if (!window.confirm('작업관리 서버를 종료할까요?\n다시 사용하려면 시작 앱을 실행하면 됩니다.')) return;

    const button = document.getElementById('btn-shutdown-server');
    const originalMarkup = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-power-off fa-fade"></i>';
    }
    try {
        const response = await API.shutdownServer();
        if (!response?.success) throw new Error(response?.error || '서버를 종료하지 못했습니다.');
        showToast(response.message || '서버를 종료했습니다. 다시 사용하려면 시작 앱을 실행하세요.', 'info');
    } catch (error) {
        showToast(error?.message || '서버 종료 요청에 실패했습니다.', 'error');
        if (button) button.disabled = false;
    } finally {
        if (button && !button.disabled) button.innerHTML = originalMarkup;
    }
}

// --- 드롭존 헬퍼 ---
function setupDropzone(dropzoneId, inputId, onFiles) {
    const zone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
        if (input.files.length > 0) onFiles(input.files);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('dragover');
        });
    });

    zone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) onFiles(files);
    });
}

// DashboardManager compatibility wrappers: preserve existing inline/event contracts.
function loadDashboard() {
    return dashboardManager?.loadDashboard();
}

function loadStats() {
    return dashboardManager?.loadStats();
}

function loadProjects() {
    return dashboardManager?.loadProjects();
}

function renderProjects() {
    return dashboardManager?.renderProjects();
}

function applyViewMode() {
    return dashboardManager?.applyViewMode();
}

function toggleViewMode() {
    state.viewMode = state.viewMode === 'grid' ? 'table' : 'grid';
    localStorage.setItem('projectViewMode', state.viewMode);
    applyViewMode();
    renderProjects();
}

function applyQuickFilter(filterType) {
    return dashboardManager?.applyQuickFilter(filterType);
}
