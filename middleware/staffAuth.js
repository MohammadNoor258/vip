const { STAFF_COOKIE, verifyStaffToken } = require('../lib/jwtAuth');

function requireStaffAuth(req, res, next) {
  const token = req.cookies && req.cookies[STAFF_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Staff login required.' });
  }
  const u = verifyStaffToken(token);
  if (!u || !u.userId) {
    return res.status(401).json({ error: 'invalid_token', message: 'Invalid or expired token.' });
  }
  req.auth = u;
  next();
}

module.exports = { requireStaffAuth };
