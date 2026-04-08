(function () {
  const themeKey = `vip.theme.${window.location.pathname}`;
  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');
    localStorage.setItem(themeKey, theme);
  }
  function initTheme(toggleId = 'themeToggleBtn') {
    applyTheme(localStorage.getItem(themeKey) || 'light');
    const btn = document.getElementById(toggleId);
    if (btn) {
      btn.textContent = document.documentElement.classList.contains('dark-theme') ? 'Light' : 'Dark';
      btn.addEventListener('click', () => {
        const next = document.documentElement.classList.contains('dark-theme') ? 'light' : 'dark';
        applyTheme(next);
        btn.textContent = next === 'dark' ? 'Light' : 'Dark';
      });
    }
  }
  function toast(message, type = 'info') {
    const host = document.querySelector('.toast-host') || (() => {
      const h = document.createElement('div');
      h.className = 'toast-host';
      document.body.appendChild(h);
      return h;
    })();
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderLeftColor = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)';
    el.innerHTML = `<div class="toast-body">${message}</div>`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }
  function setLoading(on) {
    let el = document.getElementById('globalSpinner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'globalSpinner';
      el.className = 'global-spinner hidden';
      el.innerHTML = '<div class="spinner-ring"></div>';
      document.body.appendChild(el);
    }
    el.classList.toggle('hidden', !on);
  }
  window.UI = { initTheme, toast, setLoading };
})();

