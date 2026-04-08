const express = require('express');
const { pool } = require('../config/database');
const { requireRole, requireRestaurantContext } = require('../middleware/requireRole');
const { requireSubscriptionForOrders } = require('../middleware/requireSubscription');
const { requireStaffAuth } = require('../middleware/staffAuth');
const { uploadMenuImage } = require('../lib/uploads');

const router = express.Router();

const staffMenu = [requireStaffAuth, requireRole('admin', 'manager'), requireRestaurantContext];

function handleMenuUpload(req, res, next) {
  uploadMenuImage.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'upload_failed', message: err.message });
    }
    next();
  });
}

function optionalMenuImage(req, res, next) {
  if (req.is('multipart/form-data')) {
    return handleMenuUpload(req, res, next);
  }
  next();
}

async function categoryBelongsToRestaurant(categoryId, restaurantId) {
  const [rows] = await pool.query(
    'SELECT id FROM menu_categories WHERE id = ? AND restaurant_id = ? LIMIT 1',
    [categoryId, restaurantId]
  );
  return rows.length > 0;
}

router.get('/', requireSubscriptionForOrders, async (req, res) => {
  const restaurantId = req.publicRestaurantId || 1;
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.description, m.price, m.image_url AS imageUrl, m.available,
            c.name AS category, m.category_id AS categoryId
     FROM menu m
     JOIN menu_categories c ON c.id = m.category_id
     WHERE m.restaurant_id = ? AND m.available = 1
     ORDER BY c.sort_order, c.name, m.name`,
    [restaurantId]
  );
  res.json(rows);
});

router.get('/all', ...staffMenu, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.description, m.price, m.image_url AS imageUrl, m.available,
            c.name AS category, m.category_id AS categoryId
     FROM menu m
     JOIN menu_categories c ON c.id = m.category_id
     WHERE m.restaurant_id = ?
     ORDER BY c.sort_order, c.name, m.name`,
    [restaurantId]
  );
  res.json(rows);
});

router.post('/items', ...staffMenu, optionalMenuImage, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const { name, description, price, categoryId } = req.body || {};
  if (!name || price == null || categoryId == null) {
    return res.status(400).json({ error: 'missing_fields', message: 'name, price, categoryId required.' });
  }
  const catId = Number(categoryId);
  if (!Number.isFinite(catId)) {
    return res.status(400).json({ error: 'invalid_category' });
  }
  const okCat = await categoryBelongsToRestaurant(catId, restaurantId);
  if (!okCat) {
    return res.status(400).json({ error: 'unknown_category' });
  }
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) {
    return res.status(400).json({ error: 'invalid_price' });
  }
  const desc = description != null ? String(description).slice(0, 2000) : null;
  const imageUrl = req.file ? `/uploads/menu/${req.file.filename}` : null;
  try {
    const [r] = await pool.query(
      `INSERT INTO menu (restaurant_id, category_id, name, description, price, image_url, available)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [restaurantId, catId, String(name).trim().slice(0, 255), desc, p, imageUrl]
    );
    const [rows] = await pool.query(
      `SELECT m.id, m.name, m.description, m.price, m.image_url AS imageUrl, m.available,
              c.name AS category, m.category_id AS categoryId
       FROM menu m
       JOIN menu_categories c ON c.id = m.category_id
       WHERE m.id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('menu POST items', e);
    res.status(500).json({ error: 'create_failed' });
  }
});

router.put('/items/:id', ...staffMenu, optionalMenuImage, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const { name, description, price, categoryId, available, clearImage } = req.body || {};
  if (
    name == null ||
    description === undefined ||
    price == null ||
    categoryId == null ||
    available === undefined
  ) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Send all fields: name, description, price, categoryId, available (and image file or clearImage).',
    });
  }
  const catId = Number(categoryId);
  if (!Number.isFinite(catId)) {
    return res.status(400).json({ error: 'invalid_category' });
  }
  const okCat = await categoryBelongsToRestaurant(catId, restaurantId);
  if (!okCat) {
    return res.status(400).json({ error: 'unknown_category' });
  }
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) {
    return res.status(400).json({ error: 'invalid_price' });
  }
  const avail =
    available === true || available === '1' || available === 1 || available === 'true' ? 1 : 0;
  try {
    const [existing] = await pool.query(
      'SELECT id FROM menu WHERE id = ? AND restaurant_id = ?',
      [id, restaurantId]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'not_found' });
    }
    let imageUrl = undefined;
    if (req.file) {
      imageUrl = `/uploads/menu/${req.file.filename}`;
    } else if (clearImage === '1' || clearImage === true || clearImage === 'true') {
      imageUrl = null;
    }
    if (imageUrl === undefined) {
      await pool.query(
        `UPDATE menu SET name = ?, description = ?, price = ?, category_id = ?, available = ?
         WHERE id = ? AND restaurant_id = ?`,
        [
          String(name).trim().slice(0, 255),
          String(description).slice(0, 2000),
          p,
          catId,
          avail,
          id,
          restaurantId,
        ]
      );
    } else {
      await pool.query(
        `UPDATE menu SET name = ?, description = ?, price = ?, category_id = ?, available = ?, image_url = ?
         WHERE id = ? AND restaurant_id = ?`,
        [
          String(name).trim().slice(0, 255),
          String(description).slice(0, 2000),
          p,
          catId,
          avail,
          imageUrl,
          id,
          restaurantId,
        ]
      );
    }
    const [rows] = await pool.query(
      `SELECT m.id, m.name, m.description, m.price, m.image_url AS imageUrl, m.available,
              c.name AS category, m.category_id AS categoryId
       FROM menu m
       JOIN menu_categories c ON c.id = m.category_id
       WHERE m.id = ?`,
      [id]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('menu PUT items', e);
    res.status(500).json({ error: 'update_failed' });
  }
});

router.delete('/items/:id', ...staffMenu, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const [r] = await pool.query('DELETE FROM menu WHERE id = ? AND restaurant_id = ?', [id, restaurantId]);
  if (r.affectedRows === 0) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json({ ok: true });
});

module.exports = router;
