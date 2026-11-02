/**
 * 신규 작업 등록용 AI 자동 입력 어시스턴트.
 * 상태(state)와 신규 작업 폼은 메인 컨트롤러가 소유하고,
 * 대화/첨부파일/분석 흐름만 이 모듈에서 관리한다.
 */
(function registerAiAssistant(window) {
    let analysisController = null;
    let analysisGeneration = 0;
    function addFilesToNewProject(files) {
        if (!files || !files.length) return;
        const manager = window.NewProjectManager?.get?.();
        if (manager) {
            manager.addFiles(files);
            return;
        }
        const fileArray = Array.from(files);
        for (const f of fileArray) {
            if (!state.selectedNewFiles.some(sf => sf.name === f.name && sf.size === f.size)) {
                state.selectedNewFiles.push(f);
            }
        }
        state.aiAttachedFiles = [...state.selectedNewFiles];
        renderSelectedNewFiles();
    }

    function handleAiFileAttach(event) {
        addFilesToNewProject(event.target.files);
        event.target.value = '';
    }

    function resetAiChat() {
        analysisGeneration += 1;
        analysisController?.abort?.();
        analysisController = null;
        state.aiChatHistory = [];
        renderAiChatHistory();
        const chatFeed = document.getElementById('ai-chat-history');
        if (chatFeed) chatFeed.style.display = 'none';
        const resetBtn = document.getElementById('btn-reset-ai-chat');
        if (resetBtn) resetBtn.style.display = 'none';
    }

    function renderAiChatHistory() {
        const historyEl = document.getElementById('ai-chat-history');
        if (!historyEl) return;

        if (state.aiChatHistory.length === 0) {
            historyEl.innerHTML = '';
            historyEl.style.display = 'none';
            return;
        }

        historyEl.style.display = 'flex';
        historyEl.innerHTML = state.aiChatHistory.map(msg => `
            <div class="ai-msg-bubble ${msg.role === 'assistant' ? 'assistant' : 'user'}">
                ${msg.role === 'assistant' ? '<strong><i class="fa-solid fa-wand-magic-sparkles"></i> AI:</strong> ' : '<strong><i class="fa-regular fa-user"></i> 나:</strong> '}
                ${escapeHtml(msg.content).replace(/\n/g, '<br>')}
            </div>
        `).join('');

        historyEl.scrollTop = historyEl.scrollHeight;
    }

    function highlightField(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.classList.remove('field-highlight-pulse');
        void el.offsetWidth;
        el.classList.add('field-highlight-pulse');
    }

    async function handleAiOrderAnalysis() {
        const promptInput = document.getElementById('ai-order-prompt');
        const promptText = promptInput.value.trim();
        const newProjectManager = window.NewProjectManager?.get?.();
        const aiGeneration = newProjectManager?.generation?.();

        const attachedFiles = [...(state.aiAttachedFiles || [])];
        if (!promptText && attachedFiles.length === 0) {
            showToast('분석할 주문 텍스트를 입력하거나 사진/파일을 첨부해 주세요.', 'info');
            promptInput.focus();
            return;
        }
        if (typeof window.isExternalAiTransferEnabled === 'function' && !window.isExternalAiTransferEnabled()) {
            showToast('설정에서 외부 AI 전송을 허용한 뒤 다시 시도해 주세요.', 'info');
            return;
        }

        const btn = document.getElementById('btn-ai-analyze');
        analysisController?.abort?.();
        const requestGeneration = ++analysisGeneration;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        analysisController = controller;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 3.7 Flash 분석 중...';

        const currentData = {
            client_name: document.getElementById('new-client-name')?.value || '',
            job_name: document.getElementById('new-job-name')?.value || '',
            received_date: document.getElementById('new-received-date')?.value || '',
            channel: document.getElementById('new-channel')?.value || '카카오톡',
            material: document.getElementById('new-material')?.value || '',
            color: document.getElementById('new-color')?.value || '',
            quantity: document.getElementById('new-quantity')?.value || '1',
            due_date: document.getElementById('new-due-date')?.value || '',
            tax_type: document.getElementById('new-tax-type')?.value || '면세',
            quote_amount: document.getElementById('new-quote-amount')?.value || '',
            shipping_fee: document.getElementById('new-shipping-fee')?.value || '3500',
            phone: document.getElementById('new-phone')?.value || '',
            zipcode: document.getElementById('new-zipcode')?.value || '',
            address: document.getElementById('new-address')?.value || '',
            detail_address: document.getElementById('new-detail-address')?.value || '',
            request_notes: document.getElementById('new-request-notes')?.value || ''
        };

        const formData = new FormData();
        formData.append('message', promptText);
        formData.append('current_data', JSON.stringify(currentData));
        formData.append('history', JSON.stringify(state.aiChatHistory));
        formData.append('external_ai_consent', 'true');

        for (const f of attachedFiles) {
            formData.append('files', f);
        }

        try {
            const res = await API.parseOrderWithAi(formData, controller ? { signal: controller.signal } : {});
            if (res.success && res.data) {
                const data = res.data;

                // The form may have been reset/reopened while AI was processing.
                // Do not let a late response enter the new form or its chat history.
                if (requestGeneration !== analysisGeneration || newProjectManager?.generation?.() !== aiGeneration) return res;
                const applied = newProjectManager?.applyAiFields?.(data, aiGeneration);
                if (newProjectManager && applied !== true) return res;

                if (promptText) {
                    state.aiChatHistory.push({ role: 'user', content: promptText });
                } else if (attachedFiles.length > 0) {
                    state.aiChatHistory.push({ role: 'user', content: `[파일 ${attachedFiles.length}개 분석 요청]` });
                }
                state.aiChatHistory.push({ role: 'assistant', content: res.reply || '작업 정보를 입력했습니다.' });

                renderAiChatHistory();
                const resetBtn = document.getElementById('btn-reset-ai-chat');
                if (resetBtn) resetBtn.style.display = 'inline-flex';

                const fields = {
                    client_name: 'new-client-name',
                    job_name: 'new-job-name',
                    received_date: 'new-received-date',
                    channel: 'new-channel',
                    material: 'new-material',
                    color: 'new-color',
                    quantity: 'new-quantity',
                    due_date: 'new-due-date',
                    quote_amount: 'new-quote-amount',
                    shipping_fee: 'new-shipping-fee',
                    phone: 'new-phone',
                    zipcode: 'new-zipcode',
                    address: 'new-address',
                    detail_address: 'new-detail-address',
                    tax_type: 'new-tax-type',
                    request_notes: 'new-request-notes'
                };
                Object.entries(fields).forEach(([key, elementId]) => {
                    if (data[key] !== undefined && data[key] !== null && data[key] !== '' && !document.getElementById(elementId)?.value) {
                        document.getElementById(elementId).value = data[key];
                        highlightField(elementId);
                    }
                });

                const itemsTbody = document.getElementById('new-project-items-tbody');
                if (itemsTbody) {
                    const hasManualItems = newProjectManager?.hasManualItems?.() || false;
                    const replaceItems = !hasManualItems || newProjectManager?.confirmOverwrite?.('AI가 품목 입력을 덮어쓸까요?') === true;
                    if (data.items && Array.isArray(data.items) && data.items.length > 0 && replaceItems) {
                        itemsTbody.innerHTML = '';
                        data.items.forEach(it => {
                            addNewProjectItemRow(
                                it.name || '',
                                it.material || data.material || '',
                                it.color || data.color || '',
                                window.Pricing.parseInteger(it.quantity, { min: 1 }) ?? 1,
                                window.Pricing.parseInteger(it.price ?? it.unit_price, { min: 0 }) ?? 0,
                                it.note || it.notes || ''
                            );
                        });
                    } else if (itemsTbody.children.length === 0 && data.job_name) {
                        addNewProjectItemRow(
                            data.job_name,
                            data.material || 'PLA',
                            data.color || 'White',
                            window.Pricing.parseInteger(data.quantity, { min: 1 }) ?? 1,
                            window.Pricing.parseInteger(data.quote_amount, { min: 0 }) ?? 0,
                            data.request_notes || ''
                        );
                    }
                }

                promptInput.value = '';
                showToast('AI 분석 완료: 세부 품목 및 양식 정보가 자동 입력되었습니다.', 'success');
            } else {
                showToast(res.error || 'AI 분석에 실패했습니다.', 'error');
            }
        } catch (e) {
            if (requestGeneration === analysisGeneration && e?.name !== 'AbortError' && !e?.isAbortError) showToast('AI 분석 요청 중 네트워크 오류가 발생했습니다.', 'error');
        } finally {
            if (requestGeneration === analysisGeneration) {
                analysisController = null;
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-sparkles"></i> AI 분석 & 자동 완성';
            }
        }
    }

    window.addFilesToNewProject = addFilesToNewProject;
    window.handleAiFileAttach = handleAiFileAttach;
    window.resetAiChat = resetAiChat;
    window.renderAiChatHistory = renderAiChatHistory;
    window.highlightField = highlightField;
    window.handleAiOrderAnalysis = handleAiOrderAnalysis;
})(window);
