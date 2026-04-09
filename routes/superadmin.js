const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { uploadLogo } = require('../lib/uploads');
const { requireSuperAuth } = require('../middleware/superAuth');
const { refreshSubscriptionState } = require('../services/subscriptionService');
const {
  SUPER_COOKIE,
  signSuperToken,
  verifySuperToken,
  cookieBaseOptions,
  cookieClearOptions,
} = require('../lib/jwtAuth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'missing_credentials', message: 'Username and password are required.' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = :u LIMIT 1',
      { u: username }
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid username or password.' });
    }
    const user = rows[0];
    if (user.role !== 'superadmin') {
      return res.status(403).json({ error: 'not_superadmin', message: 'This user is not a superadmin.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid username or password.' });
    }
    const token = signSuperToken({ id: user.id, username: user.username });
    res.cookie(SUPER_COOKIE, token, cookieBaseOptions(req));
    return res.json({ ok: true, username: user.username, role: 'superadmin' });
  } catch (e) {
    console.error('superadmin/login', e);
    return res.status(500).json({ error: 'login_failed', message: 'Could not complete sign-in. Try again.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(SUPER_COOKIE, cookieClearOptions(req));
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies && req.cookies[SUPER_COOKIE];
  if (!token) {
    return res.json({ authenticated: false });
  }
  const u = verifySuperToken(token);
  if (!u) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    username: u.username,
    role: 'superadmin',
    userId: u.userId,
  });
});

router.use(requireSuperAuth);

router.post('/restaurants/:id/logo', (req, res, next) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'upload_failed', message: err.message });
    return next();
  });
}, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || !req.file) return res.status(400).json({ error: 'invalid_request' });
  const logoUrl = `/uploads/logos/${req.file.filename}`;
  await pool.query('UPDATE restaurants SET logo_url = ? WHERE id = ?', [logoUrl, id]);
  res.json({ ok: true, logoUrl });
});

router.get('/restaurants', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const where = q ? 'WHERE r.name LIKE ? OR r.slug LIKE ? OR r.contact_name LIKE ? OR r.contact_phone LIKE ? OR r.whatsapp_number LIKE ?' : '';
    const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [];
    const [rows] = await pool.query(
      `SELECT r.id, r.name, r.slug, r.logo_url AS logoUrl,
              r.whatsapp_number AS whatsappNumber,
              r.contact_name AS contactName, r.contact_phone AS contactPhone, r.contact_email AS contactEmail,
              s.id AS subscriptionId, s.status AS subscriptionStatus, s.plan_name AS planName,
              s.starts_at AS startsAt, s.expires_at AS expiresAt,
              (s.status = 'active' AND s.expires_at IS NOT NULL AND s.expires_at > NOW()) AS subscriptionActive
       FROM restaurants r
       LEFT JOIN subscription s ON s.restaurant_id = r.id
       ${where}
       ORDER BY r.id`
      ,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error('superadmin/restaurants', e);
    res.status(500).json({ error: 'list_failed' });
  }
});

router.post('/subscription/:id/renew', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const [rows] = await pool.query('SELECT id, restaurant_id FROM subscription WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'not_found' });
    }
    await pool.query(
      `UPDATE subscription
       SET expires_at = GREATEST(COALESCE(expires_at, NOW()), NOW()) + INTERVAL '30 day'
       WHERE id = ?`,
      [id]
    );
    const io = req.app.get('io');
    const sub = await refreshSubscriptionState(io, rows[0].restaurant_id);
    res.json(sub);
  } catch (e) {
    console.error('superadmin renew', e);
    res.status(500).json({ error: 'renew_failed' });
  }
});

router.post('/subscription/:id/change-plan', async (req, res) => {
  const id = Number(req.params.id);
  const raw = (req.body && req.body.plan) || '';
  const plan = String(raw).trim();
  const normalized = plan.toLowerCase() === 'premium' ? 'Premium' : plan.toLowerCase() === 'standard' ? 'Standard' : null;
  if (!Number.isFinite(id) || !normalized) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  try {
    const [rows] = await pool.query('SELECT restaurant_id FROM subscription WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'not_found' });
    }
    await pool.query('UPDATE subscription SET plan_name = ? WHERE id = ?', [normalized, id]);
    const io = req.app.get('io');
    const sub = await refreshSubscriptionState(io, rows[0].restaurant_id);
    res.json(sub);
  } catch (e) {
    console.error('superadmin change-plan', e);
    res.status(500).json({ error: 'change_plan_failed' });
  }
});

router.delete('/subscription/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const [rows] = await pool.query('SELECT restaurant_id FROM subscription WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'not_found' });
    }
    const restaurantId = rows[0].restaurant_id;
    await pool.query(`UPDATE subscription SET status = 'cancelled' WHERE id = ?`, [id]);
    const io = req.app.get('io');
    const sub = await refreshSubscriptionState(io, restaurantId);
    res.json({ ok: true, subscription: sub });
  } catch (e) {
    console.error('superadmin delete subscription', e);
    res.status(500).json({ error: 'delete_failed' });
  }
});

router.put('/subscription/:id/reactivate', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const [rows] = await pool.query('SELECT restaurant_id, status FROM subscription WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (rows[0].status !== 'cancelled') {
      return res.status(409).json({ error: 'not_cancelled' });
    }
    await pool.query(`UPDATE subscription SET status = 'active' WHERE id = ?`, [id]);
    const io = req.app.get('io');
    const sub = await refreshSubscriptionState(io, rows[0].restaurant_id);
    return res.json(sub);
  } catch (e) {
    console.error('superadmin reactivate', e);
    return res.status(500).json({ error: 'reactivate_failed' });
  }
});

router.put('/subscription/:id/manual-date', async (req, res) => {
  const id = Number(req.params.id);
  const { startsAt, expiresAt, status } = req.body || {};
  if (!Number.isFinite(id) || !startsAt || !expiresAt) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  const nextStatus = ['active', 'cancelled', 'suspended'].includes(String(status)) ? String(status) : 'active';
  try {
    const [rows] = await pool.query('SELECT restaurant_id FROM subscription WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    await pool.query(
      `UPDATE subscription
       SET starts_at = ?, expires_at = ?, status = ?
       WHERE id = ?`,
      [startsAt, expiresAt, nextStatus, id]
    );
    const sub = await refreshSubscriptionState(req.app.get('io'), rows[0].restaurant_id);
    return res.json(sub);
  } catch (e) {
    console.error('superadmin manual-date', e);
    return res.status(500).json({ error: 'update_failed' });
  }
});

router.post('/restaurants', (req, res, next) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'upload_failed', message: err.message });
    return next();
  });
}, async (req, res) => {
  const {
    name,
    slug,
    whatsappNumber,
    contactName,
    contactPhone,
    contactEmail,
    ownerUsername,
    ownerPassword,
    cashierUsername,
    cashierPassword,
    tableCount,
  } = req.body || {};
  if (!name || !slug || !ownerUsername || !ownerPassword || !cashierUsername || !cashierPassword) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  const tablesN = Math.max(1, Math.min(1000, Number(tableCount) || 10));
  const logoUrl = req.file ? `/uploads/logos/${req.file.filename}` : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rr] = await conn.query(
      `INSERT INTO restaurants (name, slug, whatsapp_number, contact_name, contact_phone, contact_email, logo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(name).slice(0, 128),
        String(slug).slice(0, 64),
        whatsappNumber ? String(whatsappNumber).slice(0, 32) : null,
        contactName ? String(contactName).slice(0, 128) : null,
        contactPhone ? String(contactPhone).slice(0, 32) : null,
        contactEmail ? String(contactEmail).slice(0, 128) : null,
        logoUrl,
      ]
    );
    const restaurantId = rr.insertId;
    for (let i = 1; i <= tablesN; i += 1) {
      await conn.query(
        'INSERT INTO `tables` (restaurant_id, table_number, label) VALUES (?, ?, ?)',
        [restaurantId, String(i), `Table ${i}`]
      );
    }
    const ownerHash = await bcrypt.hash(String(ownerPassword), 10);
    const cashierHash = await bcrypt.hash(String(cashierPassword), 10);
    await conn.query(
      'INSERT INTO users (restaurant_id, username, password_hash, role) VALUES (?, ?, ?, "admin")',
      [restaurantId, String(ownerUsername).slice(0, 64), ownerHash]
    );
    await conn.query(
      'INSERT INTO users (restaurant_id, username, password_hash, role) VALUES (?, ?, ?, "cashier")',
      [restaurantId, String(cashierUsername).slice(0, 64), cashierHash]
    );
    const now = new Date();
    const exp = new Date(now);
    exp.setMonth(exp.getMonth() + 1);
    await conn.query(
      `INSERT INTO subscription (restaurant_id, status, plan_name, starts_at, expires_at)
       VALUES (?, 'active', 'Standard', ?, ?)`,
      [restaurantId, now, exp]
    );
    await conn.commit();
    return res.status(201).json({ ok: true, restaurantId });
  } catch (e) {
    await conn.rollback();
    console.error('superadmin create restaurant', e);
    return res.status(500).json({ error: 'create_failed' });
  } finally {
    conn.release();
  }
});

router.put('/restaurants/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  const { name, slug, whatsappNumber, contactName, contactPhone, contactEmail } = req.body || {};
  try {
    const [r] = await pool.query(
      `UPDATE restaurants
       SET name = ?, slug = ?, whatsapp_number = ?, contact_name = ?, contact_phone = ?, contact_email = ?
       WHERE id = ?`,
      [
        String(name || '').slice(0, 128),
        String(slug || '').slice(0, 64),
        whatsappNumber ? String(whatsappNumber).slice(0, 32) : null,
        contactName ? String(contactName).slice(0, 128) : null,
        contactPhone ? String(contactPhone).slice(0, 32) : null,
        contactEmail ? String(contactEmail).slice(0, 128) : null,
        id,
      ]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'not_found' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('superadmin update restaurant', e);
    return res.status(500).json({ error: 'update_failed' });
  }
});

router.put('/restaurants/:id/tables', async (req, res) => {
  const restaurantId = Number(req.params.id);
  const n = Number(req.body && req.body.tableCount);
  if (!Number.isFinite(restaurantId) || !Number.isFinite(n) || n < 1 || n > 1000) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query(
      'SELECT id, table_number FROM `tables` WHERE restaurant_id = ?',
      [restaurantId]
    );
    for (let i = 1; i <= n; i += 1) {
      const s = String(i);
      if (!existing.some((x) => String(x.table_number) === s)) {
        await conn.query(
          'INSERT INTO `tables` (restaurant_id, table_number, label) VALUES (?, ?, ?)',
          [restaurantId, s, `Table ${s}`]
        );
      }
    }
    const toRemove = existing.filter((row) => {
      const num = parseInt(String(row.table_number), 10);
      return Number.isFinite(num) && num > n;
    });
    for (const row of toRemove) {
      const [oc] = await conn.query('SELECT COUNT(*) AS c FROM orders WHERE dining_table_id = ?', [row.id]);
      if (oc[0].c > 0) {
        await conn.rollback();
        return res.status(409).json({ error: 'has_orders', tableNumber: row.table_number });
      }
    }
    if (toRemove.length) {
      await conn.query(
        `DELETE FROM \`tables\` WHERE id IN (${toRemove.map(() => '?').join(',')})`,
        toRemove.map((x) => x.id)
      );
    }
    await conn.commit();
    const io = req.app.get('io');
    if (io) io.to('superadmin').emit('restaurants:tables-updated', { restaurantId, tableCount: n });
    return res.json({ ok: true, tableCount: n });
  } catch (e) {
    await conn.rollback();
    console.error('superadmin tables update', e);
    return res.status(500).json({ error: 'update_failed' });
  } finally {
    conn.release();
  }
});

router.put('/restaurants/:id/users', async (req, res) => {
  const restaurantId = Number(req.params.id);
  const {
    ownerUsername,
    ownerPassword,
    cashierUsername,
    cashierPassword,
  } = req.body || {};
  if (!Number.isFinite(restaurantId)) return res.status(400).json({ error: 'invalid_id' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (ownerUsername) {
      await conn.query(
        'UPDATE users SET username = ? WHERE restaurant_id = ? AND role = "admin" LIMIT 1',
        [String(ownerUsername).slice(0, 64), restaurantId]
      );
    }
    if (ownerPassword) {
      const hash = await bcrypt.hash(String(ownerPassword), 10);
      await conn.query(
        'UPDATE users SET password_hash = ? WHERE restaurant_id = ? AND role = "admin" LIMIT 1',
        [hash, restaurantId]
      );
    }
    if (cashierUsername) {
      await conn.query(
        'UPDATE users SET username = ? WHERE restaurant_id = ? AND role = "cashier" LIMIT 1',
        [String(cashierUsername).slice(0, 64), restaurantId]
      );
    }
    if (cashierPassword) {
      const hash = await bcrypt.hash(String(cashierPassword), 10);
      await conn.query(
        'UPDATE users SET password_hash = ? WHERE restaurant_id = ? AND role = "cashier" LIMIT 1',
        [hash, restaurantId]
      );
    }
    await conn.commit();
    return res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error('superadmin users update', e);
    return res.status(500).json({ error: 'update_failed' });
  } finally {
    conn.release();
  }
});

module.exports = router;
