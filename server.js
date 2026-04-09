require('dotenv').config();
const path = require('path');
const http = require('http');
const cookie = require('cookie');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const { pool } = require('./config/database');
const { refreshSubscriptionState, refreshAllRestaurants } = require('./services/subscriptionService');
const { ensureUploadDirs } = require('./lib/uploads');
const {
  STAFF_COOKIE,
  SUPER_COOKIE,
  verifyStaffToken,
  verifySuperToken,
} = require('./lib/jwtAuth');

const authRouter = require('./routes/auth');
const menuRouter = require('./routes/menu');
const tablesRouter = require('./routes/tables');
const statusRouter = require('./routes/status');
const { router: ordersRouter, emitOrders } = require('./routes/orders');
const dashboardRouter = require('./routes/dashboard');
const subscriptionApiRouter = require('./routes/subscriptionApi');
const superadminRouter = require('./routes/superadmin');
const restaurantRouter = require('./routes/restaurant');
const categoriesRouter = require('./routes/categories');
const { logSocketEmit } = require('./lib/debug');
const { perfMiddleware } = require('./middleware/perfMiddleware');

const PORT = Number(process.env.PORT || 3000);
const APP_DOMAIN = 'https://thaka-smarttable.com';
const PUBLIC_ROOT = path.join(__dirname, process.env.PUBLIC_HTML_DIR || 'public');
const LOCALES_ROOT = path.join(__dirname, 'locales');
const app = express();
const server = http.createServer(app);

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  APP_DOMAIN
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      // allow same-origin / server-side / file:// etc
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('not_allowed_by_cors'));
    },
    credentials: true,
  },
});

app.set('io', io);

app.use(cookieParser());
app.use(express.json({ limit: '512kb' }));
app.use(perfMiddleware);
ensureUploadDirs();

io.use((socket, next) => {
  const raw = socket.handshake.headers.cookie;
  const cookies = raw ? cookie.parse(raw) : {};

  const staffTok = cookies[STAFF_COOKIE];
  if (staffTok) {
    const u = verifyStaffToken(staffTok);
    if (u && u.restaurantId && ['admin', 'manager', 'waiter', 'cashier'].includes(u.role)) {
      socket.join(`admin:r${u.restaurantId}`);
      socket.join(`restaurant:${u.restaurantId}`);
      if (process.env.SOCKET_SNAPSHOT_ON_CONNECT === '1') {
        emitOrders(io, u.restaurantId)().catch((e) => console.error('emitOrders', e));
      }
    }
  }

  const superTok = cookies[SUPER_COOKIE];
  if (superTok) {
    const s = verifySuperToken(superTok);
    if (s) {
      socket.join('superadmin');
    }
  }

  // Public customers join by table session token (no cookies).
  const auth = socket.handshake.auth || {};
  const sessionToken = auth.sessionToken ? String(auth.sessionToken) : '';
  const participantId = Number(auth.participantId);
  if (sessionToken && Number.isFinite(participantId)) {
    pool.query(
      `SELECT s.id AS sessionId, s.status, s.restaurant_id AS restaurantId
       FROM table_sessions s
       JOIN session_participants p ON p.table_session_id = s.id
       WHERE s.token = ? AND p.id = ?
       LIMIT 1`,
      [sessionToken, participantId]
    )
      .then(([rows]) => {
        if (rows && rows.length && rows[0].status === 'active') {
          socket.join(`session:${sessionToken}`);
          socket.join(`public:r${rows[0].restaurantId}`);
          logSocketEmit('customer:join', {
            rooms: [`session:${sessionToken}`, `public:r${rows[0].restaurantId}`],
            participantId,
          });
        }
        next();
      })
      .catch(() => next());
    return;
  }

  next();
});

io.on('connection', (s) => {
  logSocketEmit('socket:connect', { id: s.id });
  s.on('disconnect', (reason) => {
    logSocketEmit('socket:disconnect', { id: s.id, reason });
  });
});

app.use('/api/auth', authRouter);
if (process.env.DISABLE_SUBSCRIPTION_API === '1') {
  app.use('/api/subscription', (req, res) =>
    res.status(503).json({
      error: 'route_disabled',
      message: 'Subscription API is temporarily disabled (DISABLE_SUBSCRIPTION_API=1).',
    })
  );
} else {
  app.use('/api/subscription', subscriptionApiRouter);
}
app.use('/api/superadmin', superadminRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/restaurant', restaurantRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/menu', menuRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/status', statusRouter);
app.use('/api/orders', ordersRouter);

app.get('/menu', (req, res) => {
  res.sendFile(path.join(PUBLIC_ROOT, 'menu.html'));
});

app.use('/locales', express.static(LOCALES_ROOT));
app.use('/uploads', express.static(path.join(PUBLIC_ROOT, 'uploads')));
app.use(express.static(PUBLIC_ROOT));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'invalid_json', message: 'Request body must be valid JSON.' });
  }
  const code = err && err.status ? Number(err.status) : 500;
  const prod = process.env.NODE_ENV === 'production';
  console.error('[http]', req.method, req.path, err.message || err);
  res.status(code >= 400 && code < 600 ? code : 500).json({
    error: 'internal_error',
    message: prod ? 'Something went wrong.' : err.message || 'Internal error',
  });
});

async function start() {
  if (!Number.isFinite(PORT) || PORT <= 0) throw new Error('Invalid PORT value.');
  try {
    await pool.query('SELECT NOW() AS now');
    console.log('[startup] database connectivity check passed.');
  } catch (e) {
    console.error('[startup] database connectivity check failed:', e);
    process.exit(1);
  }

  try {
    await refreshAllRestaurants(io);
  } catch (e) {
    console.error(
      '[DB] Schema missing or outdated. Run: npm run db:setup (new DB) or apply sql/migration_v2.sql (existing).'
    );
    console.error(e.message);
    process.exit(1);
  }

  const sub = await refreshSubscriptionState(io, 1);
  console.log(
    sub.active
      ? '[subscription] Active (restaurant 1).'
      : `[subscription] INACTIVE (restaurant 1) — ${sub.message || 'Orders blocked.'}`
  );

  setInterval(() => {
    refreshAllRestaurants(io).catch((err) =>
      console.error('[subscription] refresh failed:', err.message)
    );
  }, 60_000);

  server.listen(PORT, () => {
    console.log(`[startup] server listening on port ${PORT}`);
    console.log(`[startup] domain: ${APP_DOMAIN}`);
    console.log(`Customer menu: ${APP_DOMAIN}/menu?table=1`);
    console.log(`Cashier: ${APP_DOMAIN}/cashier.html`);
    console.log(`Owner dashboard: ${APP_DOMAIN}/owner.html`);
    console.log(`Legacy admin: ${APP_DOMAIN}/admin.html`);
    console.log(`Superadmin: ${APP_DOMAIN}/superadmin.html`);
    if (process.env.TRUST_PROXY === '1') {
      console.log('[http] trust proxy enabled (use behind Cloudflare / reverse proxy)');
    }
    console.log(
      '[perf] /api/dashboard/stats: one aggregated SQL on cache miss; [PERF] logs queries & dbTime. Redis: REDIS_URL. Order emit logs: VIP_LOG_ORDER_EMIT=1. Snapshot on socket connect: SOCKET_SNAPSHOT_ON_CONNECT=1 (off by default).'
    );
  });
}

module.exports = { app, server, io, start };

if (require.main === module) {
  start().catch((err) => {
    console.error('[startup] fatal bootstrap error:', err);
    process.exit(1);
  });
}
