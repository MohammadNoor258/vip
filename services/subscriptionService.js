const { pool } = require('../config/database');

const CACHE_MS = 30_000;
const cache = new Map();
const lastExpiringEmittedFor = new Map();

function msUntilExpiry(expiresAt) {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt).getTime();
  if (!Number.isFinite(exp)) return null;
  return exp - Date.now();
}

async function checkFromDatabase(restaurantId) {
  const [rows] = await pool.query(
    `SELECT id, status, plan_name, expires_at
     FROM subscription
     WHERE restaurant_id = ?
     LIMIT 1`,
    [restaurantId]
  );
  if (!rows.length) {
    return {
      active: false,
      status: null,
      reason: 'No subscription in database.',
      subscriptionId: null,
      planName: null,
      expiresAt: null,
    };
  }
  const row = rows[0];
  const exp = row.expires_at ? new Date(row.expires_at) : null;
  const expOk = exp && Number.isFinite(exp.getTime()) && exp.getTime() > Date.now();
  const active = row.status === 'active' && expOk;
  if (active) {
    return {
      active: true,
      status: row.status,
      reason: '',
      subscriptionId: row.id,
      planName: row.plan_name,
      expiresAt: row.expires_at,
    };
  }
  const s = row.status;
  return {
    active: false,
    status: s,
    reason:
      s === 'cancelled'
        ? 'Subscription cancelled.'
        : s === 'suspended'
          ? 'Subscription suspended.'
          : 'No active subscription in database.',
    subscriptionId: row.id,
    planName: row.plan_name,
    expiresAt: row.expires_at,
  };
}

async function checkFromExternalApi() {
  const url = process.env.SUBSCRIPTION_API_URL;
  if (!url) return null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { active: false, reason: `Subscription API returned ${res.status}.` };
    }
    const data = await res.json();
    if (typeof data.active === 'boolean') {
      return data.active
        ? { active: true, reason: '', expiresAt: data.expiresAt || null }
        : { active: false, reason: data.message || 'Subscription inactive.' };
    }
    if (data.expiresAt) {
      const exp = new Date(data.expiresAt);
      const active = exp.getTime() > Date.now();
      return active
        ? { active: true, reason: '', expiresAt: data.expiresAt }
        : { active: false, reason: 'Subscription expired (API).' };
    }
    return { active: false, reason: 'Invalid subscription API response.' };
  } catch (e) {
    return { active: false, reason: `Subscription API error: ${e.message}` };
  } finally {
    clearTimeout(t);
  }
}

function mergeApiWithDb(apiResult, dbRow) {
  if (!apiResult.active) {
    return {
      active: false,
      status: dbRow.status || 'active',
      reason: apiResult.reason || 'Subscription inactive.',
      subscriptionId: dbRow.subscriptionId,
      planName: dbRow.planName,
      expiresAt: apiResult.expiresAt || dbRow.expiresAt,
    };
  }
  return {
    active: true,
    status: dbRow.status || 'active',
    reason: '',
    subscriptionId: dbRow.subscriptionId,
    planName: dbRow.planName,
    expiresAt: apiResult.expiresAt || dbRow.expiresAt,
  };
}

async function refreshSubscriptionState(io, restaurantId = 1) {
  const extRestaurant = Number(process.env.SUBSCRIPTION_API_RESTAURANT_ID) || 1;
  const api = restaurantId === extRestaurant ? await checkFromExternalApi() : null;

  let result;
  if (api !== null) {
    const db = await checkFromDatabase(restaurantId);
    result = mergeApiWithDb(api, db);
    if (result.active && !result.expiresAt && db.expiresAt) {
      result.expiresAt = db.expiresAt;
    }
    if (result.active && !result.subscriptionId && db.subscriptionId) {
      result.subscriptionId = db.subscriptionId;
      result.planName = db.planName;
    }
  } else {
    result = await checkFromDatabase(restaurantId);
  }

  const message = result.active ? '' : result.reason || 'Subscription expired.';
  cache.set(restaurantId, {
    active: result.active,
    status: result.status || null,
    message,
    expiresAt: result.expiresAt || null,
    subscriptionId: result.subscriptionId,
    planName: result.planName,
    lastCheckedAt: Date.now(),
  });

  const payload = {
    active: result.active,
    status: result.status || null,
    message,
    expiresAt: result.expiresAt || null,
    subscriptionId: result.subscriptionId,
    planName: result.planName,
  };

  if (io && payload.active && payload.expiresAt) {
    const remaining = msUntilExpiry(payload.expiresAt);
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (remaining !== null && remaining > 0 && remaining <= twoDaysMs) {
      const key = `${restaurantId}:${payload.expiresAt}`;
      if (lastExpiringEmittedFor.get(restaurantId) !== key) {
        lastExpiringEmittedFor.set(restaurantId, key);
        io.to(`restaurant:${restaurantId}`).emit('subscription:expiring-soon', {
          expiresAt: payload.expiresAt,
          message: 'Subscription expires within 2 days.',
          restaurantId,
        });
      }
    }
  }

  return payload;
}

async function getSubscriptionState(force = false, restaurantId = 1) {
  const cached = cache.get(restaurantId);
  const now = Date.now();
  if (!force && cached && now - cached.lastCheckedAt < CACHE_MS) {
    return {
      active: cached.active,
      status: cached.status || null,
      message: cached.active ? '' : cached.message,
      expiresAt: cached.expiresAt,
      subscriptionId: cached.subscriptionId,
      planName: cached.planName,
    };
  }
  return refreshSubscriptionState(null, restaurantId);
}

function isSubscriptionActiveSync(restaurantId = 1) {
  const c = cache.get(restaurantId);
  return !!(c && c.active);
}

async function refreshAllRestaurants(io) {
  const [rows] = await pool.query('SELECT id FROM restaurants');
  for (const r of rows) {
    await refreshSubscriptionState(io, r.id);
  }
}

module.exports = {
  refreshSubscriptionState,
  getSubscriptionState,
  isSubscriptionActiveSync,
  refreshAllRestaurants,
};
