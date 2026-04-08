const { getSubscriptionState } = require('../services/subscriptionService');
const { pool } = require('../config/database');

function resolveRestaurantId(req) {
  const fromBody = req.body && req.body.restaurantId != null ? Number(req.body.restaurantId) : NaN;
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  const fromQuery = req.query && req.query.restaurantId != null ? Number(req.query.restaurantId) : NaN;
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
  return 1;
}

async function resolveRestaurantIdAsync(req) {
  if (req._resolvedRestaurantId != null) return req._resolvedRestaurantId;
  const fromNumeric = resolveRestaurantId(req);
  const hasNumeric =
    (req.body && req.body.restaurantId != null) || (req.query && req.query.restaurantId != null);
  if (hasNumeric) {
    req._resolvedRestaurantId = fromNumeric;
    return fromNumeric;
  }
  const slug = String((req.query && req.query.restaurant) || '').trim();
  const bodySlug = String((req.body && req.body.restaurant) || '').trim();
  const targetSlug = slug || bodySlug;
  if (!targetSlug) {
    req._resolvedRestaurantId = fromNumeric;
    return fromNumeric;
  }
  try {
    const [rows] = await pool.query('SELECT id FROM restaurants WHERE slug = ? LIMIT 1', [targetSlug]);
    if (rows.length) {
      const id = Number(rows[0].id);
      req._resolvedRestaurantId = id;
      return id;
    }
  } catch {
    /* ignore and fallback */
  }
  req._resolvedRestaurantId = fromNumeric;
  return fromNumeric;
}

async function requireSubscriptionForOrders(req, res, next) {
  const restaurantId = await resolveRestaurantIdAsync(req);
  req.publicRestaurantId = restaurantId;
  req.restaurantId = restaurantId;
  getSubscriptionState(false, restaurantId).then((s) => {
    if (s.active) return next();
    return res.status(403).json({
      error: 'subscription_expired',
      message: s.message || 'Subscription expired.',
    });
  });
}

module.exports = { requireSubscriptionForOrders, resolveRestaurantId, resolveRestaurantIdAsync };
