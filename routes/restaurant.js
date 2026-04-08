const express = require('express');
const { pool } = require('../config/database');
const { requireRole, requireRestaurantContext } = require('../middleware/requireRole');
const { requireStaffAuth } = require('../middleware/staffAuth');
const { uploadLogo } = require('../lib/uploads');

const router = express.Router();

router.get('/public', async (req, res) => {
  const id = Number(req.query.restaurantId);
  const slug = String(req.query.restaurant || '').trim();
  try {
    let rows;
    if (Number.isFinite(id) && id > 0) {
      [rows] = await pool.query(
        'SELECT id, name, slug, logo_url AS logoUrl FROM restaurants WHERE id = ? LIMIT 1',
        [id]
      );
    } else if (slug) {
      [rows] = await pool.query(
        'SELECT id, name, slug, logo_url AS logoUrl FROM restaurants WHERE slug = ? LIMIT 1',
        [slug]
      );
    } else {
      [rows] = await pool.query(
        'SELECT id, name, slug, logo_url AS logoUrl FROM restaurants WHERE id = 1 LIMIT 1'
      );
    }
    if (!rows.length) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json(rows[0]);
  } catch (e) {
    console.error('restaurant/public', e);
    res.status(500).json({ error: 'failed' });
  }
});

router.post(
  '/logo',
  requireStaffAuth,
  requireRole('admin'),
  requireRestaurantContext,
  (req, res, next) => {
    uploadLogo.single('logo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: 'upload_failed', message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'no_file' });
    }
    const restaurantId = req.auth.restaurantId;
    const publicPath = `/uploads/logos/${req.file.filename}`;
    try {
      await pool.query('UPDATE restaurants SET logo_url = ? WHERE id = ?', [publicPath, restaurantId]);
      res.json({ ok: true, logoUrl: publicPath });
    } catch (e) {
      console.error('restaurant/logo', e);
      res.status(500).json({ error: 'save_failed' });
    }
  }
);

module.exports = router;
