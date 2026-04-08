 (function () {
  const loginPanel = document.getElementById('loginPanel');
  const dash = document.getElementById('dash');
  const userEl = document.getElementById('user');
  const passEl = document.getElementById('pass');
  const loginBtn = document.getElementById('loginBtn');
  const loginErr = document.getElementById('loginErr');
  const logoutBtn = document.getElementById('logoutBtn');
  const restaurantList = document.getElementById('restaurantList');
  const listErr = document.getElementById('listErr');
  const addRestaurantForm = document.getElementById('addRestaurantForm');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const openAddRestaurantModal = document.getElementById('openAddRestaurantModal');
  const editModal = document.getElementById('editModal');
  const closeEditModal = document.getElementById('closeEditModal');
  const editGeneralForm = document.getElementById('editGeneralForm');
  const editSubscriptionForm = document.getElementById('editSubscriptionForm');
  const editTablesForm = document.getElementById('editTablesForm');
  const editUsersForm = document.getElementById('editUsersForm');
  const subscriptionCards = document.getElementById('subscriptionCards');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const fetchOpts = { credentials: 'same-origin' };
  let rowsCache = [];
  let searchQuery = '';
  let currentView = 'restaurants';

  function setView(view) {
    currentView = view;
    document.querySelectorAll('.super-view').forEach((el) => el.classList.add('hidden'));
    const panel = document.getElementById(`view-${view}`);
    if (panel) panel.classList.remove('hidden');
    document.querySelectorAll('.super-nav-btn').forEach((btn) => {
      const on = btn.getAttribute('data-view') === view;
      btn.classList.toggle('bg-slate-800', on);
    });
    if (view === 'subscriptions') renderSubscriptionCards();
  }

  function fmtTime(iso) { return iso ? new Date(iso).toLocaleString() : '-'; }
  function toInputDateTime(iso) { return iso ? new Date(iso).toISOString().slice(0, 16) : ''; }
  function fromInputDateTime(v) { return v ? v.replace('T', ' ') + ':00' : ''; }

  function setTab(name) {
    document.querySelectorAll('.edit-panel').forEach((x) => x.classList.add('hidden'));
    document.querySelectorAll('.edit-tab').forEach((x) => x.classList.remove('active'));
    const panel = document.getElementById(`tab-${name}`);
    if (panel) panel.classList.remove('hidden');
    const tab = document.querySelector(`.edit-tab[data-tab="${name}"]`);
    if (tab) tab.classList.add('active');
  }

  function openEditModal(row) {
    editGeneralForm.id.value = row.id;
    editGeneralForm.name.value = row.name || '';
    editGeneralForm.slug.value = row.slug || '';
    editGeneralForm.whatsappNumber.value = row.whatsappNumber || '';
    editGeneralForm.contactName.value = row.contactName || '';
    editGeneralForm.contactPhone.value = row.contactPhone || '';
    editGeneralForm.contactEmail.value = row.contactEmail || '';
    editGeneralForm.logo.value = '';
    editSubscriptionForm.subscriptionId.value = row.subscriptionId || '';
    editSubscriptionForm.plan.value = (row.planName || 'Standard') === 'Premium' ? 'Premium' : 'Standard';
    editSubscriptionForm.status.value = row.subscriptionStatus || 'active';
    editSubscriptionForm.startsAt.value = toInputDateTime(row.startsAt);
    editSubscriptionForm.expiresAt.value = toInputDateTime(row.expiresAt);
    editTablesForm.id.value = row.id;
    editTablesForm.tableCount.value = 10;
    editUsersForm.id.value = row.id;
    editUsersForm.ownerUsername.value = '';
    editUsersForm.ownerPassword.value = '';
    editUsersForm.cashierUsername.value = '';
    editUsersForm.cashierPassword.value = '';
    setTab('general');
    editModal.classList.remove('hidden');
  }

  function subscriptionState(row) {
    const exp = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
    const days = exp ? Math.ceil((exp - Date.now()) / 86400000) : -1;
    if (!row.subscriptionActive || days < 3) return { cls: 'text-danger', label: 'critical' };
    if (days < 7) return { cls: '', label: 'warning' };
    return { cls: 'text-success', label: 'safe' };
  }

  function renderSubscriptionCards() {
    if (!subscriptionCards) return;
    subscriptionCards.innerHTML = rowsCache.map((r) => {
      const s = subscriptionState(r);
      return `
        <article class="card dashboard-card">
          ${r.logoUrl ? `<img src="${r.logoUrl}" alt="" class="menu-admin-thumb" />` : ''}
          <h3>${r.name}</h3>
          <p class="meta">Plan: ${r.planName || '-'}</p>
          <p class="meta">Status: <span class="${s.cls}">${s.label}</span></p>
          <p class="meta">Expiry: ${fmtTime(r.expiresAt)}</p>
        </article>
      `;
    }).join('');
  }

  async function loadRestaurants() {
    if (window.UI) window.UI.setLoading(true);
    listErr.classList.add('hidden');
    const q = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
    const res = await fetch(`/api/superadmin/restaurants${q}`, fetchOpts);
    if (!res.ok) { listErr.textContent = 'Could not load restaurants.'; listErr.classList.remove('hidden'); if (window.UI) window.UI.setLoading(false); return; }
    const rows = await res.json();
    rowsCache = rows;
    restaurantList.innerHTML = rows.map((r) => `
      <tr class="border-b border-slate-700">
        <td class="py-2">${r.name}</td>
        <td>${r.logoUrl ? `<img src="${r.logoUrl}" alt="" class="menu-admin-thumb" />` : '-'}</td>
        <td>${r.slug}</td>
        <td>${r.whatsappNumber || '-'}</td>
        <td>${r.planName || '-'}</td>
        <td>${r.subscriptionStatus || '-'}</td>
        <td><button type="button" class="secondary" data-edit="${r.id}">Edit</button></td>
      </tr>
    `).join('');
    restaurantList.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = rowsCache.find((x) => String(x.id) === btn.getAttribute('data-edit'));
        if (row) openEditModal(row);
      });
    });
    if (window.UI) window.UI.setLoading(false);
  }

  async function checkSession() {
    const res = await fetch('/api/superadmin/me', fetchOpts);
    const data = await res.json();
    if (data.authenticated && data.role === 'superadmin') {
      loginPanel.classList.add('hidden');
      dash.classList.remove('hidden');
      await loadRestaurants();
      return true;
    }
    return false;
  }

  loginBtn.addEventListener('click', async () => {
    loginErr.textContent = '';
    if (window.UI) window.UI.setLoading(true);
    loginBtn.disabled = true;
    try {
      const res = await fetch('/api/superadmin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...fetchOpts,
        body: JSON.stringify({ username: userEl.value.trim(), password: passEl.value }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        loginErr.textContent =
          j.message ||
          (j.error === 'not_superadmin' ? 'This user is not a superadmin.' : 'Invalid username or password.');
        return;
      }
      await checkSession();
    } catch {
      loginErr.textContent = 'Network error.';
    } finally {
      loginBtn.disabled = false;
      if (window.UI) window.UI.setLoading(false);
    }
  });

  addRestaurantForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (window.UI) window.UI.setLoading(true);
    const fd = new FormData(addRestaurantForm);
    // Normalize tableCount to a string so backend can parse it consistently from multipart form.
    fd.set('tableCount', String(Number(fd.get('tableCount') || 10)));
    const res = await fetch('/api/superadmin/restaurants', {
      method: 'POST',
      ...fetchOpts,
      body: fd,
    });
    if (!res.ok) { if (window.UI) window.UI.toast('Create failed', 'error'); if (window.UI) window.UI.setLoading(false); return; }
    addRestaurantForm.reset();
    addRestaurantForm.classList.add('hidden');
    await res.json().catch(() => ({}));
    if (window.UI) window.UI.toast('Restaurant created', 'success');
    await loadRestaurants();
    if (window.UI) window.UI.setLoading(false);
  });

  searchBtn.addEventListener('click', async () => {
    searchQuery = searchInput.value.trim();
    await loadRestaurants();
  });

  clearSearchBtn.addEventListener('click', async () => {
    searchQuery = '';
    searchInput.value = '';
    await loadRestaurants();
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/superadmin/logout', { method: 'POST', ...fetchOpts });
    dash.classList.add('hidden');
    loginPanel.classList.remove('hidden');
    restaurantList.innerHTML = '';
  });

  closeEditModal.addEventListener('click', () => editModal.classList.add('hidden'));
  document.querySelectorAll('.super-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.getAttribute('data-view')));
  });
  if (openAddRestaurantModal) {
    openAddRestaurantModal.addEventListener('click', () => addRestaurantForm.classList.toggle('hidden'));
  }
  document.querySelectorAll('.edit-tab').forEach((b) => b.addEventListener('click', () => setTab(b.getAttribute('data-tab'))));
  editGeneralForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (window.UI) window.UI.setLoading(true);
    const id = editGeneralForm.id.value;
    const payload = Object.fromEntries(new FormData(editGeneralForm).entries());
    delete payload.logo;
    await fetch(`/api/superadmin/restaurants/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, ...fetchOpts, body: JSON.stringify(payload),
    });
    const logoFile = editGeneralForm.logo && editGeneralForm.logo.files && editGeneralForm.logo.files[0];
    if (logoFile) {
      const lf = new FormData();
      lf.append('logo', logoFile);
      await fetch(`/api/superadmin/restaurants/${id}/logo`, { method: 'POST', ...fetchOpts, body: lf });
    }
    await loadRestaurants();
    if (window.UI) { window.UI.toast('General info saved', 'success'); window.UI.setLoading(false); }
  });
  editSubscriptionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sid = editSubscriptionForm.subscriptionId.value;
    if (!sid) return;
    const plan = editSubscriptionForm.plan.value;
    await fetch(`/api/superadmin/subscription/${sid}/change-plan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, ...fetchOpts, body: JSON.stringify({ plan }),
    });
    await fetch(`/api/superadmin/subscription/${sid}/manual-date`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify({
        startsAt: fromInputDateTime(editSubscriptionForm.startsAt.value),
        expiresAt: fromInputDateTime(editSubscriptionForm.expiresAt.value),
        status: editSubscriptionForm.status.value,
      }),
    });
    await loadRestaurants();
    if (window.UI) window.UI.toast('Subscription updated', 'success');
  });
  editTablesForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await fetch(`/api/superadmin/restaurants/${editTablesForm.id.value}/tables`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify({ tableCount: Number(editTablesForm.tableCount.value) }),
    });
    await loadRestaurants();
    if (window.UI) window.UI.toast('Tables updated', 'success');
  });
  editUsersForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editUsersForm.id.value;
    const payload = Object.fromEntries(new FormData(editUsersForm).entries());
    await fetch(`/api/superadmin/restaurants/${id}/users`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, ...fetchOpts, body: JSON.stringify(payload),
    });
    await loadRestaurants();
    if (window.UI) window.UI.toast('Users updated', 'success');
  });
  if (window.UI) window.UI.initTheme('themeToggleBtn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      localStorage.setItem('vip.settings.currency', document.getElementById('settingCurrency').value.trim());
      localStorage.setItem('vip.settings.timezone', document.getElementById('settingTimezone').value.trim());
      localStorage.setItem('vip.settings.supportEmail', document.getElementById('settingSupportEmail').value.trim());
      localStorage.setItem('vip.settings.supportWhatsapp', document.getElementById('settingSupportWhatsapp').value.trim());
      if (window.UI) window.UI.toast('Settings saved', 'success');
    });
  }
  setView('restaurants');
  checkSession();
})();
