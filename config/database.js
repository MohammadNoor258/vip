const mysql = require('mysql2/promise');
const { logDb } = require('../lib/debug');
const { getStore } = require('../lib/requestContext');
require('dotenv').config();

const basePool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_POOL_MAX || 10),
  queueLimit: 0,
});

function normalizeSqlAndParams(sql, params) {
  let text = String(sql || '');
  let values = params;

  if (params && !Array.isArray(params) && typeof params === 'object') {
    const orderedKeys = [];
    text = text.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
      orderedKeys.push(key);
      return '?';
    });
    values = orderedKeys.map((k) => params[k]);
  }

  if (!Array.isArray(values)) values = [];
  return { text, values };
}

async function instrumentedQuery(executor, sql, params) {
  const { text, values } = normalizeSqlAndParams(sql, params);
  const t0 = Date.now();
  try {
    return await executor(text, values);
  } finally {
    const ms = Date.now() - t0;
    const sqlText = typeof sql === 'string' ? sql : sql && sql.text ? sql.text : '';
    logDb('query', ms, sqlText);
    const st = getStore();
    if (st) {
      st.queryCount += 1;
      st.dbTime += ms;
    }
  }
}

const pool = {
  query(sql, params) {
    return instrumentedQuery((text, values) => basePool.query(text, values), sql, params);
  },
  async getConnection() {
    const conn = await basePool.getConnection();
    return {
      query(sql, params) {
        return instrumentedQuery((text, values) => conn.query(text, values), sql, params);
      },
      async beginTransaction() {
        await conn.beginTransaction();
      },
      async commit() {
        await conn.commit();
      },
      async rollback() {
        await conn.rollback();
      },
      release() {
        conn.release();
      },
    };
  },
};

module.exports = { pool };