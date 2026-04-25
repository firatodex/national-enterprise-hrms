const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../utils/db');
const { authenticate, requireRole, logAudit } = require('../middleware/auth');
const { calculateMinutes, dateOnlyIST, getOpenLoan, getPendingAdvanceTotal } = require('../utils/salary');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('ADMIN', 'OWNER'));

// ========== EMPLOYEES ==========

router.get('/employees', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.employee_code, u.full_name, u.role, u.phone, u.joined_on, u.is_active,
      (SELECT daily_wage_paise FROM wage_history WHERE user_id = u.id AND effective_from <= date('now') ORDER BY effective_from DESC LIMIT 1) as current_daily_wage_paise,
      (SELECT COUNT(*) FROM punches WHERE user_id = u.id AND punch_out IS NULL) as has_open_punch
    FROM users u
    WHERE u.is_active = 1
    ORDER BY u.role DESC, u.employee_code
  `).all();

  res.json({ employees: rows });
});

router.get('/employees/:id', (req, res) => {
  const user = db.prepare('SELECT id, employee_code, full_name, role, phone, joined_on, is_active FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Employee not found' } });

  const wage = db.prepare(`
    SELECT daily_wage_paise, effective_from FROM wage_history
    WHERE user_id = ? AND effective_from <= date('now')
    ORDER BY effective_from DESC LIMIT 1
  `).get(req.params.id);

  const loan = getOpenLoan(Number(req.params.id));
  const pendingAdvance = getPendingAdvanceTotal(Number(req.params.id));

  res.json({
    employee: {
      ...user,
      current_daily_wage_paise: wage ? wage.daily_wage_paise : 0,
      wage_effective_from: wage ? wage.effective_from : null,
      active_loan_balance_paise: loan ? loan.balance_paise : 0,
      pending_advance_total_paise: pendingAdvance
    }
  });
});

router.post('/employees', requireRole('OWNER'), (req, res) => {
  const { employee_code, full_name, role, phone, initial_daily_wage_paise, wage_effective_from, initial_password } = req.body;
  if (!employee_code || !full_name || !role || !initial_daily_wage_paise || !wage_effective_from) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Missing required fields' } });
  }
  const existing = db.prepare('SELECT id FROM users WHERE employee_code = ?').get(employee_code);
  if (existing) return res.status(409).json({ error: { code: 'CODE_TAKEN', message: 'Employee code already exists' } });

  const hash = bcrypt.hashSync(initial_password || employee_code, 10);
  const result = db.prepare(`
    INSERT INTO users (employee_code, full_name, password_hash, role, phone, joined_on, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(employee_code, full_name, hash, role, phone || null, wage_effective_from, req.user.id);

  const userId = result.lastInsertRowid;
  db.prepare(`
    INSERT INTO wage_history (user_id, daily_wage_paise, effective_from, change_recorded_on, reason, changed_by)
    VALUES (?, ?, ?, date('now'), 'Initial wage', ?)
  `).run(userId, initial_daily_wage_paise, wage_effective_from, req.user.id);

  logAudit(req.user.id, req.user.role, 'EMPLOYEE_CREATE', userId, 'users', userId, null, { employee_code, full_name, role }, 'Created employee');

  res.status(201).json({ employee: { id: userId, employee_code, full_name, role } });
});

router.post('/employees/:id/reset-password', (req, res) => {
  const { new_password } = req.body;
  if (!new_password) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'New password required' } });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Employee not found' } });

  // Admin cannot reset Owner's password
  if (target.role === 'OWNER' && req.user.role !== 'OWNER') {
    return res.status(403).json({ error: { code: 'ROLE_FORBIDDEN', message: 'Cannot reset owner password' } });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).run(req.params.id);
  logAudit(req.user.id, req.user.role, 'PASSWORD_RESET', Number(req.params.id), 'users', Number(req.params.id), null, null, `Password reset for ${target.employee_code}`);
  res.json({ ok: true });
});

// ========== WAGE HISTORY ==========

router.get('/employees/:id/wage-history', (req, res) => {
  const rows = db.prepare(`
    SELECT w.*, u.full_name as changed_by_name
    FROM wage_history w
    LEFT JOIN users u ON u.id = w.changed_by
    WHERE w.user_id = ?
    ORDER BY w.effective_from DESC, w.created_at DESC
  `).all(req.params.id);
  res.json({ wage_history: rows });
});

router.post('/employees/:id/wage-change', (req, res) => {
  const { new_daily_wage_paise, effective_from, change_recorded_on, reason } = req.body;
  if (!new_daily_wage_paise || !effective_from) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Wage and effective date required' } });
  }
  const result = db.prepare(`
    INSERT INTO wage_history (user_id, daily_wage_paise, effective_from, change_recorded_on, reason, changed_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.id, new_daily_wage_paise, effective_from, change_recorded_on || new Date().toISOString().substring(0,10), reason || null, req.user.id);

  logAudit(req.user.id, req.user.role, 'WAGE_CHANGE', Number(req.params.id), 'wage_history', result.lastInsertRowid, null, { new_daily_wage_paise, effective_from }, reason);

  res.status(201).json({
    wage_history: {
      id: result.lastInsertRowid,
      daily_wage_paise: new_daily_wage_paise,
      effective_from,
      change_recorded_on
    }
  });
});

// ========== PUNCHES (admin view/edit) ==========

router.get('/employees/:id/punches', (req, res) => {
  const { from, to } = req.query;
  let query = 'SELECT * FROM punches WHERE user_id = ?';
  const params = [req.params.id];
  if (from) { query += ' AND date(punch_in) >= ?'; params.push(from); }
  if (to) { query += ' AND date(punch_in) <= ?'; params.push(to); }
  query += ' ORDER BY punch_in DESC';

  const punches = db.prepare(query).all(...params).map(p => {
    const { regular, overtime } = p.punch_out ? calculateMinutes(p.punch_in, p.punch_out) : { regular: 0, overtime: 0 };
    return { ...p, regular_minutes: regular, overtime_minutes: overtime };
  });

  res.json({ punches });
});

router.post('/employees/:id/punches/check-overlap', (req, res) => {
  const { punch_in, punch_out, exclude_punch_id } = req.body;
  const date = dateOnlyIST(punch_in);

  const dayStart = `${date}T00:00:00+05:30`;
  const dayEnd = `${date}T23:59:59.999+05:30`;

  const all = db.prepare(`
    SELECT * FROM punches WHERE user_id = ? AND punch_in >= ? AND punch_in <= ?
    ${exclude_punch_id ? 'AND id != ?' : ''}
    ORDER BY punch_in
  `).all(...(exclude_punch_id ? [req.params.id, dayStart, dayEnd, exclude_punch_id] : [req.params.id, dayStart, dayEnd]));

  const newIn = new Date(punch_in).getTime();
  const newOut = new Date(punch_out).getTime();

  const conflicts = all.filter(p => {
    const pIn = new Date(p.punch_in).getTime();
    const pOut = p.punch_out ? new Date(p.punch_out).getTime() : Infinity;
    return pIn < newOut && pOut > newIn;
  }).map(p => {
    const { regular, overtime } = p.punch_out ? calculateMinutes(p.punch_in, p.punch_out) : { regular: 0, overtime: 0 };
    return { ...p, regular_minutes: regular, overtime_minutes: overtime };
  });

  const fullDayHistory = all.map(p => {
    const { regular, overtime } = p.punch_out ? calculateMinutes(p.punch_in, p.punch_out) : { regular: 0, overtime: 0 };
    return { ...p, regular_minutes: regular, overtime_minutes: overtime };
  });

  res.json({
    has_overlap: conflicts.length > 0,
    conflicting_punches: conflicts,
    full_day_history: fullDayHistory,
    message: conflicts.length > 0 ? 'Salary for part of this time window may already be calculated. Review below.' : null
  });
});

router.post('/employees/:id/punches', (req, res) => {
  const { punch_in, punch_out, override_note, override_overlap } = req.body;
  if (!punch_in) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Punch in required' } });

  if (punch_out && new Date(punch_out).getTime() <= new Date(punch_in).getTime()) {
    return res.status(422).json({ error: { code: 'INVALID_TIME_RANGE', message: 'Punch out must be after punch in' } });
  }
  if (punch_out && dateOnlyIST(punch_in) !== dateOnlyIST(punch_out)) {
    return res.status(422).json({ error: { code: 'CROSS_DAY', message: 'Punch in and out must be on the same day' } });
  }

  // Overlap check
  if (punch_out) {
    const date = dateOnlyIST(punch_in);
    const dayStart = `${date}T00:00:00+05:30`;
    const dayEnd = `${date}T23:59:59.999+05:30`;
    const all = db.prepare(`SELECT * FROM punches WHERE user_id = ? AND punch_in >= ? AND punch_in <= ?`).all(req.params.id, dayStart, dayEnd);
    const newIn = new Date(punch_in).getTime();
    const newOut = new Date(punch_out).getTime();
    const conflicts = all.filter(p => {
      const pIn = new Date(p.punch_in).getTime();
      const pOut = p.punch_out ? new Date(p.punch_out).getTime() : Infinity;
      return pIn < newOut && pOut > newIn;
    });
    if (conflicts.length > 0 && !override_overlap) {
      return res.status(409).json({
        error: { code: 'OVERLAP_DETECTED', message: 'Overlap with existing punch. Call check-overlap endpoint and set override_overlap: true to proceed.' }
      });
    }
  }

  const result = db.prepare(`
    INSERT INTO punches (user_id, punch_in, punch_out, is_manual, entered_by, override_note)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(req.params.id, punch_in, punch_out || null, req.user.id, override_note || null);

  logAudit(req.user.id, req.user.role, override_overlap ? 'PUNCH_OVERLAP_OVERRIDE' : 'PUNCH_CREATE_MANUAL', Number(req.params.id), 'punches', result.lastInsertRowid, null, { punch_in, punch_out }, override_note);

  const { regular, overtime } = punch_out ? calculateMinutes(punch_in, punch_out) : { regular: 0, overtime: 0 };
  res.status(201).json({
    punch: { id: result.lastInsertRowid, punch_in, punch_out, regular_minutes: regular, overtime_minutes: overtime, is_manual: 1 }
  });
});

router.patch('/punches/:id', (req, res) => {
  const { punch_in, punch_out, reason } = req.body;
  const existing = db.prepare('SELECT * FROM punches WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Punch not found' } });

  const newIn = punch_in || existing.punch_in;
  const newOut = punch_out !== undefined ? punch_out : existing.punch_out;

  if (newOut && new Date(newOut).getTime() <= new Date(newIn).getTime()) {
    return res.status(422).json({ error: { code: 'INVALID_TIME_RANGE', message: 'Punch out must be after punch in' } });
  }

  db.prepare(`UPDATE punches SET punch_in = ?, punch_out = ?, updated_at = datetime('now') WHERE id = ?`).run(newIn, newOut, req.params.id);
  logAudit(req.user.id, req.user.role, 'PUNCH_EDIT', existing.user_id, 'punches', existing.id, { punch_in: existing.punch_in, punch_out: existing.punch_out }, { punch_in: newIn, punch_out: newOut }, reason);
  res.json({ ok: true });
});

router.delete('/punches/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM punches WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Punch not found' } });
  db.prepare('DELETE FROM punches WHERE id = ?').run(req.params.id);
  logAudit(req.user.id, req.user.role, 'PUNCH_DELETE', existing.user_id, 'punches', existing.id, existing, null, req.body.reason || 'Punch deleted');
  res.json({ ok: true });
});

// ========== PENDING VERIFICATIONS ==========

router.get('/pending-verifications', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id as punch_id, p.punch_in, u.id as user_id, u.employee_code, u.full_name
    FROM punches p
    JOIN users u ON u.id = p.user_id
    WHERE p.punch_out IS NULL
    ORDER BY p.punch_in ASC
  `).all();
  const now = Date.now();
  const pending = rows.map(r => ({
    ...r,
    open_duration_hours: ((now - new Date(r.punch_in).getTime()) / (1000 * 60 * 60)).toFixed(1)
  }));
  res.json({ pending, total: pending.length });
});

router.post('/pending-verifications/:punch_id/resolve', (req, res) => {
  const { action, punch_out, note } = req.body;
  const existing = db.prepare('SELECT * FROM punches WHERE id = ?').get(req.params.punch_id);
  if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Punch not found' } });
  if (existing.punch_out) return res.status(409).json({ error: { code: 'ALREADY_RESOLVED', message: 'Already closed' } });

  if (action === 'CLOSE') {
    if (!punch_out) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'punch_out required' } });
    if (new Date(punch_out).getTime() <= new Date(existing.punch_in).getTime()) {
      return res.status(422).json({ error: { code: 'INVALID_TIME_RANGE', message: 'Punch out must be after punch in' } });
    }
    if (dateOnlyIST(existing.punch_in) !== dateOnlyIST(punch_out)) {
      return res.status(422).json({ error: { code: 'CROSS_DAY', message: 'Punch out must be on the same day as punch in' } });
    }
    db.prepare(`UPDATE punches SET punch_out = ?, updated_at = datetime('now'), override_note = ? WHERE id = ?`).run(punch_out, note || null, req.params.punch_id);
    logAudit(req.user.id, req.user.role, 'PENDING_RESOLVED', existing.user_id, 'punches', existing.id, { punch_out: null }, { punch_out }, note);
    res.json({ ok: true, action: 'CLOSED' });
  } else if (action === 'MARK_ABSENT') {
    db.prepare('DELETE FROM punches WHERE id = ?').run(req.params.punch_id);
    logAudit(req.user.id, req.user.role, 'PENDING_RESOLVED_ABSENT', existing.user_id, 'punches', existing.id, existing, null, note || 'Marked as absent');
    res.json({ ok: true, action: 'MARKED_ABSENT' });
  } else {
    res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'action must be CLOSE or MARK_ABSENT' } });
  }
});

// ========== ADVANCES ==========

router.get('/employees/:id/advances', (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM advances WHERE user_id = ?';
  const params = [req.params.id];
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY given_on DESC';
  const advances = db.prepare(query).all(...params);
  const pendingTotal = advances.filter(a => a.status === 'PENDING').reduce((s, a) => s + a.amount_paise, 0);
  const lifetimeTotal = advances.reduce((s, a) => s + a.amount_paise, 0);
  res.json({ advances, pending_total_paise: pendingTotal, lifetime_total_paise: lifetimeTotal });
});

router.post('/employees/:id/advances', (req, res) => {
  const { amount_paise, given_on, note } = req.body;
  if (!amount_paise || !given_on) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Amount and date required' } });
  }
  const result = db.prepare(`
    INSERT INTO advances (user_id, amount_paise, given_on, note, given_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, amount_paise, given_on, note || null, req.user.id);
  logAudit(req.user.id, req.user.role, 'ADVANCE_CREATE', Number(req.params.id), 'advances', result.lastInsertRowid, null, { amount_paise, given_on }, note);
  res.status(201).json({ advance: { id: result.lastInsertRowid, amount_paise, given_on, note, status: 'PENDING' } });
});

router.delete('/advances/:id', requireRole('OWNER'), (req, res) => {
  const existing = db.prepare('SELECT * FROM advances WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Advance not found' } });
  if (existing.status === 'SETTLED') {
    return res.status(409).json({ error: { code: 'ALREADY_SETTLED', message: 'Cannot delete settled advance' } });
  }
  db.prepare('DELETE FROM advances WHERE id = ?').run(req.params.id);
  logAudit(req.user.id, req.user.role, 'ADVANCE_DELETE', existing.user_id, 'advances', existing.id, existing, null, req.body.reason);
  res.json({ ok: true });
});

// ========== LOANS ==========

router.get('/employees/:id/loans', (req, res) => {
  const loans = db.prepare('SELECT * FROM loans WHERE user_id = ? ORDER BY issued_on DESC').all(req.params.id);
  const enriched = loans.map(loan => {
    const paid = db.prepare('SELECT COALESCE(SUM(emi_paise), 0) as paid FROM loan_emi_payments WHERE loan_id = ?').get(loan.id).paid;
    const emiHistory = db.prepare(`
      SELECT e.emi_paise, sp.period_year, sp.period_month
      FROM loan_emi_payments e JOIN salary_periods sp ON sp.id = e.salary_period_id
      WHERE e.loan_id = ? ORDER BY sp.period_year DESC, sp.period_month DESC
    `).all(loan.id);
    return { ...loan, paid_paise: paid, balance_paise: loan.original_paise - paid, emi_history: emiHistory };
  });
  res.json({ loans: enriched });
});

router.post('/employees/:id/loans', (req, res) => {
  const { original_paise, issued_on, note } = req.body;
  if (!original_paise || !issued_on) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Amount and date required' } });
  }
  const result = db.prepare(`
    INSERT INTO loans (user_id, original_paise, issued_on, note, issued_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, original_paise, issued_on, note || null, req.user.id);
  logAudit(req.user.id, req.user.role, 'LOAN_CREATE', Number(req.params.id), 'loans', result.lastInsertRowid, null, { original_paise, issued_on }, note);
  res.status(201).json({ loan: { id: result.lastInsertRowid, original_paise, issued_on, note, is_closed: 0 } });
});

// ========== AUDIT LOG ==========

router.get('/audit-log', (req, res) => {
  const { actor_user_id, target_user_id, action_type, limit = 100 } = req.query;
  let query = `SELECT a.*, u1.full_name as actor_name, u2.full_name as target_name
    FROM audit_log a
    LEFT JOIN users u1 ON u1.id = a.actor_user_id
    LEFT JOIN users u2 ON u2.id = a.target_user_id
    WHERE 1=1`;
  const params = [];
  if (actor_user_id) { query += ' AND a.actor_user_id = ?'; params.push(actor_user_id); }
  if (target_user_id) { query += ' AND a.target_user_id = ?'; params.push(target_user_id); }
  if (action_type) { query += ' AND a.action_type = ?'; params.push(action_type); }
  query += ' ORDER BY a.created_at DESC LIMIT ?';
  params.push(Number(limit));
  const entries = db.prepare(query).all(...params);
  res.json({ entries });
});

// ========== DASHBOARD ==========

router.get('/dashboard/summary', (req, res) => {
  const totalActive = db.prepare(`SELECT COUNT(*) as c FROM users WHERE is_active = 1 AND role = 'EMPLOYEE'`).get().c;
  const punchedIn = db.prepare(`
    SELECT COUNT(DISTINCT p.user_id) as c FROM punches p
    JOIN users u ON u.id = p.user_id
    WHERE p.punch_out IS NULL AND u.role = 'EMPLOYEE' AND u.is_active = 1
  `).get().c;
  const pending = db.prepare('SELECT COUNT(*) as c FROM punches WHERE punch_out IS NULL').get().c;

  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;

  const advTotal = db.prepare(`SELECT COALESCE(SUM(amount_paise),0) as t FROM advances WHERE given_on >= ?`).get(startDate).t;
  const loanBalanceRow = db.prepare(`
    SELECT COALESCE(SUM(l.original_paise), 0) - COALESCE((SELECT SUM(emi_paise) FROM loan_emi_payments), 0) as balance
    FROM loans l WHERE l.is_closed = 0
  `).get();

  res.json({
    as_of: new Date().toISOString(),
    live: {
      currently_punched_in: punchedIn,
      total_active_employees: totalActive,
      absent_today: Math.max(0, totalActive - punchedIn),
      pending_verifications: pending
    },
    current_month: {
      year, month,
      total_advances_given_paise: advTotal,
      outstanding_loans_paise: loanBalanceRow.balance || 0
    }
  });
});

module.exports = router;
