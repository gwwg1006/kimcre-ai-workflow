/**
 * 공통 UI 유틸리티.
 * 기능별 화면 코드가 서로의 구현을 직접 복사하지 않도록 한 곳에서 제공한다.
 */
(function registerUiUtils(window) {
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function debounce(func, wait) {
        let timeout;
        return function debounced(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        let icon = '<i class="fa-solid fa-circle-info text-primary"></i>';
        if (type === 'success') icon = '<i class="fa-solid fa-circle-check text-success"></i>';
        if (type === 'error') icon = '<i class="fa-solid fa-circle-exclamation text-danger"></i>';

        toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideIn 0.2s reverse forwards';
            setTimeout(() => toast.remove(), 200);
        }, 3500);
    }

    window.escapeHtml = escapeHtml;
    window.debounce = debounce;
    window.showToast = showToast;
})(window);
