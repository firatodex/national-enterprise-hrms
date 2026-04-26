const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../utils/db');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { employee_code, password } = req.body;
  if (!employee_code || !password)
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'employee_code and password required' } });

  const user = db.prepare('SELECT * FROM users WHERE employee_code = ? AND is_active = 1').get(employee_code);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  db.prepare(`INSERT INTO sessions (id, user_id, refresh_token_hash) VALUES (?, ?, ?)`)
    .run(require('crypto').randomUUID(), user.id, tokenHash);

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: { id: user.id, employee_code: user.employee_code, full_name: user.full_name, role: user.role }
  });
});

router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'refresh_token required' } });

  const hash = hashRefreshToken(refresh_token);
  const session = db.prepare('SELECT * FROM sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL').get(hash);
  if (!session) return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' } });

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(session.user_id);
  if (!user) return res.status(401).json({ error: { code: 'USER_INACTIVE' } });

  const newAccess = generateAccessToken(user);
  const newRefresh = generateRefreshToken();
  db.prepare(`UPDATE sessions SET refresh_token_hash = ?, last_used_at = datetime('now') WHERE id = ?`)
    .run(hashRefreshToken(newRefresh), session.id);

  res.json({ access_token: newAccess, refresh_token: newRefresh });
});

router.post('/logout', (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    const hash = hashRefreshToken(refresh_token);
    db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE refresh_token_hash = ?`).run(hash);
  }
  res.json({ ok: true });
});

module.exports = router;
