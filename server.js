console.log("Passenger started. PORT:", process.env.PORT);

require('dotenv').config();
const path = require('path');
const http = require('http');
const cookie = require('cookie');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

// تعطيل استدعاءات الداتابيز مؤقتاً لعزل المشكلة
// const { pool } = require('./config/database');
// const { refreshSubscriptionState, refreshAllRestaurants } = require('./services/subscriptionService');

const { ensureUploadDirs } = require('./lib/uploads');
const {
  STAFF_COOKIE,
  SUPER_COOKIE,
  verifyStaffToken,
  verifySuperToken,
} = require('./lib/jwtAuth');

// Routers - (استيراد الأساسي فقط للتجربة)
const authRouter = require('./routes/auth');
const menuRouter = require('./routes/menu');

const PORT = process.env.PORT || 8080;
const APP_DOMAIN = 'https://thaka-smarttable.com';
const PUBLIC_ROOT = path.join(__dirname, process.env.PUBLIC_HTML_DIR || 'public');

const app = express();
const server = http.createServer(app);

app.use(cookieParser());
app.use(express.json({ limit: '512kb' }));

// 🚀 مسار اختبار بسيط جداً
app.get('/test-is-alive', (req, res) => {
  res.send(`
    <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
      <h1 style="color:green;">✅ Server is ALIVE!</h1>
      <p>If you see this, Node.js is working perfectly on Hostinger.</p>
      <p>The 503 error was likely caused by the Database connection hanging.</p>
    </div>
  `);
});

app.use(express.static(PUBLIC_ROOT));

async function start() {
  console.log(`[TEST-MODE] Attempting to listen on port ${PORT}`);
  
  server.listen(PORT, () => {
    console.log(`[TEST-MODE] SUCCESS! Server is listening on port ${PORT}`);
    console.log(`[TEST-MODE] Check this URL: ${APP_DOMAIN}/test-is-alive`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[FATAL STARTUP ERROR]', err);
    process.exit(1);
  });
}

module.exports = { app, server, start };