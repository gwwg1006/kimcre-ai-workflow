/**
 * 김명규크리에이티브 우측 하단 플로팅 AI 관제 챗봇 (Gemini 3.7 Flash)
 * - 전체 프로젝트 실시간 질의응답 및 상태 제어 명령 지원
 * - 3MF 열기, 견적서, 배송 모달 연계
 * - 사진/캡처/도면 첨부 및 클립보드 붙여넣기(Cmd+V) 지원
 */

(function registerGlobalAiCommander(window) {
    const MAX_FILES = 20;
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
    const ALLOWED_EXTENSIONS = new Set(['.3mf', '.csv', '.jpeg', '.jpg', '.pdf', '.png', '.stl', '.step', '.stp', '.webp', '.xlsx']);
    const globalState = {
        history: [],
        attachedFiles: [],
        isSending: false,
        isOpen: false,
        generation: 0,
        abortController: null
    };
    let actionGeneration = 0;
    function setSendIcon(button, className) {
        if (!button) return;
        button.replaceChildren?.();
        const icon = document.createElement('i'); icon.className = className; button.appendChild(icon);
    }

    function initGlobalAiCommander() {
        const promptInput = document.getElementById('global-ai-prompt');
        const widgetWindow = document.getElementById('floating-ai-window');

        if (document.__globalAiActionsBound) return;
        document.__globalAiActionsBound = true;

        if (promptInput) {
            promptInput.addEventListener('keydown', handleGlobalAiKeyDown);
            promptInput.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 100) + 'px';
            });

            // 클립보드 이미지 붙여넣기 (Cmd+V / Ctrl+V)
            promptInput.addEventListener('paste', function (e) {
                const items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData))?.items;
                if (!items) return;
                const newFiles = [];
                for (let item of items) {
                    if (item.type && item.type.indexOf('image') === 0) {
                        const blob = item.getAsFile();
                        if (blob) {
                            const fileName = `clipboard_${new Date().getTime()}.png`;
                            const file = new File([blob], fileName, { type: blob.type });
                            newFiles.push(file);
                        }
                    }
                }
                if (newFiles.length > 0) {
                    handleGlobalAiFilesSelected(newFiles);
                    if (typeof showToast === 'function') {
                        showToast(`${newFiles.length}개의 클립보드 이미지가 첨부되었습니다.`, 'info');
                    }
                }
            });
        }

        document.getElementById('global-ai-file-input')?.addEventListener('change', event => {
            handleGlobalAiFilesSelected(event.target.files);
            event.target.value = '';
        });
        document.getElementById('btn-global-ai-send')?.addEventListener('click', sendGlobalAiMessage);
        document.addEventListener('click', event => {
            const action = event.target.closest?.('[data-global-ai-action]')?.dataset.globalAiAction;
            if (action === 'pick-files') document.getElementById('global-ai-file-input')?.click();
        });

        // 드래그앤드롭 파일 첨부
        if (widgetWindow) {
            widgetWindow.addEventListener('dragover', (e) => {
                e.preventDefault();
                widgetWindow.classList.add('drag-over-ai');
            });
            widgetWindow.addEventListener('dragleave', (e) => {
                e.preventDefault();
                widgetWindow.classList.remove('drag-over-ai');
            });
            widgetWindow.addEventListener('drop', (e) => {
                e.preventDefault();
                widgetWindow.classList.remove('drag-over-ai');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleGlobalAiFilesSelected(e.dataTransfer.files);
                    if (typeof showToast === 'function') {
                        showToast(`${e.dataTransfer.files.length}개의 파일이 첨부되었습니다.`, 'info');
                    }
                }
            });
        }
    }

    function toggleFloatingAiWidget(isOpen) {
        const windowEl = document.getElementById('floating-ai-window');
        const launcherBtn = document.getElementById('btn-floating-ai-launcher');
        const promptInput = document.getElementById('global-ai-prompt');
        if (!windowEl) return;

        if (isOpen === undefined) {
            globalState.isOpen = windowEl.style.display === 'none' || !windowEl.style.display;
        } else {
            globalState.isOpen = !!isOpen;
        }

        if (globalState.isOpen) {
            windowEl.style.display = 'flex';
            windowEl.classList.add('open');
            if (launcherBtn) launcherBtn.classList.add('active');
            if (promptInput) {
                setTimeout(() => promptInput.focus(), 150);
            }
        } else {
            windowEl.style.display = 'none';
            windowEl.classList.remove('open');
            if (launcherBtn) launcherBtn.classList.remove('active');
            // 닫기는 대화를 초기화하지 않지만, 진행 중 응답이 숨겨진 위젯을 갱신하지 않도록 무효화한다.
            globalState.generation += 1;
            globalState.abortController?.abort();
            globalState.abortController = null;
        }
    }

    function focusGlobalAiCommander() {
        toggleFloatingAiWidget(true);
    }

    function toggleGlobalAiCommander() {
        toggleFloatingAiWidget();
    }

    function handleGlobalAiKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendGlobalAiMessage();
        }
    }

    function applyGlobalAiPrompt(promptText) {
        toggleFloatingAiWidget(true);
        const promptInput = document.getElementById('global-ai-prompt');
        if (promptInput) {
            promptInput.value = promptText;
            promptInput.style.height = 'auto';
            promptInput.style.height = Math.min(promptInput.scrollHeight, 100) + 'px';
            sendGlobalAiMessage();
        }
    }

    function handleGlobalAiFilesSelected(files) {
        if (!files || !files.length) return;
        const fileArr = Array.from(files);
        const invalid = fileArr.find(f => {
            const name = String(f?.name || '');
            const dot = name.lastIndexOf('.');
            return !dot || !ALLOWED_EXTENSIONS.has(name.slice(dot).toLowerCase()) || Number(f?.size || 0) > MAX_FILE_BYTES;
        });
        if (invalid) {
            if (typeof showToast === 'function') showToast(`${invalid.name || '파일'}은 허용되지 않는 형식이거나 크기 제한을 초과했습니다.`, 'error');
            return;
        }
        const newFiles = fileArr.filter(f => !globalState.attachedFiles.some(sf => sf.name === f.name && sf.size === f.size));
        if (globalState.attachedFiles.length + newFiles.length > MAX_FILES
            || globalState.attachedFiles.reduce((sum, f) => sum + Number(f.size || 0), 0)
                + newFiles.reduce((sum, f) => sum + Number(f.size || 0), 0) > MAX_TOTAL_BYTES) {
            if (typeof showToast === 'function') showToast('첨부 파일은 최대 20개, 전체 100MB까지 가능합니다.', 'error');
            return;
        }
        globalState.attachedFiles.push(...newFiles);
        renderGlobalAiAttachedFiles();
    }

    function renderGlobalAiAttachedFiles() {
        const bar = document.getElementById('global-ai-attached-files-bar');
        const badge = document.getElementById('global-ai-attach-count');
        if (!bar) return;
        if (window.GlobalAiRenderer) {
            window.GlobalAiRenderer.renderAttached(bar, badge, globalState.attachedFiles);
            return;
        }
        // renderer가 비활성인 테스트/부분 로드 환경도 DOM API만 사용한다.
        bar.replaceChildren?.();
        bar.style.display = globalState.attachedFiles.length ? 'flex' : 'none';
        if (badge) { badge.textContent = String(globalState.attachedFiles.length); badge.style.display = globalState.attachedFiles.length ? 'inline-block' : 'none'; }
        globalState.attachedFiles.forEach((file, index) => {
            const chip = document.createElement('div'); chip.className = 'ai-file-chip';
            const name = document.createElement('span'); name.className = 'file-name'; name.title = String(file.name || ''); name.textContent = String(file.name || '첨부파일');
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-remove-chip'; remove.dataset.globalAiRemove = String(index); remove.title = '삭제'; remove.textContent = '×';
            chip.append(name, remove); bar.appendChild(chip);
        });
    }

    function removeGlobalAiFile(idx) {
        globalState.attachedFiles.splice(idx, 1);
        renderGlobalAiAttachedFiles();
    }

    function handleGlobalAiFileAction(event) {
        const button = event.target.closest?.('[data-global-ai-remove], [data-global-ai-action="remove-file"]');
        if (!button) return;
        event.preventDefault();
        const index = Number(button.dataset.globalAiRemove ?? button.dataset.fileIndex);
        if (Number.isInteger(index) && index >= 0 && index < globalState.attachedFiles.length) removeGlobalAiFile(index);
    }

    function resetGlobalAiChat() {
        if (window.AIPlanUI) window.AIPlanUI.cancelContext('global').catch(() => {});
        globalState.abortController?.abort();
        globalState.abortController = null;
        globalState.generation += 1;
        globalState.history = [];
        globalState.attachedFiles = [];
        renderGlobalAiAttachedFiles();

        const feed = document.getElementById('global-ai-chat-feed');
        if (feed && window.GlobalAiRenderer) window.GlobalAiRenderer.renderWelcome(feed);

        const promptInput = document.getElementById('global-ai-prompt');
        if (promptInput) {
            promptInput.value = '';
            promptInput.style.height = 'auto';
        }

        if (typeof showToast === 'function') {
            showToast('AI 관제 대화가 초기화되었습니다.', 'info');
        }
    }

    function actionError(message) { if (typeof showToast === 'function') showToast(message, 'warning'); }
    async function openActionProject(projectNo, generation) {
        if (typeof openProjectDetail !== 'function') { actionError('프로젝트 상세 화면을 열 수 없습니다.'); return false; }
        const result = await openProjectDetail(projectNo);
        if (generation !== actionGeneration) return false;
        if (result === null || (typeof state !== 'undefined' && String(state.currentProject?.project_no || '') !== String(projectNo))) { actionError('요청한 프로젝트 상세를 불러오지 못했습니다.'); return false; }
        return true;
    }
    async function handleSafeAction(event) {
        const button = event.target.closest?.('[data-global-ai-action]');
        if (!button) return;
        const type = button.dataset.globalAiAction;
        const projectNo = button.dataset.projectNo;
        if (projectNo && !/^\d{6}-\d{3,}$/.test(projectNo)) { actionError('유효하지 않은 프로젝트 번호입니다.'); return; }
        const generation = ++actionGeneration;
        if (['open_project', 'open_3mf', 'generate_estimate', 'open_delivery'].includes(type) && !projectNo) { actionError('이 AI 바로가기에 프로젝트 번호가 없습니다.'); return; }
        if (type === 'open_project') { if (await openActionProject(projectNo, generation) && generation === actionGeneration) return; }
        else if (type === 'open_3mf') {
            if (typeof openProject3MF !== 'function') { actionError('3MF 열기 기능을 사용할 수 없습니다.'); return; }
            if (generation === actionGeneration) openProject3MF(projectNo);
        } else if (type === 'generate_estimate') {
            if (typeof openEstimateModal !== 'function') { actionError('견적서 기능을 사용할 수 없습니다.'); return; }
            if (await openActionProject(projectNo, generation) && generation === actionGeneration) openEstimateModal('integrated');
        } else if (type === 'open_delivery') {
            if (!(await openActionProject(projectNo, generation)) || generation !== actionGeneration) return;
            const deliveryField = document.getElementById('detail-tracking-no') || document.getElementById('detail-courier');
            deliveryField?.scrollIntoView?.({ block: 'center' });
            deliveryField?.focus?.();
        } else if (type === 'new_project') {
            if (typeof openNewProjectModal !== 'function') { actionError('신규 작업 등록 기능을 사용할 수 없습니다.'); return; }
            openNewProjectModal();
        }
    }

    function renderSafeFallback(target, role, label, message, actions = [], planNode = null, executed = []) {
        if (!target) return null;
        const doc = target.ownerDocument || document;
        target.replaceChildren?.();
        const bubble = doc.createElement('div'); bubble.className = `ai-chat-bubble ${role}`;
        const content = doc.createElement('div'); content.className = 'bubble-content';
        const name = doc.createElement('div'); name.className = 'bubble-name'; name.textContent = label;
        const body = doc.createElement('div'); body.className = 'bubble-text'; body.textContent = String(message || '');
        content.append(name, body);
        if (executed.length) { const note = doc.createElement('div'); note.className = 'ai-executed-banner'; note.textContent = `시스템 처리 결과: ${executed.map(item => item.summary || item.filename || item.project_no || '').join(', ')}`; content.appendChild(note); }
        actions.filter(action => window.AIPlanUI?.validAction(action)).forEach(action => {
            const button = doc.createElement('button'); button.type = 'button'; button.className = 'btn-ai-action-chip'; button.dataset.globalAiAction = action.type;
            if (/^\d{6}-\d{3,}$/.test(String(action.project_no || ''))) button.dataset.projectNo = action.project_no;
            button.textContent = String(action.label || '상세 보기'); content.appendChild(button);
        });
        if (planNode) content.appendChild(planNode);
        bubble.appendChild(content); target.appendChild(bubble); return bubble;
    }

    async function sendGlobalAiMessage() {
        if (globalState.isSending) return;

        const promptInput = document.getElementById('global-ai-prompt');
        const promptText = promptInput ? promptInput.value.trim() : '';

        if (!promptText && globalState.attachedFiles.length === 0) {
            if (typeof showToast === 'function') {
                showToast('질문이나 지시할 명령을 입력해 주세요.', 'info');
            }
            if (promptInput) promptInput.focus();
            return;
        }
        if (typeof window.isExternalAiTransferEnabled === 'function' && !window.isExternalAiTransferEnabled()) {
            if (typeof showToast === 'function') showToast('설정에서 외부 AI 전송을 허용한 뒤 다시 시도해 주세요.', 'info');
            return;
        }

        toggleFloatingAiWidget(true);

        const welcomeCard = document.getElementById('global-ai-welcome-card');
        if (welcomeCard) welcomeCard.style.display = 'none';

        const feed = document.getElementById('global-ai-chat-feed');
        const sendBtn = document.getElementById('btn-global-ai-send');
        if (feed) {
            if (window.GlobalAiRenderer) window.GlobalAiRenderer.renderUser(feed, promptText, globalState.attachedFiles);
            else renderSafeFallback(feed, 'user', '나', promptText);
        }

        const loadingView = feed && window.GlobalAiRenderer ? window.GlobalAiRenderer.renderLoading(feed) : null;
        const loadingBubble = loadingView?.bubble || (feed ? renderSafeFallback(feed, 'assistant', 'Gemini 3.7 Flash 관제 AI', '전체 프로젝트 분석 및 명령 수행 중...') : null);

        const requestGeneration = globalState.generation;
        const messageToSend = promptText;
        const filesToSend = [...globalState.attachedFiles];
        if (promptInput) {
            promptInput.value = '';
            promptInput.style.height = 'auto';
        }
        globalState.attachedFiles = [];
        renderGlobalAiAttachedFiles();

        globalState.isSending = true;
        globalState.abortController = typeof AbortController === 'function' ? new AbortController() : null;
        if (sendBtn) {
            sendBtn.disabled = true;
            setSendIcon(sendBtn, 'fa-solid fa-spinner fa-spin');
        }

        try {
            const formData = new FormData();
            formData.append('message', messageToSend);
            formData.append('history', JSON.stringify(globalState.history));
            formData.append('external_ai_consent', 'true');
            for (const f of filesToSend) {
                formData.append('files', f);
            }

            const res = await API.globalAiChat(formData, globalState.abortController ? { signal: globalState.abortController.signal } : {});
            if (requestGeneration !== globalState.generation) return;

            if (res.success) {
                let planNode = null;
                if (res.requires_confirmation && window.AIPlanUI) {
                    const planTarget = document.createElement('div');
                    const planGeneration = globalState.generation;
                    window.AIPlanUI.render(res, planTarget, {
                        name: 'global',
                        isCurrent: () => globalState.generation === planGeneration && globalState.isOpen,
                        onApplied: async () => {
                            if (typeof window.refreshProjectState === 'function') await window.refreshProjectState();
                            else if (typeof loadDashboard === 'function') await loadDashboard();
                            showToast('AI 변경 사항이 적용되었습니다.', 'success');
                        },
                        onError: error => showToast(error.message || 'AI 승인 계획을 적용할 수 없습니다.', 'error')
                    });
                    planNode = planTarget;
                }

                if (loadingView && window.GlobalAiRenderer) {
                    window.GlobalAiRenderer.renderAssistant(loadingBubble, res.reply || '답변을 완료했습니다.', res.suggested_actions || [], action => window.AIPlanUI?.validAction(action), planNode, [...(res.executed_updates || []), ...(res.executed_file_ops || [])]);
                } else renderSafeFallback(loadingBubble, 'assistant', 'Gemini 3.7 Flash 관제 AI', res.reply || '답변을 완료했습니다.', res.suggested_actions || [], planNode, [...(res.executed_updates || []), ...(res.executed_file_ops || [])]);

                globalState.history.push({ role: 'user', content: messageToSend });
                globalState.history.push({ role: 'assistant', content: res.reply });
                if (globalState.history.length > 20) {
                    globalState.history = globalState.history.slice(-20);
                }

                if (res.executed_file_ops && res.executed_file_ops.length > 0) {
                    if (typeof showToast === 'function') {
                        showToast(`${res.executed_file_ops.length}건의 3MF 파일이 안전하게 교체되었습니다.`, 'success');
                    }
                }

                if (res.executed_updates && res.executed_updates.length > 0) {
                    if (typeof showToast === 'function') {
                        showToast(`${res.executed_updates.length}건의 프로젝트가 실시간 업데이트되었습니다.`, 'success');
                    }
                }

                if (!res.requires_confirmation && ((res.executed_updates && res.executed_updates.length > 0) || (res.executed_file_ops && res.executed_file_ops.length > 0))) {
                    const affected = (res.executed_updates || []).flatMap(item => [item.project_no, item.projectNo]);
                    if (typeof window.refreshProjectState === 'function') window.refreshProjectState(affected).catch(() => {});
                    else if (typeof loadDashboard === 'function') loadDashboard();
                }
            } else {
                if (loadingView && window.GlobalAiRenderer) window.GlobalAiRenderer.renderError(loadingBubble, 'AI 관제 오류', res.reply || res.error || '요청 처리 중 오류가 발생했습니다.');
                else renderSafeFallback(loadingBubble, 'error', 'AI 관제 오류', res.reply || res.error || '요청 처리 중 오류가 발생했습니다.');
                if (typeof showToast === 'function') {
                    showToast(res.error || 'AI 응답 오류가 발생했습니다.', 'error');
                }
            }
        } catch (err) {
            if (err?.name === 'AbortError' || err?.isAbortError || err?.kind === 'abort') return;
            console.error('Global AI Chat Error:', err);
            if (loadingView && window.GlobalAiRenderer) window.GlobalAiRenderer.renderError(loadingBubble, '네트워크 오류', `서버와의 통신에 실패했습니다: ${err.message}`);
            else renderSafeFallback(loadingBubble, 'error', '네트워크 오류', '서버와의 통신에 실패했습니다.');
            if (typeof showToast === 'function') {
                showToast(`통신 오류: ${err.message}`, 'error');
            }
        } finally {
            globalState.abortController = null;
            globalState.isSending = false;
            if (sendBtn) {
                sendBtn.disabled = false;
                setSendIcon(sendBtn, 'fa-solid fa-paper-plane');
            }
            if (feed) {
                feed.scrollTop = feed.scrollHeight;
            }
            if (promptInput) {
                promptInput.focus();
            }
        }
    }

    window.initGlobalAiCommander = initGlobalAiCommander;
    window.toggleFloatingAiWidget = toggleFloatingAiWidget;
    window.focusGlobalAiCommander = focusGlobalAiCommander;
    window.toggleGlobalAiCommander = toggleGlobalAiCommander;
    window.handleGlobalAiKeyDown = handleGlobalAiKeyDown;
    window.applyGlobalAiPrompt = applyGlobalAiPrompt;
    window.handleGlobalAiFilesSelected = handleGlobalAiFilesSelected;
    window.removeGlobalAiFile = removeGlobalAiFile;
    window.resetGlobalAiChat = resetGlobalAiChat;
    window.sendGlobalAiMessage = sendGlobalAiMessage;

    document.addEventListener('click', handleSafeAction);
    document.addEventListener('click', handleGlobalAiFileAction);
    document.addEventListener('DOMContentLoaded', initGlobalAiCommander);
})(window);
