const express = require('express');
const { pool } = require('../config/database');
const { requireRole, requireRestaurantContext } = require('../middleware/requireRole');
const { requireStaffAuth } = require('../middleware/staffAuth');

const router = express.Router();

const adminOnly = [requireStaffAuth, requireRole('admin'), requireRestaurantContext];
const staffReadCats = [requireStaffAuth, requireRole('admin', 'manager'), requireRestaurantContext];

router.get('/', ...staffReadCats, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const [rows] = await pool.query(
    `SELECT id, name, sort_order AS sortOrder
     FROM menu_categories
     WHERE restaurant_id = ?
     ORDER BY sort_order ASC, name ASC`,
    [restaurantId]
  );
  res.json(rows);
});

router.post('/', ...adminOnly, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const { name, sortOrder } = req.body || {};
  const n = name != null ? String(name).trim().slice(0, 64) : '';
  if (!n) {
    return res.status(400).json({ error: 'missing_name' });
  }
  const sort = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0;
  try {
    const [r] = await pool.query(
      'INSERT INTO menu_categories (restaurant_id, name, sort_order) VALUES (?, ?, ?)',
      [restaurantId, n, sort]
    );
    const [rows] = await pool.query(
      'SELECT id, name, sort_order AS sortOrder FROM menu_categories WHERE id = ?',
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'duplicate_category' });
    }
    console.error('categories POST', e);
    res.status(500).json({ error: 'create_failed' });
  }
});

router.put('/:id', ...adminOnly, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const id = Number(req.params.id);
  const { name, sortOrder } = req.body || {};
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const n = name != null ? String(name).trim().slice(0, 64) : '';
  if (!n) {
    return res.status(400).json({ error: 'missing_name' });
  }
  const sort = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0;
  try {
    const [r] = await pool.query(
      'UPDATE menu_categories SET name = ?, sort_order = ? WHERE id = ? AND restaurant_id = ?',
      [n, sort, id, restaurantId]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    const [rows] = await pool.query(
      'SELECT id, name, sort_order AS sortOrder FROM menu_categories WHERE id = ?',
      [id]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'duplicate_category' });
    }
    console.error('categories PUT', e);
    res.status(500).json({ error: 'update_failed' });
  }
});

router.delete('/:id', ...adminOnly, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const [used] = await pool.query(
    'SELECT COUNT(*) AS c FROM menu WHERE category_id = ? AND restaurant_id = ?',
    [id, restaurantId]
  );
  if (used[0].c > 0) {
    return res.status(409).json({ error: 'category_in_use' });
  }
  const [r] = await pool.query(
    'DELETE FROM menu_categories WHERE id = ? AND restaurant_id = ?',
    [id, restaurantId]
  );
  if (r.affectedRows === 0) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json({ ok: true });
});

module.exports = router;
