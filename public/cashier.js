(function () {
  let tr = (k, f) => f || k;
  const loginPanel = document.getElementById('loginPanel');
  const app = document.getElementById('app');
  const userEl = document.getElementById('user');
  const passEl = document.getElementById('pass');
  const loginBtn = document.getElementById('loginBtn');
  const loginErr = document.getElementById('loginErr');
  const logoutBtn = document.getElementById('logoutBtn');
  const blocks = document.getElementById('blocks');
  const tableSearch = document.getElementById('tableSearch');
  const tableFilter = document.getElementById('tableFilter');
  const wsBadge = document.getElementById('wsBadge');

  let socket = null;
  let selectedTable = '';
  let blocksCache = [];
  const fetchOpts = { credentials: 'same-origin' };

  function statusClass(s) {
    return `status-pill status-${s}`;
  }

  async function patchStatus(id, status) {
    if (window.UI) window.UI.setLoading(true);
    const res = await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      if (window.UI) window.UI.toast(tr('cashier.statusUpdateFailed', 'Status update failed'), 'error');
      if (window.UI) window.UI.setLoading(false);
      return;
    }
    if (selectedTable) await loadTableDetail(selectedTable);
    await loadBlocks();
    if (window.UI) { window.UI.toast('Order status updated', 'success'); window.UI.setLoading(false); }
  }

  function renderOrderCard(o) {
    const items = Array.isArray(o.items) ? o.items : [];
    const lines = items
      .map((i) => `${i.quantity}× ${i.name} = €${Number(i.lineTotal).toFixed(2)}`)
      .join('<br/>');
    const actions = [];
    if (o.status === 'new') {
      actions.push(`<button type="button" data-act="preparing" data-id="${o.id}" class="success">Preparing</button>`);
    } else if (o.status === 'preparing') {
      actions.push(`<button type="button" data-act="ready" data-id="${o.id}" class="success">Ready</button>`);
    } else if (o.status === 'ready') {
      actions.push(`<button type="button" data-act="completed" data-id="${o.id}" class="success">Completed</button>`);
    }
    if (o.status !== 'completed' && o.status !== 'cancelled') {
      actions.push(`<button type="button" data-act="cancelled" data-id="${o.id}" class="danger">Cancel</button>`);
    }
    return `
      <article class="order-card">
        <header>
          <div><strong>#${o.id}</strong> <span class="meta"> ${o.customerName || 'Guest'}</span></div>
          <span class="${statusClass(o.status)}">${o.status}</span>
        </header>
        <div class="meta">${lines || '—'}</div>
        <p style="margin:.4rem 0"><strong>€${Number(o.total).toFixed(2)}</strong></p>
        <div class="order-actions">${actions.join('')}</div>
      </article>
    `;
  }

  async function loadBlocks() {
    const res = await fetch('/api/tables/blocks', fetchOpts);
    if (!res.ok) return;
    const rows = await res.json();
    blocksCache = rows;
    renderBlocks();
  }

  function renderBlocks() {
    const q = (tableSearch && tableSearch.value || '').trim().toLowerCase();
    const f = (tableFilter && tableFilter.value) || 'all';
    const rows = blocksCache.filter((t) => {
      if (q && !String(t.tableNumber).toLowerCase().includes(q)) return false;
      if (f === 'active' && !t.active) return false;
      if (f === 'idle' && t.active) return false;
      return true;
    });
    blocks.innerHTML = rows
      .map(
        (t) => `
        <article class="card ${t.active ? 'table-active' : ''}" data-table="${t.tableNumber}">
          <h3>Table ${t.tableNumber}</h3>
          <p class="meta">${t.active ? tr('cashier.activeSession', 'Active session') : tr('cashier.idle', 'Idle')}</p>
          <p class="meta">People: ${t.peopleCount || 0}</p>
          <p class="meta">Orders: ${t.ordersCount || 0}</p>
          <p><strong>€${Number(t.total || 0).toFixed(2)}</strong></p>
        </article>
      `
      )
      .join('');
    blocks.querySelectorAll('[data-table]').forEach((el) => {
      el.addEventListener('click', () => {
        const table = el.getAttribute('data-table');
        window.location.href = `/cashier-table.html?table=${encodeURIComponent(table)}`;
      });
    });
  }

  function connectSocket() {
    if (socket) socket.disconnect();
    socket = io({
      withCredentials: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
    });
    wsBadge.textContent = 'Connecting…';
    socket.on('connect', () => {
      wsBadge.textContent = 'Live';
      wsBadge.classList.add('live');
    });
    socket.on('disconnect', () => {
      wsBadge.textContent = 'Offline';
      wsBadge.classList.remove('live');
    });
    socket.on('order:new', async () => {
      await loadBlocks();
    });
    socket.on('order:updated', async () => {
      await loadBlocks();
    });
    socket.on('tables:updated', async () => {
      await loadBlocks();
      if (window.UI) window.UI.toast('Table session updated', 'info');
    });
  }

  async function checkSession() {
    const res = await fetch('/api/auth/me', fetchOpts);
    const data = await res.json();
    if (data.authenticated && ['cashier', 'admin', 'waiter'].includes(data.role)) {
      loginPanel.classList.add('hidden');
      app.classList.remove('hidden');
      await loadBlocks();
      connectSocket();
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
    if (socket) socket.disconnect();
    socket = null;
    app.classList.add('hidden');
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
  if (tableSearch) tableSearch.addEventListener('input', renderBlocks);
  if (tableFilter) tableFilter.addEventListener('change', renderBlocks);
})();

