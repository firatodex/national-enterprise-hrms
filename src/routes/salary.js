const express = require('express');
const db = require('../utils/db');
const { authenticate, requireRole, logAudit } = require('../middleware/auth');
const {
  computeGrossForMonth,
  getCarryForward,
  getPendingAdvanceTotal,
  getOpenLoan
} = require('../utils/salary');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('ADMIN', 'OWNER'));

// GET /salary/period?year=X&month=Y
router.get('/period', (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || !month) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'year and month required' } });
  }

  const period = db.prepare('SELECT * FROM salary_periods WHERE period_year = ? AND period_month = ?').get(year, month);

  if (period && period.status === 'FINALIZED') {
    const slips = db.prepare(`
      SELECT ss.*, u.employee_code, u.full_name
      FROM salary_slips ss JOIN users u ON u.id = ss.user_id
      WHERE ss.salary_period_id = ? ORDER BY u.employee_code
    `).all(period.id);
    return res.json({
      period,
      is_finalized: true,
      slips
    });
  }

  // OPEN: compute drafts for all active employees (including admins who are also paid)
  const employees = db.prepare(`
    SELECT id, employee_code, full_name, role FROM users
    WHERE is_active = 1 AND role IN ('EMPLOYEE','ADMIN')
    ORDER BY role DESC, employee_code
  `).all();

  const drafts = [];
  const blockers = [];

  for (const emp of employees) {
    const gross = computeGrossForMonth(emp.id, year, month);
    if (gross.blocked) {
      drafts.push({
        user: emp,
        has_blocker: true,
        blocker_reason: `${gross.openCount} open punch(es) needs verification`
      });
      blockers.push({ user: emp, reason: gross.blocker_reason || 'OPEN_PUNCHES' });
      continue;
    }

    const carry = getCarryForward(emp.id, year, month);
    const pendingAdvance = getPendingAdvanceTotal(emp.id);
    const loan = getOpenLoan(emp.id);

    drafts.push({
      user: emp,
      days_worked: gross.daysWorked,
      regular_minutes: gross.regularMinutes,
      overtime_minutes: gross.overtimeMinutes,
      regular_salary_paise: gross.regularSalaryPaise,
      overtime_salary_paise: gross.overtimeSalaryPaise,
      gross_paise: gross.grossPaise,
      carry_forward_paise: carry,
      pending_advance_total_paise: pendingAdvance,
      active_loan_balance_paise: loan ? loan.balance_paise : 0,
      suggested_advance_deduction_paise: pendingAdvance,
      has_blocker: false
    });
  }

  res.json({
    period: period || { period_year: year, period_month: month, status: 'OPEN' },
    is_finalized: false,
    blockers: {
      pending_verifications: blockers,
      can_finalize: blockers.length === 0
    },
    drafts
  });
});

// POST /salary/period/preview
router.post('/period/preview', (req, res) => {
  const { year, month, entries } = req.body;
  if (!year || !month || !Array.isArray(entries)) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'year, month, entries required' } });
  }

  const previews = entries.map(e => {
    const gross = computeGrossForMonth(e.user_id, year, month);
    if (gross.blocked) {
      return { user_id: e.user_id, blocked: true };
    }
    const carry = getCarryForward(e.user_id, year, month);
    const subtotal = gross.grossPaise + carry;
    const net = subtotal - (e.advance_deduction_paise || 0) - (e.loan_emi_paise || 0) - (e.other_deduction_paise || 0);
    const nextCarry = net < 0 ? net : 0;
    return {
      user_id: e.user_id,
      gross_paise: gross.grossPaise,
      carry_forward_paise: carry,
      advance_deduction_paise: e.advance_deduction_paise || 0,
      loan_emi_paise: e.loan_emi_paise || 0,
      other_deduction_paise: e.other_deduction_paise || 0,
      net_paise: net,
      next_month_carry_paise: nextCarry
    };
  });

  res.json({ previews });
});

// POST /salary/period/finalize — atomic transaction
router.post('/period/finalize', (req, res) => {
  const { year, month, entries } = req.body;
  if (!year || !month || !Array.isArray(entries)) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'year, month, entries required' } });
  }

  // Check blockers
  const allOpen = db.prepare(`
    SELECT p.user_id, u.full_name FROM punches p
    JOIN users u ON u.id = p.user_id
    WHERE p.punch_out IS NULL
      AND strftime('%Y', p.punch_in) = ?
      AND strftime('%m', p.punch_in) = ?
  `).all(String(year), String(month).padStart(2, '0'));

  if (allOpen.length > 0) {
    return res.status(409).json({
      error: {
        code: 'BLOCKERS_EXIST',
        message: 'Pending verifications must be resolved first',
        details: { blockers: allOpen }
      }
    });
  }

  const existing = db.prepare('SELECT * FROM salary_periods WHERE period_year = ? AND period_month = ?').get(year, month);
  if (existing && existing.status === 'FINALIZED') {
    return res.status(409).json({ error: { code: 'ALREADY_FINALIZED', message: 'Month already finalized' } });
  }

  const txn = db.transaction(() => {
    let periodId;
    if (existing) {
      periodId = existing.id;
    } else {
      periodId = db.prepare(`INSERT INTO salary_periods (period_year, period_month, status) VALUES (?, ?, 'OPEN')`).run(year, month).lastInsertRowid;
    }

    const slipIds = [];

    for (const entry of entries) {
      const gross = computeGrossForMonth(entry.user_id, year, month);
      if (gross.blocked) {
        throw new Error(`User ${entry.user_id} has open punches`);
      }
      const carry = getCarryForward(entry.user_id, year, month);
      const adv = entry.advance_deduction_paise || 0;
      const emi = entry.loan_emi_paise || 0;
      const other = entry.other_deduction_paise || 0;

      const net = gross.grossPaise + carry - adv - emi - other;
      const nextCarry = net < 0 ? net : 0;

      const slipResult = db.prepare(`
        INSERT INTO salary_slips (
          user_id, salary_period_id,
          days_worked, regular_minutes, overtime_minutes,
          regular_salary_paise, overtime_salary_paise, gross_paise,
          carry_forward_paise, advance_deduction_paise, loan_emi_paise,
          other_deduction_paise, other_deduction_note,
          net_paise, next_month_carry_paise,
          finalized_on, finalized_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).run(
        entry.user_id, periodId,
        gross.daysWorked, gross.regularMinutes, gross.overtimeMinutes,
        gross.regularSalaryPaise, gross.overtimeSalaryPaise, gross.grossPaise,
        carry, adv, emi, other, entry.other_deduction_note || null,
        net, nextCarry, req.user.id
      );
      slipIds.push(slipResult.lastInsertRowid);

      // Mark pending advances settled
      if (adv > 0) {
        db.prepare(`UPDATE advances SET status = 'SETTLED', settled_in_period = ? WHERE user_id = ? AND status = 'PENDING'`).run(periodId, entry.user_id);
      }

      // Record EMI
      if (emi > 0) {
        const loan = getOpenLoan(entry.user_id);
        if (!loan) throw new Error(`User ${entry.user_id} has no open loan but EMI > 0`);
        if (emi > loan.balance_paise) throw new Error(`EMI ${emi} exceeds loan balance ${loan.balance_paise}`);
        db.prepare(`INSERT INTO loan_emi_payments (loan_id, salary_period_id, emi_paise) VALUES (?, ?, ?)`).run(loan.id, periodId, emi);
        if (emi === loan.balance_paise) {
          db.prepare('UPDATE loans SET is_closed = 1 WHERE id = ?').run(loan.id);
        }
      }
    }

    db.prepare(`UPDATE salary_periods SET status = 'FINALIZED', finalized_on = datetime('now'), finalized_by = ? WHERE id = ?`).run(req.user.id, periodId);

    return { periodId, slipIds };
  });

  try {
    const { periodId, slipIds } = txn();
    logAudit(req.user.id, req.user.role, 'SALARY_FINALIZED', null, 'salary_periods', periodId, null, { year, month, slips: slipIds.length }, `Finalized ${year}-${String(month).padStart(2,'0')}`);
    res.status(201).json({ period_id: periodId, slips_generated: slipIds.length, slip_ids: slipIds });
  } catch (err) {
    res.status(422).json({ error: { code: 'FINALIZATION_FAILED', message: err.message } });
  }
});

// GET /salary/slips/:id
router.get('/slips/:id', (req, res) => {
  const slip = db.prepare(`
    SELECT ss.*, u.employee_code, u.full_name, sp.period_year, sp.period_month
    FROM salary_slips ss
    JOIN users u ON u.id = ss.user_id
    JOIN salary_periods sp ON sp.id = ss.salary_period_id
    WHERE ss.id = ?
  `).get(req.params.id);
  if (!slip) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Slip not found' } });

  const dailyWage = db.prepare(`
    SELECT daily_wage_paise FROM wage_history
    WHERE user_id = ? AND effective_from <= date(?, 'start of month')
    ORDER BY effective_from DESC LIMIT 1
  `).get(slip.user_id, `${slip.period_year}-${String(slip.period_month).padStart(2,'0')}-01`);

  // Loan balance after this slip
  const loans = db.prepare('SELECT * FROM loans WHERE user_id = ? AND is_closed = 0').all(slip.user_id);
  let loanBalanceAfter = 0;
  for (const l of loans) {
    const paid = db.prepare('SELECT COALESCE(SUM(emi_paise),0) as p FROM loan_emi_payments WHERE loan_id = ?').get(l.id).p;
    loanBalanceAfter += l.original_paise - paid;
  }

  res.json({
    slip: { ...slip, daily_wage_paise: dailyWage ? dailyWage.daily_wage_paise : 0, loan_balance_after_paise: loanBalanceAfter }
  });
});

// GET /employees/:id/slips
router.get('/employees/:id/slips', (req, res) => {
  const slips = db.prepare(`
    SELECT ss.id, ss.net_paise, ss.gross_paise, ss.finalized_on, sp.period_year, sp.period_month
    FROM salary_slips ss JOIN salary_periods sp ON sp.id = ss.salary_period_id
    WHERE ss.user_id = ? ORDER BY sp.period_year DESC, sp.period_month DESC
  `).all(req.params.id);
  res.json({ slips });
});

module.exports = router;
