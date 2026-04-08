(function () {
  const STORAGE_KEY = 'vip.lang';
  let lang = localStorage.getItem(STORAGE_KEY) || 'en';
  let dict = {};

  function resolve(path, obj) {
    return String(path || '')
      .split('.')
      .reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
  }

  async function load(nextLang) {
    const safe = nextLang === 'ar' ? 'ar' : 'en';
    const res = await fetch(`/locales/${safe}.json`);
    if (!res.ok) throw new Error('i18n_load_failed');
    dict = await res.json();
    lang = safe;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }

  function t(key, fallback) {
    const val = resolve(key, dict);
    if (typeof val === 'string') return val;
    return fallback != null ? fallback : key;
  }

  function apply() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'), el.textContent);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'), el.getAttribute('placeholder') || ''));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title'), el.getAttribute('title') || ''));
    });
    const langBtn = document.getElementById('langSwitchBtn');
    if (langBtn) {
      langBtn.textContent = lang === 'ar' ? 'English' : 'العربية';
    }
  }

  async function init() {
    await load(lang);
    apply();
    const langBtn = document.getElementById('langSwitchBtn');
    if (langBtn) {
      langBtn.addEventListener('click', async () => {
        await load(lang === 'ar' ? 'en' : 'ar');
        apply();
        window.dispatchEvent(new CustomEvent('i18n:updated'));
      });
    }
  }

  window.I18n = { init, t, getLang: () => lang, apply };
})();

