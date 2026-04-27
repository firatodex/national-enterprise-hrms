const db = require('./db');

const LUNCH_START_MIN = 780;   // 13:00
const LUNCH_END_MIN = 840;     // 14:00
const OT_START_MIN = 1050;     // 17:30
const WORKING_MIN_PER_DAY = 480;

// Convert ISO timestamp to IST minutes-since-midnight
function minutesSinceMidnight(isoString) {
  const d = new Date(isoString);
  // Convert to IST (UTC+5:30)
  const istMs = d.getTime() + (5.5 * 60 * 60 * 1000);
  const ist = new Date(istMs);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function dateOnlyIST(isoString) {
  const d = new Date(isoString);
  const istMs = d.getTime() + (5.5 * 60 * 60 * 1000);
  const ist = new Date(istMs);
  return ist.toISOString().substring(0, 10);
}

function isWithinGeofence(lat, lng, centerLat, centerLng, radiusM) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const phi1 = toRad(centerLat);
  const phi2 = toRad(lat);
  const dphi = toRad(lat - centerLat);
  const dlam = toRad(lng - centerLng);
  const a = Math.sin(dphi/2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c <= radiusM;
}

// Calculate regular and OT minutes for a punch pair
function calculateMinutes(punchIn, punchOut) {
  if (!punchOut) return { regular: 0, overtime: 0 };

  const inMin = minutesSinceMidnight(punchIn);
  const outMin = minutesSinceMidnight(punchOut);

  // If dates differ (cross-midnight), reject
  if (dateOnlyIST(punchIn) !== dateOnlyIST(punchOut)) {
    return { regular: 0, overtime: 0, error: 'CROSS_DAY' };
  }

  // Subtract lunch break if the shift overlaps with it
  const lunchOverlap = Math.max(0,
    Math.min(outMin, LUNCH_END_MIN) - Math.max(inMin, LUNCH_START_MIN)
  );
  const worked = Math.max(0, outMin - inMin - lunchOverlap);

  // Overtime = minutes after OT_START_MIN
  const otMinutes = Math.max(0, outMin - Math.max(inMin, OT_START_MIN));
  const overtime  = Math.min(otMinutes, worked);
  const regular   = worked - overtime;

  return { regular, overtime };
}

function getWageOnDate(userId, date) {
  const row = db.prepare(`
    SELECT daily_wage_paise FROM wage_history
    WHERE user_id = ? AND effective_from <= ?
    ORDER BY effective_from DESC LIMIT 1
  `).get(userId, date);
  return row ? row.daily_wage_paise : 0;
}

function perMinuteRate(dailyWagePaise) {
  return dailyWagePaise / WORKING_MIN_PER_DAY;
}

function computeGrossForMonth(userId, year, month) {
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  // Check for open punches in this month
  const openCount = db.prepare(`
    SELECT COUNT(*) as c FROM punches
    WHERE user_id = ? AND punch_out IS NULL
      AND punch_in >= ? AND punch_in < ?
  `).get(userId, startDate, endDate).c;

  if (openCount > 0) {
    return { blocked: true, reason: 'OPEN_PUNCHES', openCount };
  }

  const punches = db.prepare(`
    SELECT * FROM punches
    WHERE user_id = ? AND punch_out IS NOT NULL
      AND punch_in >= ? AND punch_in < ?
    ORDER BY punch_in
  `).all(userId, startDate, endDate);

  let totalRegularMin = 0, totalOvertimeMin = 0;
  let regularPaise = 0, overtimePaise = 0;
  const daysWorkedSet = new Set();

  for (const p of punches) {
    const date = dateOnlyIST(p.punch_in);
    const wage = getWageOnDate(userId, date);
    const rate = perMinuteRate(wage);
    const { regular, overtime } = calculateMinutes(p.punch_in, p.punch_out);
    totalRegularMin += regular;
    totalOvertimeMin += overtime;
    regularPaise += regular * rate;
    overtimePaise += overtime * rate;
    if (regular + overtime > 0) daysWorkedSet.add(date);
  }

  return {
    blocked: false,
    daysWorked: daysWorkedSet.size,
    regularMinutes: totalRegularMin,
    overtimeMinutes: totalOvertimeMin,
    regularSalaryPaise: Math.round(regularPaise),
    overtimeSalaryPaise: Math.round(overtimePaise),
    grossPaise: Math.round(regularPaise) + Math.round(overtimePaise)
  };
}

function getCarryForward(userId, year, month) {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const row = db.prepare(`
    SELECT ss.next_month_carry_paise
    FROM salary_slips ss
    JOIN salary_periods sp ON sp.id = ss.salary_period_id
    WHERE ss.user_id = ? AND sp.period_year = ? AND sp.period_month = ?
  `).get(userId, prevYear, prevMonth);
  return row ? row.next_month_carry_paise : 0;
}

function getPendingAdvanceTotal(userId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount_paise), 0) as total
    FROM advances WHERE user_id = ? AND status = 'PENDING'
  `).get(userId);
  return row.total;
}

function getOpenLoan(userId) {
  const loan = db.prepare(`
    SELECT * FROM loans WHERE user_id = ? AND is_closed = 0
    ORDER BY issued_on ASC LIMIT 1
  `).get(userId);
  if (!loan) return null;

  const paid = db.prepare(`
    SELECT COALESCE(SUM(emi_paise), 0) as paid FROM loan_emi_payments WHERE loan_id = ?
  `).get(loan.id).paid;

  return { ...loan, paid_paise: paid, balance_paise: loan.original_paise - paid };
}

module.exports = {
  isWithinGeofence,
  calculateMinutes,
  dateOnlyIST,
  computeGrossForMonth,
  getCarryForward,
  getPendingAdvanceTotal,
  getOpenLoan,
  getWageOnDate,
  minutesSinceMidnight,
  LUNCH_START_MIN, LUNCH_END_MIN, OT_START_MIN, WORKING_MIN_PER_DAY
};
