const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne, run } = require('../utils/db');
const { authenticate, requireRole, logAudit } = require('../middleware/auth');
const { calculateMinutes, dateOnlyIST, getOpenLoan, getPendingAdvanceTotal } = require('../utils/salary');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('ADMIN', 'OWNER'));

// ── EMPLOYEES ──────────────────────────────────────────────

router.get('/employees', async (req, res) => {
  try {
    const rows = await query(`
      SELECT u.id, u.employee_code, u.full_name, u.role, u.phone, u.joined_on, u.is_active,
        (SELECT daily_wage_paise FROM wage_history WHERE user_id = u.id AND effective_from <= CURRENT_DATE::TEXT ORDER BY effective_from DESC LIMIT 1) as current_daily_wage_paise,
        (SELECT COUNT(*) FROM punches WHERE user_id = u.id AND punch_out IS NULL) as has_open_punch
      FROM users u WHERE u.is_active = 1 ORDER BY u.role DESC, u.employee_code
    `);
    res.json({ employees: rows });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.get('/employees/:id', async (req, res) => {
  try {
    const user = await queryOne('SELECT id, employee_code, full_name, role, phone, joined_on, is_active FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Employee not found' } });
    const wage = await queryOne(`SELECT daily_wage_paise, effective_from FROM wage_history WHERE user_id = $1 AND effective_from <= CURRENT_DATE::TEXT ORDER BY effective_from DESC LIMIT 1`, [req.params.id]);
    const loan = await getOpenLoan(Number(req.params.id));
    const pendingAdvance = await getPendingAdvanceTotal(Number(req.params.id));
    res.json({ employee: { ...user, current_daily_wage_paise: wage ? wage.daily_wage_paise : 0, wage_effective_from: wage ? wage.effective_from : null, active_loan_balance_paise: loan ? loan.balance_paise : 0, pending_advance_total_paise: pendingAdvance } });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.post('/employees', requireRole('OWNER'), async (req, res) => {
  try {
    const { employee_code, full_name, role, phone, initial_daily_wage_paise, wage_effective_from, initial_password } = req.body;
    if (!employee_code || !full_name || !role || !initial_daily_wage_paise || !wage_effective_from)
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Missing required fields' } });
    const existing = await queryOne('SELECT id FROM users WHERE employee_code = $1', [employee_code]);
    if (existing) return res.status(409).json({ error: { code: 'CODE_TAKEN', message: 'Employee code already exists' } });
    const hash = bcrypt.hashSync(initial_password || employee_code, 10);
    const result = await run(
      `INSERT INTO users (employee_code, full_name, password_hash, role, phone, joined_on, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [employee_code, full_name, hash, role, phone || null, wage_effective_from, req.user.id]
    );
    const userId = result.rows[0].id;
    await run(`INSERT INTO wage_history (user_id, daily_wage_paise, effective_from, change_recorded_on, reason, changed_by) VALUES ($1,$2,$3,NOW()::TEXT,'Initial wage',$4)`,
      [userId, initial_daily_wage_paise, wage_effective_from, req.user.id]);
    await logAudit(req.user.id, req.user.role, 'EMPLOYEE_CREATE', userId, 'users', userId, null, { employee_code, full_name, role }, 'Created employee');
    res.status(201).json({ employee: { id: userId, employee_code, full_name, role } });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.post('/employees/:id/reset-password', async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'New password required' } });
    const target = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Employee not found' } });
    if (target.role === 'OWNER' && req.user.role !== 'OWNER')
      return res.status(403).json({ error: { code: 'ROLE_FORBIDDEN', message: 'Cannot reset owner password' } });
    const hash = bcrypt.hashSync(new_password, 10);
    await run('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    await run(`UPDATE sessions SET revoked_at = NOW()::TEXT WHERE user_id = $1 AND revoked_at IS NULL`, [req.params.id]);
    await logAudit(req.user.id, req.user.role, 'PASSWORD_RESET', Number(req.params.id), 'users', Number(req.params.id), null, null, `Password reset for ${target.employee_code}`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

// ── WAGE HISTORY ───────────────────────────────────────────

router.get('/employees/:id/wage-history', async (req, res) => {
  try {
    const rows = await query(`SELECT w.*, u.full_name as changed_by_name FROM wage_history w LEFT JOIN users u ON u.id = w.changed_by WHERE w.user_id = $1 ORDER BY w.effective_from DESC, w.created_at DESC`, [req.params.id]);
    res.json({ wage_history: rows });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.post('/employees/:id/wage-change', async (req, res) => {
  try {
    const { new_daily_wage_paise, effective_from, change_recorded_on, reason } = req.body;
    if (!new_daily_wage_paise || !effective_from)
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Wage and effective date required' } });
    const result = await run(
      `INSERT INTO wage_history (user_id, daily_wage_paise, effective_from, change_recorded_on, reason, changed_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [req.params.id, new_daily_wage_paise, effective_from, change_recorded_on || new Date().toISOString().substring(0,10), reason || null, req.user.id]
    );
    await logAudit(req.user.id, req.user.role, 'WAGE_CHANGE', Number(req.params.id), 'wage_history', result.rows[0].id, null, { new_daily_wage_paise, effective_from }, reason);
    res.status(201).json({ wage_history: { id: result.rows[0].id, daily_wage_paise: new_daily_wage_paise, effective_from, change_recorded_on } });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

// ── PUNCHES (admin) ────────────────────────────────────────

router.get('/employees/:id/punches', async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = 'SELECT * FROM punches WHERE user_id = $1';
    const params = [req.params.id];
    if (from) { sql += ` AND punch_in >= $${params.length+1}`; params.push(from); }
    if (to)   { sql += ` AND punch_in <= $${params.length+1}`; params.push(to + 'T23:59:59Z'); }
    sql += ' ORDER BY punch_in DESC';
    const punches = (await query(sql, params)).map(p => {
      const { regular, overtime } = p.punch_out ? calculateMinutes(p.punch_in, p.punch_out) : { regular: 0, overtime: 0 };
      return { ...p, regular_minutes: regular, overtime_minutes: overtime };
    });
    res.json({ punches });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.post('/employees/:id/punches', async (req, res) => {
  try {
    const { punch_in, punch_out, override_note, override_overlap } = req.body;
    if (!punch_in) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Punch in required' } });
    if (punch_out && new Date(punch_out) <= new Date(punch_in))
      return res.status(422).json({ error: { code: 'INVALID_TIME_RANGE', message: 'Punch out must be after punch in' } });
    if (punch_out && dateOnlyIST(punch_in) !== dateOnlyIST(punch_out))
      return res.status(422).json({ error: { code: 'CROSS_DAY', message: 'Must be same day' } });
    const result = await run(
      `INSERT INTO punches (user_id, punch_in, punch_out, is_manual, entered_by, override_note) VALUES ($1,$2,$3,1,$4,$5) RETURNING id`,
      [req.params.id, punch_in, punch_out || null, req.user.id, override_note || null]
    );
    await logAudit(req.user.id, req.user.role, 'PUNCH_CREATE_MANUAL', Number(req.params.id), 'punches', result.rows[0].id, null, { punch_in, punch_out }, override_note);
    const { regular, overtime } = punch_out ? calculateMinutes(punch_in, punch_out) : { regular: 0, overtime: 0 };
    res.status(201).json({ punch: { id: result.rows[0].id, punch_in, punch_out, regular_minutes: regular, overtime_minutes: overtime, is_manual: 1 } });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.patch('/punches/:id', async (req, res) => {
  try {
    const { punch_in, punch_out, reason } = req.body;
    const existing = await queryOne('SELECT * FROM punches WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Punch not found' } });
    const newIn = punch_in || existing.punch_in;
    const newOut = punch_out !== undefined ? punch_out : existing.punch_out;
    if (newOut && new Date(newOut) <= new Date(newIn))
      return res.status(422).json({ error: { code: 'INVALID_TIME_RANGE', message: 'Punch out must be after punch in' } });
    await run(`UPDATE punches SET punch_in = $1, punch_out = $2, updated_at = NOW()::TEXT WHERE id = $3`, [newIn, newOut, req.params.id]);
    await logAudit(req.user.id, req.user.role, 'PUNCH_EDIT', existing.user_id, 'punches', existing.id, { punch_in: existing.punch_in, punch_out: existing.punch_out }, { punch_in: newIn, punch_out: newOut }, reason);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.delete('/punches/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM punches WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Punch not found' } });
    await run('DELETE FROM punches WHERE id = $1', [req.params.id]);
    await logAudit(req.user.id, req.user.role, 'PUNCH_DELETE', existing.user_id, 'punches', existing.id, existing, null, req.body.reason || 'Punch deleted');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

// ── PENDING VERIFICATIONS ──────────────────────────────────

router.get('/pending-verifications', async (req, res) => {
  try {
    const rows = await query(`SELECT p.id as punch_id, p.punch_in, u.id as user_id, u.employee_code, u.full_name FROM punches p JOIN users u ON u.id = p.user_id WHERE p.punch_out IS NULL ORDER BY p.punch_in ASC`);
    const now = Date.now();
    res.json({ pending: rows.map(r => ({ ...r, open_duration_hours: ((now - new Date(r.punch_in).getTime()) / 3600000).toFixed(1) })), total: rows.length });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.post('/pending-verifications/:punch_id/resolve', async (req, res) => {
  try {
    const { action, punch_out, note } = req.body;
    const existing = await queryOne('SELECT * FROM punches WHERE id = $1', [req.params.punch_id]);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Punch not found' } });
    if (existing.punch_out) return res.status(409).json({ error: { code: 'ALREADY_RESOLVED', message: 'Already closed' } });
    if (action === 'CLOSE') {
      if (!punch_out) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'punch_out required' } });
      await run(`UPDATE punches SET punch_out = $1, updated_at = NOW()::TEXT, override_note = $2 WHERE id = $3`, [punch_out, note || null, req.params.punch_id]);
      await logAudit(req.user.id, req.user.role, 'PENDING_RESOLVED', existing.user_id, 'punches', existing.id, { punch_out: null }, { punch_out }, note);
      res.json({ ok: true, action: 'CLOSED' });
    } else if (action === 'MARK_ABSENT') {
      await run('DELETE FROM punches WHERE id = $1', [req.params.punch_id]);
      await logAudit(req.user.id, req.user.role, 'PENDING_RESOLVED_ABSENT', existing.user_id, 'punches', existing.id, existing, null, note || 'Marked as absent');
      res.json({ ok: true, action: 'MARKED_ABSENT' });
    } else {
      res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'action must be CLOSE or MARK_ABSENT' } });
    }
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

// ── ADVANCES ───────────────────────────────────────────────

router.get('/employees/:id/advances', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM advances WHERE user_id = $1';
    const params = [req.params.id];
    if (status) { sql += ` AND status = $2`; params.push(status); }
    sql += ' ORDER BY given_on DESC';
    const advances = await query(sql, params);
    const pendingTotal = advances.filter(a => a.status === 'PENDING').reduce((s, a) => s + a.amount_paise, 0);
    res.json({ advances, pending_total_paise: pendingTotal, lifetime_total_paise: advances.reduce((s, a) => s + a.amount_paise, 0) });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.post('/employees/:id/advances', async (req, res) => {
  try {
    const { amount_paise, given_on, note } = req.body;
    if (!amount_paise || !given_on) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Amount and date required' } });
    const result = await run(
      `INSERT INTO advances (user_id, amount_paise, given_on, note, given_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.params.id, amount_paise, given_on, note || null, req.user.id]
    );
    await logAudit(req.user.id, req.user.role, 'ADVANCE_CREATE', Number(req.params.id), 'advances', result.rows[0].id, null, { amount_paise, given_on }, note);
    res.status(201).json({ advance: { id: result.rows[0].id, amount_paise, given_on, note, status: 'PENDING' } });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.delete('/advances/:id', requireRole('OWNER'), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM advances WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Advance not found' } });
    if (existing.status === 'SETTLED') return res.status(409).json({ error: { code: 'ALREADY_SETTLED', message: 'Cannot delete settled advance' } });
    await run('DELETE FROM advances WHERE id = $1', [req.params.id]);
    await logAudit(req.user.id, req.user.role, 'ADVANCE_DELETE', existing.user_id, 'advances', existing.id, existing, null, req.body.reason);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

// ── LOANS ──────────────────────────────────────────────────

router.get('/employees/:id/loans', async (req, res) => {
  try {
    const loans = await query('SELECT * FROM loans WHERE user_id = $1 ORDER BY issued_on DESC', [req.params.id]);
    const enriched = await Promise.all(loans.map(async loan => {
      const paid = await queryOne('SELECT COALESCE(SUM(emi_paise), 0) as paid FROM loan_emi_payments WHERE loan_id = $1', [loan.id]);
      const emiHistory = await query(`SELECT e.emi_paise, sp.period_year, sp.period_month FROM loan_emi_payments e JOIN salary_periods sp ON sp.id = e.salary_period_id WHERE e.loan_id = $1 ORDER BY sp.period_year DESC, sp.period_month DESC`, [loan.id]);
      return { ...loan, paid_paise: parseInt(paid.paid), balance_paise: loan.original_paise - parseInt(paid.paid), emi_history: emiHistory };
    }));
    res.json({ loans: enriched });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.post('/employees/:id/loans', async (req, res) => {
  try {
    const { original_paise, issued_on, note } = req.body;
    if (!original_paise || !issued_on) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Amount and date required' } });
    const result = await run(
      `INSERT INTO loans (user_id, original_paise, issued_on, note, issued_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.params.id, original_paise, issued_on, note || null, req.user.id]
    );
    await logAudit(req.user.id, req.user.role, 'LOAN_CREATE', Number(req.params.id), 'loans', result.rows[0].id, null, { original_paise, issued_on }, note);
    res.status(201).json({ loan: { id: result.rows[0].id, original_paise, issued_on, note, is_closed: 0 } });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

// ── AUDIT LOG ──────────────────────────────────────────────

router.get('/audit-log', async (req, res) => {
  try {
    const { actor_user_id, target_user_id, action_type, limit = 100 } = req.query;
    let sql = `SELECT a.*, u1.full_name as actor_name, u2.full_name as target_name FROM audit_log a LEFT JOIN users u1 ON u1.id = a.actor_user_id LEFT JOIN users u2 ON u2.id = a.target_user_id WHERE 1=1`;
    const params = [];
    if (actor_user_id) { sql += ` AND a.actor_user_id = $${params.length+1}`; params.push(actor_user_id); }
    if (target_user_id) { sql += ` AND a.target_user_id = $${params.length+1}`; params.push(target_user_id); }
    if (action_type) { sql += ` AND a.action_type = $${params.length+1}`; params.push(action_type); }
    sql += ` ORDER BY a.created_at DESC LIMIT $${params.length+1}`;
    params.push(Number(limit));
    res.json({ entries: await query(sql, params) });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

// ── DASHBOARD ──────────────────────────────────────────────

router.get('/dashboard/summary', async (req, res) => {
  try {
    const totalActive = (await queryOne(`SELECT COUNT(*) as c FROM users WHERE is_active = 1 AND role = 'EMPLOYEE'`)).c;
    const punchedIn = (await queryOne(`SELECT COUNT(DISTINCT p.user_id) as c FROM punches p JOIN users u ON u.id = p.user_id WHERE p.punch_out IS NULL AND u.role = 'EMPLOYEE' AND u.is_active = 1`)).c;
    const pending = (await queryOne('SELECT COUNT(*) as c FROM punches WHERE punch_out IS NULL')).c;
    const istNow = new Date(Date.now() + 5.5 * 3600000);
    const year = istNow.getUTCFullYear(), month = istNow.getUTCMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const advTotal = (await queryOne(`SELECT COALESCE(SUM(amount_paise),0) as t FROM advances WHERE given_on >= $1`, [startDate])).t;
    const loanBalance = (await queryOne(`SELECT COALESCE(SUM(l.original_paise),0) - COALESCE((SELECT SUM(emi_paise) FROM loan_emi_payments),0) as balance FROM loans l WHERE l.is_closed = 0`)).balance;
    res.json({ as_of: new Date().toISOString(), live: { currently_punched_in: parseInt(punchedIn), total_active_employees: parseInt(totalActive), absent_today: Math.max(0, parseInt(totalActive) - parseInt(punchedIn)), pending_verifications: parseInt(pending) }, current_month: { year, month, total_advances_given_paise: parseInt(advTotal), outstanding_loans_paise: parseInt(loanBalance) || 0 } });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

module.exports = router;
