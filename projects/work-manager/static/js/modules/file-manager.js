/**
 * 프로젝트 상세의 파일 탭 렌더링과 파일 조작 액션.
 */
(function registerFileManager(window) {
    let tokenSequence = 0;
    const allowedTabs = new Set(['received', 'modified', 'slicing', 'qc', 'estimate', 'delivery']);
    const allowedIcons = new Set(['stl', '3mf', 'pdf', 'xlsx', 'image', 'other']);

    function fileTabButtons() {
        if (typeof document.querySelectorAll !== 'function') return [];
        return Array.from(document.querySelectorAll('.files-tab-header [role="tab"], .files-tab-header .file-tab'))
            .filter(button => !button.disabled && button.getAttribute('aria-hidden') !== 'true' && button.style.display !== 'none');
    }
    function syncFileTabA11y(selectedKey, render = false) {
        const header = document.querySelector('.files-tab-header');
        if (!header) return;
        const buttons = fileTabButtons();
        const selected = buttons.find(button => button.dataset.tab === selectedKey) || buttons[0];
        if (!selected) return;
        const key = selected.dataset.tab;
        buttons.forEach(button => {
            const active = button === selected;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        const panel = document.getElementById('tab-files-container');
        if (panel) {
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', selected.id);
            panel.tabIndex = 0;
        }
        const name = document.getElementById('current-tab-name');
        if (name) name.textContent = getTabFolderKorean(key);
        if (typeof state !== 'undefined') state.currentTab = key;
        if (render && typeof renderProjectFiles === 'function') renderProjectFiles();
    }
    function selectFileTab(button, shouldRender = true) {
        if (!button || button.disabled) return;
        syncFileTabA11y(button.dataset.tab, shouldRender);
    }
    function bindFileTabs() {
        if (typeof document.querySelector !== 'function') return;
        const header = document.querySelector('.files-tab-header');
        if (!header || header.__fileTabsBound) return;
        header.addEventListener('click', event => {
            const button = event.target.closest?.('.file-tab');
            if (!button || !header.contains(button)) return;
            event.preventDefault?.(); event.stopImmediatePropagation?.();
            selectFileTab(button);
        }, true);
        header.addEventListener('keydown', event => {
            const button = event.target.closest?.('.file-tab');
            if (!button || !header.contains(button)) return;
            const buttons = fileTabButtons(); const index = buttons.indexOf(button);
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault?.(); selectFileTab(button); return; }
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault?.();
            let next = index;
            if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = buttons.length - 1;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
            else next = (index + 1) % buttons.length;
            buttons[next]?.focus?.(); selectFileTab(buttons[next]);
        }, true);
        header.__fileTabsBound = true;
        syncFileTabA11y(typeof state !== 'undefined' ? state.currentTab : 'received', false);
    }

    function ensureDelegation(container) {
        if (container.__fileManagerDelegation) return;
        const dispatch = event => {
            const target = event.target;
            const button = target && target.closest ? target.closest('[data-file-action]') : null;
            if (!button || (container.contains && !container.contains(button))) return;
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
            if (event.type === 'keydown' && event.preventDefault) event.preventDefault();
            if (button.dataset.fileBusy === '1') return;
            const record = container.__fileManagerActions && container.__fileManagerActions.get(button.dataset.fileToken);
            const action = button.dataset.fileAction;
            if (!record || !['preview', 'open', 'reveal', 'bump', 'delete'].includes(action)) return;
            button.dataset.fileBusy = '1';
            Promise.resolve().then(() => {
                if (action === 'preview') return previewSTL(record.tabKey, record.name);
                if (action === 'open') return API.openFile(record.projectNo, record.tabKey, record.name, false);
                if (action === 'reveal') return API.openFile(record.projectNo, record.tabKey, record.name, true);
                if (action === 'bump') return handleBumpVersion(record.name, record.projectNo, record.tabKey);
                return handleDeleteFile(record.name, record.projectNo, record.tabKey);
            }).finally(() => { delete button.dataset.fileBusy; });
        };
        container.addEventListener('click', dispatch);
        container.addEventListener('keydown', dispatch);
        container.__fileManagerDelegation = dispatch;
    }

    function fileIcon(file) {
        const ext = String(file.ext || '').toLowerCase();
        if (ext === '.stl') return ['stl', '<i class="fa-solid fa-cube"></i>'];
        if (ext === '.3mf') return ['3mf', '<i class="fa-solid fa-cube"></i>'];
        if (ext === '.pdf') return ['pdf', '<i class="fa-solid fa-file-pdf"></i>'];
        if (ext === '.xlsx' || ext === '.xls') return ['xlsx', '<i class="fa-solid fa-file-excel"></i>'];
        if (file.category === 'image') return ['image', '<i class="fa-solid fa-file-image"></i>'];
        return ['other', '<i class="fa-solid fa-file"></i>'];
    }

    function renderProjectFiles() {
        bindFileTabs();
        const container = document.getElementById('tab-files-container');
        if (!container || !state.currentProject || !state.currentProject.tabs) return;

        ensureDelegation(container);
        const tabKey = allowedTabs.has(state.currentTab) ? state.currentTab : 'received';
        const tabData = state.currentProject.tabs[tabKey];
        container.__fileManagerActions = new Map();
        if (!tabData || !tabData.files || tabData.files.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 40px 0;">
                    <div class="empty-icon"><i class="fa-regular fa-folder-open"></i></div>
                    <p>이 폴더에 저장된 파일이 없습니다.</p>
                    <span class="drop-hint">상단 드롭존에 파일을 끌어다 놓으세요.</span>
                </div>
            `;
            return;
        }

        const actionButton = (action, label, icon, token, extra) => `<button type="button" class="btn ${extra}" data-file-action="${action}" data-file-token="${token}" data-tab-key="${escapeHtml(tabKey)}" title="${escapeHtml(label)}"><i class="${icon}"></i>${action === 'open' ? ' 열기' : ''}</button>`;
        container.innerHTML = tabData.files.map(f => {
            const file = f || {};
            const [rawIcon, iconHtml] = fileIcon(file);
            const iconClass = allowedIcons.has(rawIcon) ? rawIcon : 'other';
            const isSTL = String(file.ext || '').toLowerCase() === '.stl';
            const token = `fm-${++tokenSequence}`;
            container.__fileManagerActions.set(token, { name: String(file.name || ''), tabKey, projectNo: String(state.currentProject.project_no) });
            return `<div class="file-item-card"><div class="file-item-left"><div class="file-type-icon ${iconClass}">${iconHtml}</div><div class="file-info"><span class="file-name" title="${escapeHtml(file.name || '')}">${escapeHtml(file.name || '')}</span><div class="file-meta"><span>${escapeHtml(file.formatted_size || '')}</span><span>·</span><span>${escapeHtml(file.mtime || '')}</span></div></div></div><div class="file-actions">${isSTL ? actionButton('preview', '3D 미리보기', 'fa-solid fa-cube', token, 'btn-outline btn-xs') : ''}${actionButton('open', '열기', 'fa-solid fa-arrow-up-right-from-square', token, 'btn-outline btn-xs')}${actionButton('reveal', 'Finder에서 위치 보기', 'fa-solid fa-folder-open', token, 'btn-ghost btn-xs')}${actionButton('bump', '버전 올리기 (v01 -> v02)', 'fa-solid fa-code-branch', token, 'btn-ghost btn-xs')}${actionButton('delete', '삭제', 'fa-solid fa-trash', token, 'btn-ghost btn-xs text-danger')}</div></div>`;
        }).join('');
    }

    function getTabFolderKorean(tabKey) {
        const map = {
            received: '01_수신원본', modified: '02_모델수정', slicing: '03_슬라이싱_3MF',
            qc: '04_출력검수', estimate: '05_견적거래', delivery: '06_배송'
        };
        return map[tabKey] || tabKey;
    }

    async function handleTabFileUpload(files) {
        if (!state.currentProject || files.length === 0) return;
        const projectNo = String(state.currentProject.project_no);
        const tabKey = allowedTabs.has(state.currentTab) ? state.currentTab : 'received';
        try {
            showToast('파일을 업로드하는 중...', 'info');
            const res = await API.uploadFiles(projectNo, tabKey, files);
            if (res.success) {
                showToast(res.message, 'success');
                if (String(state.currentProject?.project_no || '') === projectNo && state.currentTab === tabKey) openProjectDetail(projectNo);
            } else showToast(res.error, 'error');
        } catch (e) {
            showToast('파일 업로드 실패', 'error');
        }
    }

    async function handleBumpVersion(filename, requestedProjectNo = null, requestedTab = null) {
        if (!state.currentProject && !requestedProjectNo) return;
        const projectNo = String(requestedProjectNo || state.currentProject.project_no);
        const tabKey = requestedTab || (allowedTabs.has(state.currentTab) ? state.currentTab : 'received');
        try {
            const res = await API.bumpFileVersion(projectNo, tabKey, filename);
            if (res.success) {
                showToast(res.message, 'success');
                if (String(state.currentProject?.project_no || '') === projectNo && state.currentTab === tabKey) openProjectDetail(projectNo);
            } else showToast(res.error, 'error');
        } catch (e) {
            showToast('버전 생성 실패', 'error');
        }
    }

    async function handleDeleteFile(filename, requestedProjectNo = null, requestedTab = null) {
        if (!state.currentProject && !requestedProjectNo) return;
        const projectNo = String(requestedProjectNo || state.currentProject.project_no);
        const tabKey = requestedTab || (allowedTabs.has(state.currentTab) ? state.currentTab : 'received');
        if (!confirm(`'${filename}' 파일을 삭제하시겠습니까?`)) return;
        try {
            const res = await API.deleteFile(projectNo, tabKey, filename);
            if (res.success) {
                showToast(res.message, 'success');
                if (String(state.currentProject?.project_no || '') === projectNo && state.currentTab === tabKey) openProjectDetail(projectNo);
            } else showToast(res.error, 'error');
        } catch (e) {
            showToast('파일 삭제 실패', 'error');
        }
    }

    window.renderProjectFiles = renderProjectFiles;
    window.getTabFolderKorean = getTabFolderKorean;
    window.handleTabFileUpload = handleTabFileUpload;
    window.handleBumpVersion = handleBumpVersion;
    window.handleDeleteFile = handleDeleteFile;
    bindFileTabs();
})(window);
