const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { queryOne, run } = require('../utils/db');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { employee_code, password } = req.body;
    if (!employee_code || !password)
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'employee_code and password required' } });

    const user = await queryOne('SELECT * FROM users WHERE employee_code = $1 AND is_active = 1', [employee_code]);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);

    await run(
      `INSERT INTO sessions (id, user_id, refresh_token_hash) VALUES ($1, $2, $3)`,
      [crypto.randomUUID(), user.id, tokenHash]
    );

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, employee_code: user.employee_code, full_name: user.full_name, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token)
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'refresh_token required' } });

    const hash = hashRefreshToken(refresh_token);
    const session = await queryOne(
      'SELECT * FROM sessions WHERE refresh_token_hash = $1 AND revoked_at IS NULL', [hash]
    );
    if (!session) return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' } });

    const user = await queryOne('SELECT * FROM users WHERE id = $1 AND is_active = 1', [session.user_id]);
    if (!user) return res.status(401).json({ error: { code: 'USER_INACTIVE' } });

    const newAccess = generateAccessToken(user);
    const newRefresh = generateRefreshToken();
    await run(
      `UPDATE sessions SET refresh_token_hash = $1, last_used_at = NOW()::TEXT WHERE id = $2`,
      [hashRefreshToken(newRefresh), session.id]
    );

    res.json({ access_token: newAccess, refresh_token: newRefresh });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      const hash = hashRefreshToken(refresh_token);
      await run(`UPDATE sessions SET revoked_at = NOW()::TEXT WHERE refresh_token_hash = $1`, [hash]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

module.exports = router;
