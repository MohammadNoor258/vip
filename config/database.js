const { Pool } = require('pg'); // حولنا من mysql2 إلى pg
const { logDb } = require('../lib/debug');
const { getStore } = require('../lib/requestContext');
require('dotenv').config();

// إعداد الاتصال بـ PostgreSQL (Supabase)
const basePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // ضروري جداً للربط مع Supabase من خارج سيرفراتهم
  },
  max: 10, // تعادل connectionLimit
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// حفظ الدالة الأصلية للاستعلام
const origQuery = basePool.query.bind(basePool);

// تعديل دالة query لإضافة نظام الـ Logging والـ Stats اللي كان عندك
basePool.query = async (...args) => {
  const t0 = Date.now();
  try {
    // في PostgreSQL، النتائج ترجع في كائن يحتوي على rows
    const res = await origQuery(...args);
    return res; 
  } finally {
    const ms = Date.now() - t0;
    // استخراج نص الـ SQL للـ Debugging
    const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
    
    logDb('query', ms, sql);
    
    const st = getStore();
    if (st) {
      st.queryCount += 1;
      st.dbTime += ms;
    }
  }
};

// تصدير الـ pool بنفس الاسم القديم عشان ما نضطر نغير في ملفات الـ routes
const pool = basePool;

module.exports = { pool };