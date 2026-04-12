require('dotenv').config();
const path = require('path');
const http = require('http');
const cookie = require('cookie');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const { PUBLIC_ROOT, LOCALES_ROOT } = require('./lib/paths');
const { parseAllowedOrigins } = require('./lib/corsOrigins');
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

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

const allowedOrigins = parseAllowedOrigins();
if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  console.warn(
    '[startup] Set CORS_ORIGINS or PUBLIC_BASE_URL for Socket.IO and browser CORS in production.'
  );
}

function healthPayload() {
  return {
    ok: true,
    service: 'restaurant-order-system',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

app.get('/health', (req, res) => {
  res.status(200).json(healthPayload());
});

app.get('/api/health', (req, res) => {
  res.status(200).json(healthPayload());
});

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
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
      message: 'Subscription API is temporarily disabled.',
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
  const code = err && err.status ? Number(err.status) : 500;
  const prod = process.env.NODE_ENV === 'production';
  console.error('[http]', req.method, req.path, err.message || err);
  res.status(code >= 400 && code < 600 ? code : 500).json({
    error: 'internal_error',
    message: prod ? 'Something went wrong.' : err.message || 'Internal error',
  });
});

async function start() {
  let dbReady = false;
  try {
    await pool.query('SELECT 1');
    dbReady = true;
    console.log('[startup] Database connection established successfully');
  } catch (e) {
    console.error(`[error] Database connection failed: ${e && e.message ? e.message : e}`);
  }

  server.listen(PORT, async () => {
    console.log(`[startup] Server listening on port ${PORT}`);
    if (process.env.DEBUG_STARTUP === '1') {
      console.log('[startup] Passenger PORT:', process.env.PORT, 'cwd:', process.cwd());
    }

    if (!dbReady) return;
    try {
      await refreshAllRestaurants(io);
      const sub = await refreshSubscriptionState(io, 1);
      console.log(sub.active ? '[subscription] Active.' : '[subscription] INACTIVE.');
      setInterval(() => {
        refreshAllRestaurants(io).catch((err) =>
          console.error('[subscription] refresh failed:', err.message)
        );
      }, 60_000);
    } catch (e) {
      console.error('[startup] Critical background error:', e.message);
    }
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[startup] fatal bootstrap error:', err);
    process.exit(1);
  });
}

module.exports = { app, server, io, start };