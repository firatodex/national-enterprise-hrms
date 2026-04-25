const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../utils/db');

const JWT_SECRET = 'national-enterprise-hrms-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '1h';

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, employeeCode: user.employee_code, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken() {
  return 'rf_' + crypto.randomBytes(32).toString('hex');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Authorization required' } });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: { code: 'USER_INACTIVE', message: 'User not found or inactive' } });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' } });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'ROLE_FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };
}

function logAudit(actorId, actorRole, actionType, targetUserId, targetEntity, targetEntityId, before, after, note) {
  db.prepare(`
    INSERT INTO audit_log (actor_user_id, actor_role, action_type, target_user_id, target_entity, target_entity_id, before_data, after_data, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actorId, actorRole, actionType, targetUserId || null, targetEntity || null, targetEntityId || null,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    note || null
  );
}

module.exports = {
  JWT_SECRET,
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  authenticate,
  requireRole,
  logAudit
};
