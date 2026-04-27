const express = require('express');
const { query, queryOne, run, pool } = require('../utils/db');
const { authenticate, requireRole, logAudit } = require('../middleware/auth');
const { computeGrossForMonth, getCarryForward, getPendingAdvanceTotal, getOpenLoan } = require('../utils/salary');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('ADMIN', 'OWNER'));

router.get('/period', async (req, res) => {
  try {
    const year = Number(req.query.year), month = Number(req.query.month);
    if (!year || !month) return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'year and month required' } });

    const period = await queryOne('SELECT * FROM salary_periods WHERE period_year = $1 AND period_month = $2', [year, month]);

    if (period && period.status === 'FINALIZED') {
      const slips = await query(`SELECT ss.*, u.employee_code, u.full_name FROM salary_slips ss JOIN users u ON u.id = ss.user_id WHERE ss.salary_period_id = $1 ORDER BY u.employee_code`, [period.id]);
      return res.json({ period, is_finalized: true, slips });
    }

    const employees = await query(`SELECT id, employee_code, full_name, role FROM users WHERE is_active = 1 AND role IN ('EMPLOYEE','ADMIN') ORDER BY role DESC, employee_code`);
    const drafts = [], blockers = [];

    for (const emp of employees) {
      const gross = await computeGrossForMonth(emp.id, year, month);
      if (gross.blocked) {
        drafts.push({ user: emp, has_blocker: true, blocker_reason: `${gross.openCount} open punch(es) needs verification` });
        blockers.push({ user: emp, reason: 'OPEN_PUNCHES' });
        continue;
      }
      const carry = await getCarryForward(emp.id, year, month);
      const pendingAdvance = await getPendingAdvanceTotal(emp.id);
      const loan = await getOpenLoan(emp.id);
      drafts.push({ user: emp, days_worked: gross.daysWorked, regular_minutes: gross.regularMinutes, overtime_minutes: gross.overtimeMinutes, regular_salary_paise: gross.regularSalaryPaise, overtime_salary_paise: gross.overtimeSalaryPaise, gross_paise: gross.grossPaise, carry_forward_paise: carry, pending_advance_total_paise: pendingAdvance, active_loan_balance_paise: loan ? loan.balance_paise : 0, suggested_advance_deduction_paise: pendingAdvance, has_blocker: false });
    }

    res.json({ period: period || { period_year: year, period_month: month, status: 'OPEN' }, is_finalized: false, blockers: { pending_verifications: blockers, can_finalize: blockers.length === 0 }, drafts });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.post('/period/finalize', async (req, res) => {
  const { year, month, entries } = req.body;
  if (!year || !month || !Array.isArray(entries))
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'year, month, entries required' } });

  const client = await pool.connect();
  try {
    // Check for open punches
    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = month === 12 ? `${year+1}-01-01` : `${year}-${String(month+1).padStart(2,'0')}-01`;
    const openPunches = await client.query(`SELECT p.user_id, u.full_name FROM punches p JOIN users u ON u.id = p.user_id WHERE p.punch_out IS NULL AND p.punch_in >= $1 AND p.punch_in < $2`, [startDate, endDate]);
    if (openPunches.rows.length > 0)
      return res.status(409).json({ error: { code: 'BLOCKERS_EXIST', message: 'Pending verifications must be resolved first', details: { blockers: openPunches.rows } } });

    const existing = await client.query('SELECT * FROM salary_periods WHERE period_year = $1 AND period_month = $2', [year, month]);
    if (existing.rows[0] && existing.rows[0].status === 'FINALIZED')
      return res.status(409).json({ error: { code: 'ALREADY_FINALIZED', message: 'Month already finalized' } });

    await client.query('BEGIN');

    let periodId;
    if (existing.rows[0]) {
      periodId = existing.rows[0].id;
    } else {
      const r = await client.query(`INSERT INTO salary_periods (period_year, period_month, status) VALUES ($1,$2,'OPEN') RETURNING id`, [year, month]);
      periodId = r.rows[0].id;
    }

    const slipIds = [];
    for (const entry of entries) {
      const gross = await computeGrossForMonth(entry.user_id, year, month);
      if (gross.blocked) throw new Error(`User ${entry.user_id} has open punches`);
      const carry = await getCarryForward(entry.user_id, year, month);
      const adv = entry.advance_deduction_paise || 0;
      const emi = entry.loan_emi_paise || 0;
      const other = entry.other_deduction_paise || 0;
      const net = gross.grossPaise + carry - adv - emi - other;
      const nextCarry = net < 0 ? net : 0;

      const slipR = await client.query(`
        INSERT INTO salary_slips (user_id, salary_period_id, days_worked, regular_minutes, overtime_minutes, regular_salary_paise, overtime_salary_paise, gross_paise, carry_forward_paise, advance_deduction_paise, loan_emi_paise, other_deduction_paise, other_deduction_note, net_paise, next_month_carry_paise, finalized_on, finalized_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()::TEXT,$16) RETURNING id
      `, [entry.user_id, periodId, gross.daysWorked, gross.regularMinutes, gross.overtimeMinutes, gross.regularSalaryPaise, gross.overtimeSalaryPaise, gross.grossPaise, carry, adv, emi, other, entry.other_deduction_note || null, net, nextCarry, req.user.id]);
      slipIds.push(slipR.rows[0].id);

      if (adv > 0) await client.query(`UPDATE advances SET status = 'SETTLED', settled_in_period = $1 WHERE user_id = $2 AND status = 'PENDING'`, [periodId, entry.user_id]);

      if (emi > 0) {
        const loan = await getOpenLoan(entry.user_id);
        if (!loan) throw new Error(`User ${entry.user_id} has no open loan but EMI > 0`);
        if (emi > loan.balance_paise) throw new Error(`EMI exceeds loan balance`);
        await client.query(`INSERT INTO loan_emi_payments (loan_id, salary_period_id, emi_paise) VALUES ($1,$2,$3)`, [loan.id, periodId, emi]);
        if (emi === loan.balance_paise) await client.query('UPDATE loans SET is_closed = 1 WHERE id = $1', [loan.id]);
      }
    }

    await client.query(`UPDATE salary_periods SET status = 'FINALIZED', finalized_on = NOW()::TEXT, finalized_by = $1 WHERE id = $2`, [req.user.id, periodId]);
    await client.query('COMMIT');

    await logAudit(req.user.id, req.user.role, 'SALARY_FINALIZED', null, 'salary_periods', periodId, null, { year, month, slips: slipIds.length }, `Finalized ${year}-${String(month).padStart(2,'0')}`);
    res.status(201).json({ period_id: periodId, slips_generated: slipIds.length, slip_ids: slipIds });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(422).json({ error: { code: 'FINALIZATION_FAILED', message: err.message } });
  } finally {
    client.release();
  }
});

router.get('/slips/:id', async (req, res) => {
  try {
    const slip = await queryOne(`SELECT ss.*, u.employee_code, u.full_name, sp.period_year, sp.period_month FROM salary_slips ss JOIN users u ON u.id = ss.user_id JOIN salary_periods sp ON sp.id = ss.salary_period_id WHERE ss.id = $1`, [req.params.id]);
    if (!slip) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Slip not found' } });
    const dailyWage = await queryOne(`SELECT daily_wage_paise FROM wage_history WHERE user_id = $1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1`, [slip.user_id, `${slip.period_year}-${String(slip.period_month).padStart(2,'0')}-01`]);
    const loans = await query('SELECT * FROM loans WHERE user_id = $1 AND is_closed = 0', [slip.user_id]);
    let loanBalanceAfter = 0;
    for (const l of loans) {
      const paid = await queryOne('SELECT COALESCE(SUM(emi_paise),0) as p FROM loan_emi_payments WHERE loan_id = $1', [l.id]);
      loanBalanceAfter += l.original_paise - parseInt(paid.p);
    }
    res.json({ slip: { ...slip, daily_wage_paise: dailyWage ? dailyWage.daily_wage_paise : 0, loan_balance_after_paise: loanBalanceAfter } });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

router.get('/employees/:id/slips', async (req, res) => {
  try {
    const slips = await query(`SELECT ss.id, ss.net_paise, ss.gross_paise, ss.finalized_on, sp.period_year, sp.period_month FROM salary_slips ss JOIN salary_periods sp ON sp.id = ss.salary_period_id WHERE ss.user_id = $1 ORDER BY sp.period_year DESC, sp.period_month DESC`, [req.params.id]);
    res.json({ slips });
  } catch (err) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } }); }
});

module.exports = router;
