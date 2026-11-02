/* 배송 상세 동작. 상태/API/화면 의존성은 init()으로 주입한다. */
(function registerDeliveryManager(window) {
    const HANJIN_HOST = 'www.hanjin.co.kr';
    const HANJIN_PATH = '/kor/CMS/DeliveryMgr/WaybillResult.do';
    const HANJIN_COURIERS = new Set(['한진', '한진택배', 'hanjin', 'kr_hanjin']);
    const MIN_TRACKING_LENGTH = 10;
    const MAX_TRACKING_LENGTH = 14;
    let manager;

    function init(options = {}) {
        const state = options.state || window.state;
        const api = options.api || window.API;
        const doc = options.documentRef || document;
        const toast = options.showToast || window.showToast || (() => {});
        const reloadDetail = options.openProjectDetail || window.openProjectDetail;
        const refreshProjects = options.loadProjects || window.loadProjects;
        const refreshStats = options.loadStats || window.loadStats;
        const refreshDashboard = options.loadDashboard || window.loadDashboard;
        const clipboard = options.clipboard || window.navigator?.clipboard;
        let saving = false;
        let tracking = false;
        // Saving a tracking number clears the stored tracking snapshot on the
        // server. Keep save/query mutually exclusive per project so a late
        // save cannot erase a result just written by a query.
        const busyProjects = new Set();
        let saveGeneration = 0;
        let trackGeneration = 0;
        let contextGeneration = 0;

        function currentProject() { return state?.currentProject || null; }
        function isCurrent(projectNo, generation = contextGeneration) { return String(currentProject()?.project_no || '') === String(projectNo) && generation === contextGeneration; }
        function setContext(projectNo) { if (projectNo) contextGeneration += 1; return contextGeneration; }
        function invalidateContext() { contextGeneration += 1; return contextGeneration; }
        function courierValue(value) { return String(value || '한진택배').trim() || '한진택배'; }
        function normalizeTracking(value) {
            const text = String(value ?? '').trim();
            if (!text) return '';
            return /^\d+$/.test(text) && text.length >= MIN_TRACKING_LENGTH && text.length <= MAX_TRACKING_LENGTH ? text : null;
        }
        function isHanjin(courier) { return HANJIN_COURIERS.has(String(courier || '한진택배').trim().toLowerCase()); }
        function officialUrl(trackingNo, courier = '한진택배') {
            const normalized = normalizeTracking(trackingNo);
            if (!normalized || !isHanjin(courier)) return '';
            return `https://${HANJIN_HOST}/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${encodeURIComponent(normalized)}`;
        }
        function safeUrl(value) {
            try {
                const parsed = new URL(String(value), window.location?.origin || 'http://localhost');
                return (parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === HANJIN_HOST && !parsed.username && !parsed.password && !parsed.port && parsed.pathname === HANJIN_PATH) ? parsed.href : '';
            } catch (_) { return ''; }
        }
        function updateTrackingLink(value, courier) {
            const row = doc.getElementById('detail-tracking-link-row');
            const link = doc.getElementById('detail-tracking-link');
            const trackButton = doc.getElementById('btn-track-delivery');
            if (!row || !link) return '';
            const url = courier === undefined && /^https?:/i.test(String(value || ''))
                ? safeUrl(value)
                : officialUrl(value, courierValue(courier));
            if (url) {
                link.href = url;
                link.textContent = '공식 배송조회 열기';
                link.classList.remove('is-disabled');
                link.removeAttribute('aria-disabled');
                if (trackButton) trackButton.disabled = false;
            } else {
                link.removeAttribute('href');
                link.textContent = '운송장 저장 후 공식 배송조회';
                link.classList.add('is-disabled');
                link.setAttribute('aria-disabled', 'true');
                if (trackButton) trackButton.disabled = true;
            }
            return url;
        }
        function renderTrackingResult(result) {
            const panel = doc.getElementById('detail-tracking-result');
            const status = doc.getElementById('detail-tracking-status');
            const summary = doc.getElementById('detail-tracking-summary');
            const time = doc.getElementById('detail-tracking-time');
            const location = doc.getElementById('detail-tracking-location');
            if (!panel) return;
            if (!result) {
                panel.hidden = true;
                [status, summary, time, location].forEach(el => { if (el) el.textContent = ''; });
                return;
            }
            const latest = result.latest_progress || {};
            const timestamp = [latest.date, latest.time].filter(Boolean).join(' ');
            if (status) status.textContent = result.deliv_status ? `상태: ${result.deliv_status}` : '상태 확인';
            if (summary) summary.textContent = latest.description || result.status_text || '한진 배송 이력을 확인했습니다.';
            if (time) time.textContent = timestamp ? `최신 시각: ${timestamp}` : '';
            if (location) location.textContent = latest.location ? `현재 위치: ${latest.location}` : '';
            panel.hidden = false;
        }
        function updateTrackingLinkFromFields() {
            const courier = doc.getElementById('detail-courier')?.value || '한진택배';
            const trackingNo = doc.getElementById('detail-tracking-no')?.value || '';
            return updateTrackingLink(trackingNo, courier);
        }
        async function handleCopyLogiiAddress() {
            const project = currentProject();
            const text = project?.logii_address?.formatted_block;
            if (!text || !clipboard?.writeText) return;
            try { await clipboard.writeText(text); toast('로지아이 배송 주소 정보가 클립보드에 복사되었습니다!', 'success'); }
            catch (_) { toast('클립보드 복사 실패', 'error'); }
        }
        async function handleSaveTrackingNo() {
            const project = currentProject();
            if (!project || saving || tracking) return null;
            const trackingNo = normalizeTracking(doc.getElementById('detail-tracking-no')?.value);
            if (trackingNo === null) { toast(`운송장번호는 ${MIN_TRACKING_LENGTH}~${MAX_TRACKING_LENGTH}자리 숫자여야 합니다.`, 'warning'); return null; }
            const projectNo = project.project_no;
            if (busyProjects.has(String(projectNo))) return null;
            const generation = ++saveGeneration; const context = contextGeneration;
            saving = true;
            busyProjects.add(String(projectNo));
            const trackButton = doc.getElementById('btn-track-delivery');
            if (trackButton) trackButton.disabled = true;
            try {
                const res = await api.updateDelivery({ project_no: projectNo, tracking_no: trackingNo, courier: courierValue(doc.getElementById('detail-courier')?.value), deliv_status: trackingNo ? '발송' : project.deliv_status, expected_version: project.version });
                if (!isCurrent(projectNo, context) || generation !== saveGeneration) return res;
                if (res?.success) {
                    toast('운송장 번호가 저장되었습니다.', 'success');
                    await reloadDetail?.(projectNo);
                    await refreshDashboard?.();
                    if (!refreshDashboard) await refreshProjects?.();
                    return res;
                }
                toast(res?.error || '운송장 저장 실패', 'error');
                return res;
            } catch (_) { if (isCurrent(projectNo, context) && generation === saveGeneration) toast('운송장 저장 실패', 'error'); return null; }
            finally { saving = false; busyProjects.delete(String(projectNo)); if (trackButton) trackButton.disabled = false; }
        }
        async function handleTrackDelivery() {
            const project = currentProject();
            if (!project || tracking || saving) return null;
            const trackingNo = normalizeTracking(doc.getElementById('detail-tracking-no')?.value);
            const courier = courierValue(doc.getElementById('detail-courier')?.value);
            if (!trackingNo) { toast(trackingNo === null ? `운송장번호는 ${MIN_TRACKING_LENGTH}~${MAX_TRACKING_LENGTH}자리 숫자여야 합니다.` : '먼저 운송장번호를 저장하세요.', 'warning'); return null; }
            const projectNo = project.project_no;
            if (busyProjects.has(String(projectNo))) return null;
            const generation = ++trackGeneration; const context = contextGeneration;
            const button = doc.getElementById('btn-track-delivery');
            tracking = true;
            busyProjects.add(String(projectNo));
            if (button) { button.disabled = true; button.textContent = '조회 중...'; }
            try {
                const res = await api.trackDelivery({ project_no: projectNo, courier, tracking_no: trackingNo });
                if (!isCurrent(projectNo, context) || generation !== trackGeneration) return res;
                if (!res?.success) { toast(res?.error || '배송조회에 실패했습니다.', 'error'); return res; }
                toast(`배송 상태가 '${res.data?.deliv_status || '확인'}'으로 반영되었습니다.`, 'success');
                if (res.data?.project) { state.currentProject = res.data.project; options.renderProjectDetailContent?.(res.data.project); await refreshProjects?.(); await refreshStats?.(); }
                renderTrackingResult(res.data);
                return res;
            } catch (_) { if (isCurrent(projectNo, context) && generation === trackGeneration) toast('한진 배송조회 중 오류가 발생했습니다.', 'error'); return null; }
            finally { tracking = false; busyProjects.delete(String(projectNo)); if (button) { button.disabled = false; button.textContent = '상태 조회'; } }
        }
        manager = { handleCopyLogiiAddress, updateTrackingLink, renderTrackingResult, updateTrackingLinkFromFields, handleSaveTrackingNo, handleTrackDelivery, officialUrl, normalizeTracking, setContext, invalidateContext, isSaving: () => saving, isTracking: () => tracking };
        return manager;
    }
    function get() { return manager || init(); }
    window.DeliveryManager = { init, get };
})(window);
