const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const { SQL_DIR } = require('../lib/paths');
require('dotenv').config();

async function main() {
  const sqlPath = path.join(SQL_DIR, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  console.log('Schema applied:', sqlPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
