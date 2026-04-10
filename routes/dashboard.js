const express = require('express');
const { pool } = require('../config/database');
const { requireRole, requireRestaurantContext } = require('../middleware/requireRole');
const { requireStaffAuth } = require('../middleware/staffAuth');
const { getRestaurantStats, getStatsCacheMetrics } = require('../lib/statsCache');
const { setStatsCacheMeta } = require('../middleware/perfMiddleware');

const router = express.Router();

const AGGREGATED_STATS_SQL = `
SELECT
  COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND status IN ('completed','ready') THEN total END), 0) AS todayRevenue,
  COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) AS todayOrderCount,
  COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND status IN ('completed','ready') THEN total END), 0) AS weekRevenue,
  COUNT(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN 1 END) AS weekOrderCount
FROM orders
WHERE restaurant_id = ?
`;

async function fetchAggregatedStats(restaurantId) {
  const [rows] = await pool.query(AGGREGATED_STATS_SQL, [restaurantId]);
  const r = rows[0] || {};
  return {
    todayRevenue: Number(r.todayRevenue),
    todayOrderCount: Number(r.todayOrderCount),
    weekRevenue: Number(r.weekRevenue),
    weekOrderCount: Number(r.weekOrderCount),
  };
}

const staffDash = [requireStaffAuth, requireRole('admin', 'manager'), requireRestaurantContext];

async function topSellingItems(restaurantId, sinceSqlDate) {
  const [orders] = await pool.query(
    `SELECT items FROM orders
     WHERE restaurant_id = ?
       AND status IN ('completed', 'ready')
       AND DATE(created_at) >= ?`,
    [restaurantId, sinceSqlDate]
  );
  const counts = new Map();
  for (const row of orders) {
    const arr = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
    if (!Array.isArray(arr)) continue;
    for (const line of arr) {
      const id = line.menuId;
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + (Number(line.quantity) || 0));
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (!sorted.length) return [];
  const ids = sorted.map(([id]) => id);
  const [menuRows] = await pool.query(
    `SELECT id, name FROM menu WHERE restaurant_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    [restaurantId, ...ids]
  );
  const nameMap = new Map(menuRows.map((m) => [m.id, m.name]));
  return sorted.map(([menuId, qty]) => ({
    menuId,
    name: nameMap.get(menuId) || `#${menuId}`,
    quantitySold: qty,
  }));
}

router.get('/cache-metrics', ...staffDash, (req, res) => {
  res.json(getStatsCacheMetrics());
});

router.get('/stats', ...staffDash, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  try {
    const { data, hit, source } = await getRestaurantStats(restaurantId, () => fetchAggregatedStats(restaurantId));
    setStatsCacheMeta(hit, source);
    res.json(data);
  } catch (e) {
    console.error('dashboard/stats', e);
    res.status(500).json({ error: 'stats_failed', message: 'Could not load dashboard stats.' });
  }
});

router.get('/report', ...staffDash, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const range = String(req.query.range || '').toLowerCase();
  const days = range === 'monthly' ? 30 : 7;
  if (!['weekly', 'monthly'].includes(range)) {
    return res.status(400).json({ error: 'invalid_range', message: 'Use weekly or monthly.' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT DATE(created_at) AS day,
              COALESCE(SUM(CASE WHEN status IN ('completed','ready') THEN total ELSE 0 END), 0) AS revenue,
              COUNT(*) AS orderCount
       FROM orders
       WHERE restaurant_id = ?
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [restaurantId, days - 1]
    );
    const series = rows.map((r) => ({
      date: r.day,
      revenue: Number(r.revenue),
      orderCount: Number(r.orderCount),
    }));
    const totals = series.reduce(
      (acc, row) => {
        acc.revenue += row.revenue;
        acc.orderCount += row.orderCount;
        return acc;
      },
      { revenue: 0, orderCount: 0 }
    );
    res.json({ range, days, series, totals });
  } catch (e) {
    console.error('dashboard/report', e);
    res.status(500).json({ error: 'report_failed' });
  }
});

router.get('/top-items', ...staffDash, async (req, res) => {
  const restaurantId = req.auth.restaurantId;
  const range = String(req.query.range || 'week').toLowerCase();
  const since =
    range === 'today'
      ? new Date().toISOString().slice(0, 10)
      : // rolling 7 days including today
        (() => {
          const d = new Date();
          d.setDate(d.getDate() - 6);
          return d.toISOString().slice(0, 10);
        })();
  try {
    const items = await topSellingItems(restaurantId, since);
    res.json({ range, since, items });
  } catch (e) {
    console.error('dashboard/top-items', e);
    res.status(500).json({ error: 'top_items_failed' });
  }
});

module.exports = router;
