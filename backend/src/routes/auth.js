const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../utils/db');
const {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  authenticate,
  logAudit
} = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { employee_code, password } = req.body;
  if (!employee_code || !password) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Employee code and password required' } });
  }
  const user = db.prepare('SELECT * FROM users WHERE employee_code = ?').get(employee_code.trim());
  if (!user) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: { code: 'ACCOUNT_INACTIVE', message: 'Account is inactive' } });
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const sessionId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO sessions (id, user_id, refresh_token_hash, device_info)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, user.id, hashRefreshToken(refreshToken), req.headers['user-agent'] || null);

  logAudit(user.id, user.role, 'LOGIN', user.id, 'sessions', null, null, null, 'User logged in');

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      role: user.role
    }
  });
});

router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: { code: 'MISSING_TOKEN', message: 'Refresh token required' } });
  }
  const hash = hashRefreshToken(refresh_token);
  const session = db.prepare(`
    SELECT s.*, u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.refresh_token_hash = ? AND s.revoked_at IS NULL AND u.is_active = 1
  `).get(hash);

  if (!session) {
    return res.status(401).json({ error: { code: 'SESSION_REVOKED', message: 'Session invalid. Please log in again.' } });
  }

  // Rotate the refresh token
  const newRefresh = generateRefreshToken();
  db.prepare(`
    UPDATE sessions SET refresh_token_hash = ?, last_used_at = datetime('now') WHERE id = ?
  `).run(hashRefreshToken(newRefresh), session.id);

  const user = {
    id: session.user_id,
    employee_code: session.employee_code,
    role: session.role
  };
  const accessToken = generateAccessToken(user);

  res.json({ access_token: accessToken, refresh_token: newRefresh });
});

router.post('/logout', authenticate, (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    const hash = hashRefreshToken(refresh_token);
    db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE refresh_token_hash = ?`).run(hash);
  }
  logAudit(req.user.id, req.user.role, 'LOGOUT', req.user.id, 'sessions', null, null, null, 'User logged out');
  res.json({ ok: true });
});

router.post('/change-password', authenticate, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Both passwords required' } });
  }
  if (!bcrypt.compareSync(current_password, req.user.password_hash)) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' } });
  }
  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  // Revoke all other sessions
  db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).run(req.user.id);
  logAudit(req.user.id, req.user.role, 'PASSWORD_CHANGE', req.user.id, 'users', req.user.id, null, null, 'Password changed');
  res.json({ ok: true });
});

module.exports = router;
