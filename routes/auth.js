const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { requireRole, requireRestaurantContext } = require('../middleware/requireRole');
const { requireStaffAuth } = require('../middleware/staffAuth');
const {
  STAFF_COOKIE,
  signStaffToken,
  verifyStaffToken,
  cookieBaseOptions,
  cookieClearOptions,
} = require('../lib/jwtAuth');

const router = express.Router();
const SALT_ROUNDS = 10;

const STAFF_ROLES = new Set(['admin', 'manager', 'waiter', 'cashier']);

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'missing_credentials', message: 'Username and password are required.' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, role, restaurant_id AS restaurantId FROM users WHERE username = :u LIMIT 1',
      { u: username }
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid username or password.' });
    }
    const user = rows[0];
    if (user.role === 'superadmin') {
      return res.status(403).json({
        error: 'use_superadmin_portal',
        message: 'Sign in via the superadmin page — staff and superadmin use separate sessions.',
      });
    }
    if (!STAFF_ROLES.has(user.role)) {
      return res.status(403).json({ error: 'invalid_role', message: 'This account cannot use staff login.' });
    }
    if (user.restaurantId == null) {
      return res.status(403).json({ error: 'no_restaurant', message: 'Account is not linked to a restaurant.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid username or password.' });
    }
    const token = signStaffToken({
      id: user.id,
      username: user.username,
      role: user.role,
      restaurantId: user.restaurantId,
    });
    res.cookie(STAFF_COOKIE, token, cookieBaseOptions(req));
    return res.json({
      ok: true,
      username: user.username,
      role: user.role,
      restaurantId: user.restaurantId,
    });
  } catch (e) {
    console.error('auth/login', e);
    return res.status(500).json({ error: 'login_failed', message: 'Could not complete sign-in. Try again.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(STAFF_COOKIE, cookieClearOptions(req));
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies && req.cookies[STAFF_COOKIE];
  if (!token) {
    return res.json({ authenticated: false });
  }
  const u = verifyStaffToken(token);
  if (!u) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    userId: u.userId,
    username: u.username,
    role: u.role,
    restaurantId: u.restaurantId,
  });
});

router.post(
  '/users',
  requireStaffAuth,
  requireRole('admin'),
  requireRestaurantContext,
  async (req, res) => {
    const { username, password, role } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const u = String(username).trim();
    const r = role ? String(role).toLowerCase() : 'waiter';
    if (!STAFF_ROLES.has(r)) {
      return res.status(400).json({ error: 'invalid_role' });
    }
    if (u.length < 2 || String(password).length < 8) {
      return res.status(400).json({ error: 'invalid_credentials_shape' });
    }
    try {
      const hash = await bcrypt.hash(String(password), SALT_ROUNDS);
      await pool.query(
        'INSERT INTO users (restaurant_id, username, password_hash, role) VALUES (?, ?, ?, ?)',
        [req.auth.restaurantId, u, hash, r]
      );
      return res.status(201).json({ ok: true, username: u, role: r });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'username_taken' });
      }
      console.error('auth/users', e);
      return res.status(500).json({ error: 'create_failed' });
    }
  }
);

module.exports = router;
