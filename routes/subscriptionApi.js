const express = require('express');
const { pool } = require('../config/database');
const { requireRole, requireRestaurantContext } = require('../middleware/requireRole');
const { requireStaffAuth } = require('../middleware/staffAuth');
const { refreshSubscriptionState } = require('../services/subscriptionService');

const router = express.Router();

const staffRead = [requireStaffAuth, requireRole('admin', 'manager'), requireRestaurantContext];
const adminOnly = [requireStaffAuth, requireRole('admin'), requireRestaurantContext];

router.get('/', ...staffRead, async (req, res) => {
  try {
    const sub = await refreshSubscriptionState(req.app.get('io'), req.auth.restaurantId);
    res.json(sub);
  } catch (e) {
    console.error('GET /subscription', e);
    res.status(500).json({ error: 'subscription_check_failed' });
  }
});

router.post('/renew', ...adminOnly, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  try {
    const [rows] = await pool.query(
      'SELECT id, expires_at FROM subscription WHERE restaurant_id = ? LIMIT 1',
      [restaurantId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'no_subscription' });
    }
    await pool.query(
      `UPDATE subscription
       SET expires_at = DATE_ADD(GREATEST(expires_at, NOW()), INTERVAL 30 DAY)
       WHERE id = ? AND restaurant_id = ?`,
      [rows[0].id, restaurantId]
    );
    const sub = await refreshSubscriptionState(req.app.get('io'), restaurantId);
    res.json(sub);
  } catch (e) {
    console.error('POST /subscription/renew', e);
    res.status(500).json({ error: 'renew_failed' });
  }
});

router.post('/change-plan', ...adminOnly, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const raw = (req.body && req.body.plan) || '';
  const plan = String(raw).trim();
  const normalized = plan.toLowerCase() === 'premium' ? 'Premium' : plan.toLowerCase() === 'standard' ? 'Standard' : null;
  if (!normalized) {
    return res.status(400).json({ error: 'invalid_plan', message: 'Use Standard or Premium.' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id FROM subscription WHERE restaurant_id = ? LIMIT 1',
      [restaurantId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'no_subscription' });
    }
    await pool.query('UPDATE subscription SET plan_name = ? WHERE id = ? AND restaurant_id = ?', [
      normalized,
      rows[0].id,
      restaurantId,
    ]);
    const sub = await refreshSubscriptionState(req.app.get('io'), restaurantId);
    res.json(sub);
  } catch (e) {
    console.error('POST /subscription/change-plan', e);
    res.status(500).json({ error: 'change_plan_failed' });
  }
});

router.delete('/:id', ...adminOnly, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const [r] = await pool.query(
      `UPDATE subscription
       SET status = 'cancelled'
       WHERE id = ? AND restaurant_id = ?`,
      [id, restaurantId]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    const sub = await refreshSubscriptionState(req.app.get('io'), restaurantId);
    res.json({ ok: true, subscription: sub });
  } catch (e) {
    console.error('DELETE /subscription/:id', e);
    res.status(500).json({ error: 'delete_failed' });
  }
});

module.exports = router;
