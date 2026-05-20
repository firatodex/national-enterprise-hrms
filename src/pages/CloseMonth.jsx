import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiCloseMonth } from '../api'
import {
  calcSalary, getAdvanceTotal, getCarryForward,
  fmtRs, fmtDate, fmtMonthYear, todayStr, pad
} from '../utils/helpers'

// Get loan EMI deductions for an employee for a specific month
// Reads from loan_payments where month = "YYYY-MM"
function getLoanDeductionTotal(empId, yr, mo, loanPayments) {
  const monthKey = `${yr}-${pad(mo)}`
  return loanPayments
    .filter((p) => p.emp_id === empId && p.month === monthKey)
    .reduce((s, p) => s + Number(p.amount || 0), 0)
}

export default function CloseMonth() {
  const { currentUser, db, refresh } = useAuth()
  const showToast = useToast()
  const today = todayStr()
  const [curYr, curMo] = today.split('-').map(Number)
  const [selYr, setSelYr] = useState(curYr)
  const [selMo, setSelMo] = useState(curMo)
  const [busy, setBusy] = useState(false)

  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)

  const monthOptions = []
  for (let i = 0; i < 12; i++) {
    let mo = curMo - i, yr = curYr
    if (mo <= 0) { mo += 12; yr -= 1 }
    monthOptions.push({ yr, mo })
  }

  const alreadyClosed = db.monthCloses.some(
    (mc) => Number(mc.year) === selYr && Number(mc.month) === selMo
  )
  const closedRecords = db.monthCloses.filter(
    (mc) => Number(mc.year) === selYr && Number(mc.month) === selMo
  )

  const handleSelChange = (val) => {
    const [yr, mo] = val.split('-').map(Number)
    setSelYr(yr); setSelMo(mo)
  }

  // Calculate all figures for one employee
  const calcEmployee = (e) => {
    const s = calcSalary(e.id, selYr, selMo, db.punches, db.users)
    const grossPay = s ? s.grossPay : 0
    const totalMinutes = s ? s.totalMinutes : 0
    const daysPresent = s ? s.daysPresent : 0
    const advDed = getAdvanceTotal(e.id, selYr, selMo, db.advances)
    const loanDed = getLoanDeductionTotal(e.id, selYr, selMo, db.loanPayments)
    const carryFwd = getCarryForward(e.id, selYr, selMo, db.monthCloses)
    const netPay = grossPay - advDed - loanDed - carryFwd
    return { grossPay, totalMinutes, daysPresent, advDed, loanDed, carryFwd, netPay }
  }

  const doClose = async () => {
    // Double-close protection
    if (alreadyClosed) {
      showToast('This month is already closed', 'var(--red)')
      return
    }

    if (!window.confirm(
      `Finalise salaries for ${fmtMonthYear(selYr, selMo)}?\n\n` +
      `This will lock all ${emps.length} employee salaries and cannot be undone.`
    )) return

    const salaryData = emps.map((e) => {
      const c = calcEmployee(e)
      return {
        empId: e.id,
        totalMinutes: c.totalMinutes,
        grossPay: c.grossPay,
        loanDed: c.loanDed,
        advDed: c.advDed,
        carryForward: c.carryFwd,
        netPay: c.netPay,
      }
    })

    setBusy(true)
    showToast('Closing month…', 'var(--accent)')
    const r = await apiCloseMonth(selYr, selMo, salaryData, currentUser.name)
    setBusy(false)

    if (r.ok) {
      showToast(`✓ Month closed! ${r.count} salary records saved.`)
      await refresh()
    } else {
      showToast(r.err, 'var(--red)')
    }
  }

  const pastMonths = {}
  db.monthCloses.forEach((mc) => {
    const key = `${mc.year}-${pad(Number(mc.month))}`
    if (!pastMonths[key]) pastMonths[key] = {
      year: Number(mc.year), month: Number(mc.month),
      count: 0, gross: 0, net: 0, closedAt: mc.closed_at
    }
    pastMonths[key].count++
    pastMonths[key].gross += Number(mc.gross_pay)
    pastMonths[key].net += Number(mc.net_pay)
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Close Month</div>
          <div className="page-sub">Review and finalise monthly salaries</div>
        </div>
        {alreadyClosed ? (
          <span className="badge b-green" style={{ fontSize: 13, padding: '6px 14px' }}>✓ Already Closed</span>
        ) : (
          <button className="btn btn-primary" onClick={doClose} disabled={busy}>
            {busy ? 'Closing…' : 'Finalise & Close Month'}
          </button>
        )}
      </div>

      {/* Month selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <label className="lbl" style={{ margin: 0, whiteSpace: 'nowrap' }}>Viewing month:</label>
        <select className="inp" style={{ width: 240 }} value={`${selYr}-${pad(selMo)}`}
          onChange={(e) => handleSelChange(e.target.value)}>
          {monthOptions.map(({ yr, mo }) => {
            const val = `${yr}-${pad(mo)}`
            const closed = db.monthCloses.some((mc) => Number(mc.year) === yr && Number(mc.month) === mo)
            const tag = closed ? ' ✓' : yr === curYr && mo === curMo ? ' (Current)' : ''
            return <option key={val} value={val}>{fmtMonthYear(yr, mo)}{tag}</option>
          })}
        </select>
        {alreadyClosed
          ? <span className="badge b-green">Finalised</span>
          : <span className="badge b-amber">Not yet finalised</span>}
      </div>

      {alreadyClosed ? (
        /* ── CLOSED VIEW ── */
        <>
          <div style={{ padding: '14px 16px', background: 'var(--green-light)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--green)' }}>
            <strong>✓ This month is finalised.</strong> All salary records are locked.
          </div>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div className="stat">
              <div className="stat-label">Total Gross</div>
              <div className="stat-val text-green">{fmtRs(closedRecords.reduce((s, r) => s + Number(r.gross_pay), 0))}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Total Deductions</div>
              <div className="stat-val text-red">{fmtRs(closedRecords.reduce((s, r) =>
                s + Number(r.loan_deductions || 0) + Number(r.advance_deductions || 0) + Number(r.carry_forward || 0), 0))}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Net Payable</div>
              <div className="stat-val">{fmtRs(closedRecords.reduce((s, r) => s + Number(r.net_pay), 0))}</div>
            </div>
          </div>
          <div className="card">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th><th>Time</th><th>Gross Pay</th>
                    <th>Advance Ded.</th><th>Loan EMI</th><th>Carry Fwd</th><th>Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {closedRecords.map((mc) => {
                    const e = db.users.find((u) => u.id === mc.emp_id)
                    return (
                      <tr key={mc.id}>
                        <td className="fw6">{e ? e.name : mc.emp_id} <span className="text-muted text-xs">{mc.emp_id}</span></td>
                        <td className="text-muted">{mc.total_minutes} min</td>
                        <td className="text-green fw6">{fmtRs(mc.gross_pay)}</td>
                        <td className="text-amber">{Number(mc.advance_deductions) > 0 ? '−' + fmtRs(mc.advance_deductions) : '—'}</td>
                        <td className="text-red">{Number(mc.loan_deductions) > 0 ? '−' + fmtRs(mc.loan_deductions) : '—'}</td>
                        <td className="text-red">{Number(mc.carry_forward) > 0 ? '−' + fmtRs(mc.carry_forward) : '—'}</td>
                        <td className={`fw7 ${Number(mc.net_pay) < 0 ? 'text-red' : 'text-green'}`}>
                          {fmtRs(mc.net_pay)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* ── OPEN VIEW — everything auto, nothing to type ── */
        <>
          <div style={{ padding: '14px 16px', background: 'var(--accent-light)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--accent)' }}>
            <strong>How to use:</strong> Record loan EMI deductions in the <strong>Loans</strong> page first using the <strong>+ Deduct</strong> button, selecting the month. Then come here and click <strong>Finalise</strong>. All numbers are calculated automatically — nothing to type here.
          </div>

          {/* Summary stats */}
          {(() => {
            let totalGross = 0, totalNet = 0, totalAdv = 0, totalLoan = 0
            emps.forEach(e => {
              const c = calcEmployee(e)
              totalGross += c.grossPay
              totalNet += c.netPay
              totalAdv += c.advDed
              totalLoan += c.loanDed
            })
            return (
              <div className="stats" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                <div className="stat"><div className="stat-label">Gross Payroll</div><div className="stat-val text-green">{fmtRs(totalGross)}</div></div>
                <div className="stat"><div className="stat-label">Advance Deductions</div><div className="stat-val text-amber">{fmtRs(totalAdv)}</div></div>
                <div className="stat"><div className="stat-label">Loan EMI Deductions</div><div className="stat-val text-red">{fmtRs(totalLoan)}</div></div>
                <div className="stat"><div className="stat-label">Net Payable</div><div className="stat-val">{fmtRs(totalNet)}</div></div>
              </div>
            )
          })()}

          <div className="card">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Time Worked</th>
                    <th>Gross Pay</th>
                    <th style={{ background: 'var(--amber-light)' }}>
                      Advance Ded.
                      <div style={{ fontWeight: 400, color: 'var(--amber)', fontSize: 10 }}>auto from Advances</div>
                    </th>
                    <th style={{ background: 'var(--red-light)' }}>
                      Loan EMI
                      <div style={{ fontWeight: 400, color: 'var(--red)', fontSize: 10 }}>auto from Loans page</div>
                    </th>
                    <th style={{ background: 'var(--red-light)' }}>
                      Carry Fwd
                      <div style={{ fontWeight: 400, color: 'var(--red)', fontSize: 10 }}>prev month negative</div>
                    </th>
                    <th>Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {emps.map((e) => {
                    const c = calcEmployee(e)
                    return (
                      <tr key={e.id}>
                        <td className="fw6">
                          {e.name}
                          <div className="text-muted text-xs">{e.id}</div>
                        </td>
                        <td>
                          {c.totalMinutes > 0
                            ? <span>{c.totalMinutes} min <span className="text-muted text-xs">({c.daysPresent}d)</span></span>
                            : <span className="badge b-gray">Absent</span>}
                        </td>
                        <td className="text-green fw6">{fmtRs(c.grossPay)}</td>
                        <td style={{ background: 'var(--amber-light)' }}>
                          {c.advDed > 0
                            ? <span className="text-amber fw6">−{fmtRs(c.advDed)}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td style={{ background: 'var(--red-light)' }}>
                          {c.loanDed > 0
                            ? <span className="text-red fw6">−{fmtRs(c.loanDed)}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td style={{ background: 'var(--red-light)' }}>
                          {c.carryFwd > 0
                            ? <span className="text-red fw6">−{fmtRs(c.carryFwd)}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td className={`fw7 ${c.netPay < 0 ? 'text-red' : 'text-green'}`}>
                          {fmtRs(c.netPay)}
                          {c.netPay < 0 && (
                            <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 400 }}>carries to next month</div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: 'var(--surface3)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--muted)' }}>
            ⚠️ If a loan EMI shows — or 0 when it should have a value, go to <strong>Loans</strong> page and record the deduction there first using <strong>+ Deduct</strong>.
          </div>
        </>
      )}

      {/* All closed months history */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">All Closed Months</div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr><th>Month</th><th>Staff</th><th>Gross Payroll</th><th>Net Payable</th><th>Closed On</th><th></th></tr>
              </thead>
              <tbody>
                {Object.entries(pastMonths).length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No months closed yet</td></tr>
                ) : (
                  Object.entries(pastMonths)
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .map(([key, m]) => (
                      <tr key={key}>
                        <td className="fw6">{fmtMonthYear(m.year, m.month)}</td>
                        <td>{m.count} staff</td>
                        <td className="text-green fw6">{fmtRs(m.gross)}</td>
                        <td className="fw6">{fmtRs(m.net)}</td>
                        <td className="text-muted text-sm">{fmtDate(m.closedAt ? String(m.closedAt).substring(0, 10) : '')}</td>
                        <td>
                          <button className="btn btn-outline btn-sm"
                            onClick={() => { setSelYr(m.year); setSelMo(m.month) }}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
