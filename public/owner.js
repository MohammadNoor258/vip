(function () {
  let tr = (k, f) => f || k;
  const loginPanel = document.getElementById('loginPanel');
  const dash = document.getElementById('dash');
  const userEl = document.getElementById('user');
  const passEl = document.getElementById('pass');
  const loginBtn = document.getElementById('loginBtn');
  const loginErr = document.getElementById('loginErr');
  const logoutBtn = document.getElementById('logoutBtn');
  const todayRevenue = document.getElementById('todayRevenue');
  const todayOrders = document.getElementById('todayOrders');
  const weekRevenue = document.getElementById('weekRevenue');
  const weekOrders = document.getElementById('weekOrders');
  const topItems = document.getElementById('topItems');
  const trendChart = document.getElementById('trendChart');
  const compareView = document.getElementById('compareView');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  const fetchOpts = { credentials: 'same-origin' };

  async function loadData() {
    const [statsRes, topRes] = await Promise.all([
      fetch('/api/dashboard/stats', fetchOpts),
      fetch('/api/dashboard/top-items?range=week', fetchOpts),
    ]);
    if (!statsRes.ok || !topRes.ok) return;
    const s = await statsRes.json();
    const t = await topRes.json();
    todayRevenue.textContent = `€${Number(s.todayRevenue).toFixed(2)}`;
    todayOrders.textContent = String(s.todayOrderCount);
    weekRevenue.textContent = `€${Number(s.weekRevenue).toFixed(2)}`;
    weekOrders.textContent = String(s.weekOrderCount);
    topItems.innerHTML = t.items.length
      ? t.items.map((x) => `<li>${x.name} — ${x.quantitySold}</li>`).join('')
      : `<li class="meta">${tr('owner.noData', 'No data yet.')}</li>`;
    await loadCharts();
  }

  function drawTrend(series) {
    if (!trendChart) return;
    const ctx = trendChart.getContext('2d');
    const w = trendChart.width = trendChart.clientWidth * 2;
    const h = trendChart.height = 240;
    ctx.clearRect(0, 0, w, h);
    const pad = 28;
    const max = Math.max(1, ...series.map((s) => Number(s.revenue || 0)));
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    series.forEach((s, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(1, series.length - 1);
      const y = h - pad - ((Number(s.revenue || 0) / max) * (h - pad * 2));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  async function loadCharts() {
    const [weeklyRes, monthlyRes] = await Promise.all([
      fetch('/api/dashboard/report?range=weekly', fetchOpts),
      fetch('/api/dashboard/report?range=monthly', fetchOpts),
    ]);
    if (!weeklyRes.ok || !monthlyRes.ok) return;
    const w = await weeklyRes.json();
    const m = await monthlyRes.json();
    drawTrend(w.series || []);
    const cur = Number(w.totals?.revenue || 0);
    const prev = Number((m.series || []).slice(0, 7).reduce((a, x) => a + Number(x.revenue || 0), 0));
    compareView.textContent = `This week: €${cur.toFixed(2)} vs previous period: €${prev.toFixed(2)}`;
    exportCsvBtn.onclick = () => {
      const rows = [['date', 'revenue', 'orders'], ...(m.series || []).map((x) => [x.date, x.revenue, x.orderCount])];
      const csv = rows.map((r) => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'owner-report.csv';
      a.click();
    };
  }

  async function checkSession() {
    const res = await fetch('/api/auth/me', fetchOpts);
    const me = await res.json();
    if (me.authenticated && me.role === 'admin') {
      loginPanel.classList.add('hidden');
      dash.classList.remove('hidden');
      await loadData();
      return true;
    }
    return false;
  }

  loginBtn.addEventListener('click', async () => {
    loginErr.textContent = '';
    if (window.UI) window.UI.setLoading(true);
    loginBtn.disabled = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...fetchOpts,
        body: JSON.stringify({ username: userEl.value.trim(), password: passEl.value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        loginErr.textContent = body.message || tr('common.invalidCredentials', 'Invalid username or password.');
        return;
      }
      if (body.role !== 'admin') {
        loginErr.textContent = tr('owner.ownerOnly', 'Owner dashboard is for owner/admin only.');
        await fetch('/api/auth/logout', { method: 'POST', ...fetchOpts });
        return;
      }
      await checkSession();
    } catch {
      loginErr.textContent = tr('common.networkError', 'Network error.');
    } finally {
      loginBtn.disabled = false;
      if (window.UI) window.UI.setLoading(false);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', ...fetchOpts });
    dash.classList.add('hidden');
    loginPanel.classList.remove('hidden');
  });

  (async function init() {
    if (window.UI) window.UI.initTheme('themeToggleBtn');
    if (window.I18n) {
      await window.I18n.init();
      tr = window.I18n.t;
    }
    checkSession();
  })();
})();

