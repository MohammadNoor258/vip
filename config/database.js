const mysql = require('mysql2/promise');
const { logDb } = require('../lib/debug');
const { getStore } = require('../lib/requestContext');
require('dotenv').config();

const basePool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'restaurant_vip',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
});

const origQuery = basePool.query.bind(basePool);
basePool.query = async (...args) => {
  const t0 = Date.now();
  try {
    return await origQuery(...args);
  } finally {
    const ms = Date.now() - t0;
    const sql = typeof args[0] === 'string' ? args[0] : args[0]?.sql || '';
    logDb('query', ms, sql);
    const st = getStore();
    if (st) {
      st.queryCount += 1;
      st.dbTime += ms;
    }
  }
};

const pool = basePool;

module.exports = { pool };
