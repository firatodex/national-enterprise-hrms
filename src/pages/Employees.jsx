import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiAddEmployee, apiChangePassword, apiChangeDailyWage, apiChangeRole } from '../api'
import { initials, fmtRs, fmtDate, todayStr, DEPT_COLORS, capitalize } from '../utils/helpers'
import { roleBadge, deptBadge } from '../utils/badges'

const DEPTS = ['Production', 'Quality Control', 'Maintenance', 'Logistics', 'Admin']

export default function Employees() {
  const { currentUser, db, refresh } = useAuth()
  const showToast = useToast()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ fname: '', lname: '', dept: 'Production', wage: '', phone: '', join: todayStr(), pass: '' })
  const [cpForm, setCpForm] = useState({ emp: '', pass: '', pass2: '' })
  const [cwForm, setCwForm] = useState({ emp: '', wage: '' })
  const [crForm, setCrForm] = useState({ emp: '', role: 'employee' })

  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)
  const filtered = emps.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.id.toLowerCase().includes(search.toLowerCase()) ||
      e.dept.toLowerCase().includes(search.toLowerCase())
  )

  const openModal = (name) => {
    if (name === 'pwd') setCpForm({ emp: emps[0]?.id || '', pass: '', pass2: '' })
    if (name === 'wage') setCwForm({ emp: emps[0]?.id || '', wage: '' })
    if (name === 'role') setCrForm({ emp: db.users.filter(u => u.active && u.id !== currentUser.id)[0]?.id || '', role: 'employee' })
    setModal(name)
  }

  const addEmp = async () => {
    if (!form.fname || !form.lname) { showToast('Enter full name', 'var(--red)'); return }
    const r = await apiAddEmployee(`${form.fname} ${form.lname}`, form.dept, form.wage, form.phone, form.join, form.pass)
    if (r.ok) { setModal(null); showToast(`Added (${r.id})`); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const changePwd = async () => {
    if (!cpForm.pass || cpForm.pass !== cpForm.pass2) { showToast("Passwords don't match", 'var(--red)'); return }
    const r = await apiChangePassword(cpForm.emp, cpForm.pass)
    if (r.ok) { setModal(null); showToast('Password updated') }
    else showToast(r.err, 'var(--red)')
  }

  const changeWage = async () => {
    if (!cwForm.wage || Number(cwForm.wage) <= 0) { showToast('Enter valid wage', 'var(--red)'); return }
    const r = await apiChangeDailyWage(cwForm.emp, cwForm.wage)
    if (r.ok) { setModal(null); showToast('Wage updated'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const changeRole = async () => {
    if (crForm.emp === currentUser.id) { showToast("Can't change your own role", 'var(--red)'); return }
    if (!window.confirm(`Change role to ${capitalize(crForm.role)}?`)) return
    const r = await apiChangeRole(crForm.emp, crForm.role)
    if (r.ok) { setModal(null); showToast('Role updated'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const curWageEmp = emps.find((e) => e.id === cwForm.emp)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Employees</div>
          <div className="page-sub">{emps.length} active staff</div>
        </div>
        <div className="flex gap8" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => openModal('pwd')}>Change Password</button>
          <button className="btn btn-outline" onClick={() => openModal('wage')}>Change Wage</button>
          {currentUser.role === 'owner' && (
            <button className="btn btn-outline" onClick={() => openModal('role')}>Change Role</button>
          )}
          <button className="btn btn-primary" onClick={() => setModal('add')}>+ Add Employee</button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search-inp"
          placeholder="Search name, ID, department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th><th>ID</th><th>Role</th>
                <th>Department</th><th>Wage/Day</th><th>Phone</th><th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="flex items-center gap8">
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${DEPT_COLORS[e.dept] || '#888'}20`, color: DEPT_COLORS[e.dept] || '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {initials(e.name)}
                      </div>
                      <span className="fw6">{e.name}</span>
                    </div>
                  </td>
                  <td className="text-muted">{e.id}</td>
                  <td>{roleBadge(e.role)}</td>
                  <td>{deptBadge(e.dept)}</td>
                  <td className="fw6">{fmtRs(e.daily_wage)}<span className="text-muted text-xs">/day</span></td>
                  <td className="text-muted">{e.phone}</td>
                  <td className="text-muted">{fmtDate(e.join_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Employee */}
      {modal === 'add' && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Add Employee<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4 }}>
              <div className="form-grid">
                <div><label className="lbl">First Name</label><input className="inp" value={form.fname} onChange={(e) => setForm((f) => ({ ...f, fname: e.target.value }))} placeholder="Ravi"/></div>
                <div><label className="lbl">Last Name</label><input className="inp" value={form.lname} onChange={(e) => setForm((f) => ({ ...f, lname: e.target.value }))} placeholder="Kumar"/></div>
                <div><label className="lbl">Department</label><select className="inp" value={form.dept} onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></div>
                <div><label className="lbl">Daily Wage (₹)</label><input className="inp" type="number" value={form.wage} onChange={(e) => setForm((f) => ({ ...f, wage: e.target.value }))} placeholder="900"/></div>
                <div><label className="lbl">Phone</label><input className="inp" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="9876543210"/></div>
                <div><label className="lbl">Join Date</label><input className="inp" type="date" value={form.join} onChange={(e) => setForm((f) => ({ ...f, join: e.target.value }))}/></div>
                <div style={{ gridColumn: '1/-1' }}><label className="lbl">Password <span className="text-muted">(blank = Employee ID)</span></label><input className="inp" type="password" value={form.pass} onChange={(e) => setForm((f) => ({ ...f, pass: e.target.value }))}/></div>
              </div>
            </div>
            <div className="modal-foot"><button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={addEmp}>Add Employee</button></div>
          </div>
        </div>
      )}

      {/* Change Password */}
      {modal === 'pwd' && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Change Password<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label className="lbl">Employee</label><select className="inp" value={cpForm.emp} onChange={(e) => setCpForm((f) => ({ ...f, emp: e.target.value }))}>{emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}</select></div>
              <div><label className="lbl">New Password</label><input className="inp" type="password" value={cpForm.pass} onChange={(e) => setCpForm((f) => ({ ...f, pass: e.target.value }))}/></div>
              <div><label className="lbl">Confirm Password</label><input className="inp" type="password" value={cpForm.pass2} onChange={(e) => setCpForm((f) => ({ ...f, pass2: e.target.value }))}/></div>
            </div>
            <div className="modal-foot"><button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={changePwd}>Update</button></div>
          </div>
        </div>
      )}

      {/* Change Wage */}
      {modal === 'wage' && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Change Daily Wage<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label className="lbl">Employee</label><select className="inp" value={cwForm.emp} onChange={(e) => setCwForm((f) => ({ ...f, emp: e.target.value }))}>{emps.map((e) => <option key={e.id} value={e.id}>{e.name} — {fmtRs(e.daily_wage)}/day</option>)}</select></div>
              <div><label className="lbl">Current Wage</label><div style={{ padding: '8px 0', fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>{fmtRs(curWageEmp?.daily_wage || 0)}/day</div></div>
              <div><label className="lbl">New Daily Wage (₹)</label><input className="inp" type="number" value={cwForm.wage} onChange={(e) => setCwForm((f) => ({ ...f, wage: e.target.value }))} placeholder="1000"/></div>
            </div>
            <div className="modal-foot"><button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={changeWage}>Update Wage</button></div>
          </div>
        </div>
      )}

      {/* Change Role */}
      {modal === 'role' && currentUser.role === 'owner' && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Change Role<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label className="lbl">Employee</label><select className="inp" value={crForm.emp} onChange={(e) => setCrForm((f) => ({ ...f, emp: e.target.value }))}>{db.users.filter((u) => u.active && u.id !== currentUser.id).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.id}) — {capitalize(e.role)}</option>)}</select></div>
              <div><label className="lbl">New Role</label><select className="inp" value={crForm.role} onChange={(e) => setCrForm((f) => ({ ...f, role: e.target.value }))}><option value="employee">Employee</option><option value="admin">Admin</option><option value="owner">Owner</option></select></div>
            </div>
            <div className="modal-foot"><button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={changeRole}>Update Role</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
