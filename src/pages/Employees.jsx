import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { T } from '../lib/theme.js'
import { fmtDate } from '../lib/calc.js'
import { Card, Avatar, Badge, PageHeader, Table, TR, TD, Btn, Modal, Input, Select, Alert } from '../components/UI.jsx'

const DEPTS = ['Production','Management','Quality','Logistics','Admin']
const ROLES  = [{value:'employee',label:'Employee'},{value:'admin',label:'Admin'},{value:'owner',label:'Owner'}]

export default function EmployeesPage() {
  const { state, dispatch } = useStore()
  const { employees, currentUser } = state

  const [search,   setSearch]   = useState('')
  const [showAdd,  setShowAdd]  = useState(false)
  const [showEdit, setShowEdit] = useState(null)   // employee object
  const [form,     setForm]     = useState({ name:'', dept:'Production', wage:'', phone:'', role:'employee' })
  const [toast,    setToast]    = useState(null)
  const [confirm,  setConfirm]  = useState(null)

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  const isOwner = currentUser.role === 'owner'
  const active  = employees.filter(e => e.active && e.role !== 'owner')
  const filtered= active.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.id.toLowerCase().includes(search.toLowerCase()) ||
    e.dept.toLowerCase().includes(search.toLowerCase())
  )

  const addEmp = () => {
    if (!form.name.trim() || !form.wage) return
    dispatch({ type:'ADD_EMPLOYEE', name:form.name.trim(), dept:form.dept, wage:Number(form.wage), phone:form.phone })
    setShowAdd(false)
    setForm({name:'',dept:'Production',wage:'',phone:'',role:'employee'})
    showToast(`${form.name} added successfully`)
  }

  const openEdit = emp => {
    setShowEdit(emp)
    setForm({ name:emp.name, dept:emp.dept, wage:emp.dailyWage, phone:emp.phone||'', role:emp.role })
  }

  const saveEdit = () => {
    dispatch({ type:'UPDATE_WAGE',     empId:showEdit.id, wage:Number(form.wage) })
    if (isOwner && form.role !== showEdit.role) {
      dispatch({ type:'UPDATE_ROLE', empId:showEdit.id, role:form.role })
    }
    setShowEdit(null)
    showToast('Employee updated')
  }

  const deactivate = emp => {
    dispatch({ type:'DEACTIVATE_EMPLOYEE', empId:emp.id })
    setConfirm(null)
    showToast(`${emp.name} deactivated`, 'success')
  }

  return (
    <div>
      {toast && (
        <div style={{ position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:toast.type==='success'?T.green:T.red,color:'#fff',padding:'11px 22px',borderRadius:T.r12,fontWeight:700,fontSize:T.base,zIndex:900,boxShadow:T.shadowMd }}>
          {toast.type==='success'?'✓ ':''}{toast.msg}
        </div>
      )}

      <PageHeader
        title="Team"
        sub={`${active.length} active employees`}
        action={<Btn onClick={() => setShowAdd(true)} icon="+">Add Employee</Btn>}
      />

      <div style={{ marginBottom:16 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, ID, or department…"
          style={{ width:'100%', padding:'11px 14px', border:`1.5px solid ${T.border}`, borderRadius:T.r12, fontSize:T.base, fontFamily:'inherit', outline:'none', background:T.surface }}/>
      </div>

      <Card p="0">
        <Table headers={['Employee','ID','Department','Daily Wage','Phone','Role','']}>
          {filtered.map((emp, i) => (
            <TR key={i}>
              <TD>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Avatar name={emp.name} dept={emp.dept} size={36}/>
                  <div>
                    <div style={{ fontSize:T.base, fontWeight:700, color:T.n700 }}>{emp.name}</div>
                    <div style={{ fontSize:T.xs, color:T.n400 }}>Joined {fmtDate(emp.joinDate)}</div>
                  </div>
                </div>
              </TD>
              <TD style={{ fontFamily:"'JetBrains Mono',monospace", color:T.n500, fontSize:T.sm }}>{emp.id}</TD>
              <TD>
                <span style={{ fontSize:T.sm, fontWeight:700, padding:'3px 10px', borderRadius:T.full,
                  background: emp.dept==='Production'?T.brandLight:emp.dept==='Management'?'#F5F3FF':'#F0FDF4',
                  color: emp.dept==='Production'?T.brand:emp.dept==='Management'?'#7C3AED':'#059669' }}>
                  {emp.dept}
                </span>
              </TD>
              <TD style={{ fontWeight:800, color:T.n800, fontSize:T.md }}>₹{emp.dailyWage}<span style={{fontWeight:400,color:T.n400,fontSize:T.xs}}>/day</span></TD>
              <TD style={{ color:T.n500, fontFamily:"'JetBrains Mono',monospace", fontSize:T.sm }}>{emp.phone||'—'}</TD>
              <TD>
                <Badge color={emp.role==='admin'?'blue':emp.role==='owner'?'purple':'gray'}>
                  {emp.role==='admin'?'Admin':emp.role==='owner'?'Owner':'Staff'}
                </Badge>
              </TD>
              <TD>
                <div style={{ display:'flex', gap:6 }}>
                  <Btn size="xs" variant="ghost" onClick={() => openEdit(emp)}>Edit</Btn>
                  {isOwner && emp.id !== currentUser.id && (
                    <Btn size="xs" variant="danger" onClick={() => setConfirm(emp)}>Remove</Btn>
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </Table>
      </Card>

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Employee">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <Input label="Full Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="Ravi Shankar Thakor" required/>
          </div>
          <Select label="Department" value={form.dept} onChange={v=>setForm(f=>({...f,dept:v}))} options={DEPTS}/>
          <Input label="Daily Wage (₹)" type="number" value={form.wage} onChange={v=>setForm(f=>({...f,wage:v}))} placeholder="800" required/>
          <div style={{ gridColumn:'1/-1' }}>
            <Input label="Phone Number" value={form.phone} onChange={v=>setForm(f=>({...f,phone:v}))} placeholder="9876543210"
              note="Employee can use their phone number to identify themselves"/>
          </div>
        </div>
        <Alert type="info" style={{ marginTop:14 }}>
          Employee ID and default PIN will be auto-assigned. The employee's initial PIN equals their Employee ID (e.g. EMP037 → PIN is EMP037).
        </Alert>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addEmp} disabled={!form.name||!form.wage}>Add Employee</Btn>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title={`Edit — ${showEdit?.name}`}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Select label="Department" value={form.dept} onChange={v=>setForm(f=>({...f,dept:v}))} options={DEPTS}/>
          <Input label="Daily Wage (₹)" type="number" value={form.wage} onChange={v=>setForm(f=>({...f,wage:v}))} required/>
          <Input label="Phone" value={form.phone} onChange={v=>setForm(f=>({...f,phone:v}))}/>
          {isOwner && (
            <Select label="Role" value={form.role} onChange={v=>setForm(f=>({...f,role:v}))} options={ROLES}/>
          )}
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Btn variant="ghost" onClick={() => setShowEdit(null)}>Cancel</Btn>
          <Btn onClick={saveEdit} disabled={!form.wage}>Save Changes</Btn>
        </div>
      </Modal>

      {/* Deactivate confirm */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Confirm Removal" width={400}>
        <div style={{ textAlign:'center', padding:'8px 0' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
          <div style={{ fontSize:T.md, fontWeight:700, color:T.n700, marginBottom:8 }}>
            Deactivate {confirm?.name}?
          </div>
          <div style={{ fontSize:T.sm, color:T.n400, lineHeight:1.7, marginBottom:24 }}>
            Their attendance and salary history will be preserved. They will no longer be able to log in or appear in active lists.
          </div>
          <div style={{ display:'flex', justifyContent:'center', gap:10 }}>
            <Btn variant="ghost" onClick={() => setConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => deactivate(confirm)}>Deactivate</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
