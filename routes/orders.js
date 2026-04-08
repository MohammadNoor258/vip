const express = require('express');
const { pool } = require('../config/database');
const { requireSubscriptionForOrders } = require('../middleware/requireSubscription');
const { requireRole, requireRestaurantContext } = require('../middleware/requireRole');
const { requireStaffAuth } = require('../middleware/staffAuth');
const { sendWhatsAppMessage } = require('../services/whatsAppService');
const { logSocketEmit } = require('../lib/debug');
const { invalidateRestaurantStats } = require('../lib/statsCache');

const router = express.Router();

const orderStaff = [requireStaffAuth, requireRole('admin', 'waiter', 'cashier'), requireRestaurantContext];

function emitOrders(io, restaurantId) {
  return async () => {
    const [list] = await pool.query(
      `SELECT o.id, o.status, o.total, o.items, o.customer_note AS customerNote,
              o.created_at AS createdAt, o.updated_at AS updatedAt,
              dt.table_number AS tableNumber
       FROM orders o
       JOIN \`tables\` dt ON dt.id = o.dining_table_id
       WHERE o.restaurant_id = ?
       ORDER BY o.created_at DESC
       LIMIT 500`,
      [restaurantId]
    );
    const parsed = list.map((row) => ({
      ...row,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
    }));
    const room = `restaurant:${restaurantId}`;
    io.to(room).emit('orders:snapshot', parsed);
    logSocketEmit('orders:snapshot', { restaurantId, count: parsed.length, room });
  };
}

router.post('/', requireSubscriptionForOrders, async (req, res) => {
  const restaurantId = req.publicRestaurantId || 1;
  const { tableNumber, items, customerNote, sessionToken, participantId } = req.body || {};
  if (!tableNumber || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  if (!sessionToken || !Number.isFinite(Number(participantId))) {
    return res.status(400).json({ error: 'missing_session_context' });
  }

  const tn = String(tableNumber).trim();
  const [tables] = await pool.query(
    'SELECT id FROM `tables` WHERE restaurant_id = ? AND table_number = ? LIMIT 1',
    [restaurantId, tn]
  );
  if (!tables.length) {
    return res.status(400).json({
      error: 'invalid_table',
      message: 'Table number is not valid for this restaurant.',
    });
  }
  const diningTableId = tables[0].id;

  const [sessRows] = await pool.query(
    `SELECT id, status
     FROM table_sessions
     WHERE token = ? AND restaurant_id = ? AND dining_table_id = ?
     LIMIT 1`,
    [String(sessionToken), restaurantId, diningTableId]
  );
  if (!sessRows.length || sessRows[0].status !== 'active') {
    return res.status(403).json({ error: 'session_ended', message: 'Table session has ended. Please rescan QR.' });
  }
  const tableSessionId = sessRows[0].id;
  const participantIdNum = Number(participantId);
  const [partRows] = await pool.query(
    `SELECT id
     FROM session_participants
     WHERE id = ? AND table_session_id = ? AND active = 1
     LIMIT 1`,
    [participantIdNum, tableSessionId]
  );
  if (!partRows.length) {
    return res.status(403).json({ error: 'invalid_participant' });
  }

  const menuIds = [...new Set(items.map((i) => Number(i.menuId)))];
  if (menuIds.some((id) => !Number.isFinite(id))) {
    return res.status(400).json({ error: 'invalid_menu_ids' });
  }

  const [menuRows] = await pool.query(
    `SELECT id, name, price, available FROM menu WHERE restaurant_id = ? AND id IN (${menuIds.map(() => '?').join(',')})`,
    [restaurantId, ...menuIds]
  );
  const menuMap = new Map(menuRows.map((m) => [m.id, m]));

  let total = 0;
  const normalized = [];
  for (const line of items) {
    const menuId = Number(line.menuId);
    const qty = Math.max(1, Math.min(99, parseInt(line.quantity, 10) || 1));
    const m = menuMap.get(menuId);
    if (!m || !m.available) {
      return res.status(400).json({ error: 'invalid_or_unavailable_item', menuId });
    }
    const lineTotal = Number(m.price) * qty;
    total += lineTotal;
    normalized.push({
      menuId,
      name: m.name,
      quantity: qty,
      unitPrice: Number(m.price),
      lineTotal: Math.round(lineTotal * 100) / 100,
    });
  }

  const totalRounded = Math.round(total * 100) / 100;
  const note =
    customerNote && String(customerNote).trim().slice(0, 500) || null;

  const [result] = await pool.query(
    `INSERT INTO orders
      (restaurant_id, dining_table_id, table_session_id, participant_id, items, total, status, customer_note)
     VALUES (?, ?, ?, ?, ?, ?, "new", ?)`,
    [restaurantId, diningTableId, tableSessionId, participantIdNum, JSON.stringify(normalized), totalRounded, note]
  );

  const orderId = result.insertId;
  const [created] = await pool.query(
    `SELECT o.id, o.status, o.total, o.items, o.customer_note AS customerNote,
            o.created_at AS createdAt, o.updated_at AS updatedAt, o.table_session_id AS tableSessionId,
            o.participant_id AS participantId, p.display_name AS customerName, p.phone AS customerPhone,
            dt.table_number AS tableNumber
     FROM orders o
     JOIN \`tables\` dt ON dt.id = o.dining_table_id
     LEFT JOIN session_participants p ON p.id = o.participant_id
     WHERE o.id = ?`,
    [orderId]
  );
  const order = created[0];
  order.items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

  invalidateRestaurantStats(restaurantId).catch(() => {});

  const io = req.app.get('io');
  if (io) {
    const restaurantRoom = `restaurant:${restaurantId}`;
    const slimStaff = {
      id: order.id,
      table: order.tableNumber,
      items: order.items,
      total: Number(order.total),
    };
    io.to(restaurantRoom).emit('order:new', slimStaff);
    logSocketEmit('order:new', { restaurantId, room: restaurantRoom, id: order.id, table: order.tableNumber });
    if (process.env.VIP_LOG_ORDER_EMIT === '1') {
      console.log('[emit] order:new', { room: restaurantRoom, ...slimStaff });
    }
    if (sessionToken) {
      const sr = `session:${String(sessionToken)}`;
      io.to(sr).emit('order:new', order);
    }
  }

  res.status(201).json(order);
});

router.get('/', ...orderStaff, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const { status, dateFrom, dateTo, tableNumber } = req.query;

  const conditions = ['o.restaurant_id = ?'];
  const params = [restaurantId];

  if (status && String(status).trim()) {
    const list = String(status)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed = ['new', 'preparing', 'ready', 'completed', 'cancelled'];
    const safe = list.filter((s) => allowed.includes(s));
    if (safe.length) {
      conditions.push(`o.status IN (${safe.map(() => '?').join(',')})`);
      params.push(...safe);
    }
  }
  if (dateFrom && String(dateFrom).match(/^\d{4}-\d{2}-\d{2}$/)) {
    conditions.push('DATE(o.created_at) >= ?');
    params.push(String(dateFrom));
  }
  if (dateTo && String(dateTo).match(/^\d{4}-\d{2}-\d{2}$/)) {
    conditions.push('DATE(o.created_at) <= ?');
    params.push(String(dateTo));
  }
  if (tableNumber != null && String(tableNumber).trim() !== '') {
    conditions.push('dt.table_number = ?');
    params.push(String(tableNumber).trim());
  }

  const where = conditions.join(' AND ');
  const [list] = await pool.query(
    `SELECT o.id, o.status, o.total, o.items, o.customer_note AS customerNote,
            o.created_at AS createdAt, o.updated_at AS updatedAt,
            dt.table_number AS tableNumber
     FROM orders o
     JOIN \`tables\` dt ON dt.id = o.dining_table_id
     WHERE ${where}
     ORDER BY o.created_at DESC
     LIMIT 500`,
    params
  );
  const parsed = list.map((row) => ({
    ...row,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
  }));
  res.json(parsed);
});

router.get('/session/:token', async (req, res) => {
  const token = String(req.params.token || '');
  const participantId = Number(req.query.participantId);
  if (!token || !Number.isFinite(participantId)) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  const [sRows] = await pool.query(
    `SELECT id, status, restaurant_id AS restaurantId
     FROM table_sessions
     WHERE token = ?
     LIMIT 1`,
    [token]
  );
  if (!sRows.length) return res.status(404).json({ error: 'session_not_found' });
  const s = sRows[0];

  const [pCheck] = await pool.query(
    `SELECT id FROM session_participants WHERE id = ? AND table_session_id = ? LIMIT 1`,
    [participantId, s.id]
  );
  if (!pCheck.length) return res.status(403).json({ error: 'invalid_participant' });

  const [participants] = await pool.query(
    `SELECT id, display_name AS name, phone, joined_at AS joinedAt, active
     FROM session_participants
     WHERE table_session_id = ?
     ORDER BY joined_at ASC`,
    [s.id]
  );
  const [orders] = await pool.query(
    `SELECT id, status, total, items, customer_note AS customerNote,
            created_at AS createdAt, participant_id AS participantId
     FROM orders
     WHERE table_session_id = ?
     ORDER BY created_at DESC`,
    [s.id]
  );
  const parsed = orders.map((row) => ({
    ...row,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
  }));
  const [[mine]] = await pool.query(
    `SELECT COALESCE(SUM(total), 0) AS total
     FROM orders
     WHERE table_session_id = ? AND participant_id = ?`,
    [s.id, participantId]
  );
  const [[all]] = await pool.query(
    `SELECT COALESCE(SUM(total), 0) AS total
     FROM orders
     WHERE table_session_id = ?`,
    [s.id]
  );
  res.json({
    sessionStatus: s.status,
    myTotal: Number(mine.total),
    tableTotal: Number(all.total),
    participants,
    orders: parsed,
  });
});

// Staff: fetch all orders in a table session by sessionId, flattened by item line.
router.get('/:sessionId', ...orderStaff, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const sessionId = Number(req.params.sessionId);
  if (!Number.isFinite(sessionId)) return res.status(400).json({ error: 'invalid_session_id' });

  const [rows] = await pool.query(
    `SELECT o.id AS orderId, o.items, o.total, o.status, o.created_at AS createdAt,
            p.id AS participantId, p.display_name AS participantName, p.phone AS participantPhone
     FROM orders o
     LEFT JOIN session_participants p ON p.id = o.participant_id
     WHERE o.restaurant_id = ? AND o.table_session_id = ?
     ORDER BY o.created_at ASC`,
    [restaurantId, sessionId]
  );

  const out = [];
  for (const r of rows) {
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    for (const it of items) {
      out.push({
        id: Number(r.orderId),
        item: it.name,
        quantity: Number(it.quantity) || 0,
        price: Number(it.unitPrice ?? it.lineTotal ?? 0),
        participant: {
          id: r.participantId ? Number(r.participantId) : null,
          name: r.participantName || null,
          phone: r.participantPhone || null,
        },
        status: r.status,
        createdAt: r.createdAt,
      });
    }
  }
  res.json(out);
});

router.get(
  '/table/:tableNumber/detail',
  ...orderStaff,
  async (req, res) => {
    const restaurantId = req.auth.restaurantId;
    const tableNumber = String(req.params.tableNumber);
    const [tableRows] = await pool.query(
      'SELECT id FROM `tables` WHERE restaurant_id = ? AND table_number = ? LIMIT 1',
      [restaurantId, tableNumber]
    );
    if (!tableRows.length) return res.status(404).json({ error: 'table_not_found' });
    const tableId = tableRows[0].id;
    const [sessRows] = await pool.query(
      `SELECT id, token, status, started_at AS startedAt
       FROM table_sessions
       WHERE restaurant_id = ? AND dining_table_id = ? AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`,
      [restaurantId, tableId]
    );
    if (!sessRows.length) {
      return res.json({ tableNumber, active: false, participants: [], orders: [], tableTotal: 0 });
    }
    const s = sessRows[0];
    const [participants] = await pool.query(
      `SELECT id, display_name AS name, phone, joined_at AS joinedAt, active
       FROM session_participants
       WHERE table_session_id = ?
       ORDER BY joined_at ASC`,
      [s.id]
    );
    const [orders] = await pool.query(
      `SELECT o.id, o.status, o.total, o.items, o.customer_note AS customerNote, o.created_at AS createdAt,
              o.participant_id AS participantId, p.display_name AS customerName
       FROM orders o
       LEFT JOIN session_participants p ON p.id = o.participant_id
       WHERE o.table_session_id = ?
       ORDER BY o.created_at DESC`,
      [s.id]
    );
    const parsedOrders = orders.map((row) => ({
      ...row,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
    }));
    const [[all]] = await pool.query('SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE table_session_id = ?', [
      s.id,
    ]);
    res.json({
      tableNumber,
      active: s.status === 'active',
      sessionToken: s.token,
      sessionStartedAt: s.startedAt,
      participants,
      orders: parsedOrders,
      tableTotal: Number(all.total),
    });
  }
);

const ALLOWED_TRANSITIONS = {
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

router.patch('/:id/status', ...orderStaff, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const id = Number(req.params.id);
  const { status: nextStatus } = req.body || {};
  if (!Number.isFinite(id) || !nextStatus) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const [rows] = await pool.query(
    'SELECT id, status FROM orders WHERE id = ? AND restaurant_id = ?',
    [id, restaurantId]
  );
  if (!rows.length) {
    return res.status(404).json({ error: 'not_found' });
  }
  const current = rows[0].status;
  const allowed = ALLOWED_TRANSITIONS[current] || [];
  if (!allowed.includes(nextStatus)) {
    return res.status(400).json({ error: 'invalid_transition', current, nextStatus });
  }

  await pool.query('UPDATE orders SET status = ? WHERE id = ? AND restaurant_id = ?', [
    nextStatus,
    id,
    restaurantId,
  ]);

  const [updated] = await pool.query(
    `SELECT o.id, o.status, o.total, o.items, o.customer_note AS customerNote,
            o.created_at AS createdAt, o.updated_at AS updatedAt,
            dt.table_number AS tableNumber
     FROM orders o
     JOIN \`tables\` dt ON dt.id = o.dining_table_id
     WHERE o.id = ?`,
    [id]
  );
  const order = updated[0];
  order.items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

  invalidateRestaurantStats(restaurantId).catch(() => {});

  // WhatsApp on status update (if customer phone exists).
  try {
    const [[w]] = await pool.query(
      `SELECT p.display_name AS customerName, p.phone, r.whatsapp_number AS restaurantWhatsapp
       FROM orders o
       LEFT JOIN session_participants p ON p.id = o.participant_id
       LEFT JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.id = ? AND o.restaurant_id = ?
       LIMIT 1`,
      [id, restaurantId]
    );
    if (w) {
      sendWhatsAppMessage({
        customerName: w.customerName,
        phone: w.phone,
        restaurantWhatsapp: w.restaurantWhatsapp,
        orderId: id,
        status: nextStatus,
      }).catch((e) => console.error('whatsapp update send failed', e.message));
    }
  } catch {
    /* ignore */
  }

  const io = req.app.get('io');
  if (io) {
    const restaurantRoom = `restaurant:${restaurantId}`;
    const slimStaff = {
      id: order.id,
      table: order.tableNumber,
      items: order.items,
      total: Number(order.total),
      status: order.status,
    };
    io.to(restaurantRoom).emit('order:updated', slimStaff);
    logSocketEmit('order:updated', { restaurantId, room: restaurantRoom, orderId: order.id, status: order.status });
    if (process.env.VIP_LOG_ORDER_EMIT === '1') {
      console.log('[emit] order:updated', { room: restaurantRoom, ...slimStaff });
    }
    try {
      const [[sess]] = await pool.query(
        `SELECT s.token
         FROM orders o
         JOIN table_sessions s ON s.id = o.table_session_id
         WHERE o.id = ? AND o.restaurant_id = ?
         LIMIT 1`,
        [id, restaurantId]
      );
      if (sess && sess.token) {
        const sr = `session:${String(sess.token)}`;
        io.to(sr).emit('order:updated', order);
        logSocketEmit('order:updated', { sessionRoom: sr, orderId: order.id });
      }
    } catch {
      /* ignore */
    }
  }

  res.json(order);
});

module.exports = { router, emitOrders };
