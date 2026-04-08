const DEBUG_DB = process.env.VIP_DEBUG_DB === '1';
const DEBUG_SOCKET = process.env.VIP_DEBUG_SOCKET === '1';

/**
 * @param {string} label
 * @param {number} ms
 * @param {string} [sql]
 */
function logDb(label, ms, sql) {
  if (!DEBUG_DB) return;
  const snippet = sql ? String(sql).replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  console.log(`[db] ${label} ${ms.toFixed(1)}ms${snippet ? ` — ${snippet}` : ''}`);
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [meta]
 */
function logSocketEmit(event, meta) {
  if (!DEBUG_SOCKET) return;
  console.log('[socket:emit]', event, meta && Object.keys(meta).length ? meta : '');
}

module.exports = { logDb, logSocketEmit, DEBUG_DB, DEBUG_SOCKET };
