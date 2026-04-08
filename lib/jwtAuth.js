const jwt = require('jsonwebtoken');

const STAFF_COOKIE = 'vip_staff_token';
const SUPER_COOKIE = 'vip_super_token';
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-jwt-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Cookie options for HTTPS behind proxies (e.g. Cloudflare):
 * - Set TRUST_PROXY=1 on the app and COOKIE_SECURE=1 in production, or
 * - rely on req.secure / X-Forwarded-Proto: https
 * @param {import('express').Request} [req]
 */
function cookieBaseOptions(req) {
  const forwarded = req && req.headers && String(req.headers['x-forwarded-proto'] || '');
  const secure =
    process.env.COOKIE_SECURE === '1' ||
    (req && (req.secure || forwarded.split(',')[0].trim() === 'https'));
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: Boolean(secure),
  };
}

/** Match options used when setting the cookie (needed for clearCookie in some browsers). */
function cookieClearOptions(req) {
  const o = cookieBaseOptions(req);
  return { path: o.path, sameSite: o.sameSite, secure: o.secure };
}

function signStaffToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      restaurantId: user.restaurantId,
      username: user.username,
      typ: 'staff',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function signSuperToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      role: 'superadmin',
      typ: 'superadmin',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyStaffToken(token) {
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.typ !== 'staff' || !p.sub) return null;
    return {
      userId: Number(p.sub),
      role: p.role,
      restaurantId: p.restaurantId != null ? Number(p.restaurantId) : null,
      username: p.username,
    };
  } catch {
    return null;
  }
}

function verifySuperToken(token) {
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.typ !== 'superadmin' || p.role !== 'superadmin' || !p.sub) return null;
    return {
      userId: Number(p.sub),
      username: p.username,
    };
  } catch {
    return null;
  }
}

module.exports = {
  STAFF_COOKIE,
  SUPER_COOKIE,
  signStaffToken,
  signSuperToken,
  verifyStaffToken,
  verifySuperToken,
  cookieBaseOptions,
  cookieClearOptions,
};
