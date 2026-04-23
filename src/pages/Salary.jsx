import { useState, useMemo, useCallback } from 'react'
import { useStore } from '../lib/store.jsx'
import { T } from '../lib/theme.js'
import { fmtRs, fmtMin, pad, buildGrossData, applyDeductions, getCarryForward } from '../lib/calc.js'
import { Card, CardHead, Badge, Avatar, PageHeader, Table, TR, TD, Btn, Modal, Input, Select, Alert, StatCard } from '../components/UI.jsx'

// FIX #10: Generate month options at call time so it's never stale
function getMonthOptions() {
  const opts = []
  const now  = new Date()
  for (let i = 0; i < 13; i++) {
    let m = now.getMonth() + 1 - i   // 1-indexed
    let y = now.getFullYear()
    if (m <= 0) { m += 12; y -= 1 }
    opts.push({
      value: `${y}-${pad(m)}`,
      label: new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    })
  }
  return opts
}

// FIX #2: defaultPeriod — getMonth() is 0-indexed, must convert to 1-indexed first
function getDefaultPeriod() {
  const now = new Date()
  let m = now.getMonth() + 1   // 1-indexed: April = 4
  let y = now.getFullYear()
  // If it's the first week, default to the previous (just-ended) month
  if (now.getDate() <= 7) {
    m -= 1
    if (m < 1) { m = 12; y -= 1 }
  }
  // Otherwise default to current month (for mid-month advance entries etc.)
  return `${y}-${pad(m)}`
}

export default function SalaryPage() {
  const { state, dispatch } = useStore()
  const { employees, punches, loans, advances, monthCloses, currentUser, activeSalaryPeriod, adminPerms } = state

  const canClose = currentUser.role === 'owner' || adminPerms?.canCloseMonth

  const MONTH_OPTIONS = useMemo(() => getMonthOptions(), [])  // safe: recomputes if component remounts across midnight

  const [period,        setPeriod]        = useState(() =>
    activeSalaryPeriod
      ? `${activeSalaryPeriod.year}-${pad(activeSalaryPeriod.month)}`
      : getDefaultPeriod()
  )
  const [loanOverrides, setLoanOverrides] = useState({})
  const [showAdvModal,  setShowAdvModal]  = useState(false)
  const [advForm,       setAdvForm]       = useState({ empId: '', amount: '', notes: '', deductMonth: period })
  const [closingConfirm,setClosingConfirm]= useState(false)
  const [toast,         setToast]         = useState(null)

  const showToast = useCallback((m, t = 'success') => {
    setToast({ m, t })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const [yr, mo] = period.split('-').map(Number)
  const monthLabel = MONTH_OPTIONS.find(o => o.value === period)?.label || period
  const isClosed = monthCloses.some(mc => mc.year === yr && mc.month === mo)

  // FIX #8 PERFORMANCE: Two-stage memoisation.
  // Stage 1: Gross data — expensive (scans all punches). Only recomputes when
  //          employees, punches, or the selected month changes.
  const grossData = useMemo(
    () => buildGrossData(yr, mo, employees, punches),
    [yr, mo, employees, punches]
  )

  // Stage 2: Net/deduction data — cheap. Recomputes when advances, loans,
  //          monthCloses, or loanOverrides change (e.g. every loan keystroke).
  //          Does NOT re-scan punches.
  const preview = useMemo(
    () => applyDeductions(grossData, yr, mo, advances, loans, monthCloses, loanOverrides),
    [grossData, yr, mo, advances, loans, monthCloses, loanOverrides]
  )

  const totalGross = preview.reduce((s, r) => s + r.grossPay, 0)
  const totalNet   = preview.reduce((s, r) => s + r.netPay, 0)
  const totalDed   = totalGross - totalNet
  const advancesThisPeriod = advances.filter(a => a.deductMonth === period)
  const anomalyCount = preview.reduce((s, r) => s + r.anomalies.length, 0)
  const ghostEntries = preview.filter(r => r.totalMinutes > 0 && r.totalMinutes < 60)

  const activeStaff = employees.filter(e => e.active && e.role !== 'owner')

  const doSetPeriod = val => {
    setPeriod(val)
    setLoanOverrides({})
    const [y, m] = val.split('-').map(Number)
    dispatch({ type: 'SET_SALARY_PERIOD', period: { year: y, month: m } })
  }

  // FIX #4: Ensure empId is always valid when opening advance modal
  const openAdvModal = () => {
    const firstEmpId = activeStaff[0]?.id || ''
    setAdvForm({ empId: firstEmpId, amount: '', notes: '', deductMonth: period })
    setShowAdvModal(true)
  }

  const addAdvance = () => {
    if (!advForm.empId || !advForm.amount || Number(advForm.amount) <= 0) return
    dispatch({
      type: 'ADD_ADVANCE',
      empId:       advForm.empId,
      amount:      Number(advForm.amount),
      notes:       advForm.notes,
      deductMonth: advForm.deductMonth || period,
      addedBy:     currentUser.name,
    })
    setShowAdvModal(false)
    showToast('Advance recorded')
  }

  const doClose = () => {
    // Guard: isClosed is checked before opening confirm, but double-check here
    if (isClosed) { setClosingConfirm(false); return }
    const rows = preview.map(r => ({
      empId:         r.emp.id,
      totalMinutes:  r.totalMinutes,
      grossPay:      r.grossPay,
      loanDed:       r.loanDed,
      advDed:        r.advDed,
      carryFwd:      r.carryFwd,
      netPay:        r.netPay,
      dailyWageUsed: r.dailyWageUsed,
    }))
    dispatch({ type: 'CLOSE_MONTH', year: yr, month: mo, rows, closedBy: currentUser.name })
    setClosingConfirm(false)
    showToast(`${monthLabel} salary closed — ${rows.length} records saved`)
  }

  const closedRows = monthCloses.filter(mc => mc.year === yr && mc.month === mo)

  return (
    <div>
      {toast && (
        <div style={{ position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:toast.t==='error'?T.red:T.green,color:'#fff',padding:'11px 22px',borderRadius:T.r12,fontWeight:700,fontSize:T.base,zIndex:900,boxShadow:T.shadowMd,whiteSpace:'nowrap' }}>
          ✓ {toast.m}
        </div>
      )}

      <PageHeader
        title="Salary Preparation"
        sub="Advances, loan deductions, and month close — all in one place"
        action={
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <select value={period} onChange={e=>doSetPeriod(e.target.value)}
              style={{ padding:'9px 13px', border:`1.5px solid ${T.border}`, borderRadius:T.r12, fontSize:T.base, fontFamily:'inherit', background:T.n50, color:T.n800, outline:'none' }}>
              {MONTH_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}{monthCloses.some(mc=>mc.year===parseInt(o.value)&&mc.month===parseInt(o.value.split('-')[1]))?' ✓':''}</option>)}
            </select>
            {!isClosed && canClose && (
              <Btn onClick={() => setClosingConfirm(true)}
                style={{ background:`linear-gradient(135deg,${T.green},#047857)`, color:'#fff', border:'none' }}>
                ✓ Finalise {monthLabel}
              </Btn>
            )}
            {isClosed && <Badge color="green">✓ Closed</Badge>}
          </div>
        }
      />

      {/* FIX #8: Active period banner */}
      <div style={{ background:`linear-gradient(135deg,${T.brandLight},#DBEAFE)`, border:`1px solid ${T.brandBorder}`, borderRadius:T.r12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:18 }}>📋</span>
        <div>
          <span style={{ fontSize:T.base, fontWeight:700, color:T.brandDark }}>Active salary period: {monthLabel}  </span>
          <span style={{ fontSize:T.sm, color:T.brand }}>
            All advances you enter now will default to this period. Loan EMIs are pre-filled below.
          </span>
        </div>
      </div>

      {/* Warnings */}
      {anomalyCount > 0 && !isClosed && (
        <Alert type="warning" style={{ marginBottom:16 }}>
          <strong>{anomalyCount} punch anomalies</strong> detected in {monthLabel}. Review attendance before closing to avoid incorrect gross pay.
        </Alert>
      )}
      {ghostEntries.length > 0 && !isClosed && (
        <Alert type="warning" style={{ marginBottom:16 }}>
          <strong>{ghostEntries.length} employee{ghostEntries.length>1?'s':''}</strong> have less than 1 hour total for {monthLabel} — likely a data error: {ghostEntries.map(r=>r.emp.name.split(' ')[0]).join(', ')}. Review before closing.
        </Alert>
      )}

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
        <StatCard label="Total Gross"      value={fmtRs(totalGross)} color={T.brand}/>
        <StatCard label="Total Deductions" value={fmtRs(totalDed)}   color={T.red}/>
        <StatCard label="Total Net Pay"    value={fmtRs(totalNet)}   color={T.green}/>
      </div>

      {/* ── ADVANCES SECTION ────────────────────────────────────────────────── */}
      {!isClosed && (
        <Card p="0" style={{ marginBottom:16 }}>
          <CardHead action={
            <Btn size="sm" variant="ghost" onClick={openAdvModal}>+ Add Advance</Btn>
          }>
            Advances — {monthLabel}
            <span style={{ fontSize:T.sm, fontWeight:400, color:T.n400, marginLeft:8 }}>
              Cash given · auto-deducted from this month's salary
            </span>
          </CardHead>
          {advancesThisPeriod.length === 0 ? (
            <div style={{ padding:'28px', textAlign:'center', color:T.n400, fontSize:T.sm }}>
              No advances recorded for {monthLabel}
            </div>
          ) : (
            advancesThisPeriod.map((a, i) => {
              const emp = employees.find(e => e.id === a.empId)
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:`1px solid ${T.border2}` }}>
                  <Avatar name={emp?.name||a.empId} dept={emp?.dept||''} size={32}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:T.base, fontWeight:700, color:T.n700 }}>{emp?.name||a.empId}</div>
                    <div style={{ fontSize:T.xs, color:T.n400 }}>{a.notes||'No notes'} · {a.date} · Added by {a.addedBy}</div>
                  </div>
                  <div style={{ fontSize:T.lg, fontWeight:800, color:T.amber }}>{fmtRs(a.amount)}</div>
                </div>
              )
            })
          )}
          {advancesThisPeriod.length > 0 && (
            <div style={{ padding:'11px 20px', background:T.n50, display:'flex', justifyContent:'flex-end' }}>
              <span style={{ fontSize:T.sm, fontWeight:700, color:T.amber }}>
                Total advances: {fmtRs(advancesThisPeriod.reduce((s,a)=>s+a.amount,0))}
              </span>
            </div>
          )}
        </Card>
      )}

      {/* ── MAIN SALARY TABLE ─────────────────────────────────────────────── */}
      <Card p="0">
        <CardHead>
          {isClosed ? `${monthLabel} — Closed` : `${monthLabel} — Preview`}
          <span style={{ fontSize:T.xs, color:T.n400 }}>
            {isClosed ? 'Records are locked' : 'Loan EMIs pre-filled · adjust if needed'}
          </span>
        </CardHead>

        {isClosed ? (
          // Closed view
          <Table headers={['Employee','Time','Gross','Adv Ded.','Loan Ded.','Carry Fwd','Net Pay']}>
            {closedRows.map((mc,i) => {
              const emp = employees.find(e=>e.id===mc.empId)
              return (
                <TR key={i}>
                  <TD>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <Avatar name={emp?.name||mc.empId} dept={emp?.dept||'Production'} size={30}/>
                      <div>
                        <div style={{ fontSize:T.base, fontWeight:700, color:T.n700 }}>{emp?.name||mc.empId}</div>
                        <div style={{ fontSize:T.xs, color:T.n400 }}>{mc.empId} · ₹{mc.dailyWageUsed}/day used</div>
                      </div>
                    </div>
                  </TD>
                  <TD style={{ color:T.n500 }}>{fmtMin(mc.totalMinutes)}</TD>
                  <TD style={{ fontWeight:700, color:T.n800 }}>{fmtRs(mc.grossPay)}</TD>
                  <TD style={{ color:T.amber, fontWeight:600 }}>{mc.advanceDeductions>0?`−${fmtRs(mc.advanceDeductions)}`:'—'}</TD>
                  <TD style={{ color:T.red, fontWeight:600 }}>{mc.loanDeductions>0?`−${fmtRs(mc.loanDeductions)}`:'—'}</TD>
                  <TD style={{ color:T.red, fontWeight:600 }}>{mc.carryForward>0?`−${fmtRs(mc.carryForward)}`:'—'}</TD>
                  <TD style={{ fontWeight:800, fontSize:T.md, color:mc.netPay<0?T.red:T.green }}>
                    {fmtRs(mc.netPay)}
                    {mc.netPay<0&&<div style={{ fontSize:T.xs, fontWeight:600, color:T.red }}>Carries fwd</div>}
                  </TD>
                </TR>
              )
            })}
          </Table>
        ) : (
          // Preview view
          <Table headers={['Employee','Gross Pay','Advance Ded.','Carry Fwd','Loan Deduction (EMI)','Net Pay']}>
            {preview.map((row, i) => (
              <TR key={i} highlight={row.netPay<0?`${T.redLight}99`:row.hasAnomaly?'#FFFBEB99':undefined}>
                <TD>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <Avatar name={row.emp.name} dept={row.emp.dept} size={30}/>
                    <div>
                      <div style={{ fontSize:T.base, fontWeight:700, color:T.n700, display:'flex', alignItems:'center', gap:5 }}>
                        {row.emp.name}
                        {row.hasAnomaly && <Badge color="amber">⚠</Badge>}
                      </div>
                      <div style={{ fontSize:T.xs, color:T.n400 }}>{row.emp.id} · ₹{row.emp.dailyWage}/day · {fmtMin(row.totalMinutes)}</div>
                    </div>
                  </div>
                </TD>
                <TD style={{ fontWeight:800, color:T.n800, fontSize:T.md }}>{fmtRs(row.grossPay)}</TD>
                <TD style={{ color:T.amber, fontWeight:600 }}>
                  {row.advDed>0 ? `−${fmtRs(row.advDed)}` : <span style={{color:T.n400}}>—</span>}
                </TD>
                <TD style={{ color:T.red, fontWeight:600 }}>
                  {row.carryFwd>0 ? `−${fmtRs(row.carryFwd)}` : <span style={{color:T.n400}}>—</span>}
                </TD>
                <TD>
                  {row.loanRemaining>0 ? (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ color:T.n400, fontSize:T.base }}>₹</span>
                      <input
                        type="number"
                        value={loanOverrides[row.emp.id] ?? row.loanEmi}
                        onChange={e => setLoanOverrides(ov =>({...ov,[row.emp.id]:Number(e.target.value)}))}
                        style={{ width:100, padding:'6px 10px', border:`1.5px solid ${T.border}`, borderRadius:T.r8, fontSize:T.base, fontFamily:'inherit', outline:'none', color:T.red, fontWeight:700 }}
                      />
                      <div style={{ fontSize:T.xs, color:T.n400, lineHeight:1.3 }}>
                        {fmtRs(row.loanRemaining)} left<br/>EMI: {fmtRs(row.loanEmi)}
                      </div>
                    </div>
                  ) : <span style={{ color:T.n400, fontSize:T.sm }}>No loan</span>}
                </TD>
                <TD>
                  <div style={{ fontSize:T.lg, fontWeight:800, color:row.netPay<0?T.red:T.green }}>
                    {fmtRs(row.netPay)}
                  </div>
                  {row.netPay<0 && (
                    <div style={{ fontSize:T.xs, color:T.red, fontWeight:600 }}>
                      ₹{Math.abs(row.netPay).toLocaleString('en-IN')} carries to next month
                    </div>
                  )}
                </TD>
              </TR>
            ))}

            {/* Footer */}
            <tr style={{ background:T.n50, borderTop:`2px solid ${T.border}` }}>
              <td style={{ padding:'14px 16px', fontSize:T.sm, fontWeight:800, color:T.n700 }}>TOTAL — {preview.length} staff</td>
              <td style={{ padding:'14px 16px', fontSize:T.md, fontWeight:800, color:T.n800 }}>{fmtRs(totalGross)}</td>
              <td style={{ padding:'14px 16px', fontSize:T.md, fontWeight:700, color:T.amber }}>−{fmtRs(preview.reduce((s,r)=>s+r.advDed,0))}</td>
              <td style={{ padding:'14px 16px', fontSize:T.md, fontWeight:700, color:T.red }}>−{fmtRs(preview.reduce((s,r)=>s+r.carryFwd,0))}</td>
              <td style={{ padding:'14px 16px', fontSize:T.md, fontWeight:700, color:T.red }}>−{fmtRs(preview.reduce((s,r)=>s+(loanOverrides[r.emp.id]??r.loanDed),0))}</td>
              <td style={{ padding:'14px 16px', fontSize:T.xl, fontWeight:900, color:T.green }}>{fmtRs(totalNet)}</td>
            </tr>
          </Table>
        )}
      </Card>

      {/* Past closes */}
      {(() => {
        const months = {}
        monthCloses.forEach(mc => {
          const key = `${mc.year}-${pad(mc.month)}`
          if (!months[key]) months[key] = { year:mc.year, month:mc.month, count:0, gross:0, net:0, closedAt:mc.closedAt }
          months[key].count++; months[key].gross+=mc.grossPay; months[key].net+=mc.netPay
        })
        const sorted = Object.entries(months).sort((a,b)=>b[0].localeCompare(a[0]))
        if (!sorted.length) return null
        return (
          <Card p="0" style={{ marginTop:16 }}>
            <CardHead>Closed Months</CardHead>
            <Table headers={['Month','Staff','Gross Payroll','Net Payable','Closed At','']}>
              {sorted.map(([key,m],i) => (
                <TR key={i}>
                  <TD style={{ fontWeight:700, color:T.n700 }}>
                    {new Date(m.year,m.month-1).toLocaleDateString('en-IN',{month:'long',year:'numeric'})}
                  </TD>
                  <TD style={{ color:T.n500 }}>{m.count} staff</TD>
                  <TD style={{ fontWeight:700, color:T.n800 }}>{fmtRs(m.gross)}</TD>
                  <TD style={{ fontWeight:700, color:T.green }}>{fmtRs(m.net)}</TD>
                  <TD style={{ color:T.n400, fontSize:T.sm }}>{m.closedAt}</TD>
                  <TD>
                    <Btn size="xs" variant="ghost" onClick={()=>doSetPeriod(key)}>View</Btn>
                  </TD>
                </TR>
              ))}
            </Table>
          </Card>
        )
      })()}

      {/* Add Advance Modal */}
      <Modal open={showAdvModal} onClose={()=>setShowAdvModal(false)} title={`Add Advance — ${monthLabel}`}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Alert type="info">
            This advance will be deducted from <strong>{monthLabel}</strong> salary. You can change the deduction month below if needed.
          </Alert>
          <Select label="Employee" value={advForm.empId} onChange={v=>setAdvForm(f=>({...f,empId:v}))}
            options={activeStaff.map(e=>({value:e.id,label:`${e.name} (${e.id})`}))}/>
          <Input label="Amount (₹)" type="number" value={advForm.amount} onChange={v=>setAdvForm(f=>({...f,amount:v}))} placeholder="5000" required/>
          {/* FIX #3: explicit deductMonth field */}
          <Select label="Deduct from month" value={advForm.deductMonth||period}
            onChange={v=>setAdvForm(f=>({...f,deductMonth:v}))} options={MONTH_OPTIONS}/>
          <Input label="Notes (optional)" value={advForm.notes} onChange={v=>setAdvForm(f=>({...f,notes:v}))} placeholder="Medical, personal, tool purchase…"/>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Btn variant="ghost" onClick={()=>setShowAdvModal(false)}>Cancel</Btn>
          <Btn onClick={addAdvance} disabled={!advForm.empId||!advForm.amount}>Add Advance</Btn>
        </div>
      </Modal>

      {/* Close month confirm */}
      <Modal open={closingConfirm} onClose={()=>setClosingConfirm(false)} title="Finalise Salary" width={440}>
        <div style={{ textAlign:'center', padding:'8px 0' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:T.lg, fontWeight:800, color:T.n700, marginBottom:8 }}>
            Close {monthLabel}?
          </div>
          <div style={{ fontSize:T.sm, color:T.n400, lineHeight:1.8, marginBottom:8 }}>
            This will finalise salary records for <strong>{preview.length} employees</strong>.
          </div>
          <div style={{ background:T.greenLight, border:`1px solid ${T.greenBorder}`, borderRadius:T.r12, padding:'14px 20px', marginBottom:20, textAlign:'left' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:T.sm, color:T.n600 }}>Total Gross</span>
              <span style={{ fontWeight:700, color:T.n700 }}>{fmtRs(totalGross)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:T.sm, color:T.n600 }}>Total Deductions</span>
              <span style={{ fontWeight:700, color:T.red }}>{fmtRs(totalDed)}</span>
            </div>
            <div style={{ height:1, background:T.greenBorder, margin:'8px 0' }}/>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:T.md, fontWeight:700, color:T.n700 }}>Cash to Pay</span>
              <span style={{ fontSize:T.xl, fontWeight:900, color:T.green }}>{fmtRs(totalNet)}</span>
            </div>
          </div>
          <Alert type="warning">This action cannot be undone. Records will be locked.</Alert>
          <div style={{ display:'flex', justifyContent:'center', gap:10, marginTop:20 }}>
            <Btn variant="ghost" onClick={()=>setClosingConfirm(false)}>Cancel</Btn>
            <Btn style={{ background:T.green, color:'#fff', border:'none' }} onClick={doClose}>
              ✓ Confirm & Close Month
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
