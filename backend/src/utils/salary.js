const { queryOne, query } = require('./db');

const LUNCH_START_MIN = 780;
const LUNCH_END_MIN = 840;
const OT_START_MIN = 1050;
const WORKING_MIN_PER_DAY = 480;

function minutesSinceMidnight(isoString) {
  const d = new Date(isoString);
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
  const phi1 = toRad(centerLat), phi2 = toRad(lat);
  const dphi = toRad(lat - centerLat), dlam = toRad(lng - centerLng);
  const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlam/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= radiusM;
}

function calculateMinutes(punchIn, punchOut) {
  if (!punchOut) return { regular: 0, overtime: 0 };
  if (dateOnlyIST(punchIn) !== dateOnlyIST(punchOut))
    return { regular: 0, overtime: 0, error: 'CROSS_DAY' };

  const inMin = minutesSinceMidnight(punchIn);
  const outMin = minutesSinceMidnight(punchOut);
  const lunchOverlap = Math.max(0, Math.min(outMin, LUNCH_END_MIN) - Math.max(inMin, LUNCH_START_MIN));
  const worked = Math.max(0, outMin - inMin - lunchOverlap);
  const otMinutes = Math.max(0, outMin - Math.max(inMin, OT_START_MIN));
  const overtime = Math.min(otMinutes, worked);
  return { regular: worked - overtime, overtime };
}

async function getWageOnDate(userId, date) {
  const row = await queryOne(`
    SELECT daily_wage_paise FROM wage_history
    WHERE user_id = $1 AND effective_from <= $2
    ORDER BY effective_from DESC LIMIT 1
  `, [userId, date]);
  return row ? row.daily_wage_paise : 0;
}

function perMinuteRate(dailyWagePaise) {
  return dailyWagePaise / WORKING_MIN_PER_DAY;
}

async function computeGrossForMonth(userId, year, month) {
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = month === 12 ? `${year+1}-01-01` : `${year}-${String(month+1).padStart(2,'0')}-01`;

  const openRow = await queryOne(`
    SELECT COUNT(*) as c FROM punches
    WHERE user_id = $1 AND punch_out IS NULL AND punch_in >= $2 AND punch_in < $3
  `, [userId, startDate, endDate]);

  if (parseInt(openRow.c) > 0)
    return { blocked: true, reason: 'OPEN_PUNCHES', openCount: parseInt(openRow.c) };

  const punches = await query(`
    SELECT * FROM punches
    WHERE user_id = $1 AND punch_out IS NOT NULL AND punch_in >= $2 AND punch_in < $3
    ORDER BY punch_in
  `, [userId, startDate, endDate]);

  let totalRegularMin = 0, totalOvertimeMin = 0, regularPaise = 0, overtimePaise = 0;
  const daysWorkedSet = new Set();

  for (const p of punches) {
    const date = dateOnlyIST(p.punch_in);
    const wage = await getWageOnDate(userId, date);
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

async function getCarryForward(userId, year, month) {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const row = await queryOne(`
    SELECT ss.next_month_carry_paise FROM salary_slips ss
    JOIN salary_periods sp ON sp.id = ss.salary_period_id
    WHERE ss.user_id = $1 AND sp.period_year = $2 AND sp.period_month = $3
  `, [userId, prevYear, prevMonth]);
  return row ? row.next_month_carry_paise : 0;
}

async function getPendingAdvanceTotal(userId) {
  const row = await queryOne(`
    SELECT COALESCE(SUM(amount_paise), 0) as total FROM advances
    WHERE user_id = $1 AND status = 'PENDING'
  `, [userId]);
  return parseInt(row.total);
}

async function getOpenLoan(userId) {
  const loan = await queryOne(`
    SELECT * FROM loans WHERE user_id = $1 AND is_closed = 0
    ORDER BY issued_on ASC LIMIT 1
  `, [userId]);
  if (!loan) return null;
  const paid = await queryOne(
    `SELECT COALESCE(SUM(emi_paise), 0) as paid FROM loan_emi_payments WHERE loan_id = $1`,
    [loan.id]
  );
  return { ...loan, paid_paise: parseInt(paid.paid), balance_paise: loan.original_paise - parseInt(paid.paid) };
}

module.exports = {
  isWithinGeofence, calculateMinutes, dateOnlyIST, minutesSinceMidnight,
  computeGrossForMonth, getCarryForward, getPendingAdvanceTotal, getOpenLoan, getWageOnDate,
  LUNCH_START_MIN, LUNCH_END_MIN, OT_START_MIN, WORKING_MIN_PER_DAY
};
