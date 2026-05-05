import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiCloseMonth } from '../api'
import { calcSalary, getAdvanceTotal, getCarryForward, fmtRs, fmtDate, fmtMonthYear, todayStr, pad } from '../utils/helpers'

export default function CloseMonth() {
  const { currentUser, db, refresh } = useAuth()
  const showToast = useToast()
  const today = todayStr()
  const [curYr, curMo] = today.split('-').map(Number)
  const [selYr, setSelYr] = useState(curYr)
  const [selMo, setSelMo] = useState(curMo)
  const [loanDeds, setLoanDeds] = useState({})

  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)

  const monthOptions = []
  for (let i = 0; i < 12; i++) {
    let mo = curMo - i, yr = curYr
    if (mo <= 0) { mo += 12; yr -= 1 }
    monthOptions.push({ yr, mo })
  }

  const alreadyClosed = db.monthCloses.some((mc) => mc.year === selYr && mc.month === selMo)
  const closedRecords = db.monthCloses.filter((mc) => mc.year === selYr && mc.month === selMo)

  const handleSelChange = (val) => {
    const [yr, mo] = val.split('-').map(Number)
    setSelYr(yr); setSelMo(mo); setLoanDeds({})
  }

  const getNetPreview = (empId, grossPay) => {
    const advDed = getAdvanceTotal(empId, selYr, selMo, db.advances)
    const carryFwd = getCarryForward(empId, selYr, selMo, db.monthCloses)
    const loanDed = parseInt(loanDeds[empId]) || 0
    return grossPay - advDed - carryFwd - loanDed
  }

  const doClose = async () => {
    if (!window.confirm(`Finalise salary for ${fmtMonthYear(selYr, selMo)}?\n\nThis cannot be undone.`)) return
    const salaryData = emps.map((e) => {
      const s = calcSalary(e.id, selYr, selMo, db.punches, db.users)
      if (!s) return null
      const advDed = getAdvanceTotal(e.id, selYr, selMo, db.advances)
      const carryFwd = getCarryForward(e.id, selYr, selMo, db.monthCloses)
      const loanDed = parseInt(loanDeds[e.id]) || 0
      const netPay = s.grossPay - advDed - carryFwd - loanDed
      return { empId: e.id, totalMinutes: s.totalMinutes, grossPay: s.grossPay, loanDed, advDed, carryForward: carryFwd, netPay }
    }).filter(Boolean)

    showToast('Closing month…', 'var(--accent)')
    const r = await apiCloseMonth(selYr, selMo, salaryData, currentUser.name)
    if (r.ok) { showToast(`Month closed! ${r.count} records saved.`); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const pastMonths = {}
  db.monthCloses.forEach((mc) => {
    const key = `${mc.year}-${pad(mc.month)}`
    if (!pastMonths[key]) pastMonths[key] = { year: mc.year, month: mc.month, count: 0, gross: 0, closedAt: mc.closed_at }
    pastMonths[key].count++
    pastMonths[key].gross += Number(mc.gross_pay)
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Close Month</div>
          <div className="page-sub">Select a month to review or finalise</div>
        </div>
        {alreadyClosed ? (
          <span className="badge b-green" style={{ fontSize: 13, padding: '6px 14px' }}>✓ Already Closed</span>
        ) : (
          <button className="btn btn-primary" onClick={doClose}>Finalise & Close Month</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <label className="lbl" style={{ margin: 0, whiteSpace: 'nowrap' }}>Viewing month:</label>
        <select className="inp" style={{ width: 240 }} value={`${selYr}-${pad(selMo)}`} onChange={(e) => handleSelChange(e.target.value)}>
          {monthOptions.map(({ yr, mo }) => {
            const val = `${yr}-${pad(mo)}`
            const closed = db.monthCloses.some((mc) => mc.year === yr && mc.month === mo)
            const tag = closed ? ' ✓' : yr === curYr && mo === curMo ? ' (Current)' : ''
            return <option key={val} value={val}>{fmtMonthYear(yr, mo)}{tag}</option>
          })}
        </select>
        {alreadyClosed ? (
          <span className="badge b-green">Closed</span>
        ) : (
          <span className="badge b-amber">Not yet closed</span>
        )}
      </div>

      {alreadyClosed ? (
        <>
          <div style={{ padding: '14px 16px', background: 'var(--green-light)', borderRadius: 8, marginBottom: 16, fontSize: 12.5, color: 'var(--green)' }}>
            <strong>This month is finalised.</strong> Salary records are locked.
          </div>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div className="stat"><div className="stat-label">Total Gross</div><div className="stat-val text-green">{fmtRs(closedRecords.reduce((s, r) => s + Number(r.gross_pay), 0))}</div></div>
            <div className="stat"><div className="stat-label">Deductions</div><div className="stat-val text-red">{fmtRs(closedRecords.reduce((s, r) => s + Number(r.loan_deductions || 0) + Number(r.advance_deductions || 0) + Number(r.carry_forward || 0), 0))}</div></div>
            <div className="stat"><div className="stat-label">Net Payable</div><div className="stat-val">{fmtRs(closedRecords.reduce((s, r) => s + Number(r.net_pay), 0))}</div></div>
          </div>
          <div className="card">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Total Time</th><th>Gross</th><th>Advance Ded.</th><th>Loan Ded.</th><th>Carry Fwd</th><th>Net Pay</th></tr></thead>
                <tbody>
                  {closedRecords.map((mc) => {
                    const e = db.users.find((u) => u.id === mc.emp_id)
                    return (
                      <tr key={mc.id}>
                        <td className="fw6">{e ? e.name : mc.emp_id} <span className="text-muted text-xs">{mc.emp_id}</span></td>
                        <td>{mc.total_minutes} min</td>
                        <td className="text-green fw6">{fmtRs(mc.gross_pay)}</td>
                        <td className="text-amber fw6">{mc.advance_deductions > 0 ? '−' + fmtRs(mc.advance_deductions) : '—'}</td>
                        <td className="text-red">{mc.loan_deductions > 0 ? '−' + fmtRs(mc.loan_deductions) : '—'}</td>
                        <td className="text-red">{mc.carry_forward > 0 ? '−' + fmtRs(mc.carry_forward) : '—'}</td>
                        <td className={`fw7 ${mc.net_pay < 0 ? 'text-red' : 'text-green'}`}>{fmtRs(mc.net_pay)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: '14px 16px', background: 'var(--amber-light)', borderRadius: 8, marginBottom: 16, fontSize: 12.5, color: 'var(--amber)' }}>
            <strong>Before closing:</strong> Advance deductions are auto-calculated. Carry forward is from previous month's negative balance. Enter loan deductions manually.
          </div>
          <div className="card">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th><th>Total Time</th><th>Gross Pay</th>
                    <th style={{ background: 'var(--amber-light)' }}>Advance Ded. <span style={{ fontWeight: 400, color: 'var(--amber)', fontSize: 10 }}>(auto)</span></th>
                    <th style={{ background: 'var(--red-light)' }}>Carry Fwd <span style={{ fontWeight: 400, color: 'var(--red)', fontSize: 10 }}>(auto)</span></th>
                    <th>Loan Ded. <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 10 }}>(manual)</span></th>
                    <th>Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {emps.map((e) => {
                    const s = calcSalary(e.id, selYr, selMo, db.punches, db.users)
                    if (!s) return null
                    const advDed = getAdvanceTotal(e.id, selYr, selMo, db.advances)
                    const carryFwd = getCarryForward(e.id, selYr, selMo, db.monthCloses)
                    const net = getNetPreview(e.id, s.grossPay)
                    return (
                      <tr key={e.id}>
                        <td className="fw6">{e.name} <span className="text-muted text-xs">{e.id}</span></td>
                        <td>{s.totalMinutes} min ({s.daysPresent}d)</td>
                        <td className="text-green fw6">{fmtRs(s.grossPay)}</td>
                        <td className="text-amber fw6" style={{ background: 'var(--amber-light)' }}>{advDed > 0 ? '−' + fmtRs(advDed) : <span className="text-muted">—</span>}</td>
                        <td className="text-red" style={{ background: 'var(--red-light)' }}>{carryFwd > 0 ? '−' + fmtRs(carryFwd) : <span className="text-muted">—</span>}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: 'var(--muted)', fontSize: 13 }}>₹</span>
                            <input
                              className="inp"
                              type="number"
                              min="0"
                              placeholder="0"
                              style={{ width: 110, padding: '6px 10px', fontSize: 13 }}
                              value={loanDeds[e.id] || ''}
                              onChange={(ev) => setLoanDeds((d) => ({ ...d, [e.id]: ev.target.value }))}
                            />
                          </div>
                        </td>
                        <td className={`fw7 ${net < 0 ? 'text-red' : 'text-green'}`}>{fmtRs(net)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">All Closed Months</div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Month</th><th>Staff</th><th>Total Gross</th><th>Closed At</th><th></th></tr></thead>
              <tbody>
                {Object.entries(pastMonths).length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No months closed yet</td></tr>
                ) : (
                  Object.entries(pastMonths)
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .map(([key, m]) => (
                      <tr key={key}>
                        <td className="fw6">{fmtMonthYear(m.year, m.month)}</td>
                        <td>{m.count} staff</td>
                        <td className="text-green fw6">{fmtRs(m.gross)}</td>
                        <td className="text-muted text-sm">{fmtDate(m.closedAt ? String(m.closedAt).substring(0, 10) : '')}</td>
                        <td><button className="btn btn-outline btn-sm" onClick={() => { setSelYr(m.year); setSelMo(m.month) }}>View</button></td>
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
