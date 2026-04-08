(function () {
  let tr = (k, f) => f || k;
  const params = new URLSearchParams(window.location.search);
  const tableFromQr = params.get('table');
  const restaurantSlug = (params.get('restaurant') || '').trim();
  const restaurantId = Math.max(1, parseInt(params.get('restaurantId') || params.get('r') || '1', 10) || 1);
  const MENU_DEBUG = params.get('debug') === '1' || localStorage.getItem('vip.debug') === '1';

  function dbg(...args) {
    if (MENU_DEBUG) console.log('[menu]', ...args);
  }

  const tableBadge = document.getElementById('tableBadge');
  const subExpired = document.getElementById('subExpired');
  const tableWarning = document.getElementById('tableWarning');
  const menuBlocked = document.getElementById('menuBlocked');
  const menuArea = document.getElementById('menuArea');
  const menuGrid = document.getElementById('menuGrid');
  const categoryFilters = document.getElementById('categoryFilters');
  const cartList = document.getElementById('cartList');
  const cartTotal = document.getElementById('cartTotal');
  const submitOrder = document.getElementById('submitOrder');
  const orderMsg = document.getElementById('orderMsg');
  const customerNote = document.getElementById('customerNote');
  const restaurantLogo = document.getElementById('restaurantLogo');
  const restaurantName = document.getElementById('restaurantName');
  const joinPanel = document.getElementById('joinPanel');
  const guestName = document.getElementById('guestName');
  const guestPhone = document.getElementById('guestPhone');
  const joinBtn = document.getElementById('joinBtn');
  const joinMsg = document.getElementById('joinMsg');
  const billBox = document.getElementById('billBox');
  const myBill = document.getElementById('myBill');
  const tableBill = document.getElementById('tableBill');
  const myOrdersSection = document.getElementById('myOrdersSection');
  const cartCount = document.getElementById('cartCount');
  const cartFab = document.getElementById('cartFab');
  const trackingBar = document.getElementById('trackingBar');
  const etaText = document.getElementById('etaText');

  /** @type {Record<number, { menuId: number, name: string, unitPrice: number, quantity: number }>} */
  const cart = {};
  /** @type {Array<object>} */
  let allItems = [];
  let activeCategory = 'All';
  let filterLabels = ['All'];
  let sessionToken = '';
  let participantId = 0;
  let resolvedRestaurantId = restaurantId;
  /** @type {any} */
  let socket = null;
  let lastOrdersFingerprint = '';
  let refreshSessionTimer = null;
  let menuCacheKey = '';
  let menuLoadedAt = 0;
  const MENU_TTL_MS = 60_000;

  const restaurantKey = restaurantSlug || String(restaurantId);
  const STORAGE_KEY = `vip.join.r${restaurantKey}.t${tableFromQr || ''}`;
  const restaurantQuery = restaurantSlug
    ? `restaurant=${encodeURIComponent(restaurantSlug)}`
    : `restaurantId=${restaurantId}`;

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function currentTable() {
    return (tableFromQr || '').trim();
  }

  function updateTableUi() {
    const t = currentTable();
    tableBadge.textContent = t ? `Table ${t}` : 'Table —';
    tableWarning.classList.toggle('hidden', !!tableFromQr || !!t);
  }

  function hasJoinContext() {
    return !!sessionToken && Number.isFinite(participantId) && participantId > 0;
  }

  function setJoinContext(token, pid) {
    sessionToken = token || '';
    participantId = Number(pid) || 0;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessionToken, participantId, ts: Date.now() })
    );
  }

  function clearJoinContext() {
    sessionToken = '';
    participantId = 0;
    localStorage.removeItem(STORAGE_KEY);
  }

  function playNotify() {
    try {
      // Prefer a real audio file if the user later adds one at /public/notification.mp3
      const a = new Audio('/notification.mp3');
      a.volume = 0.6;
      a.play().catch(() => {
        // Fallback: short beep (works without shipping binary assets)
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.05;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        setTimeout(() => {
          o.stop();
          ctx.close().catch(() => {});
        }, 140);
      });
    } catch {
      /* ignore */
    }
  }

  function money(n) {
    return `€${Number(n || 0).toFixed(2)}`;
  }

  function fingerprintSessionSnapshot(data) {
    const o = Array.isArray(data && data.orders) ? data.orders : [];
    const ids = o.map((x) => Number(x.id) || 0).sort((a, b) => a - b);
    const totals = o.map((x) => `${x.id}:${x.status}:${Number(x.total || 0).toFixed(2)}`).sort().join('|');
    return `${ids.join(',')}::${totals}::${Number(data && data.tableTotal || 0).toFixed(2)}`;
  }

  updateTableUi();

  function renderCart() {
    const lines = Object.values(cart);
    cartList.innerHTML = '';
    let total = 0;
    lines.forEach((line) => {
      const li = document.createElement('li');
      const sub = line.unitPrice * line.quantity;
      total += sub;
      li.textContent = `${line.quantity}× ${line.name} — €${sub.toFixed(2)}`;
      cartList.appendChild(li);
    });
    cartTotal.textContent = lines.length ? `Total €${total.toFixed(2)}` : tr('menu.cartEmpty', 'Cart is empty');
    if (cartCount) cartCount.textContent = String(lines.reduce((a, x) => a + x.quantity, 0));
  }

  function addToCart(item) {
    const id = item.id;
    if (!cart[id]) {
      cart[id] = {
        menuId: id,
        name: item.name,
        unitPrice: Number(item.price),
        quantity: 0,
      };
    }
    cart[id].quantity += 1;
    renderCart();
  }

  async function loadRestaurantBranding() {
    try {
      const res = await fetch(`/api/restaurant/public?${restaurantQuery}`);
      if (!res.ok) return;
      const r = await res.json();
      if (r.name) {
        restaurantName.textContent = r.name;
      }
      if (r.id) resolvedRestaurantId = Number(r.id) || resolvedRestaurantId;
      if (r.logoUrl) {
        restaurantLogo.src = r.logoUrl;
        restaurantLogo.classList.remove('hidden');
        restaurantLogo.alt = r.name || 'Restaurant';
      }
    } catch {
      /* ignore */
    }
  }

  async function loadStatus() {
    const res = await fetch(`/api/status?${restaurantQuery}`);
    const data = await res.json();
    if (!data.subscriptionActive) {
      subExpired.classList.remove('hidden');
      subExpired.innerHTML =
        data.message || 'Subscription expired. We are not accepting new orders at this time.';
      subExpired.innerHTML += ' <a href="mailto:info@thaka.com">Contact restaurant</a>';
      menuBlocked.classList.remove('hidden');
      menuArea.classList.add('hidden');
      submitOrder.disabled = true;
      return false;
    }
    subExpired.classList.add('hidden');
    menuBlocked.classList.add('hidden');
    menuArea.classList.remove('hidden');
    return true;
  }

  async function restoreJoinContext() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.sessionToken && Number(data.participantId) > 0) {
        sessionToken = String(data.sessionToken);
        participantId = Number(data.participantId);
      }
    } catch {
      /* ignore */
    }
  }

  async function joinTableSession() {
    const tableNumber = currentTable();
    if (!tableNumber) {
      joinMsg.textContent = 'Invalid table link. Please scan the QR again.';
      return false;
    }
    const name = guestName.value.trim();
    if (!name) {
      joinMsg.textContent = 'Name is required.';
      return false;
    }
    joinMsg.textContent = '';
    if (window.UI) window.UI.setLoading(true);
    joinBtn.disabled = true;
    try {
      const res = await fetch(`/api/tables/${encodeURIComponent(tableNumber)}/session/join?${restaurantQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone: guestPhone.value.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        joinMsg.textContent = data.message || data.error || 'Join failed.';
        return false;
      }
      setJoinContext(data.sessionToken, data.participantId);
      joinMsg.textContent = `Joined as ${name}.`;
      joinPanel.classList.add('hidden');
      billBox.classList.remove('hidden');
      dbg('joined session', { participantId: data.participantId });
      return true;
    } catch {
      joinMsg.textContent = 'Network error.';
      return false;
    } finally {
      joinBtn.disabled = false;
      if (window.UI) window.UI.setLoading(false);
    }
  }

  function scheduleRefreshSessionState() {
    if (refreshSessionTimer) clearTimeout(refreshSessionTimer);
    refreshSessionTimer = setTimeout(() => {
      refreshSessionTimer = null;
      refreshSessionState();
    }, 150);
    dbg('scheduleRefreshSessionState');
  }

  async function refreshSessionState() {
    if (!hasJoinContext()) return;
    const res = await fetch(`/api/tables/session/${encodeURIComponent(sessionToken)}/status?participantId=${participantId}`);
    if (!res.ok) return;
    const data = await res.json();
    myBill.textContent = `My total: ${money(data.myTotal)}`;
    tableBill.textContent = `Table total: ${money(data.tableTotal)}`;
    if (trackingBar) trackingBar.classList.remove('hidden');
    const os = await fetch(`/api/orders/session/${encodeURIComponent(sessionToken)}?participantId=${participantId}`);
    if (os.ok) {
      const od = await os.json();
      const fp = fingerprintSessionSnapshot(od);
      if (lastOrdersFingerprint && fp !== lastOrdersFingerprint) {
        playNotify();
      }
      lastOrdersFingerprint = fp;
      renderMyOrders(od);
      dbg('orders snapshot fingerprint', fp.slice(0, 80));
      const first = (od.orders || [])[0];
      if (first) {
        const st = first.status || 'new';
        const mins = st === 'new' ? 20 : st === 'preparing' ? 10 : st === 'ready' ? 3 : 0;
        etaText.textContent = `Estimated preparation time: ${mins} min`;
      }
    }
    if (data.status !== 'active') {
      clearJoinContext();
      billBox.classList.add('hidden');
      joinPanel.classList.remove('hidden');
      menuArea.classList.add('hidden');
      menuBlocked.classList.remove('hidden');
      joinMsg.textContent = 'Session ended by cashier. Please rescan QR to order again.';
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    } else {
      // heartbeat
      fetch(`/api/tables/session/${encodeURIComponent(sessionToken)}/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId }),
      }).catch(() => {});
    }
  }

  function renderMyOrders(od) {
    if (!myOrdersSection) return;
    const participants = Array.isArray(od && od.participants) ? od.participants : [];
    const orders = Array.isArray(od && od.orders) ? od.orders : [];

    /** @type {Map<number, { id:number, name:string, phone:string|null, items:Array<{quantity:number,name:string,lineTotal:number}>, subtotal:number }>} */
    const byP = new Map();
    participants.forEach((p) => {
      byP.set(Number(p.id), {
        id: Number(p.id),
        name: String(p.name || 'Guest'),
        phone: p.phone ? String(p.phone) : null,
        items: [],
        subtotal: 0,
      });
    });
    // If participants list missing, still render current participant bucket.
    if (!byP.size && participantId) {
      byP.set(Number(participantId), { id: Number(participantId), name: 'Me', phone: null, items: [], subtotal: 0 });
    }

    for (const o of orders) {
      const pid = Number(o.participantId);
      if (!Number.isFinite(pid)) continue;
      if (!byP.has(pid)) {
        byP.set(pid, { id: pid, name: o.customerName || `Guest #${pid}`, phone: null, items: [], subtotal: 0 });
      }
      const bucket = byP.get(pid);
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const qty = Number(it.quantity) || 0;
        const nm = String(it.name || '');
        const lt = Number(it.lineTotal || 0);
        bucket.items.push({ quantity: qty, name: nm, lineTotal: lt });
        bucket.subtotal += lt;
      }
    }

    const cards = Array.from(byP.values()).sort((a, b) => a.id - b.id);
    let everyoneTotal = 0;

    myOrdersSection.innerHTML = cards.map((p) => {
      const subtotal = Math.round(p.subtotal * 100) / 100;
      everyoneTotal += subtotal;
      const headerPhone = p.phone ? ` (${escapeHtml(p.phone)})` : '';
      const itemsHtml = p.items.length
        ? `<ul class="report-list" style="margin:.5rem 0 0">
            ${p.items.map((it) => `<li>${escapeHtml(String(it.quantity))}x ${escapeHtml(it.name)} = ${escapeHtml(money(it.lineTotal))}</li>`).join('')}
          </ul>`
        : `<p class="meta" style="margin:.5rem 0 0">No orders yet.</p>`;
      return `
        <article class="card dashboard-card my-orders-card" data-pid="${p.id}" style="margin-top:.75rem">
          <header class="row-actions" style="margin-bottom:.25rem">
            <strong>My Orders — ${escapeHtml(p.name)}${headerPhone}</strong>
          </header>
          ${itemsHtml}
          <div class="row-actions" style="margin-top:.6rem; align-items:baseline">
            <span class="meta">Total ${escapeHtml(p.name)}:</span>
            <strong>${escapeHtml(money(subtotal))}</strong>
          </div>
        </article>
      `;
    }).join('') + `
      <div style="margin-top:.75rem; font-weight:800">
        Total everyone: ${escapeHtml(money(everyoneTotal))}
      </div>
    `;
  }

  function connectCustomerSocket() {
    if (!window.io || !hasJoinContext()) return;
    if (socket && socket.connected) return;
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    socket = io({
      auth: { sessionToken, participantId },
      reconnectionAttempts: 12,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => dbg('socket connect', socket.id));
    socket.on('connect_error', (err) => dbg('socket connect_error', err && err.message));
    socket.on('disconnect', (reason) => dbg('socket disconnect', reason));
    socket.on('order:new', () => {
      dbg('event order:new');
      scheduleRefreshSessionState();
    });
    socket.on('order:updated', () => {
      dbg('event order:updated');
      scheduleRefreshSessionState();
    });
    socket.on('session:ended', () => {
      dbg('event session:ended');
      scheduleRefreshSessionState();
    });
  }

  function buildCategoryFilters() {
    categoryFilters.innerHTML = '';
    filterLabels.forEach((label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-pill' + (label === activeCategory ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        activeCategory = label;
        buildCategoryFilters();
        renderMenuGrid();
      });
      categoryFilters.appendChild(btn);
    });
  }

  function itemMatchesFilter(item) {
    if (activeCategory === 'All') return true;
    const c = (item.category || '').trim();
    return c.toLowerCase() === activeCategory.toLowerCase();
  }

  function renderMenuGrid() {
    const items = allItems.filter(itemMatchesFilter);
    menuGrid.innerHTML = '';
    if (!items.length) {
      menuGrid.innerHTML = '<p class="meta">No items in this category.</p>';
      return;
    }
    const byCat = {};
    items.forEach((it) => {
      const c = it.category || 'General';
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(it);
    });
    Object.keys(byCat)
      .sort()
      .forEach((cat) => {
        const h = document.createElement('h2');
        h.className = 'menu-category-heading';
        h.textContent = cat;
        menuGrid.appendChild(h);
        byCat[cat].forEach((item) => {
          const card = document.createElement('article');
          card.className = 'card menu-item-card';
          const imgHtml = item.imageUrl
            ? `<div class="menu-item-image-wrap"><img src="${escapeHtml(item.imageUrl)}" alt="" class="menu-item-image" loading="lazy" /></div>`
            : '<div class="menu-item-image-wrap menu-item-image-placeholder"></div>';
          card.innerHTML = `
            ${imgHtml}
            <h3>${escapeHtml(item.name)}</h3>
            <p class="meta menu-item-desc">${escapeHtml(item.description || '')}</p>
            <p class="price">€${Number(item.price).toFixed(2)}</p>
            <div class="row-actions">
              <button type="button" data-add="${item.id}">Add</button>
            </div>
          `;
          menuGrid.appendChild(card);
        });
      });
    menuGrid.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-add'));
        const item = items.find((x) => x.id === id);
        if (item) addToCart(item);
      });
    });
  }

  async function loadMenu() {
    const key = restaurantQuery;
    if (allItems.length && key === menuCacheKey && Date.now() - menuLoadedAt < MENU_TTL_MS) {
      buildCategoryFilters();
      renderMenuGrid();
      dbg('menu cache hit');
      return;
    }
    const res = await fetch(`/api/menu?${restaurantQuery}`);
    if (!res.ok) throw new Error('Menu failed');
    allItems = await res.json();
    menuCacheKey = key;
    menuLoadedAt = Date.now();
    const cats = [
      ...new Set(allItems.map((i) => (i.category || '').trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
    filterLabels = ['All', ...cats];
    if (!filterLabels.includes(activeCategory)) activeCategory = 'All';
    buildCategoryFilters();
    renderMenuGrid();
  }

  submitOrder.addEventListener('click', async () => {
    orderMsg.textContent = '';
    const tableNumber = currentTable();
    if (!tableNumber) {
      orderMsg.textContent = 'Invalid table link.';
      return;
    }
    const lines = Object.values(cart).filter((l) => l.quantity > 0);
    if (!lines.length) {
      orderMsg.textContent = 'Add items to your cart first.';
      return;
    }
    if (!hasJoinContext()) {
      orderMsg.textContent = 'Please join the table session first.';
      return;
    }
    submitOrder.disabled = true;
    if (window.UI) window.UI.setLoading(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: resolvedRestaurantId,
          restaurant: restaurantSlug || undefined,
          tableNumber,
          sessionToken,
          participantId,
          items: lines.map((l) => ({ menuId: l.menuId, quantity: l.quantity })),
          customerNote: customerNote.value.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.error === 'subscription_expired') {
        orderMsg.textContent = data.message || 'Subscription expired.';
        await loadStatus();
        return;
      }
      if (!res.ok) {
        orderMsg.textContent = data.message || data.error || 'Order failed.';
        return;
      }
      orderMsg.textContent = 'Order sent. Thank you!';
      Object.keys(cart).forEach((k) => delete cart[k]);
      renderCart();
      customerNote.value = '';
      await refreshSessionState();
      dbg('order placed');
    } catch (e) {
      orderMsg.textContent = 'Network error.';
    } finally {
      submitOrder.disabled = false;
      if (window.UI) window.UI.setLoading(false);
    }
  });

  joinBtn.addEventListener('click', async () => {
    const ok = await joinTableSession();
    if (ok) {
      connectCustomerSocket();
      await refreshSessionState();
    }
  });

  (async function init() {
    if (window.UI) window.UI.initTheme('themeToggleBtn');
    if (window.I18n) {
      await window.I18n.init();
      tr = window.I18n.t;
    }
    await loadRestaurantBranding();
    const ok = await loadStatus();
    if (ok) {
      try {
        await restoreJoinContext();
        if (hasJoinContext()) {
          joinPanel.classList.add('hidden');
          billBox.classList.remove('hidden');
          connectCustomerSocket();
        } else {
          joinPanel.classList.remove('hidden');
          billBox.classList.add('hidden');
        }
        await loadMenu();
        renderCart();
        await refreshSessionState();
        setInterval(() => scheduleRefreshSessionState(), 5000);
      } catch (e) {
        menuGrid.innerHTML = '<p class="meta">Could not load menu.</p>';
      }
    }
  })();
  if (cartFab) {
    cartFab.addEventListener('click', () => {
      document.querySelector('.cart')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }
})();
