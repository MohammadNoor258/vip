const { requireRole } = require('./requireRole');

/** Restaurant admin only (not superadmin unless extended). */
function requireAdmin(req, res, next) {
  return requireRole('admin')(req, res, next);
}

module.exports = { requireAdmin };
