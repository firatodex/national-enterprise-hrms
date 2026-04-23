import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { T } from '../lib/theme.js'
import { fmtRs, fmtDate, pad, computeLoanPaid } from '../lib/calc.js'
import { Card, CardHead, Avatar, Badge, PageHeader, Table, TR, TD, Btn, Modal, Input, Select, Alert, StatCard, ProgressBar } from '../components/UI.jsx'

export default function LoansPage() {
  const { state, dispatch } = useStore()
  const { employees, loans, monthCloses, currentUser, adminPerms } = state

  const canManage = currentUser.role === 'owner' || adminPerms?.canManageLoan

  const [showAdd,  setShowAdd]  = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [confirm,  setConfirm]  = useState(null)
  const [form,     setForm]     = useState({ empId:'', total:'', emi:'' })
  const [toast,    setToast]    = useState(null)

  const showToast = m => { setToast(m); setTimeout(()=>setToast(null),3000) }

  const activeStaff = employees.filter(e => e.active && e.role !== 'owner')

  // FIX #1: Compute paid from MonthClose, not from loans.paid (which is NULL)
  const loansWithComputed = loans.map(l => ({
    ...l,
    paidComputed: computeLoanPaid(l, monthCloses),
  }))

  const active   = loansWithComputed.filter(l => l.active)
  const inactive = loansWithComputed.filter(l => !l.active)
  const totalOutstanding = active.reduce((s,l) => s + Math.max(0,(l.total||0)-l.paidComputed), 0)

  const addLoan = () => {
    if (!form.empId || !form.total) return
    dispatch({ type:'ADD_LOAN', empId:form.empId, total:Number(form.total), emi:Number(form.emi)||0 })
    setShowAdd(false)
    setForm({empId:'',total:'',emi:''})
    showToast('Loan added')
  }

  const saveEmi = () => {
    dispatch({ type:'UPDATE_LOAN_EMI', loanId:showEdit.id, emi:Number(form.emi)||0 })
    setShowEdit(null)
    showToast('EMI updated')
  }

  return (
    <div>
      {toast && (
        <div style={{ position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:T.green,color:'#fff',padding:'11px 22px',borderRadius:T.r12,fontWeight:700,fontSize:T.base,zIndex:900,boxShadow:T.shadowMd }}>
          ✓ {toast}
        </div>
      )}

      <PageHeader
        title="Loans"
        sub="Loan balances are computed live from closed salary records"
        action={canManage && <Btn onClick={()=>{setForm({empId:activeStaff[0]?.id||'',total:'',emi:''}); setShowAdd(true)}} icon="+">Add Loan</Btn>}
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
        <StatCard label="Active Loans"  value={active.length}      color={T.amber}/>
        <StatCard label="Outstanding"   value={fmtRs(totalOutstanding)} color={T.red}/>
        <StatCard label="Closed Loans"  value={inactive.length}    color={T.green}/>
      </div>

      <Alert type="info" style={{ marginBottom:16 }}>
        Loan balances are computed from salary close records. The "Paid" amount updates automatically each time a month is closed with a loan deduction.
      </Alert>

      <Card p="0">
        <CardHead>Active Loans ({active.length})</CardHead>
        {active.length === 0 ? (
          <div style={{ padding:'40px', textAlign:'center', color:T.n400 }}>No active loans</div>
        ) : (
          <Table headers={['Employee','Loan Total','Paid (from closes)','Remaining','Monthly EMI','Progress','']}>
            {active.map((loan, i) => {
              const emp       = employees.find(e => e.id === loan.empId)
              const paid      = loan.paidComputed
              const remaining = Math.max(0, (loan.total||0) - paid)
              const pct       = loan.total > 0 ? Math.round(paid/loan.total*100) : 0
              return (
                <TR key={i}>
                  <TD>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <Avatar name={emp?.name||loan.empId} dept={emp?.dept||'Production'} size={32}/>
                      <div>
                        <div style={{ fontSize:T.base, fontWeight:700, color:T.n700 }}>{emp?.name||loan.empId}</div>
                        <div style={{ fontSize:T.xs, color:T.n400 }}>{loan.id} · {fmtDate(loan.date)}</div>
                      </div>
                    </div>
                  </TD>
                  <TD style={{ fontWeight:700, color:T.n800 }}>{fmtRs(loan.total)}</TD>
                  <TD style={{ fontWeight:700, color:T.green }}>{fmtRs(paid)}</TD>
                  <TD style={{ fontWeight:800, color:T.red, fontSize:T.md }}>{fmtRs(remaining)}</TD>
                  <TD>
                    {loan.monthlyEMI > 0 ? (
                      <span style={{ fontWeight:700, color:T.brand }}>{fmtRs(loan.monthlyEMI)}/mo</span>
                    ) : (
                      <span style={{ color:T.n400, fontSize:T.sm }}>Not set</span>
                    )}
                  </TD>
                  <TD style={{ minWidth:120 }}>
                    <div style={{ fontSize:T.xs, color:T.n400, marginBottom:4 }}>{pct}% repaid</div>
                    <ProgressBar pct={pct} color={pct>=80?T.green:T.brand}/>
                  </TD>
                  <TD>
                    <div style={{ display:'flex', gap:6 }}>
                      <Btn size="xs" variant="ghost" onClick={()=>{ setShowEdit(loan); setForm({...form,emi:loan.monthlyEMI||0}) }}>Edit EMI</Btn>
                      {canManage && <Btn size="xs" variant="danger" onClick={()=>setConfirm(loan)}>Close</Btn>}
                    </div>
                  </TD>
                </TR>
              )
            })}
          </Table>
        )}
      </Card>

      {inactive.length > 0 && (
        <Card p="0" style={{ marginTop:16 }}>
          <CardHead>Closed Loans ({inactive.length})</CardHead>
          <Table headers={['Employee','Loan Total','Total Paid','Closed']}>
            {inactive.map((loan,i)=>{
              const emp  = employees.find(e=>e.id===loan.empId)
              return (
                <TR key={i}>
                  <TD><div style={{ display:'flex',alignItems:'center',gap:8 }}><Avatar name={emp?.name||loan.empId} dept={emp?.dept||''} size={28}/><span style={{ fontSize:T.base,fontWeight:600,color:T.n600 }}>{emp?.name||loan.empId}</span></div></TD>
                  <TD style={{ color:T.n500 }}>{fmtRs(loan.total)}</TD>
                  <TD style={{ color:T.green, fontWeight:700 }}>{fmtRs(loan.paidComputed)}</TD>
                  <TD><Badge color="green">Closed</Badge></TD>
                </TR>
              )
            })}
          </Table>
        </Card>
      )}

      {/* Add loan */}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Loan">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Select label="Employee" value={form.empId} onChange={v=>setForm(f=>({...f,empId:v}))}
            options={activeStaff.map(e=>({value:e.id,label:`${e.name} (${e.id})`}))}/>
          <Input label="Loan Amount (₹)" type="number" value={form.total} onChange={v=>setForm(f=>({...f,total:v}))} placeholder="50000" required/>
          <Input label="Monthly EMI (₹)" type="number" value={form.emi} onChange={v=>setForm(f=>({...f,emi:v}))} placeholder="3000"
            note="This will be pre-filled in the salary close page each month. Can be changed later."/>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addLoan} disabled={!form.empId||!form.total}>Add Loan</Btn>
        </div>
      </Modal>

      {/* Edit EMI */}
      <Modal open={!!showEdit} onClose={()=>setShowEdit(null)} title="Update Monthly EMI" width={380}>
        <div style={{ marginBottom:14 }}>
          <Input label="Monthly EMI (₹)" type="number" value={form.emi} onChange={v=>setForm(f=>({...f,emi:v}))} placeholder="3000"
            note="This will pre-fill the loan deduction in the next salary close"/>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
          <Btn variant="ghost" onClick={()=>setShowEdit(null)}>Cancel</Btn>
          <Btn onClick={saveEmi}>Save EMI</Btn>
        </div>
      </Modal>

      {/* Close confirm */}
      <Modal open={!!confirm} onClose={()=>setConfirm(null)} title="Close Loan" width={400}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
          <div style={{ fontSize:T.md, fontWeight:700, color:T.n700, marginBottom:8 }}>
            Close loan for {employees.find(e=>e.id===confirm?.empId)?.name}?
          </div>
          <div style={{ fontSize:T.sm, color:T.n400, marginBottom:20 }}>
            Remaining balance: {fmtRs(Math.max(0,(confirm?.total||0)-confirm?.paidComputed))}
          </div>
          <div style={{ display:'flex', justifyContent:'center', gap:10 }}>
            <Btn variant="ghost" onClick={()=>setConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>{ dispatch({type:'CLOSE_LOAN',loanId:confirm.id}); setConfirm(null); showToast('Loan closed') }}>Close Loan</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
