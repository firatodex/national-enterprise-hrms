import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { T } from '../lib/theme.js'
import { fmtRs, fmtMin, fmt12, todayISO, pad, mergeSessions, calcPaidMinutes, detectAnomalies } from '../lib/calc.js'
import { Card, CardHead, Badge, Avatar, PageHeader, Table, TR, TD, Btn, Modal, Input, Select, Alert } from '../components/UI.jsx'

export default function AttendancePage() {
  const { state, dispatch } = useStore()
  const { employees, punches, currentUser, adminPerms, config } = state

  const [date,     setDate]     = useState(todayISO())
  const [showMP,   setShowMP]   = useState(false)
  const [mpForm,   setMpForm]   = useState({ empId: '', type: 'in', time: '', remark: '' })
  const [mpErr,    setMpErr]    = useState('')
  const [toast,    setToast]    = useState(null)

  const canManual = currentUser.role === 'owner' || adminPerms?.canManualPunch

  const activeStaff = employees.filter(e => e.active && e.role !== 'owner')

  const dayPunches = punches.filter(p => p.date === date)

  // All anomalies for this date
  const allAnomalies = detectAnomalies(dayPunches)

  const rows = activeStaff.map(emp => {
    const sessions = dayPunches.filter(p => p.empId === emp.id)
      .sort((a,b) => (a.session||1)-(b.session||1))
    const hasIn   = sessions.some(s => s.inTime)
    const merged  = mergeSessions(sessions)
    const totalM  = calcPaidMinutes(merged)
    const pay     = Math.round(totalM * (emp.dailyWage/480))
    const anomaly = detectAnomalies(sessions)
    const isActive= sessions.some(s => s.inTime && !s.outTime)
    return { emp, sessions, hasIn, totalM, pay, anomaly, isActive }
  })

  const presentCount = rows.filter(r => r.hasIn).length
  const workingCount = rows.filter(r => r.isActive).length

  const openManual = () => {
    setMpForm({ empId: activeStaff[0]?.id || '', type: 'in', time: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`, remark: '' })
    setMpErr('')
    setShowMP(true)
  }

  const saveManual = () => {
    if (!mpForm.time) { setMpErr('Please enter a time'); return }
    dispatch({
      type:   'MANUAL_PUNCH',
      empId:  mpForm.empId,
      date,
      punchType: mpForm.type,
      time:   mpForm.time,
      remark: mpForm.remark || 'Manual entry',
    })
    setShowMP(false)
    setToast({ msg: 'Manual punch saved', type: 'success' })
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div>
      {toast && (
        <div style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', background:T.green, color:'#fff', padding:'11px 22px', borderRadius:T.r12, fontWeight:700, fontSize:T.base, zIndex:900, boxShadow:T.shadowMd }}>
          ✓ {toast.msg}
        </div>
      )}

      <PageHeader
        title="Attendance"
        sub={`${presentCount} present · ${workingCount} working now`}
        action={
          <>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ padding:'9px 13px', border:`1.5px solid ${T.border}`, borderRadius:T.r12, fontSize:T.base, fontFamily:'inherit', background:T.n50, color:T.n800, outline:'none' }}/>
            {canManual && <Btn onClick={openManual} icon="✎">Manual Entry</Btn>}
          </>
        }
      />

      {/* Anomaly warnings — persistent, not toast */}
      {allAnomalies.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <Alert type="warning">
            <strong>{allAnomalies.length} time anomaly{allAnomalies.length>1?'ies':''} detected</strong> — sessions where punch-out is earlier than punch-in. Review and correct before closing month.
            {allAnomalies.map((a,i) => (
              <div key={i} style={{ marginTop:4, fontSize:T.xs }}>
                {employees.find(e=>e.id===a.empId)?.name} — in:{a.inTime} out:{a.outTime}
                {a.suggestion && <span style={{ color:T.amber, marginLeft:6 }}>Did you mean {a.suggestion}?</span>}
              </div>
            ))}
          </Alert>
        </div>
      )}

      <Card p="0">
        <Table headers={['Employee','Status','Sessions (merged + lunch deducted)','Total Time','Earnings']}>
          {rows.map(({ emp, sessions, hasIn, totalM, pay, anomaly, isActive }, i) => (
            <TR key={i} highlight={anomaly.length > 0 ? '#FFFBEB' : undefined}>
              <TD>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ position:'relative' }}>
                    <Avatar name={emp.name} dept={emp.dept} size={34}/>
                    {isActive && <span style={{ position:'absolute', bottom:0, right:0, width:8, height:8, borderRadius:'50%', background:T.green, border:`2px solid ${T.surface}` }}/>}
                  </div>
                  <div>
                    <div style={{ fontSize:T.base, fontWeight:700, color:T.n700 }}>{emp.name}</div>
                    <div style={{ fontSize:T.xs, color:T.n400 }}>{emp.id} · ₹{emp.dailyWage}/day</div>
                  </div>
                </div>
              </TD>
              <TD>
                <Badge color={!hasIn?'gray':isActive?'amber':'green'}>
                  {!hasIn ? 'Absent' : isActive ? 'Working' : 'Done'}
                </Badge>
                {anomaly.length > 0 && <Badge color="amber" style={{ marginLeft:4 }}>⚠ Anomaly</Badge>}
              </TD>
              <TD>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  {sessions.map((s,j) => (
                    <div key={j} style={{ fontSize:T.sm, color: (s.manualIn||s.manualOut)?T.amber:T.n600, display:'flex', alignItems:'center', gap:5 }}>
                      {fmt12(s.inTime)} → {s.outTime ? fmt12(s.outTime) : <span style={{color:T.amber}}>active</span>}
                      {(s.manualIn||s.manualOut) && <span style={{ fontSize:T.xs, color:T.amber }}>M</span>}
                    </div>
                  ))}
                  {!hasIn && <span style={{ color:T.n400, fontSize:T.sm }}>—</span>}
                </div>
              </TD>
              <TD style={{ fontWeight:700, color:T.n700 }}>
                {totalM > 0 ? fmtMin(totalM) : isActive ? <Badge color="amber">Active</Badge> : '—'}
              </TD>
              <TD style={{ fontWeight:700, color:T.green }}>
                {pay > 0 ? fmtRs(pay) : '—'}
              </TD>
            </TR>
          ))}
        </Table>
      </Card>

      {/* Manual Punch Modal */}
      <Modal open={showMP} onClose={() => setShowMP(false)} title="Manual Punch Entry">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Alert type="info">
            Manual punches are flagged with <strong>M</strong> in attendance records for transparency.
          </Alert>
          <Select label="Employee" value={mpForm.empId} onChange={v => setMpForm(f => ({...f, empId:v}))}
            options={activeStaff.map(e => ({ value:e.id, label:`${e.name} (${e.id})` }))}/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Select label="Type" value={mpForm.type} onChange={v => setMpForm(f=>({...f,type:v}))}
              options={[{value:'in',label:'Punch IN'},{value:'out',label:'Punch OUT'}]}/>
            <Input label="Time" type="time" value={mpForm.time} onChange={v => { setMpForm(f=>({...f,time:v})); setMpErr('') }} error={mpErr}/>
          </div>
          <Input label="Date" type="date" value={date} onChange={()=>{}} style={{ background:T.n100 }} note="Date is fixed to the selected day"/>
          <Input label="Remark (optional)" value={mpForm.remark} onChange={v => setMpForm(f=>({...f,remark:v}))} placeholder="e.g. Forgot to punch, device issue"/>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Btn variant="ghost" onClick={() => setShowMP(false)}>Cancel</Btn>
          <Btn onClick={saveManual}>Save Punch</Btn>
        </div>
      </Modal>
    </div>
  )
}
