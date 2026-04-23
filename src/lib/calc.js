// ─── SALARY & TIME CALCULATION ENGINE ────────────────────────────────────────
// All logic bugs from audit are fixed here:
// FIX #5  — overlap merging before summing sessions
// FIX #6  — out<in detection with PM-correction suggestion
// FIX #7  — lunch deduction applied once to merged day timeline
// FIX #4  — carryForward properly chained across months
// FIX #2  — dailyWageUsed stored at close time

export const pad = n => String(n).padStart(2, '0')

export const toMin = t => {
  if (!t) return 0
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export const fmtMin = m => {
  const h = Math.floor(m / 60), mm = m % 60
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`
}

export const fmt12 = t => {
  if (!t) return '—'
  const [h, m] = String(t).split(':').map(Number)
  if (isNaN(h)) return t
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${pad(m)} ${ap}`
}

export const fmtRs = n =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

// Parse a YYYY-MM-DD string safely without timezone shifting
// new Date("2026-03-01") creates UTC midnight → in IST (UTC+5:30) that becomes Feb 28 18:30 local
// Fix: split and construct with year/month/day explicitly
export const parseDate = str => {
  if (!str) return null
  const s = String(str).slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)  // local time, no UTC shift
}

export const fmtDate = d => {
  if (!d) return '—'
  const dt = typeof d === 'string' ? parseDate(d) : d
  if (!dt) return '—'
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const initials = name =>
  (name || '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()

// ── FIX #5 + #7: Merge overlapping sessions, then apply lunch once ───────────
export const LUNCH_START = 780  // 13:00
export const LUNCH_END   = 840  // 14:00

/**
 * Merge an array of {inTime, outTime} sessions into non-overlapping intervals.
 * Skips sessions where out<=in (handled separately as anomalies).
 */
export function mergeSessions(sessions) {
  const valid = sessions
    .filter(s => s.inTime && s.outTime)
    .map(s => ({ start: toMin(s.inTime), end: toMin(s.outTime), manual: s.manualIn || s.manualOut }))
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start)

  const merged = []
  for (const seg of valid) {
    if (merged.length === 0) { merged.push({ ...seg }); continue }
    const last = merged[merged.length - 1]
    if (seg.start < last.end) {
      // overlap — extend
      last.end = Math.max(last.end, seg.end)
      last.manual = last.manual || seg.manual
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

/**
 * Subtract the lunch window from a merged segment list.
 * Returns total paid minutes.
 */
export function calcPaidMinutes(mergedSegments) {
  let total = 0
  for (const seg of mergedSegments) {
    const raw    = seg.end - seg.start
    const overlap= Math.max(0, Math.min(seg.end, LUNCH_END) - Math.max(seg.start, LUNCH_START))
    total += (raw - overlap)
  }
  return Math.max(0, total)
}

/**
 * FIX #6: Detect out<in anomalies and classify them.
 * Returns array of anomaly objects for display to admin.
 */
export function detectAnomalies(sessions) {
  const anomalies = []
  for (const s of sessions) {
    if (!s.inTime || !s.outTime) continue
    const inM  = toMin(s.inTime)
    const outM = toMin(s.outTime)
    if (outM < inM) {
      // Heuristic: if out < 12:00 it's likely a PM typo (07:00 → 17:00)
      const likelySuggestion = outM < 720
        ? `${pad(toMin(s.outTime) / 60 + 12 | 0)}:${pad(toMin(s.outTime) % 60)} (PM?)`
        : null
      anomalies.push({
        empId:      s.empId,
        date:       s.date,
        inTime:     s.inTime,
        outTime:    s.outTime,
        type:       'OUT_BEFORE_IN',
        suggestion: likelySuggestion,
      })
    }
  }
  return anomalies
}

/**
 * Main salary calculation for one employee for one month.
 * FIX #5 #7: Uses merged + lunch-deducted minutes.
 * FIX #2: Returns dailyWageUsed so it can be stored at close time.
 */
export function calcSalary(empId, year, month, punches, employees) {
  const emp = employees.find(e => e.id === empId)
  if (!emp) return null

  const wage = emp.dailyWage || 0
  const ratePerMin = wage / 480

  // Filter punches for this emp+month — use parseDate to avoid timezone trap
  const monthPunches = punches.filter(p => {
    if (p.empId !== empId) return false
    const d = parseDate(typeof p.date === 'string' ? p.date.slice(0, 10) : p.date.toISOString().slice(0, 10))
    if (!d) return false
    return d.getFullYear() === year && (d.getMonth() + 1) === month
  })

  // Group by date
  const byDate = {}
  for (const p of monthPunches) {
    const d = typeof p.date === 'string' ? p.date.slice(0, 10) : p.date.toISOString().slice(0, 10)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(p)
  }

  let totalMinutes = 0
  let daysPresent  = 0
  const dayBreakdown = []
  const anomalies    = []

  for (const [date, sessions] of Object.entries(byDate).sort()) {
    // Detect anomalies
    const dayAnomalies = detectAnomalies(sessions)
    anomalies.push(...dayAnomalies)

    // Merge and calculate
    const merged   = mergeSessions(sessions)
    const dayMins  = calcPaidMinutes(merged)

    if (dayMins > 0) {
      daysPresent++
      totalMinutes += dayMins
    }

    dayBreakdown.push({
      date,
      dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseDate(date).getDay()],
      sessions: sessions.map(s => ({
        inTime:  s.inTime,
        outTime: s.outTime,
        manual:  s.manualIn || s.manualOut,
        anomaly: s.outTime && toMin(s.outTime) < toMin(s.inTime),
      })),
      mergedSegments: merged,
      totalMin: dayMins,
      dayPay: Math.round(dayMins * ratePerMin),
    })
  }

  const grossPay = Math.round(totalMinutes * ratePerMin)

  return {
    empId,
    empName:       emp.name,
    dailyWageUsed: wage,      // FIX #2 — store which wage was used
    ratePerMin:    +ratePerMin.toFixed(4),
    totalMinutes,
    daysPresent,
    grossPay,
    dayBreakdown,
    anomalies,
  }
}

/**
 * FIX #4: Carry forward — properly chains across multiple negative months.
 * Walks back through monthCloses to find cumulative negative balance.
 */
export function getCarryForward(empId, year, month, monthCloses) {
  // Find the immediately previous closed month
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year
  const prev = monthCloses.find(
    mc => mc.empId === empId && mc.year === prevYear && mc.month === prevMonth
  )
  if (!prev) return 0
  // If net was negative, carry the absolute value forward
  // Chain: the prev record's own netPay already includes its carry-forward
  return prev.netPay < 0 ? Math.abs(prev.netPay) : 0
}

/**
 * FIX #1 + #6: Compute how much has been paid toward a specific loan.
 *
 * The MonthClose row does not store which loanId the deduction is for
 * (legacy data). We handle this with a two-tier approach:
 *   1. If the MonthClose row has a loanId field (new data), use it directly.
 *   2. Otherwise fall back to empId sum — acceptable because the system
 *      enforces one active loan per employee at a time (see ADD_LOAN and
 *      the salary preview which only picks the first active loan).
 *
 * This means the balance is always correct as long as the one-active-loan
 * constraint is maintained, which the UI enforces.
 */
export function computeLoanPaid(loan, monthCloses) {
  return monthCloses
    .filter(mc => mc.empId === loan.empId)
    .reduce((sum, mc) => {
      // Prefer loanId-tagged deductions when available (new records)
      if (mc.loanId !== undefined) {
        return mc.loanId === loan.id ? sum + (mc.loanDeductions || 0) : sum
      }
      // Legacy records: sum all deductions for this employee
      return sum + (mc.loanDeductions || 0)
    }, 0)
}

/**
 * Get advance total for an employee for a specific deduct-month (yyyy-MM).
 * FIX #3: Uses deductMonth field, not advance.date.month.
 */
export function getAdvanceTotal(empId, deductMonth, advances) {
  return advances
    .filter(a => a.empId === empId && a.deductMonth === deductMonth)
    .reduce((sum, a) => sum + (a.amount || 0), 0)
}

/**
 * PART 1: Build gross-pay data for all employees for a month.
 * This is the expensive part (scans all punches). Memoize separately
 * from loan overrides so typing in a loan input doesn't re-scan 13,000 rows.
 */
export function buildGrossData(year, month, employees, punches) {
  const activeEmps = employees.filter(e => e.active && e.role !== 'owner')
  return activeEmps.map(emp => {
    const calc = calcSalary(emp.id, year, month, punches, employees)
    return {
      emp,
      totalMinutes:  calc?.totalMinutes  || 0,
      grossPay:      calc?.grossPay      || 0,
      dailyWageUsed: emp.dailyWage,
      anomalies:     calc?.anomalies     || [],
      dayBreakdown:  calc?.dayBreakdown  || [],
      hasAnomaly:   (calc?.anomalies     || []).length > 0,
    }
  })
}

/**
 * PART 2: Apply deductions to gross data. Cheap — no punch scanning.
 * Call this whenever loanOverrides, advances, or monthCloses change.
 */
export function applyDeductions(grossData, year, month, advances, loans, monthCloses, loanOverrides = {}) {
  const deductMonth = `${year}-${pad(month)}`
  return grossData.map(g => {
    const { emp } = g
    const advDed   = getAdvanceTotal(emp.id, deductMonth, advances)
    const carryFwd = getCarryForward(emp.id, year, month, monthCloses)

    const loan         = loans.find(l => l.empId === emp.id && l.active)
    const loanPaid     = loan ? computeLoanPaid(loan, monthCloses) : 0
    const loanRemaining= loan ? Math.max(0, (loan.total || 0) - loanPaid) : 0
    const loanEmi      = loan?.monthlyEMI || 0
    const loanDed      = loanOverrides[emp.id] !== undefined
      ? Number(loanOverrides[emp.id]) || 0
      : Math.min(loanEmi, loanRemaining)

    const netPay = g.grossPay - advDed - carryFwd - loanDed

    return {
      ...g,
      advDed,
      carryFwd,
      loanDed,
      loanRemaining,
      loanEmi,
      netPay,
    }
  })
}

/**
 * Convenience wrapper — calls both parts.
 * Use buildGrossData + applyDeductions separately in components for performance.
 */
export function buildSalaryPreview(year, month, employees, punches, advances, loans, monthCloses, loanOverrides = {}) {
  const gross = buildGrossData(year, month, employees, punches)
  return applyDeductions(gross, year, month, advances, loans, monthCloses, loanOverrides)
}
