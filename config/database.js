const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // مهم مع Render
});

pool.connect()
  .then(() => console.log("✅ Connected to Render Postgres"))
  .catch(err => console.error("❌ Database connection failed:", err));

module.exports = { pool };
