import { useAuth } from '../context/AuthContext'
import { calcSalary, DEPT_COLORS, initials, fmtRs, todayStr } from '../utils/helpers'

export default function Dashboard() {
  const { currentUser, db } = useAuth()
  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)
  const today = todayStr()
  const [yr, mo] = today.split('-').map(Number)

  const presentIds = new Set(
    db.punches.filter((p) => String(p.date).substring(0, 10) === today && p.in_time).map((p) => p.emp_id)
  )
  const presentCount = [...presentIds].filter((id) => emps.find((e) => e.id === id)).length
  const activeLoans = db.loans.filter((l) => l.active).length
  let totalGross = 0
  emps.forEach((e) => {
    const s = calcSalary(e.id, yr, mo, db.punches, db.users)
    if (s) totalGross += s.grossPay
  })
  const depts = {}
  emps.forEach((e) => { depts[e.dept] = (depts[e.dept] || 0) + 1 })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Good {greeting}, {currentUser.name.split(' ')[0]}</div>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Total Staff</div>
          <div className="stat-val">{emps.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Present Today</div>
          <div className="stat-val text-green">{presentCount}</div>
          <div className="stat-sub">{emps.length - presentCount} absent</div>
        </div>
        <div className="stat">
          <div className="stat-label">Active Loans</div>
          <div className="stat-val text-amber">{activeLoans}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gross Payroll (Month)</div>
          <div className="stat-val">{fmtRs(totalGross)}</div>
        </div>
      </div>

      <div className="row2">
        <div className="card">
          <div className="card-head">Department Strength</div>
          <div className="card-body">
            {Object.entries(depts).map(([d, c]) => (
              <div key={d} style={{ marginBottom: 14 }}>
                <div className="flex justify-between items-center" style={{ marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{d}</span>
                  <span className="text-muted text-sm">{c} staff</span>
                </div>
                <div className="prog">
                  <div
                    className="prog-fill"
                    style={{
                      width: `${Math.round((c / emps.length) * 100)}%`,
                      background: DEPT_COLORS[d] || '#888',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">Today's Attendance</div>
          <div className="card-body" style={{ padding: 0 }}>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {emps.map((e) => {
                const todayPunches = db.punches.filter(
                  (p) => p.emp_id === e.id && String(p.date).substring(0, 10) === today
                )
                const hasIn = presentIds.has(e.id)
                const allDone =
                  todayPunches.length > 0 && todayPunches.every((p) => p.in_time && p.out_time)
                return (
                  <div
                    key={e.id}
                    className="flex justify-between items-center"
                    style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap8">
                      <div
                        style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: `${DEPT_COLORS[e.dept] || '#888'}20`,
                          color: DEPT_COLORS[e.dept] || '#888',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700,
                        }}
                      >
                        {initials(e.name)}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{e.name}</span>
                    </div>
                    {!hasIn ? (
                      <span className="badge b-gray">Absent</span>
                    ) : allDone ? (
                      <span className="badge b-green">Done</span>
                    ) : (
                      <span className="badge b-amber">Working</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
