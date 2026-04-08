(function () {
  const loginPanel = document.getElementById('loginPanel');
  const dash = document.getElementById('dash');
  const userEl = document.getElementById('user');
  const passEl = document.getElementById('pass');
  const loginBtn = document.getElementById('loginBtn');
  const loginErr = document.getElementById('loginErr');
  const logoutBtn = document.getElementById('logoutBtn');
  const mainNav = document.getElementById('mainNav');
  const wsBadge = document.getElementById('wsBadge');
  const roleBadge = document.getElementById('roleBadge');

  const subBanner = document.getElementById('subBanner');
  const dashExpiring = document.getElementById('dashExpiring');
  const dashSubStatus = document.getElementById('dashSubStatus');
  const dashRevenue = document.getElementById('dashRevenue');
  const dashOrderCount = document.getElementById('dashOrderCount');
  const dashWeekRevenue = document.getElementById('dashWeekRevenue');
  const dashWeekOrders = document.getElementById('dashWeekOrders');
  const topItemsList = document.getElementById('topItemsList');
  const topTodayBtn = document.getElementById('topTodayBtn');
  const topWeekBtn = document.getElementById('topWeekBtn');
  const reportSection = document.getElementById('reportSection');
  const reportSummary = document.getElementById('reportSummary');
  const reportSeries = document.getElementById('reportSeries');
  const reportWeekly = document.getElementById('reportWeekly');
  const reportMonthly = document.getElementById('reportMonthly');
  const subscriptionSection = document.getElementById('subscriptionSection');
  const subRenewBtn = document.getElementById('subRenewBtn');
  const subPlanSelect = document.getElementById('subPlanSelect');
  const subPlanBtn = document.getElementById('subPlanBtn');
  const subCancelBtn = document.getElementById('subCancelBtn');
  const subMgmtMsg = document.getElementById('subMgmtMsg');
  const logoSection = document.getElementById('logoSection');
  const logoForm = document.getElementById('logoForm');
  const logoFile = document.getElementById('logoFile');
  const logoPreview = document.getElementById('logoPreview');
  const logoMsg = document.getElementById('logoMsg');

  const filterStatus = document.getElementById('filterStatus');
  const filterDateFrom = document.getElementById('filterDateFrom');
  const filterDateTo = document.getElementById('filterDateTo');
  const filterTable = document.getElementById('filterTable');
  const filterApplyBtn = document.getElementById('filterApplyBtn');
  const filterResetBtn = document.getElementById('filterResetBtn');
  const ordersGrouped = document.getElementById('ordersGrouped');

  const menuAddForm = document.getElementById('menuAddForm');
  const menuAddCategory = document.getElementById('menuAddCategory');
  const menuEditForm = document.getElementById('menuEditForm');
  const menuEditCategory = document.getElementById('menuEditCategory');
  const menuEditCancel = document.getElementById('menuEditCancel');
  const menuAdminList = document.getElementById('menuAdminList');

  const tableCountInput = document.getElementById('tableCountInput');
  const tableCountSave = document.getElementById('tableCountSave');
  const tablesMsg = document.getElementById('tablesMsg');
  const tablesListPreview = document.getElementById('tablesListPreview');

  const catAddForm = document.getElementById('catAddForm');
  const catEditForm = document.getElementById('catEditForm');
  const catEditCancel = document.getElementById('catEditCancel');
  const categoriesList = document.getElementById('categoriesList');
  const menuAddCategoryQuick = document.getElementById('menuAddCategoryQuick');
  const menuSearch = document.getElementById('menuSearch');
  const menuPrevPage = document.getElementById('menuPrevPage');
  const menuNextPage = document.getElementById('menuNextPage');
  const menuPageInfo = document.getElementById('menuPageInfo');

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', roles: ['admin', 'manager'] },
    { id: 'menu', label: 'Menu', roles: ['admin', 'manager'] },
  ];

  const STATUS_ORDER = ['new', 'preparing', 'ready', 'completed', 'cancelled'];

  let socket = null;
  let sessionRole = '';
  let sessionRestaurantId = null;
  let lastSubscriptionId = null;
  let timersStarted = false;
  let currentPage = '';
  let categoriesCache = [];
  let toastHost = null;
  let audioUnlocked = false;
  let menuItemsCache = [];
  let menuPage = 1;
  const menuPageSize = 12;

  const fetchOpts = { credentials: 'same-origin' };

  function ensureToastHost() {
    if (toastHost) return toastHost;
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
    return toastHost;
  }

  function showToast(title, body, { timeoutMs = 6000 } = {}) {
    if (window.UI) {
      window.UI.toast(`${title}: ${body}`, 'info');
      return;
    }
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <div class="toast-title">${escapeHtml(title || 'Notification')}</div>
      <div class="toast-body">${escapeHtml(body || '')}</div>
      <button type="button" class="toast-close" aria-label="Close">×</button>
    `;
    el.querySelector('.toast-close').addEventListener('click', () => el.remove());
    host.appendChild(el);
    setTimeout(() => el.remove(), timeoutMs);
  }

  function tryPlayNotificationSound() {
    // Browsers often block autoplay until user interacts with the page.
    if (!audioUnlocked) return;
    try {
      const a = new Audio('/sounds/notification.mp3');
      a.volume = 0.9;
      a.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString();
  }

  function fmtDate(iso) {
    if (!iso) return '';
    return typeof iso === 'string' ? iso.slice(0, 10) : iso;
  }

  function statusClass(s) {
    return `status-pill status-${s}`;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function canSeeDashboard() {
    return sessionRole === 'admin' || sessionRole === 'manager';
  }
  function canManageMenu() {
    return sessionRole === 'admin' || sessionRole === 'manager';
  }
  function canManageSubscription() {
    return false;
  }
  function canSeeOrders() {
    return sessionRole === 'admin' || sessionRole === 'waiter' || sessionRole === 'cashier';
  }
  function canManageTables() {
    return false;
  }
  function canManageCategories() {
    return sessionRole === 'admin';
  }

  function buildNav() {
    mainNav.innerHTML = NAV.filter((n) => n.roles.includes(sessionRole))
      .map(
        (n) =>
          `<button type="button" class="admin-nav-btn" data-page="${n.id}">${escapeHtml(n.label)}</button>`
      )
      .join('');
    mainNav.querySelectorAll('[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => showPage(btn.getAttribute('data-page')));
    });
  }

  function showPage(id) {
    currentPage = id;
    document.querySelectorAll('.page-panel').forEach((p) => p.classList.add('hidden'));
    const panel = document.getElementById(`page-${id}`);
    if (panel) panel.classList.remove('hidden');
    mainNav.querySelectorAll('.admin-nav-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-page') === id);
    });
    if (id === 'menu' && canManageMenu()) {
      loadCategoriesForSelects();
      loadMenuAdminList();
    }
    if (id === 'dashboard' && canSeeDashboard()) {
      loadDashboardStats();
      loadTopItems('week');
      loadReport('weekly');
    }
  }

  function pickDefaultPage() {
    if (canSeeDashboard()) return 'dashboard';
    if (canManageMenu()) return 'menu';
    return 'dashboard';
  }

  function renderOrderCard(o) {
    const items = Array.isArray(o.items) ? o.items : [];
    const lines = items
      .map(
        (i) =>
          `${i.quantity}× ${escapeHtml(i.name)} @ €${Number(i.unitPrice).toFixed(2)} = €${Number(i.lineTotal).toFixed(2)}`
      )
      .join('<br/>');
    const note = o.customerNote ? `<p class="meta">Note: ${escapeHtml(o.customerNote)}</p>` : '';
    const actions = [];
    if (o.status === 'new') {
      actions.push(
        `<button type="button" data-act="preparing" data-id="${o.id}" class="success">Confirm / Preparing</button>`,
        `<button type="button" data-act="cancelled" data-id="${o.id}" class="danger">Cancel</button>`
      );
    } else if (o.status === 'preparing') {
      actions.push(
        `<button type="button" data-act="ready" data-id="${o.id}" class="success">Mark ready</button>`,
        `<button type="button" data-act="cancelled" data-id="${o.id}" class="danger">Cancel</button>`
      );
    } else if (o.status === 'ready') {
      actions.push(
        `<button type="button" data-act="completed" data-id="${o.id}" class="success">Complete</button>`,
        `<button type="button" data-act="cancelled" data-id="${o.id}" class="danger">Cancel</button>`
      );
    }
    return `
      <article class="order-card" data-order-id="${o.id}">
        <header>
          <div>
            <strong>Order #${o.id}</strong>
            <span class="meta"> · Table ${escapeHtml(String(o.tableNumber))}</span>
            <div class="meta">${fmtTime(o.createdAt)}</div>
          </div>
          <span class="${statusClass(o.status)}">${escapeHtml(o.status)}</span>
        </header>
        <div class="meta">${lines || '—'}</div>
        <p style="margin:0.5rem 0 0"><strong>Total €${Number(o.total).toFixed(2)}</strong></p>
        ${note}
        <div class="order-actions">${actions.join('')}</div>
      </article>
    `;
  }

  function renderOrdersGrouped(list) {
    const by = {};
    STATUS_ORDER.forEach((s) => {
      by[s] = [];
    });
    list.forEach((o) => {
      if (by[o.status]) by[o.status].push(o);
    });
    ordersGrouped.innerHTML = STATUS_ORDER.map((st) => {
      const arr = by[st];
      const cards = arr.map(renderOrderCard).join('');
      return `
        <section class="order-status-column">
          <h3 class="order-status-heading">${escapeHtml(st)} <span class="meta">(${arr.length})</span></h3>
          <div class="order-status-cards">${cards || '<p class="meta">None</p>'}</div>
        </section>
      `;
    }).join('');
    ordersGrouped.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => patchStatus(btn.getAttribute('data-id'), btn.getAttribute('data-act')));
    });
  }

  async function patchStatus(id, status) {
    const res = await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify({ status }),
    });
    if (res.status === 401 || res.status === 403) {
      window.location.reload();
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (window.UI) window.UI.toast(err.error || 'Update failed', 'error');
      return;
    }
    if (currentPage === 'orders') await loadOrdersPage();
  }

  function ordersQueryString() {
    const p = new URLSearchParams();
    const st = filterStatus.value.trim();
    if (st) p.set('status', st);
    if (filterDateFrom.value) p.set('dateFrom', filterDateFrom.value);
    if (filterDateTo.value) p.set('dateTo', filterDateTo.value);
    const tb = filterTable.value.trim();
    if (tb) p.set('tableNumber', tb);
    const q = p.toString();
    return q ? `?${q}` : '';
  }

  async function loadOrdersPage() {
    const res = await fetch(`/api/orders${ordersQueryString()}`, fetchOpts);
    if (res.status === 401 || res.status === 403) return;
    const list = await res.json();
    renderOrdersGrouped(list);
  }

  function connectSocket() {
    if (!sessionRestaurantId || !canSeeOrders()) return;
    if (socket) socket.disconnect();
    socket = io({ withCredentials: true });
    wsBadge.textContent = 'Connecting…';
    socket.on('connect', () => {
      wsBadge.textContent = 'Live';
      wsBadge.classList.add('live');
      if (currentPage === 'orders') loadOrdersPage();
    });
    socket.on('disconnect', () => {
      wsBadge.textContent = 'Offline';
      wsBadge.classList.remove('live');
    });
    socket.on('orders:snapshot', (list) => {
      if (currentPage === 'orders') renderOrdersGrouped(list);
    });
    socket.on('order:new', (order) => {
      const tableLabel = order && (order.table || order.tableNumber);
      if (order && tableLabel) {
        const details = `Table ${tableLabel} · Order #${order.id}`;
        showToast('New order', details);
        tryPlayNotificationSound();
      } else {
        showToast('New order', 'A new order was placed.');
        tryPlayNotificationSound();
      }
      if (currentPage === 'orders') loadOrdersPage();
    });
    socket.on('order:updated', () => {
      if (currentPage === 'orders') loadOrdersPage();
    });
    socket.on('subscription:expiring-soon', (payload) => {
      const msg =
        (payload && payload.message) ||
        'Your subscription is about to expire. Renew soon to avoid service interruption.';
      dashExpiring.textContent = msg;
      if (payload && payload.expiresAt) {
        dashExpiring.textContent += ` (expires ${fmtTime(payload.expiresAt)})`;
      }
      dashExpiring.classList.remove('hidden');
    });
  }

  async function loadReport(range) {
    if (!canSeeDashboard()) return;
    const res = await fetch(`/api/dashboard/report?range=${range}`, fetchOpts);
    if (!res.ok) return;
    const data = await res.json();
    reportSummary.textContent = `Total revenue €${Number(data.totals.revenue).toFixed(2)} · ${data.totals.orderCount} orders (${data.range}).`;
    reportSeries.innerHTML = data.series
      .map(
        (row) =>
          `<li><span>${fmtDate(row.date)}</span> — €${Number(row.revenue).toFixed(2)} · ${row.orderCount} orders</li>`
      )
      .join('');
  }

  async function loadTopItems(range) {
    if (!canSeeDashboard()) return;
    const res = await fetch(`/api/dashboard/top-items?range=${range === 'today' ? 'today' : 'week'}`, fetchOpts);
    if (!res.ok) return;
    const data = await res.json();
    topItemsList.innerHTML = data.items.length
      ? data.items.map((it) => `<li>${escapeHtml(it.name)} — ${it.quantitySold} sold</li>`).join('')
      : '<li class="meta">No data in this range.</li>';
  }

  async function loadDashboardStats() {
    if (!canSeeDashboard()) return;
    try {
      const [subRes, statsRes] = await Promise.all([
        fetch('/api/subscription', fetchOpts),
        fetch('/api/dashboard/stats', fetchOpts),
      ]);
      if (subRes.status === 401 || subRes.status === 403) return;
      if (subRes.ok) {
        const sub = await subRes.json();
        lastSubscriptionId = sub.subscriptionId;
        if (sub.planName && subPlanSelect) {
          subPlanSelect.value = sub.planName === 'Premium' ? 'Premium' : 'Standard';
        }
        if (sub.active) {
          dashSubStatus.textContent = sub.expiresAt
            ? `Active · ${sub.planName || ''} · expires ${fmtTime(sub.expiresAt)}`
            : 'Active';
          if (sub.expiresAt) {
            const ms = new Date(sub.expiresAt).getTime() - Date.now();
            const twoDays = 2 * 24 * 60 * 60 * 1000;
            if (ms > 0 && ms <= twoDays) {
              dashExpiring.textContent = `Subscription expires within 2 days (${fmtTime(sub.expiresAt)}).`;
              dashExpiring.classList.remove('hidden');
            } else {
              dashExpiring.classList.add('hidden');
            }
          } else {
            dashExpiring.classList.add('hidden');
          }
        } else {
          dashSubStatus.textContent = sub.message || 'Inactive';
          dashExpiring.classList.add('hidden');
        }
      } else {
        dashSubStatus.textContent = '—';
        dashExpiring.classList.add('hidden');
      }
      if (statsRes.ok) {
        const s = await statsRes.json();
        dashRevenue.textContent = `€${Number(s.todayRevenue).toFixed(2)}`;
        dashOrderCount.textContent = String(s.todayOrderCount ?? '—');
        dashWeekRevenue.textContent = `€${Number(s.weekRevenue).toFixed(2)}`;
        dashWeekOrders.textContent = String(s.weekOrderCount ?? '—');
      }
    } catch {
      dashSubStatus.textContent = '—';
    }
  }

  async function refreshSubBanner() {
    if (!sessionRestaurantId) return;
    const res = await fetch(`/api/status?restaurantId=${sessionRestaurantId}`);
    const data = await res.json();
    if (!data.subscriptionActive) {
      subBanner.classList.remove('hidden');
      subBanner.textContent =
        data.message || 'Subscription expired — customers cannot place new orders.';
    } else {
      subBanner.classList.add('hidden');
    }
  }

  async function loadCategoriesForSelects() {
    const res = await fetch('/api/categories', fetchOpts);
    if (!res.ok) return;
    categoriesCache = await res.json();
    const opts = categoriesCache
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
    menuAddCategory.innerHTML = opts;
    menuEditCategory.innerHTML = opts;
  }

  function renderMenuAdminList(items) {
    const q = (menuSearch && menuSearch.value || '').trim().toLowerCase();
    const filtered = q
      ? items.filter((it) =>
          `${it.name} ${it.category || ''}`.toLowerCase().includes(q)
        )
      : items.slice();
    const start = (menuPage - 1) * menuPageSize;
    const pageItems = filtered.slice(start, start + menuPageSize);
    if (menuPageInfo) menuPageInfo.textContent = `Page ${menuPage} / ${Math.max(1, Math.ceil(filtered.length / menuPageSize))}`;
    const byCat = {};
    pageItems.forEach((it) => {
      const c = it.category || 'General';
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(it);
    });
    menuAdminList.innerHTML = Object.keys(byCat).map((catName) => {
      const list = byCat[catName].map((it) => {
        const img = it.imageUrl
          ? `<img class="menu-admin-thumb" src="${escapeHtml(it.imageUrl)}" alt="" />`
          : '<div class="menu-admin-thumb placeholder"></div>';
        return `
          <div class="menu-admin-row" data-id="${it.id}">
            ${img}
            <div class="menu-admin-row-body">
              <strong>${escapeHtml(it.name)}</strong>
              <span class="meta">${escapeHtml(it.category || '')} · €${Number(it.price).toFixed(2)} · ${it.available ? 'on' : 'off'}</span>
            </div>
            <div class="row-actions">
              <button type="button" class="secondary" data-edit="${it.id}">Edit</button>
              <button type="button" class="danger" data-del="${it.id}">Delete</button>
            </div>
          </div>
        `;
      }).join('');
      return `<section class="card"><h3 class="subsection-title">${escapeHtml(catName)}</h3>${list}<div><button type="button" class="secondary" data-add-under="${escapeHtml(catName)}">+ Add item</button></div></section>`;
    }).join('');

    menuAdminList.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit'));
        const it = items.find((x) => x.id === id);
        if (!it) return;
        menuEditForm.classList.remove('hidden');
        menuEditForm.querySelector('[name=id]').value = String(it.id);
        menuEditForm.querySelector('[name=name]').value = it.name;
        menuEditForm.querySelector('[name=description]').value = it.description || '';
        menuEditForm.querySelector('[name=price]').value = String(it.price);
        menuEditForm.querySelector('[name=categoryId]').value = String(it.categoryId);
        menuEditForm.querySelector('[name=available]').value = it.available ? '1' : '0';
        menuEditForm.querySelector('[name=clearImage]').checked = false;
        menuEditForm.querySelector('[name=image]').value = '';
      });
    });

    menuAdminList.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del');
        const res = await fetch(`/api/menu/items/${id}`, { method: 'DELETE', ...fetchOpts });
        if (!res.ok) {
          if (window.UI) window.UI.toast('Delete failed', 'error');
          return;
        }
        await loadMenuAdminList();
      });
    });
    menuAdminList.querySelectorAll('[data-add-under]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const catName = btn.getAttribute('data-add-under');
        const cat = categoriesCache.find((c) => c.name === catName);
        if (cat) menuAddCategory.value = String(cat.id);
        menuAddForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  async function loadMenuAdminList() {
    const res = await fetch('/api/menu/all', fetchOpts);
    if (!res.ok) return;
    menuItemsCache = await res.json();
    renderMenuAdminList(menuItemsCache);
  }

  async function loadTablesPage() {
    tablesMsg.textContent = '';
    const res = await fetch(`/api/tables?restaurantId=${sessionRestaurantId}`, fetchOpts);
    if (!res.ok) return;
    const tables = await res.json();
    const nums = tables
      .map((t) => parseInt(String(t.tableNumber), 10))
      .filter((n) => Number.isFinite(n));
    const max = nums.length ? Math.max(...nums) : 0;
    tableCountInput.value = String(max || tables.length || 1);
    tablesListPreview.innerHTML = tables
      .slice(0, 30)
      .map((t) => `<li>Table ${escapeHtml(String(t.tableNumber))}</li>`)
      .join('');
    if (tables.length > 30) {
      tablesListPreview.innerHTML += `<li class="meta">… and ${tables.length - 30} more</li>`;
    }
  }

  async function loadCategoriesPage() {
    const res = await fetch('/api/categories', fetchOpts);
    if (!res.ok) return;
    const rows = await res.json();
    categoriesList.innerHTML = rows
      .map(
        (c) => `
      <div class="menu-admin-row">
        <div class="menu-admin-row-body">
          <strong>${escapeHtml(c.name)}</strong>
          <span class="meta">sort ${c.sortOrder}</span>
        </div>
        <div class="row-actions">
          <button type="button" class="secondary" data-cat-edit="${c.id}">Edit</button>
          <button type="button" class="danger" data-cat-del="${c.id}">Delete</button>
        </div>
      </div>
    `
      )
      .join('');

    categoriesList.querySelectorAll('[data-cat-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-cat-edit'));
        const c = rows.find((x) => x.id === id);
        if (!c) return;
        catEditForm.classList.remove('hidden');
        catEditForm.querySelector('[name=id]').value = String(c.id);
        catEditForm.querySelector('[name=name]').value = c.name;
        catEditForm.querySelector('[name=sortOrder]').value = String(c.sortOrder);
      });
    });

    categoriesList.querySelectorAll('[data-cat-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-cat-del');
        const res = await fetch(`/api/categories/${id}`, { method: 'DELETE', ...fetchOpts });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (window.UI) window.UI.toast(err.error || 'Delete failed', 'error');
          return;
        }
        await loadCategoriesPage();
        await loadCategoriesForSelects();
      });
    });
  }

  async function loadRestaurantLogoPreview() {
    if (!sessionRestaurantId) return;
    try {
      const res = await fetch(`/api/restaurant/public?restaurantId=${sessionRestaurantId}`);
      if (!res.ok) return;
      const r = await res.json();
      if (r.logoUrl) {
        logoPreview.src = r.logoUrl;
        logoPreview.classList.remove('hidden');
      } else {
        logoPreview.removeAttribute('src');
        logoPreview.classList.add('hidden');
      }
    } catch {
      /* ignore */
    }
  }

  async function checkSession() {
    const res = await fetch('/api/auth/me', fetchOpts);
    const data = await res.json();
    if (!data.authenticated) return false;

    if (data.role === 'superadmin') {
      loginErr.textContent = 'Use the superadmin portal for this account.';
      return false;
    }

    if (!data.restaurantId) {
      loginErr.textContent = 'Account has no restaurant assigned.';
      return false;
    }

    sessionRole = data.role;
    sessionRestaurantId = data.restaurantId;
    roleBadge.textContent = data.role;

    loginPanel.classList.add('hidden');
    dash.classList.remove('hidden');

    buildNav();
    subscriptionSection.classList.toggle('hidden', !canManageSubscription());
    logoSection.classList.toggle('hidden', !canManageSubscription());
    document.getElementById('dashCard').classList.toggle('hidden', !canSeeDashboard());
    reportSection.classList.toggle('hidden', !canSeeDashboard());
    const topSellers = document.getElementById('dashTopSellers');
    if (topSellers) topSellers.classList.toggle('hidden', !canSeeDashboard());

    await refreshSubBanner();
    connectSocket();

    showPage(pickDefaultPage());

    if (!timersStarted) {
      timersStarted = true;
      setInterval(refreshSubBanner, 60_000);
      if (canSeeDashboard()) {
        setInterval(loadDashboardStats, 60_000);
      }
    }

    if (canManageSubscription()) {
      await loadRestaurantLogoPreview();
    }

    return true;
  }

  reportWeekly.addEventListener('click', () => loadReport('weekly'));
  reportMonthly.addEventListener('click', () => loadReport('monthly'));
  topTodayBtn.addEventListener('click', () => loadTopItems('today'));
  topWeekBtn.addEventListener('click', () => loadTopItems('week'));

  filterApplyBtn.addEventListener('click', () => loadOrdersPage());
  filterResetBtn.addEventListener('click', () => {
    filterStatus.value = '';
    filterDateFrom.value = '';
    filterDateTo.value = '';
    filterTable.value = '';
    loadOrdersPage();
  });

  subRenewBtn.addEventListener('click', async () => {
    subMgmtMsg.textContent = '';
    const res = await fetch('/api/subscription/renew', { method: 'POST', ...fetchOpts });
    if (!res.ok) {
      subMgmtMsg.textContent = 'Renew failed.';
      return;
    }
    subMgmtMsg.textContent = 'Renewed.';
    await loadDashboardStats();
  });

  subPlanBtn.addEventListener('click', async () => {
    subMgmtMsg.textContent = '';
    const res = await fetch('/api/subscription/change-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify({ plan: subPlanSelect.value }),
    });
    if (!res.ok) {
      subMgmtMsg.textContent = 'Change plan failed.';
      return;
    }
    subMgmtMsg.textContent = 'Plan updated.';
    await loadDashboardStats();
  });

  subCancelBtn.addEventListener('click', async () => {
    subMgmtMsg.textContent = '';
    if (!lastSubscriptionId) {
      subMgmtMsg.textContent = 'No subscription to cancel.';
      return;
    }
    const res = await fetch(`/api/subscription/${lastSubscriptionId}`, { method: 'DELETE', ...fetchOpts });
    if (!res.ok) {
      subMgmtMsg.textContent = 'Cancel failed.';
      return;
    }
    subMgmtMsg.textContent = 'Cancelled.';
    await loadDashboardStats();
    await refreshSubBanner();
  });

  logoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    logoMsg.textContent = '';
    if (!logoFile.files || !logoFile.files[0]) {
      logoMsg.textContent = 'Choose a file.';
      return;
    }
    const fd = new FormData();
    fd.append('logo', logoFile.files[0]);
    const res = await fetch('/api/restaurant/logo', { method: 'POST', ...fetchOpts, body: fd });
    if (!res.ok) {
      logoMsg.textContent = 'Upload failed.';
      return;
    }
    const body = await res.json();
    logoMsg.textContent = 'Logo updated.';
    if (body.logoUrl) {
      logoPreview.src = `${body.logoUrl}?t=${Date.now()}`;
      logoPreview.classList.remove('hidden');
    }
    logoFile.value = '';
  });

  menuAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (window.UI) window.UI.setLoading(true);
    const fd = new FormData(menuAddForm);
    const res = await fetch('/api/menu/items', { method: 'POST', ...fetchOpts, body: fd });
    if (!res.ok) { if (window.UI) window.UI.toast('Add failed', 'error'); if (window.UI) window.UI.setLoading(false); return; }
    menuAddForm.reset();
    await loadCategoriesForSelects();
    await loadMenuAdminList();
    if (window.UI) { window.UI.toast('Item added', 'success'); window.UI.setLoading(false); }
  });

  menuEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = menuEditForm.querySelector('[name=id]').value;
    const fd = new FormData();
    fd.append('name', menuEditForm.querySelector('[name=name]').value);
    fd.append('description', menuEditForm.querySelector('[name=description]').value);
    fd.append('price', menuEditForm.querySelector('[name=price]').value);
    fd.append('categoryId', menuEditForm.querySelector('[name=categoryId]').value);
    fd.append('available', menuEditForm.querySelector('[name=available]').value);
    if (menuEditForm.querySelector('[name=clearImage]').checked) {
      fd.append('clearImage', '1');
    }
    const img = menuEditForm.querySelector('[name=image]').files[0];
    if (img) fd.append('image', img);

    const res = await fetch(`/api/menu/items/${id}`, { method: 'PUT', ...fetchOpts, body: fd });
    if (!res.ok) { if (window.UI) window.UI.toast('Update failed', 'error'); return; }
    menuEditForm.classList.add('hidden');
    menuEditForm.reset();
    await loadMenuAdminList();
    if (window.UI) window.UI.toast('Item updated', 'success');
  });

  menuEditCancel.addEventListener('click', () => {
    menuEditForm.classList.add('hidden');
    menuEditForm.reset();
  });

  tableCountSave.addEventListener('click', async () => {
    tablesMsg.textContent = '';
    const n = Number(tableCountInput.value);
    const res = await fetch('/api/tables/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify({ tableCount: n }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      tablesMsg.textContent = data.message || data.error || 'Save failed';
      return;
    }
    tablesMsg.textContent = `Saved ${data.tableCount} tables.`;
    await loadTablesPage();
  });

  catAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = catAddForm.querySelector('[name=name]').value.trim();
    const sortOrder = Number(catAddForm.querySelector('[name=sortOrder]').value) || 0;
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify({ name, sortOrder }),
    });
    if (!res.ok) { if (window.UI) window.UI.toast('Add failed', 'error'); return; }
    catAddForm.reset();
    await loadCategoriesPage();
    await loadCategoriesForSelects();
    if (window.UI) window.UI.toast('Category added', 'success');
  });

  catEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = catEditForm.querySelector('[name=id]').value;
    const name = catEditForm.querySelector('[name=name]').value.trim();
    const sortOrder = Number(catEditForm.querySelector('[name=sortOrder]').value) || 0;
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify({ name, sortOrder }),
    });
    if (!res.ok) { if (window.UI) window.UI.toast('Update failed', 'error'); return; }
    catEditForm.classList.add('hidden');
    await loadCategoriesPage();
    await loadCategoriesForSelects();
    if (window.UI) window.UI.toast('Category updated', 'success');
  });

  if (menuAddCategoryQuick) {
    menuAddCategoryQuick.addEventListener('click', () => {
      const categoriesPanel = document.getElementById('page-categories');
      if (categoriesPanel) categoriesPanel.classList.remove('hidden');
      if (catAddForm) catAddForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  if (menuSearch) menuSearch.addEventListener('input', () => { menuPage = 1; renderMenuAdminList(menuItemsCache); });
  if (menuPrevPage) menuPrevPage.addEventListener('click', () => { menuPage = Math.max(1, menuPage - 1); renderMenuAdminList(menuItemsCache); });
  if (menuNextPage) menuNextPage.addEventListener('click', () => { menuPage += 1; renderMenuAdminList(menuItemsCache); });

  catEditCancel.addEventListener('click', () => {
    catEditForm.classList.add('hidden');
  });

  loginBtn.addEventListener('click', async () => {
    audioUnlocked = true;
    loginErr.textContent = '';
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify({ username: userEl.value.trim(), password: passEl.value }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      loginErr.textContent =
        j.error === 'use_superadmin_portal'
          ? 'Use /superadmin.html for superadmin login.'
          : 'Invalid username or password.';
      return;
    }
    const body = await res.json();
    if (body.role === 'superadmin') {
      loginErr.textContent = 'Use superadmin portal.';
      return;
    }
    await checkSession();
  });

  logoutBtn.addEventListener('click', async () => {
    audioUnlocked = false;
    await fetch('/api/auth/logout', { method: 'POST', ...fetchOpts });
    if (socket) socket.disconnect();
    socket = null;
    dash.classList.add('hidden');
    loginPanel.classList.remove('hidden');
    sessionRole = '';
    sessionRestaurantId = null;
    timersStarted = false;
    ordersGrouped.innerHTML = '';
  });

  if (window.UI) window.UI.initTheme('themeToggleBtn');
  checkSession();
})();
