const express = require('express');
const QRCode = require('qrcode');
const { pool } = require('../config/database');
const { resolveRestaurantIdAsync } = require('../middleware/requireSubscription');
const { requireRole, requireRestaurantContext } = require('../middleware/requireRole');
const { requireStaffAuth } = require('../middleware/staffAuth');
const {
  getOrCreateActiveSession,
  endSession,
} = require('../services/tableSessionService');
const { logSocketEmit } = require('../lib/debug');

const router = express.Router();

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || 'https://yourdomain.com').replace(
    /\/$/,
    ''
  );
}

router.get(
  '/blocks',
  requireStaffAuth,
  requireRole('admin', 'cashier', 'waiter'),
  requireRestaurantContext,
  async (req, res) => {
    const restaurantId = req.auth.restaurantId;
    const [tables] = await pool.query(
      `SELECT
         t.id,
         t.table_number AS tableNumber,
         t.label,
         s.id AS sessionId,
         s.token AS sessionToken,
         s.status AS sessionStatus,
         s.started_at AS sessionStartedAt,
         COALESCE(pc.c, 0) AS peopleCount,
         COALESCE(oc.order_count, 0) AS ordersCount,
         COALESCE(oc.total_sum, 0) AS total,
         CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS active
       FROM \`tables\` t
       LEFT JOIN table_sessions s
         ON s.dining_table_id = t.id AND s.status = 'active'
       LEFT JOIN (
         SELECT table_session_id, COUNT(*) AS c
         FROM session_participants
         WHERE active = 1
         GROUP BY table_session_id
       ) pc ON pc.table_session_id = s.id
       LEFT JOIN (
         SELECT table_session_id,
                COUNT(*) AS order_count,
                COALESCE(SUM(total), 0) AS total_sum
         FROM orders
         GROUP BY table_session_id
       ) oc ON oc.table_session_id = s.id
       WHERE t.restaurant_id = ?
       ORDER BY CAST(t.table_number AS UNSIGNED)`,
      [restaurantId]
    );

    const shaped = tables.map((row) => ({
      id: row.id,
      tableNumber: row.tableNumber,
      label: row.label,
      sessionId: row.sessionId,
      sessionToken: row.sessionToken,
      sessionStatus: row.sessionStatus,
      sessionStartedAt: row.sessionStartedAt,
      peopleCount: Number(row.peopleCount),
      ordersCount: Number(row.ordersCount),
      total: Number(row.total),
      active: Boolean(Number(row.active)),
    }));

    res.json(shaped);
  }
);

router.get('/', async (req, res) => {
  const restaurantId = await resolveRestaurantIdAsync(req);
  const [rows] = await pool.query(
    'SELECT id, table_number AS tableNumber, label, created_at AS createdAt FROM `tables` WHERE restaurant_id = ? ORDER BY CAST(table_number AS UNSIGNED)',
    [restaurantId]
  );
  res.json(rows);
});

// Staff: get current (latest) session for a table by tableId.
router.get(
  '/:id/session',
  requireStaffAuth,
  requireRole('admin', 'cashier', 'waiter'),
  requireRestaurantContext,
  async (req, res) => {
    const restaurantId = req.auth.restaurantId;
    const tableId = Number(req.params.id);
    if (!Number.isFinite(tableId)) return res.status(400).json({ error: 'invalid_table_id' });

    const [sRows] = await pool.query(
      `SELECT s.id AS sessionId, s.status
       FROM table_sessions s
       JOIN \`tables\` t ON t.id = s.dining_table_id
       WHERE t.id = ? AND t.restaurant_id = ?
       ORDER BY s.started_at DESC
       LIMIT 1`,
      [tableId, restaurantId]
    );
    if (!sRows.length) return res.status(404).json({ error: 'session_not_found' });
    const s = sRows[0];

    const [participants] = await pool.query(
      `SELECT id, display_name AS name, phone, joined_at AS joinedAt, active
       FROM session_participants
       WHERE table_session_id = ?
       ORDER BY joined_at ASC`,
      [s.sessionId]
    );

    return res.json({
      sessionId: Number(s.sessionId),
      status: s.status,
      participants,
    });
  }
);

router.post('/:tableNumber/session/join', async (req, res) => {
  const restaurantId = await resolveRestaurantIdAsync(req);
  const tableNumber = String(req.params.tableNumber);
  const name = String((req.body && req.body.name) || '').trim();
  const phoneRaw = (req.body && req.body.phone) || '';
  const phone = String(phoneRaw).trim() || null;
  if (!name) {
    return res.status(400).json({ error: 'missing_name' });
  }
  const [tableRows] = await pool.query(
    `SELECT id, table_number AS tableNumber
     FROM \`tables\`
     WHERE restaurant_id = ? AND table_number = ?
     LIMIT 1`,
    [restaurantId, tableNumber]
  );
  if (!tableRows.length) {
    return res.status(404).json({ error: 'table_not_found' });
  }
  const table = tableRows[0];
  const session = await getOrCreateActiveSession(restaurantId, table.id);
  const [r] = await pool.query(
    `INSERT INTO session_participants (table_session_id, display_name, phone, active)
     VALUES (?, ?, ?, 1)`,
    [session.id, name.slice(0, 64), phone ? phone.slice(0, 32) : null]
  );
  res.json({
    restaurantId,
    tableNumber: table.tableNumber,
    tableSessionId: session.id,
    sessionToken: session.token,
    participantId: r.insertId,
    participantName: name,
    phone,
  });
  const io = req.app.get('io');
  if (io) {
    const room = `restaurant:${restaurantId}`;
    io.to(room).emit('tables:updated', { tableNumber, restaurantId });
    logSocketEmit('tables:updated', { restaurantId, tableNumber, room });
  }
});

router.post('/session/:token/ping', async (req, res) => {
  const token = String(req.params.token || '');
  const participantId = Number(req.body && req.body.participantId);
  if (!token || !Number.isFinite(participantId)) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  await pool.query(
    `UPDATE session_participants p
     JOIN table_sessions s ON s.id = p.table_session_id
     SET p.last_seen_at = NOW(), p.active = (s.status = 'active')
     WHERE s.token = ? AND p.id = ?`,
    [token, participantId]
  );
  res.json({ ok: true });
});

router.get('/session/:token/status', async (req, res) => {
  const token = String(req.params.token || '');
  const participantId = Number(req.query.participantId);
  if (!token || !Number.isFinite(participantId)) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  const [rows] = await pool.query(
    `SELECT s.id AS tableSessionId, s.status, t.table_number AS tableNumber, r.id AS restaurantId
     FROM table_sessions s
     JOIN \`tables\` t ON t.id = s.dining_table_id
     JOIN restaurants r ON r.id = s.restaurant_id
     WHERE s.token = ?
     LIMIT 1`,
    [token]
  );
  if (!rows.length) return res.status(404).json({ error: 'session_not_found' });
  const s = rows[0];
  const [[mine]] = await pool.query(
    `SELECT COALESCE(SUM(total), 0) AS total
     FROM orders
     WHERE table_session_id = ? AND participant_id = ?`,
    [s.tableSessionId, participantId]
  );
  const [[all]] = await pool.query(
    `SELECT COALESCE(SUM(total), 0) AS total
     FROM orders
     WHERE table_session_id = ?`,
    [s.tableSessionId]
  );
  res.json({
    status: s.status,
    tableSessionId: s.tableSessionId,
    tableNumber: s.tableNumber,
    restaurantId: s.restaurantId,
    myTotal: Number(mine.total),
    tableTotal: Number(all.total),
  });
});

router.post(
  '/session/:token/end',
  requireStaffAuth,
  requireRole('admin', 'cashier'),
  requireRestaurantContext,
  async (req, res) => {
    const token = String(req.params.token || '');
    const [rows] = await pool.query(
      `SELECT id, restaurant_id AS restaurantId
       FROM table_sessions
       WHERE token = ?
       LIMIT 1`,
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'session_not_found' });
    const s = rows[0];
    if (s.restaurantId !== req.auth.restaurantId) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const ok = await endSession(req.auth.restaurantId, s.id, req.auth.userId);
    if (!ok) return res.status(409).json({ error: 'already_ended' });
    await pool.query(
      `UPDATE session_participants
       SET active = 0, last_seen_at = NOW()
       WHERE table_session_id = ?`,
      [s.id]
    );
    res.json({ ok: true });
  const io = req.app.get('io');
  if (io) {
    const room = `restaurant:${s.restaurantId}`;
    io.to(room).emit('tables:updated', { tableSessionId: s.id, restaurantId: s.restaurantId });
    const sr = `session:${token}`;
    io.to(sr).emit('session:ended', { token });
    logSocketEmit('session:ended', { restaurantId: s.restaurantId, sessionRoom: sr });
    logSocketEmit('tables:updated', { restaurantId: s.restaurantId, tableSessionId: s.id, room });
  }
  }
);

router.get('/:tableNumber/qrcode.png', async (req, res) => {
  const restaurantId = await resolveRestaurantIdAsync(req);
  const { tableNumber } = req.params;
  const [rows] = await pool.query(
    'SELECT id FROM `tables` WHERE restaurant_id = ? AND table_number = ? LIMIT 1',
    [restaurantId, String(tableNumber)]
  );
  if (!rows.length) {
    return res.status(404).json({ error: 'table_not_found' });
  }
  const [[rest]] = await pool.query('SELECT slug FROM restaurants WHERE id = ? LIMIT 1', [restaurantId]);
  const slug = rest && rest.slug ? rest.slug : '';
  const url = `${baseUrl()}/menu?restaurant=${encodeURIComponent(slug)}&table=${encodeURIComponent(tableNumber)}`;
  try {
    const png = await QRCode.toBuffer(url, { type: 'png', width: 320, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="table-${tableNumber}.png"`);
    return res.send(png);
  } catch (e) {
    return res.status(500).json({ error: 'qr_failed', message: e.message });
  }
});

router.get('/:tableNumber/link', async (req, res) => {
  const restaurantId = await resolveRestaurantIdAsync(req);
  const { tableNumber } = req.params;
  const [rows] = await pool.query(
    'SELECT id FROM `tables` WHERE restaurant_id = ? AND table_number = ? LIMIT 1',
    [restaurantId, String(tableNumber)]
  );
  if (!rows.length) {
    return res.status(404).json({ error: 'table_not_found' });
  }
  const [[rest]] = await pool.query('SELECT slug FROM restaurants WHERE id = ? LIMIT 1', [restaurantId]);
  const slug = rest && rest.slug ? rest.slug : '';
  const url = `${baseUrl()}/menu?restaurant=${encodeURIComponent(slug)}&table=${encodeURIComponent(tableNumber)}`;
  res.json({ url, tableNumber, restaurantId, restaurant: slug });
});

module.exports = router;
