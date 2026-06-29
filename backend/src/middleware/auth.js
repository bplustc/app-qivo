function getAuthContext(req, _res, next) {
  const driverId = req.header('x-driver-id');
  const role = req.header('x-role') || 'driver';

  req.user = {
    driverId,
    role,
  };

  next();
}

function requireDriver(req, res, next) {
  if (!req.user || !req.user.driverId) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing x-driver-id header',
    });
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'forbidden',
      message: 'Admin role required',
    });
  }

  return next();
}

module.exports = {
  getAuthContext,
  requireDriver,
  requireAdmin,
};
