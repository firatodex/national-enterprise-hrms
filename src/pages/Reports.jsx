import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { calcSalary, getAdvanceTotal, getCarryForward, fmtRs, fmtDate, fmtMonthYear, todayStr, pad, fmt12, DEPT_COLORS } from '../utils/helpers'
import { roleBadge, deptBadge } from '../utils/badges'

export default function Reports() {
  const { currentUser, db, canDo } = useAuth()
  const today = todayStr()
  const [yr, mo] = today.split('-').map(Number)
  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)

  // FIX #1: compute salary once per employee, reuse for all displays
  const salaryMap = {}
  emps.forEach((e) => {
    salaryMap[e.id] = calcSalary(e.id, yr, mo, db.punches, db.users)
  })

  let tMin = 0, tGross = 0
  const deptPay = {}
  emps.forEach((e) => {
    const s = salaryMap[e.id]
    if (s) {
      tMin += s.totalMinutes
      tGross += s.grossPay
      deptPay[e.dept] = (deptPay[e.dept] || 0) + s.grossPay
    }
  })

  const monthOpts = new Set([`${yr}-${pad(mo)}`])
  db.monthCloses.forEach((mc) => monthOpts.add(`${mc.year}-${pad(Number(mc.month))}`))
  const sortedMonths = [...monthOpts].sort().reverse()

  const canExport = currentUser.role === 'owner' || db.adminPerms.canExportSlip === true

  const [expEmp, setExpEmp] = useState(emps[0]?.id || '')
  const [expMonth, setExpMonth] = useState(sortedMonths[0] || `${yr}-${pad(mo)}`)

  const exportPDF = () => {
    const [ey, em] = expMonth.split('-').map(Number)
    const emp = db.users.find((u) => u.id === expEmp)
    if (!emp) return

    const closedRecord = db.monthCloses.find(
      (mc) => mc.emp_id === expEmp && Number(mc.year) === ey && Number(mc.month) === em
    )
    const s = calcSalary(expEmp, ey, em, db.punches, db.users)
    if (!s && !closedRecord) { alert('No data for this month'); return }

    const isClosed = !!closedRecord
    const advDed = closedRecord ? Number(closedRecord.advance_deductions || 0) : getAdvanceTotal(expEmp, ey, em, db.advances)
    const loanDed = closedRecord ? Number(closedRecord.loan_deductions || 0) : 0
    const carryFwd = closedRecord ? Number(closedRecord.carry_forward || 0) : getCarryForward(expEmp, ey, em, db.monthCloses)
    const grossPay = closedRecord ? Number(closedRecord.gross_pay) : (s?.grossPay || 0)
    const netPay = closedRecord ? Number(closedRecord.net_pay) : (grossPay - advDed - carryFwd)
    const totalMinutes = closedRecord ? Number(closedRecord.total_minutes) : (s?.totalMinutes || 0)
    const dayBreakdown = s?.dayBreakdown || []
    const daysPresent = s?.daysPresent || 0

    const fmtM = (m) => { const h = Math.floor(m / 60), mm = m % 60; return h > 0 ? `${h}h ${mm}m` : `${mm}m` }
    const fmtINR = (n) => Number(n || 0).toLocaleString('en-IN')
    const ratePerMin = (emp.daily_wage / 480).toFixed(2)
    const monthName = fmtMonthYear(ey, em)

    const fmtPDFDate = (ds) => {
      const s = String(ds).substring(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0] }
      return s
    }

    const dayRows = dayBreakdown.map((d) => {
      const sessStr = d.sessions.length > 0
        ? d.sessions.map((ss) => fmt12(ss.inTime) + ' – ' + fmt12(ss.outTime) + (ss.manual ? ' *' : '')).join(', ')
        : '—'
      const dayPay = d.totalMin > 0 ? Math.round(d.totalMin * (emp.daily_wage / 480)) : 0
      return `<tr><td>${fmtPDFDate(d.date)}</td><td>${d.day}</td><td>${sessStr}</td><td class="r">${d.totalMin > 0 ? fmtM(d.totalMin) : '—'}</td><td class="r mono">${dayPay > 0 ? '&#8377;' + fmtINR(dayPay) : '—'}</td></tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Salary Slip — ${emp.name} — ${monthName}</title>
<style>
@page{margin:12mm 14mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#000;background:#fff;font-size:11px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slip{max-width:580px;margin:0 auto;padding:40px 0}
.co{font-size:9px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#888;margin-bottom:6px}
.name{font-size:22px;font-weight:600;margin-bottom:2px}
.period{font-size:11px;color:#888}
.tag{display:inline-block;margin-left:6px;font-size:8px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:2px 6px;border-radius:3px;vertical-align:middle}
.tag-d{background:#fff3e0;color:#e65100}
.tag-f{background:#e8f5e9;color:#2e7d32}
.info{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-top:1px solid #e0e0e0;border-bottom:1px solid #e0e0e0;padding:16px 0;margin-bottom:28px}
.info-item .k{font-size:8px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#999;margin-bottom:1px}
.info-item .v{font-size:12px;font-weight:600}
.stitle{font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;margin-bottom:8px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
thead th{font-size:8px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#999;padding:0 0 6px;text-align:left;border-bottom:1px solid #000}
th.r,td.r{text-align:right}
td{padding:6px 0;font-size:11px;border-bottom:1px solid #f0f0f0}
td.mono{font-variant-numeric:tabular-nums}
.tfoot td{border-top:1px solid #000;border-bottom:none;font-weight:700;padding-top:8px}
.earn{border-top:1px solid #e0e0e0;padding-top:20px;margin-bottom:24px}
.erow{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0}
.erow+.erow{border-top:1px solid #f5f5f5}
.elbl{font-size:11px}
.esub{font-size:9px;color:#999;margin-top:1px}
.eamt{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
.egrn{color:#2e7d32}
.ered{color:#c62828}
.net{background:#000;color:#fff;padding:20px 24px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
.net.neg{background:#b71c1c}
.net-l{font-size:10px;color:rgba(255,255,255,.5)}
.net-l2{font-size:8px;color:rgba(255,255,255,.35);margin-top:2px}
.net-v{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.foot{border-top:1px solid #e0e0e0;padding-top:12px;display:flex;justify-content:space-between;font-size:9px;color:#bbb}
@media print{.noprint{display:none!important}.slip{padding:0;max-width:100%}}
@media screen{.noprint{position:fixed;bottom:0;left:0;right:0;padding:12px;background:#fff;border-top:1px solid #eee;display:flex;justify-content:center;gap:8px;z-index:99}body{padding-bottom:60px}.noprint button{padding:8px 24px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}.btn-s{background:#000;color:#fff}.btn-c{background:#f0f0f0;color:#000}}
</style></head><body>
<div class="slip">
<div class="hdr" style="margin-bottom:32px">
<div class="co">National Enterprise</div>
<div class="name">${emp.name}</div>
<div class="period">Salary Slip &middot; ${monthName} <span class="tag ${isClosed ? 'tag-f' : 'tag-d'}">${isClosed ? 'Final' : 'Draft'}</span></div>
</div>
<div class="info">
<div class="info-item"><div class="k">ID</div><div class="v">${emp.id}</div></div>
<div class="info-item"><div class="k">Department</div><div class="v">${emp.dept}</div></div>
<div class="info-item"><div class="k">Daily Wage</div><div class="v">&#8377;${fmtINR(emp.daily_wage)}</div></div>
<div class="info-item"><div class="k">Rate/Min</div><div class="v">&#8377;${ratePerMin}</div></div>
</div>
${dayBreakdown.length > 0 ? `
<div class="stitle">Attendance &middot; ${daysPresent} days &middot; ${fmtM(totalMinutes)} (lunch excluded)</div>
<table>
<thead><tr><th>Date</th><th>Day</th><th>Sessions</th><th class="r">Time</th><th class="r">Pay</th></tr></thead>
<tbody>
${dayRows}
<tr class="tfoot"><td colspan="3">Total</td><td class="r">${fmtM(totalMinutes)}</td><td class="r mono">&#8377;${fmtINR(grossPay)}</td></tr>
</tbody>
</table>` : '<p style="color:#999;font-size:11px;margin-bottom:24px">No attendance recorded for this month.</p>'}
<div class="earn">
<div class="erow"><div><div class="elbl">Work Pay</div><div class="esub">${fmtM(totalMinutes)} &times; &#8377;${ratePerMin}/min (lunch 1–2 PM excluded)</div></div><div class="eamt egrn">&#8377;${fmtINR(grossPay)}</div></div>
${advDed > 0 ? `<div class="erow"><div class="elbl">Advance Deduction</div><div class="eamt ered">&minus;&#8377;${fmtINR(advDed)}</div></div>` : ''}
${loanDed > 0 ? `<div class="erow"><div class="elbl">Loan Deduction</div><div class="eamt ered">&minus;&#8377;${fmtINR(loanDed)}</div></div>` : ''}
${carryFwd > 0 ? `<div class="erow"><div><div class="elbl">Carry Forward</div><div class="esub">Previous month negative balance</div></div><div class="eamt ered">&minus;&#8377;${fmtINR(carryFwd)}</div></div>` : ''}
</div>
<div class="net ${netPay < 0 ? 'neg' : ''}">
<div><div class="net-l">Net Pay</div>${netPay < 0 ? '<div class="net-l2">Negative balance carries forward to next month</div>' : ''}</div>
<div class="net-v">&#8377;${fmtINR(netPay)}</div>
</div>
<div class="foot"><span>National Enterprise HRMS</span><span>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span></div>
</div>
<div class="noprint">
<button class="btn-s" onclick="window.print()">Save as PDF</button>
<button class="btn-c" onclick="window.close()">Close</button>
</div>
</body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
    else alert('Pop-up blocked. Please allow pop-ups and try again.')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-sub">{fmtMonthYear(yr, mo)} — Live Data</div>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="stat"><div className="stat-label">Total Time</div><div className="stat-val">{Math.floor(tMin / 60)}h {tMin % 60}m</div></div>
        <div className="stat"><div className="stat-label">Gross Payroll</div><div className="stat-val text-green">{fmtRs(tGross)}</div></div>
      </div>

      {canExport ? (
        <div className="card">
          <div className="card-head">Export Salary Slip (PDF)</div>
          <div className="card-body">
            <div className="form-grid" style={{ maxWidth: 500 }}>
              <div>
                <label className="lbl">Employee</label>
                <select className="inp" value={expEmp} onChange={(e) => setExpEmp(e.target.value)}>
                  {emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Month</label>
                <select className="inp" value={expMonth} onChange={(e) => setExpMonth(e.target.value)}>
                  {sortedMonths.map((m) => {
                    const [my, mm] = m.split('-').map(Number)
                    return <option key={m} value={m}>{fmtMonthYear(my, mm)}</option>
                  })}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <button className="btn btn-primary" onClick={exportPDF}>Generate Salary Slip</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 16, background: 'var(--surface3)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
          Salary slip export is restricted. Contact the owner for access.
        </div>
      )}

      <div className="row2">
        <div className="card">
          <div className="card-head">Payroll by Department</div>
          <div className="card-body">
            {Object.entries(deptPay).map(([d, pay]) => (
              <div key={d} style={{ marginBottom: 14 }}>
                <div className="flex justify-between items-center" style={{ marginBottom: 5 }}>
                  {deptBadge(d)}
                  <span className="fw7">{fmtRs(pay)}</span>
                </div>
                <div className="prog"><div className="prog-fill" style={{ width: `${tGross ? Math.round((pay / tGross) * 100) : 0}%`, background: DEPT_COLORS[d] || '#888' }}/></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head">Loan Summary</div>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span>Active Loans</span><span className="fw7">{db.loans.filter((l) => l.active).length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
              <span>Outstanding</span><span className="fw7 text-red">{fmtRs(db.loans.filter((l) => l.active).reduce((s, l) => s + (Number(l.total) - Number(l.paid)), 0))}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Current Month Breakdown</div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Dept</th><th>Days</th><th>Total Time</th><th>Rate/Day</th><th>Gross Pay</th></tr></thead>
            <tbody>
              {emps.map((e) => {
                const s = salaryMap[e.id]
                if (!s) return null
                return (
                  <tr key={e.id}>
                    <td className="fw6">{e.name} {roleBadge(e.role)}</td>
                    <td>{deptBadge(e.dept)}</td>
                    <td>{s.daysPresent}d</td>
                    <td>{Math.floor(s.totalMinutes / 60)}h {s.totalMinutes % 60}m</td>
                    <td className="fw6">{fmtRs(e.daily_wage)}</td>
                    <td className="fw7 text-green">{fmtRs(s.grossPay)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
