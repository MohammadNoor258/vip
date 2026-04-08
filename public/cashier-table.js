(function () {
  const params = new URLSearchParams(window.location.search);
  const tableNumber = (params.get('table') || '').trim();
  const pageTitle = document.getElementById('pageTitle');
  const tableStatus = document.getElementById('tableStatus');
  const tableTotals = document.getElementById('tableTotals');
  const peopleList = document.getElementById('peopleList');
  const ordersList = document.getElementById('ordersList');
  const endSessionBtn = document.getElementById('endSessionBtn');
  const wsBadge = document.getElementById('wsBadge');
  const fetchOpts = { credentials: 'same-origin' };
  let sessionToken = '';
  let socket = null;
  let loadDetailTimer = null;

  function scheduleLoadDetail() {
    if (loadDetailTimer) clearTimeout(loadDetailTimer);
    loadDetailTimer = setTimeout(() => {
      loadDetailTimer = null;
      loadDetail();
    }, 120);
  }

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
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.message || errBody.error || 'Update failed';
      if (window.UI) window.UI.toast(msg, 'error');
      if (window.UI) window.UI.setLoading(false);
      return;
    }
    await loadDetail();
    if (window.UI) { window.UI.toast('Status updated', 'success'); window.UI.setLoading(false); }
  }

  function renderOrderCard(o) {
    const items = Array.isArray(o.items) ? o.items : [];
    const lines = items.map((i) => `${i.quantity}x ${i.name} = EUR${Number(i.lineTotal).toFixed(2)}`).join('<br/>');
    const actions = [];
    if (o.status === 'new') actions.push(`<button type="button" data-act="preparing" data-id="${o.id}" class="success">Start preparing</button>`);
    if (o.status === 'preparing') actions.push(`<button type="button" data-act="ready" data-id="${o.id}" class="success">Mark ready</button>`);
    if (o.status === 'ready') actions.push(`<button type="button" data-act="completed" data-id="${o.id}" class="success">Complete</button>`);
    if (o.status !== 'completed' && o.status !== 'cancelled') actions.push(`<button type="button" data-act="cancelled" data-id="${o.id}" class="danger">Cancel</button>`);
    return `
      <article class="order-card">
        <header>
          <div><strong>#${o.id}</strong></div>
          <span class="${statusClass(o.status)}">${o.status}</span>
        </header>
        <div class="meta">${lines || '-'}</div>
        <p><strong>EUR${Number(o.total).toFixed(2)}</strong></p>
        <div class="order-actions">${actions.join('')}</div>
      </article>
    `;
  }

  async function loadDetail() {
    if (!tableNumber) return;
    const res = await fetch(`/api/orders/table/${encodeURIComponent(tableNumber)}/detail`, fetchOpts);
    if (!res.ok) return;
    const d = await res.json();
    pageTitle.textContent = `Table ${tableNumber}`;
    tableStatus.textContent = d.active ? 'Active session' : 'Idle';
    tableTotals.textContent = `Grand total: EUR${Number(d.tableTotal || 0).toFixed(2)}`;
    peopleList.innerHTML = (d.participants || []).length
      ? d.participants.map((p) => `<li>${p.name}${p.phone ? ` (${p.phone})` : ''}</li>`).join('')
      : '<li class="meta">No participants.</li>';

    // Simplified invoice: show all items merged for the table session.
    const merged = new Map();
    (d.orders || []).forEach((o) => {
      (Array.isArray(o.items) ? o.items : []).forEach((it) => {
        const key = String(it.name || '').trim() || 'Item';
        const prev = merged.get(key) || { name: key, quantity: 0, total: 0 };
        prev.quantity += Number(it.quantity) || 0;
        prev.total += Number(it.lineTotal) || 0;
        merged.set(key, prev);
      });
    });
    const mergedList = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
    const mergedHtml = mergedList.length
      ? `
        <article class="card dashboard-card">
          <h3 style="margin:0 0 .5rem">Merged invoice</h3>
          <div class="meta">
            ${mergedList.map((x) => `${x.quantity}x ${x.name} = EUR${Number(x.total).toFixed(2)}`).join('<br/>')}
          </div>
        </article>
        <div class="meta" style="margin-top:.5rem">Orders (for status control):</div>
      `
      : '<p class="meta">No orders.</p>';
    ordersList.innerHTML = mergedHtml + ((d.orders || []).map(renderOrderCard).join('') || '');
    sessionToken = d.sessionToken || '';
    endSessionBtn.classList.toggle('hidden', !d.active || !sessionToken);
    ordersList.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => patchStatus(btn.getAttribute('data-id'), btn.getAttribute('data-act')));
    });
  }

  endSessionBtn.addEventListener('click', async () => {
    if (!sessionToken) return;
    const res = await fetch(`/api/tables/session/${encodeURIComponent(sessionToken)}/end`, {
      method: 'POST',
      ...fetchOpts,
    });
    if (!res.ok) return;
    await loadDetail();
    if (window.UI) window.UI.toast('Session ended', 'success');
  });

  function connectSocket() {
    if (socket) socket.disconnect();
    socket = io({
      withCredentials: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
    });
    wsBadge.textContent = 'Connecting...';
    socket.on('connect', () => {
      wsBadge.textContent = 'Live';
      wsBadge.classList.add('live');
    });
    socket.on('disconnect', () => {
      wsBadge.textContent = 'Offline';
      wsBadge.classList.remove('live');
    });
    socket.on('order:new', scheduleLoadDetail);
    socket.on('order:updated', scheduleLoadDetail);
    socket.on('tables:updated', scheduleLoadDetail);
  }

  loadDetail();
  if (window.UI) window.UI.initTheme('themeToggleBtn');
  connectSocket();
})();

