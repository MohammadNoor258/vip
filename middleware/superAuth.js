const { SUPER_COOKIE, verifySuperToken } = require('../lib/jwtAuth');

function requireSuperAuth(req, res, next) {
  const token = req.cookies && req.cookies[SUPER_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Superadmin login required.' });
  }
  const u = verifySuperToken(token);
  if (!u || !u.userId) {
    return res.status(401).json({ error: 'invalid_token', message: 'Invalid or expired token.' });
  }
  req.superUser = u;
  next();
}

module.exports = { requireSuperAuth };
