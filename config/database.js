const { Pool } = require('pg');
const { logDb } = require('../lib/debug');
const { getStore } = require('../lib/requestContext');
require('dotenv').config();

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

function normalizeSqlAndParams(sql, params) {
  let text = String(sql || '').replace(/`([^`]+)`/g, '"$1"');
  let values = [];

  if (Array.isArray(params)) {
    let i = 0;
    text = text.replace(/\?/g, () => {
      i += 1;
      return `$${i}`;
    });
    values = params;
  } else if (params && typeof params === 'object') {
    const named = [];
    text = text.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
      named.push(key);
      return `$${named.length}`;
    });
    values = named.map((k) => params[k]);
  }

  const looksInsert = /^\s*insert\s+into\b/i.test(text);
  if (looksInsert && !/\breturning\b/i.test(text)) {
    text = `${text} RETURNING id`;
  }

  return { text, values };
}

async function mysqlLikeQuery(executor, sql, params) {
  const { text, values } = normalizeSqlAndParams(sql, params);
  const t0 = Date.now();
  try {
    const res = await executor(text, values);
    const isRead = /^\s*(select|with)\b/i.test(text);

    if (isRead) {
      return [res.rows];
    }

    const out = {
      affectedRows: res.rowCount || 0,
      rowCount: res.rowCount || 0,
      insertId: res.rows && res.rows[0] && Object.prototype.hasOwnProperty.call(res.rows[0], 'id')
        ? res.rows[0].id
        : null,
    };
    return [out];
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
    return mysqlLikeQuery((text, values) => pgPool.query(text, values), sql, params);
  },
  async getConnection() {
    const client = await pgPool.connect();
    return {
      query(sql, params) {
        return mysqlLikeQuery((text, values) => client.query(text, values), sql, params);
      },
      async beginTransaction() {
        await client.query('BEGIN');
      },
      async commit() {
        await client.query('COMMIT');
      },
      async rollback() {
        await client.query('ROLLBACK');
      },
      release() {
        client.release();
      },
    };
  },
};

module.exports = { pool };