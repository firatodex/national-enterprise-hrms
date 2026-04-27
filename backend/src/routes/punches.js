const express = require('express');
const { query, queryOne, run } = require('../utils/db');
const { authenticate, logAudit } = require('../middleware/auth');
const { isWithinGeofence, calculateMinutes, dateOnlyIST } = require('../utils/salary');

const router = express.Router();

async function getConfig() {
  return await queryOne('SELECT * FROM system_config WHERE id = 1');
}

router.get('/me/today', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const nowIso = new Date().toISOString();
    const todayStr = dateOnlyIST(nowIso);

    const openPunch = await queryOne(`
      SELECT * FROM punches WHERE user_id = $1 AND punch_out IS NULL
      ORDER BY punch_in DESC LIMIT 1
    `, [userId]);

    let hasUnresolvedOpenPunch = false;
    if (openPunch) {
      if (dateOnlyIST(openPunch.punch_in) !== todayStr) hasUnresolvedOpenPunch = true;
    }

    const dayStartUTC = new Date(todayStr + 'T00:00:00+05:30').toISOString();
    const dayEndUTC = new Date(todayStr + 'T23:59:59.999+05:30').toISOString();

    const todaySessions = await query(`
      SELECT * FROM punches WHERE user_id = $1 AND punch_in >= $2 AND punch_in <= $3
      ORDER BY punch_in
    `, [userId, dayStartUTC, dayEndUTC]);

    const sessions = todaySessions.map(p => {
      const effectiveOut = p.punch_out || nowIso;
      const { regular, overtime } = calculateMinutes(p.punch_in, effectiveOut);
      return { id: p.id, punch_in: p.punch_in, punch_out: p.punch_out, minutes_so_far: regular + overtime };
    });

    res.json({
      server_time: nowIso,
      user: { id: req.user.id, full_name: req.user.full_name, employee_code: req.user.employee_code, role: req.user.role },
      open_session: openPunch && dateOnlyIST(openPunch.punch_in) === todayStr
        ? { id: openPunch.id, punch_in: openPunch.punch_in } : null,
      today_sessions: sessions,
      has_unresolved_open_punch: hasUnresolvedOpenPunch,
      unresolved_punch: hasUnresolvedOpenPunch ? { id: openPunch.id, punch_in: openPunch.punch_in } : null
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/punches/in', authenticate, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number')
      return res.status(400).json({ error: { code: 'INVALID_LOCATION', message: 'Location required' } });

    const config = await getConfig();
    if (!isWithinGeofence(latitude, longitude, config.geofence_lat, config.geofence_lng, config.geofence_radius_meters)) {
      const R = 6371000, toRad = x => x * Math.PI / 180;
      const phi1 = toRad(config.geofence_lat), phi2 = toRad(latitude);
      const a = Math.sin(toRad(latitude - config.geofence_lat)/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(toRad(longitude - config.geofence_lng)/2)**2;
      const distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
      return res.status(422).json({ error: { code: 'GEOFENCE_VIOLATION', message: 'You must be at the workplace to punch in.', details: { distance_meters: distance } } });
    }

    const open = await queryOne('SELECT * FROM punches WHERE user_id = $1 AND punch_out IS NULL', [req.user.id]);
    if (open) return res.status(409).json({ error: { code: 'ALREADY_PUNCHED_IN', message: 'You have an open punch session.', details: { open_punch_id: open.id, punch_in: open.punch_in } } });

    const nowIso = new Date().toISOString();
    const result = await run(
      `INSERT INTO punches (user_id, punch_in, punch_in_lat, punch_in_lng) VALUES ($1,$2,$3,$4) RETURNING id`,
      [req.user.id, nowIso, latitude, longitude]
    );

    res.status(201).json({ punch: { id: result.rows[0].id, punch_in: nowIso, punch_out: null } });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/punches/out', authenticate, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const open = await queryOne('SELECT * FROM punches WHERE user_id = $1 AND punch_out IS NULL', [req.user.id]);
    if (!open) return res.status(409).json({ error: { code: 'NO_OPEN_SESSION', message: 'No open punch session to close.' } });

    const nowIso = new Date().toISOString();
    if (dateOnlyIST(open.punch_in) !== dateOnlyIST(nowIso)) {
      return res.status(422).json({ error: { code: 'CROSS_DAY_PUNCH', message: 'Punch-in was on a previous day. Admin must close this manually.', details: { punch_id: open.id, punch_in: open.punch_in } } });
    }

    await run(
      `UPDATE punches SET punch_out = $1, punch_out_lat = $2, punch_out_lng = $3, updated_at = NOW()::TEXT WHERE id = $4`,
      [nowIso, latitude || null, longitude || null, open.id]
    );

    const { regular, overtime } = calculateMinutes(open.punch_in, nowIso);
    res.json({ punch: { id: open.id, punch_in: open.punch_in, punch_out: nowIso, regular_minutes: regular, overtime_minutes: overtime } });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

module.exports = router;
