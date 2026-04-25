const express = require('express');
const db = require('../utils/db');
const { authenticate, logAudit } = require('../middleware/auth');
const { isWithinGeofence, calculateMinutes, dateOnlyIST } = require('../utils/salary');

const router = express.Router();

function getConfig() {
  return db.prepare('SELECT * FROM system_config WHERE id = 1').get();
}

router.get('/me/today', authenticate, (req, res) => {
  const userId = req.user.id;
  const nowIso = new Date().toISOString();
  const todayStr = dateOnlyIST(nowIso);

  // Any open punch (could be from a previous day)
  const openPunch = db.prepare(`
    SELECT * FROM punches WHERE user_id = ? AND punch_out IS NULL
    ORDER BY punch_in DESC LIMIT 1
  `).get(userId);

  let hasUnresolvedOpenPunch = false;
  if (openPunch) {
    const openDate = dateOnlyIST(openPunch.punch_in);
    if (openDate !== todayStr) hasUnresolvedOpenPunch = true;
  }

  // Today's sessions (all punches that started today IST)
  const dayStartUTC = new Date(todayStr + 'T00:00:00+05:30').toISOString();
  const dayEndUTC = new Date(todayStr + 'T23:59:59.999+05:30').toISOString();

  const todaySessions = db.prepare(`
    SELECT * FROM punches WHERE user_id = ? AND punch_in >= ? AND punch_in <= ?
    ORDER BY punch_in
  `).all(userId, dayStartUTC, dayEndUTC);

  const sessions = todaySessions.map(p => {
    const effectiveOut = p.punch_out || nowIso;
    const { regular, overtime } = calculateMinutes(p.punch_in, effectiveOut);
    return {
      id: p.id,
      punch_in: p.punch_in,
      punch_out: p.punch_out,
      minutes_so_far: regular + overtime
    };
  });

  res.json({
    server_time: nowIso,
    user: {
      id: req.user.id,
      full_name: req.user.full_name,
      employee_code: req.user.employee_code,
      role: req.user.role
    },
    open_session: openPunch && dateOnlyIST(openPunch.punch_in) === todayStr
      ? { id: openPunch.id, punch_in: openPunch.punch_in }
      : null,
    today_sessions: sessions,
    has_unresolved_open_punch: hasUnresolvedOpenPunch,
    unresolved_punch: hasUnresolvedOpenPunch
      ? { id: openPunch.id, punch_in: openPunch.punch_in }
      : null
  });
});

router.post('/punches/in', authenticate, (req, res) => {
  const { latitude, longitude } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: { code: 'INVALID_LOCATION', message: 'Location required' } });
  }

  const config = getConfig();
  if (!isWithinGeofence(latitude, longitude, config.geofence_lat, config.geofence_lng, config.geofence_radius_meters)) {
    const R = 6371000;
    const toRad = x => (x * Math.PI) / 180;
    const phi1 = toRad(config.geofence_lat), phi2 = toRad(latitude);
    const dphi = toRad(latitude - config.geofence_lat);
    const dlam = toRad(longitude - config.geofence_lng);
    const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlam/2)**2;
    const distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    return res.status(422).json({
      error: {
        code: 'GEOFENCE_VIOLATION',
        message: 'You must be at the workplace to punch in.',
        details: { distance_meters: distance }
      }
    });
  }

  // Check for any open punch
  const open = db.prepare('SELECT * FROM punches WHERE user_id = ? AND punch_out IS NULL').get(req.user.id);
  if (open) {
    return res.status(409).json({
      error: {
        code: 'ALREADY_PUNCHED_IN',
        message: 'You have an open punch session. Admin must close it first.',
        details: { open_punch_id: open.id, punch_in: open.punch_in }
      }
    });
  }

  const nowIso = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO punches (user_id, punch_in, punch_in_lat, punch_in_lng) VALUES (?, ?, ?, ?)
  `).run(req.user.id, nowIso, latitude, longitude);

  res.status(201).json({
    punch: { id: result.lastInsertRowid, punch_in: nowIso, punch_out: null }
  });
});

router.post('/punches/out', authenticate, (req, res) => {
  const { latitude, longitude } = req.body;

  const open = db.prepare('SELECT * FROM punches WHERE user_id = ? AND punch_out IS NULL').get(req.user.id);
  if (!open) {
    return res.status(409).json({
      error: { code: 'NO_OPEN_SESSION', message: 'No open punch session to close.' }
    });
  }

  const nowIso = new Date().toISOString();

  // Reject cross-day
  if (dateOnlyIST(open.punch_in) !== dateOnlyIST(nowIso)) {
    return res.status(422).json({
      error: {
        code: 'CROSS_DAY_PUNCH',
        message: 'Punch-in was on a previous day. Admin must close this manually.',
        details: { punch_id: open.id, punch_in: open.punch_in }
      }
    });
  }

  db.prepare(`
    UPDATE punches SET punch_out = ?, punch_out_lat = ?, punch_out_lng = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(nowIso, latitude || null, longitude || null, open.id);

  const { regular, overtime } = calculateMinutes(open.punch_in, nowIso);

  res.json({
    punch: {
      id: open.id,
      punch_in: open.punch_in,
      punch_out: nowIso,
      regular_minutes: regular,
      overtime_minutes: overtime
    }
  });
});

module.exports = router;
