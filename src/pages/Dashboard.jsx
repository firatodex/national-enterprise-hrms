import { useStore } from '../lib/store.jsx'
import { T } from '../lib/theme.js'
import { fmtRs, fmtMin, fmt12, todayISO, calcSalary, computeLoanPaid } from '../lib/calc.js'
import { Card, CardHead, StatCard, Badge, Avatar, PageHeader, ProgressBar } from '../components/UI.jsx'

export default function DashboardPage() {
  const { state } = useStore()
  const { employees, punches, loans, monthCloses, currentUser } = state

  const today     = todayISO()
  const now       = new Date()
  const [yr, mo]  = today.split('-').map(Number)
  const monthLabel= new Date(yr, mo-1).toLocaleDateString('en-IN',{month:'long',year:'numeric'})

  const activeStaff = employees.filter(e => e.active && e.role !== 'owner')

  // Who's present today
  const todayPunches = punches.filter(p => p.date === today)
  const presentIds   = new Set(todayPunches.filter(p => p.inTime).map(p => p.empId))
  const activeNow    = todayPunches.filter(p => p.inTime && !p.outTime).map(p => p.empId)
  const presentCount = [...presentIds].filter(id => activeStaff.find(e => e.id === id)).length
  const absentCount  = activeStaff.length - presentCount

  // Active loans
  const activeLoans  = loans.filter(l => l.active)
  const outstanding  = activeLoans.reduce((s, l) => {
    const paid = computeLoanPaid(l, monthCloses)
    return s + Math.max(0, (l.total || 0) - paid)
  }, 0)

  // Gross this month (from live calc)
  let monthGross = 0
  for (const emp of activeStaff) {
    const c = calcSalary(emp.id, yr, mo, punches, employees)
    monthGross += c?.grossPay || 0
  }

  // Dept breakdown
  const depts = {}
  activeStaff.forEach(e => { depts[e.dept] = (depts[e.dept] || 0) + 1 })

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${currentUser.name.split(' ')[0]} 👋`}
        sub={now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
      />

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:24 }}>
        <StatCard label="Present Today"  value={presentCount} sub={`${absentCount} absent`}           color={T.green}  icon="✅"/>
        <StatCard label="Working Now"    value={activeNow.length} sub="active sessions"               color={T.brand}  icon="⏱"/>
        <StatCard label="Active Loans"   value={activeLoans.length} sub={fmtRs(outstanding)+' total'} color={T.amber}  icon="🏦"/>
        <StatCard label={monthLabel+' Gross'} value={fmtRs(monthGross)} sub="live, accruing"          color={T.brand}  icon="₹"/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Today attendance */}
        <Card p="0">
          <CardHead>Today's Attendance
            <div style={{ display:'flex', gap:6 }}>
              <Badge color="green" dot>{presentCount} present</Badge>
              <Badge color="gray"  dot>{absentCount} absent</Badge>
            </div>
          </CardHead>
          <div style={{ maxHeight:380, overflowY:'auto' }}>
            {activeStaff.map((emp, i) => {
              const punched   = presentIds.has(emp.id)
              const working   = activeNow.includes(emp.id)
              const lastPunch = todayPunches.filter(p => p.empId === emp.id).at(-1)
              return (
                <div key={i} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'11px 20px', borderBottom:`1px solid ${T.border2}`,
                }}>
                  <div style={{ position:'relative' }}>
                    <Avatar name={emp.name} dept={emp.dept} size={34}/>
                    {working && (
                      <span style={{
                        position:'absolute', bottom:0, right:0,
                        width:9, height:9, borderRadius:'50%',
                        background:T.green, border:`2px solid ${T.surface}`,
                      }}/>
                    )}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:T.base, fontWeight:700, color:T.n700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {emp.name}
                    </div>
                    <div style={{ fontSize:T.xs, color:T.n400 }}>
                      {lastPunch?.inTime ? `In at ${fmt12(lastPunch.inTime)}` : emp.id}
                    </div>
                  </div>
                  <Badge color={!punched?'gray':working?'amber':'green'}>
                    {!punched ? 'Absent' : working ? 'Working' : 'Done'}
                  </Badge>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Right column */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Dept strength */}
          <Card>
            <div style={{ fontSize:T.md, fontWeight:700, color:T.n800, marginBottom:16 }}>Department Strength</div>
            {Object.entries(depts).map(([dept, count]) => (
              <div key={dept} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:T.sm, fontWeight:600, color:T.n700 }}>{dept}</span>
                  <span style={{ fontSize:T.sm, color:T.n400 }}>{count} staff</span>
                </div>
                <ProgressBar pct={Math.round(count/activeStaff.length*100)}/>
              </div>
            ))}
          </Card>

          {/* Loan snapshot */}
          <Card>
            <div style={{ fontSize:T.md, fontWeight:700, color:T.n800, marginBottom:14 }}>Loan Snapshot</div>
            {activeLoans.slice(0,5).map((loan, i) => {
              const emp  = employees.find(e => e.id === loan.empId)
              const paid = computeLoanPaid(loan, monthCloses)
              const pct  = loan.total > 0 ? Math.round(paid/loan.total*100) : 0
              return (
                <div key={i} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:T.sm, fontWeight:600, color:T.n700 }}>{emp?.name?.split(' ')[0]}</span>
                    <span style={{ fontSize:T.sm, color:T.n400 }}>{fmtRs(Math.max(0,loan.total-paid))} left</span>
                  </div>
                  <ProgressBar pct={pct} color={pct>=80?T.green:T.brand}/>
                </div>
              )
            })}
            {activeLoans.length > 5 && (
              <div style={{ fontSize:T.xs, color:T.n400, textAlign:'center', marginTop:8 }}>
                +{activeLoans.length-5} more active loans
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
