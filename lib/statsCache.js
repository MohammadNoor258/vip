/**
 * Short TTL cache for dashboard aggregate stats (memory + optional Redis).
 * Invalidate via invalidateRestaurantStats(restaurantId) on order create/update.
 */

const memory = new Map(); // key -> { value, expiresAt }

/** For short test / ops reporting (in-process only). */
let cacheHits = 0;
let cacheMisses = 0;

let redisClient = null;
let redisReady = false;

function initRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return;
  try {
    const { createClient } = require('redis');
    redisClient = createClient({ url });
    redisClient.on('error', (err) => {
      console.warn('[statsCache] Redis error:', err.message);
      redisReady = false;
    });
    redisClient
      .connect()
      .then(() => {
        redisReady = true;
        console.log('[statsCache] Redis connected');
      })
      .catch((e) => {
        console.warn('[statsCache] Redis connect failed, using memory only:', e.message);
        redisReady = false;
      });
  } catch (e) {
    console.warn('[statsCache] Redis module unavailable, using memory only:', e.message);
    redisClient = null;
  }
}

initRedis();

const TTL_SEC = Number(process.env.STATS_CACHE_TTL_SEC) || 30;

function memKey(restaurantId) {
  return `stats:${restaurantId}`;
}

function getMemory(key) {
  const row = memory.get(key);
  if (!row || row.expiresAt <= Date.now()) return null;
  return row.value;
}

function setMemory(key, value) {
  memory.set(key, { value, expiresAt: Date.now() + TTL_SEC * 1000 });
}

function delMemory(key) {
  memory.delete(key);
}

/**
 * @returns {Promise<{ data: object, hit: boolean, source: 'redis' | 'memory' | 'db' }>}
 */
async function getRestaurantStats(restaurantId, fetchFromDb) {
  const key = memKey(restaurantId);
  if (redisClient && redisReady) {
    try {
      const raw = await redisClient.get(key);
      if (raw) {
        cacheHits += 1;
        return { data: JSON.parse(raw), hit: true, source: 'redis' };
      }
    } catch (e) {
      console.warn('[statsCache] redis get:', e.message);
    }
  }
  const m = getMemory(key);
  if (m) {
    cacheHits += 1;
    return { data: m, hit: true, source: 'memory' };
  }
  cacheMisses += 1;
  const data = await fetchFromDb();
  setMemory(key, data);
  if (redisClient && redisReady) {
    try {
      await redisClient.setEx(key, TTL_SEC, JSON.stringify(data));
    } catch (e) {
      console.warn('[statsCache] redis set:', e.message);
    }
  }
  return { data, hit: false, source: 'db' };
}

async function invalidateRestaurantStats(restaurantId) {
  const key = memKey(restaurantId);
  delMemory(key);
  if (redisClient && redisReady) {
    try {
      await redisClient.del(key);
    } catch (e) {
      console.warn('[statsCache] redis del:', e.message);
    }
  }
}

function getStatsCacheMetrics() {
  const total = cacheHits + cacheMisses;
  const ratio = total ? cacheHits / total : 0;
  return { cacheHits, cacheMisses, total, hitRatio: ratio };
}

function resetStatsCacheMetrics() {
  cacheHits = 0;
  cacheMisses = 0;
}

module.exports = {
  getRestaurantStats,
  invalidateRestaurantStats,
  getStatsCacheMetrics,
  resetStatsCacheMetrics,
  TTL_SEC,
};
