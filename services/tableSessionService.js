const crypto = require('crypto');
const { pool } = require('../config/database');

function createSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function getOrCreateActiveSession(restaurantId, diningTableId) {
  const [rows] = await pool.query(
    `SELECT id, token, status, started_at AS startedAt
     FROM table_sessions
     WHERE restaurant_id = ? AND dining_table_id = ? AND status = 'active'
     ORDER BY started_at DESC
     LIMIT 1`,
    [restaurantId, diningTableId]
  );
  if (rows.length) return rows[0];

  const token = createSessionToken();
  const [r] = await pool.query(
    `INSERT INTO table_sessions (restaurant_id, dining_table_id, token, status)
     VALUES (?, ?, ?, 'active')`,
    [restaurantId, diningTableId, token]
  );
  return {
    id: r.insertId,
    token,
    status: 'active',
    startedAt: new Date().toISOString(),
  };
}

async function findActiveSessionByTable(restaurantId, diningTableId) {
  const [rows] = await pool.query(
    `SELECT id, token, status, started_at AS startedAt
     FROM table_sessions
     WHERE restaurant_id = ? AND dining_table_id = ? AND status = 'active'
     ORDER BY started_at DESC
     LIMIT 1`,
    [restaurantId, diningTableId]
  );
  return rows[0] || null;
}

async function endSession(restaurantId, tableSessionId, endedByUserId = null) {
  const [r] = await pool.query(
    `UPDATE table_sessions
     SET status = 'ended', ended_at = NOW(), ended_by_user_id = ?
     WHERE id = ? AND restaurant_id = ? AND status = 'active'`,
    [endedByUserId, tableSessionId, restaurantId]
  );
  return r.affectedRows > 0;
}

module.exports = {
  createSessionToken,
  getOrCreateActiveSession,
  findActiveSessionByTable,
  endSession,
};

