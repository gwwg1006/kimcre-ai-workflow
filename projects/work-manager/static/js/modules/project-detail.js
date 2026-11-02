/**
 * 프로젝트 상세 화면의 조회·표시 오케스트레이션.
 * 세부 품목 편집과 상태 변경의 실제 동작은 기존 전역 핸들러와 연결한다.
 */
(function registerProjectDetail(window) {
    const detailFields = new Set(['client_name','contact_name','job_name','received_date','channel','material','color','quantity','due_date','phone','address','detail_address','request_notes','memo']);
    const inlineBusy = new Set();
    let detailRequestGeneration = 0;
    let detailRequestController = null;
    if (!document.__projectDetailActionsBound) document.addEventListener('click', event => {
        const button = event.target.closest?.('[data-detail-action]');
        if (!button) return;
        if (button.dataset.detailAction === 'edit' && detailFields.has(button.dataset.field)) window.startInlineEdit(button.dataset.field);
        else if (button.dataset.detailAction === 'save') window.saveInlineEdit(button.dataset.field);
        else if (button.dataset.detailAction === 'cancel') window.cancelInlineEdit(button.dataset.field);
    });
    document.__projectDetailActionsBound = true;
    function invalidateProjectDetailRequest() {
        detailRequestGeneration += 1;
        detailRequestController?.abort();
        detailRequestController = null;
        return detailRequestGeneration;
    }
    function renderProjectDetailContent(p) {
        if (!p) return;
        state.currentProject = p;

        const noEl = document.getElementById('detail-project-no');
        const titleEl = document.getElementById('detail-project-title');
        if (noEl) noEl.textContent = p.project_no;
        if (titleEl) titleEl.textContent = `${p.client_name} - ${p.job_name}`;

        const prodSel = document.getElementById('detail-prod-status');
        const paySel = document.getElementById('detail-pay-status');
        const delivSel = document.getElementById('detail-deliv-status');
        if (prodSel) prodSel.value = p.prod_status;
        if (paySel) paySel.value = p.pay_status;
        if (delivSel) delivSel.value = p.deliv_status;

        const clientWrap = document.getElementById('wrap-client-name');
        const contactWrap = document.getElementById('wrap-contact-name');
        const jobWrap = document.getElementById('wrap-job-name');
        const recWrap = document.getElementById('wrap-received-date');
        const chnWrap = document.getElementById('wrap-channel');
        const matWrap = document.getElementById('wrap-material');
        const colWrap = document.getElementById('wrap-color');
        const qtyWrap = document.getElementById('wrap-quantity');
        const dueWrap = document.getElementById('wrap-due-date');
        const phnWrap = document.getElementById('wrap-phone');
        const addWrap = document.getElementById('wrap-address');
        const dAddWrap = document.getElementById('wrap-detail-address');
        const notWrap = document.getElementById('wrap-request-notes');

        if (clientWrap) clientWrap.innerHTML = `<span class="val font-bold text-main" id="d-client-name">${escapeHtml(p.client_name || p.customer || '-')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="client_name" title="고객명 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (contactWrap) contactWrap.innerHTML = `<span class="val" id="d-contact-name">${escapeHtml(p.contact_name || '(미기재)')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="contact_name" title="담당자 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (jobWrap) jobWrap.innerHTML = `<span class="val font-medium text-main" id="d-job-name">${escapeHtml(p.job_name || p.work_name || '-')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="job_name" title="작업명 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (recWrap) recWrap.innerHTML = `<span class="val" id="d-received-date">${escapeHtml(p.received_date || '-')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="received_date" title="접수일 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (chnWrap) chnWrap.innerHTML = `<span class="val" id="d-channel">${escapeHtml(p.channel || '-')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="channel" title="접수채널 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (matWrap) matWrap.innerHTML = `<span class="val" id="d-material">${escapeHtml(p.material || '-')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="material" title="소재 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (colWrap) colWrap.innerHTML = `<span class="val" id="d-color">${escapeHtml(p.color || '-')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="color" title="색상 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (qtyWrap) qtyWrap.innerHTML = `<span class="val" id="d-quantity">${escapeHtml(p.quantity || '1')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="quantity" title="수량 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (dueWrap) dueWrap.innerHTML = `<span class="val text-highlight" id="d-due-date">${escapeHtml(p.due_date || '미정')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="due_date" title="납기일 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (phnWrap) phnWrap.innerHTML = `<span class="val" id="d-phone">${escapeHtml(p.phone || '(미기재)')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="phone" title="연락처 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (addWrap) addWrap.innerHTML = `<span class="val" id="d-address">${escapeHtml(p.address || '(미기재)')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="address" title="배송주소 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (dAddWrap) dAddWrap.innerHTML = `<span class="val" id="d-detail-address">${escapeHtml(p.detail_address || '(미기재)')}</span><button type="button" class="inline-edit-btn" data-detail-action="edit" data-field="detail_address" title="상세주소 수정"><i class="fa-solid fa-pen"></i></button>`;
        if (notWrap) notWrap.innerHTML = `<div class="memo-text-view" id="d-notes">${escapeHtml(p.request_notes || p.memo || '특이사항 없음')}</div><button type="button" class="inline-edit-btn memo-edit-btn" data-detail-action="edit" data-field="request_notes" title="출력조건/메모 수정"><i class="fa-solid fa-pen"></i></button>`;
        const qAmtEl = document.getElementById('d-quote-amount');
        const extEl = document.getElementById('d-extra-fee');
        const shpEl = document.getElementById('d-shipping-fee');
        const shpInp = document.getElementById('detail-shipping-fee-input');
        const totEl = document.getElementById('d-total-amount');
        const paidEl = document.getElementById('d-paid-amount');
        const unpEl = document.getElementById('d-unpaid-amount');
        const taxSel = document.getElementById('detail-tax-type-select');

        if (qAmtEl) qAmtEl.textContent = `${(p.quote_amount || 0).toLocaleString()}원`;
        if (extEl) extEl.textContent = `${((p.model_fee || 0) + (p.post_process_fee || 0)).toLocaleString()}원`;
        if (shpEl) shpEl.textContent = `${(p.shipping_fee || 0).toLocaleString()}원`;
        if (shpInp) shpInp.value = p.shipping_fee !== undefined && p.shipping_fee !== null ? p.shipping_fee : 3500;
        if (taxSel) taxSel.value = p.tax_type || '면세';
        if (totEl) totEl.textContent = `${(p.total_amount || 0).toLocaleString()}원 (${p.tax_type || '면세'})`;
        if (paidEl) paidEl.textContent = `${(p.paid_amount || 0).toLocaleString()}원`;
        if (unpEl) unpEl.textContent = `${(p.unpaid_amount || 0).toLocaleString()}원`;

        if (p.items) renderDetailItems(p.items);

        const trkEl = document.getElementById('detail-tracking-no');
        if (trkEl) trkEl.value = p.tracking_no || '';
        const courierEl = document.getElementById('detail-courier');
        if (courierEl) courierEl.value = p.courier || '한진택배';
        // Rebuild the allowlisted official URL from the displayed fields. The
        // backend URL is optional and must not be trusted as the source of the
        // browser link after a detail reload.
        if (typeof window.updateTrackingLinkFromFields === 'function') {
            window.updateTrackingLinkFromFields();
        } else if (typeof window.updateTrackingLink === 'function') {
            window.updateTrackingLink(p.tracking_no || '', p.courier || '한진택배');
        }
        if (typeof window.renderTrackingResult === 'function') {
            const hasSavedTrackingResult = Boolean(p.tracking_status_text || p.tracking_latest_date || p.tracking_latest_location);
            window.renderTrackingResult(hasSavedTrackingResult ? {
                deliv_status: p.deliv_status,
                status_text: p.tracking_status_text,
                latest_progress: {
                    date: p.tracking_latest_date,
                    time: p.tracking_latest_time,
                    location: p.tracking_latest_location,
                    description: p.tracking_status_text,
                },
            } : null);
        }

        if (p.tabs) updateTabBadges(p.tabs);
        renderProjectFiles();
    }

    async function openProjectDetail(projectNo) {
        detailRequestController?.abort();
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        detailRequestController = controller;
        const requestGeneration = ++detailRequestGeneration;
        try {
            const res = await API.getProjectDetail(projectNo, controller ? { signal: controller.signal } : {});
            if (requestGeneration !== detailRequestGeneration || detailRequestController !== controller) return res;
            if (!res.success) {
                showToast(res.error, 'error');
                return;
            }
            if (String(res.data?.project_no || '') !== String(projectNo)) {
                showToast('상세 응답이 요청한 프로젝트와 일치하지 않습니다.', 'error');
                return null;
            }

            window.ProjectActions?.get?.().setContext?.(projectNo);
            window.ProjectEditor?.get?.().setContext?.(projectNo);
            window.DeliveryManager?.get?.().setContext?.(projectNo);
            window.DetailAiManager?.get?.().setContext?.(projectNo);

            renderProjectDetailContent(res.data);

            const detailAiInput = document.getElementById('detail-ai-prompt');
            if (detailAiInput) detailAiInput.value = '';
            state.detailAiFiles = [];
            renderDetailAiAttachedChips();
            const feedbackBubble = document.getElementById('detail-ai-feedback-bubble');
            if (feedbackBubble) feedbackBubble.style.display = 'none';

            closeModal('modal-edit-project-info');
            closeModal('modal-estimate-gen');
            closeModal('modal-stl-preview');
            openModal('modal-project-detail');
            return res;
        } catch (e) {
            if (requestGeneration !== detailRequestGeneration || e?.name === 'AbortError' || e?.kind === 'abort' || e?.isAbortError) return null;
            console.error('Failed to open project detail:', e);
            showToast('상세 정보를 불러오는 중 오류가 발생했습니다.', 'error');
            return null;
        } finally {
            if (requestGeneration === detailRequestGeneration && detailRequestController === controller) detailRequestController = null;
        }
    }

    function updateTabBadges(tabs) {
        if (!tabs) return;
        for (const [tabKey, tabData] of Object.entries(tabs)) {
            const badge = document.getElementById(`tab-badge-${tabKey}`);
            if (badge) badge.textContent = tabData.count || 0;
        }
    }

    function startInlineEdit(fieldKey) {
        if (!detailFields.has(fieldKey) || !state.currentProject) return;
        const p = state.currentProject;
        const wrapId = `wrap-${fieldKey.replace(/_/g, '-')}`;
        const wrapEl = document.getElementById(wrapId);
        if (!wrapEl) return;
        wrapEl.dataset.detailProjectNo = String(p.project_no);

        let inputHtml = '';
        const rawVal = p[fieldKey] !== undefined && p[fieldKey] !== null ? p[fieldKey] : '';

        if (fieldKey === 'channel') {
            const channels = ['카카오톡', '크몽', '이메일', '전화/문자', '방문', '숨고', '기타'];
            inputHtml = `
                <select class="form-control form-control-xs inline-edit-input" id="inline-input-${fieldKey}">
                    ${channels.map(c => `<option value="${c}" ${c === rawVal ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            `;
        } else if (fieldKey === 'material') {
            const mats = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PC', 'Nylon', 'Resin', 'MJF', '기타'];
            inputHtml = `
                <select class="form-control form-control-xs inline-edit-input" id="inline-input-${fieldKey}">
                    ${mats.map(m => `<option value="${m}" ${m === rawVal ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
            `;
        } else if (fieldKey === 'received_date' || fieldKey === 'due_date') {
            inputHtml = `<input type="date" class="form-control form-control-xs inline-edit-input" id="inline-input-${fieldKey}" value="${escapeHtml(String(rawVal))}">`;
        } else if (fieldKey === 'request_notes' || fieldKey === 'memo') {
            inputHtml = `<textarea class="form-control inline-edit-input" id="inline-input-${fieldKey}" rows="4" style="font-size: 0.92rem; width: 100%; min-height: 90px; line-height: 1.5; resize: vertical;">${escapeHtml(String(rawVal))}</textarea>`;
        } else if (fieldKey === 'address') {
            inputHtml = `<input type="text" class="form-control inline-edit-input" id="inline-input-${fieldKey}" style="width: 100%; font-size: 0.92rem;" value="${escapeHtml(String(rawVal))}">`;
        } else {
            inputHtml = `<input type="text" class="form-control inline-edit-input" id="inline-input-${fieldKey}" value="${escapeHtml(String(rawVal))}">`;
        }

        if (fieldKey === 'request_notes' || fieldKey === 'memo') {
            wrapEl.innerHTML = `
                <div class="info-inline-editor is-memo-editor">
                    ${inputHtml}
                    <div class="memo-btn-row">
                        <button type="button" class="btn btn-primary btn-xs" data-detail-action="save" data-field="${fieldKey}" title="저장 (Enter)"><i class="fa-solid fa-check"></i> 저장</button>
                        <button type="button" class="btn btn-outline btn-xs" data-detail-action="cancel" data-field="${fieldKey}" title="취소 (Esc)"><i class="fa-solid fa-xmark"></i> 취소</button>
                    </div>
                </div>
            `;
        } else {
            wrapEl.innerHTML = `
                <div class="info-inline-editor">
                    ${inputHtml}
                    <button type="button" class="btn-inline-save" data-detail-action="save" data-field="${fieldKey}" title="저장 (Enter)"><i class="fa-solid fa-check"></i></button>
                    <button type="button" class="btn-inline-cancel" data-detail-action="cancel" data-field="${fieldKey}" title="취소 (Esc)"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
        }
        const inputEl = document.getElementById(`inline-input-${fieldKey}`);
        if (inputEl) {
            inputEl.focus();
            if (inputEl.select && inputEl.type !== 'date') inputEl.select();

            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && inputEl.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    saveInlineEdit(fieldKey);
                } else if (e.key === 'Enter' && e.ctrlKey && inputEl.tagName === 'TEXTAREA') {
                    e.preventDefault();
                    saveInlineEdit(fieldKey);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelInlineEdit(fieldKey);
                }
            });
        }
    }

    async function saveInlineEdit(fieldKey) {
        if (!detailFields.has(fieldKey) || !state.currentProject) return;
        const inputEl = document.getElementById(`inline-input-${fieldKey}`);
        if (!inputEl) return;
        const projectNo = state.currentProject.project_no;
        const busyKey = `${projectNo}:${fieldKey}`;
        if (inlineBusy.has(busyKey)) return;
        inlineBusy.add(busyKey);

        const val = inputEl.value.trim();
        const updatePayload = { [fieldKey]: val, expected_version: state.currentProject.version };

        try {
            showToast('저장 중...', 'info');
            const res = await API.updateProject(projectNo, updatePayload);
            if (res.success && res.data) {
                if (state.currentProject?.project_no !== projectNo) return;
                state.currentProject = res.data;
                showToast('수정되었습니다.', 'success');
                renderProjectDetailContent(res.data);
                if (typeof loadProjects === 'function') loadProjects();
                if (typeof loadStats === 'function') loadStats();
            } else {
                showToast(res.error || '저장 실패', 'error');
                cancelInlineEdit(fieldKey);
            }
        } catch (e) {
            showToast('수정 중 오류 발생', 'error');
            cancelInlineEdit(fieldKey);
        } finally {
            inlineBusy.delete(busyKey);
        }
    }

    function cancelInlineEdit(fieldKey) {
        if (!detailFields.has(fieldKey) || !state.currentProject) return;
        renderProjectDetailContent(state.currentProject);
    }

    window.renderProjectDetailContent = renderProjectDetailContent;
    window.openProjectDetail = openProjectDetail;
    window.invalidateProjectDetailRequest = invalidateProjectDetailRequest;
    window.updateTabBadges = updateTabBadges;
    window.startInlineEdit = startInlineEdit;
    window.saveInlineEdit = saveInlineEdit;
    window.cancelInlineEdit = cancelInlineEdit;
})(window);
