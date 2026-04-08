const ROLES = new Set(['admin', 'manager', 'waiter', 'cashier', 'superadmin']);

function requireRole(...allowed) {
  const set = new Set(allowed);
  return (req, res, next) => {
    if (!req.auth || !req.auth.userId) {
      return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
    }
    const role = req.auth.role;
    if (!set.has(role)) {
      return res.status(403).json({ error: 'forbidden', message: 'Insufficient permissions.' });
    }
    return next();
  };
}

function requireRestaurantContext(req, res, next) {
  if (!req.auth || !req.auth.restaurantId) {
    return res.status(403).json({
      error: 'no_restaurant',
      message: 'This account is not linked to a restaurant.',
    });
  }
  return next();
}

const requireRestaurantStaff = [requireRole('admin', 'manager', 'waiter', 'cashier'), requireRestaurantContext];

module.exports = {
  requireRole,
  requireRestaurantContext,
  requireRestaurantStaff,
  ROLES,
};
