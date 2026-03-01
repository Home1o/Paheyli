'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'themargin-dev-secret-change-in-production';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email.toLowerCase(), name: user.name, isAdmin: !!user.is_admin, verified: !!user.verified },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function decodeToken(req) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function optionalAuth(req, res, next) { req.user = decodeToken(req) || null; next(); }
function requireAuth(req, res, next) {
  const user = decodeToken(req);
  if (!user) return res.status(401).json({ error: 'Login required.' });
  req.user = user; next();
}
function requireAdmin(req, res, next) {
  const user = decodeToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  req.user = user; next();
}

module.exports = { signToken, optionalAuth, requireAuth, requireAdmin };
