import { useAuth } from '../context/AuthContext'
import { calcSalary, fmtRs, todayStr, DEPT_COLORS, initials } from '../utils/helpers'
import { roleBadge } from '../utils/badges'

export default function Payroll() {
  const { db } = useAuth()
  const today = todayStr()
  const [yr, mo] = today.split('-').map(Number)
  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)

  let tGross = 0, tMin = 0
  const rows = emps.map((e) => {
    const s = calcSalary(e.id, yr, mo, db.punches, db.users)
    if (!s) return null
    tGross += s.grossPay
    tMin += s.totalMinutes
    return { e, s }
  }).filter(Boolean)

  const monthName = new Date(yr, mo - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Payroll</div>
          <div className="page-sub">{monthName} — Live</div>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat"><div className="stat-label">Total Time</div><div className="stat-val">{Math.floor(tMin / 60)}h {tMin % 60}m</div></div>
        <div className="stat"><div className="stat-label">Staff</div><div className="stat-val">{emps.length}</div></div>
        <div className="stat"><div className="stat-label">Gross Payroll</div><div className="stat-val text-green">{fmtRs(tGross)}</div></div>
      </div>

      <div style={{ padding: '12px 16px', background: 'var(--accent-light)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--accent)' }}>
        <strong>Pay rule:</strong> Every minute worked = ₹(daily wage ÷ 480). Lunch break (1:00 PM – 2:00 PM) is excluded.
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Days</th><th>Total Time</th><th>Rate</th><th>Gross Pay</th></tr>
            </thead>
            <tbody>
              {rows.map(({ e, s }) => (
                <tr key={e.id}>
                  <td>
                    <div className="flex items-center gap8">
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${DEPT_COLORS[e.dept] || '#888'}20`, color: DEPT_COLORS[e.dept] || '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{initials(e.name)}</div>
                      <div>
                        <div className="fw6">{e.name}</div>
                        <div className="text-muted text-xs">{e.id}{e.role === 'admin' ? ' · Admin' : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td>{s.daysPresent}d</td>
                  <td>{Math.floor(s.totalMinutes / 60)}h {s.totalMinutes % 60}m</td>
                  <td className="fw6">{fmtRs(e.daily_wage)}<span className="text-muted text-xs">/day</span></td>
                  <td className="fw7 text-green">{fmtRs(s.grossPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
