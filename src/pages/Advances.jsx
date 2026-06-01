import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiAddAdvance, apiDeleteAdvance } from '../api'
import { fmtRs, fmtDate, todayStr, initials } from '../utils/helpers'

export default function Advances() {
  const { currentUser, db, refresh } = useAuth()
  const showToast = useToast()
  const [modal, setModal] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ emp: '', amount: '', date: todayStr(), notes: '' })

  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)
  const empById = (id) => db.users.find((u) => u.id === id)

  const today = todayStr()
  const [yr, mo] = today.split('-').map(Number)
  const thisMonth = db.advances
    .filter((a) => {
      const dt = String(a.date).substring(0, 10)
      const parts = dt.split('-').map(Number)
      return parts[0] === yr && parts[1] === mo
    })
    .reduce((s, a) => s + Number(a.amount || 0), 0)

  const filtered = db.advances
    .filter((a) => {
      const e = empById(a.emp_id)
      const name = e ? e.name.toLowerCase() : ''
      return name.includes(search.toLowerCase()) || a.emp_id.toLowerCase().includes(search.toLowerCase())
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))

  const saveAdvance = async () => {
    if (!form.amount || Number(form.amount) <= 0) { showToast('Enter valid amount', 'var(--red)'); return }
    const r = await apiAddAdvance(form.emp, form.amount, form.date, form.notes, currentUser.name)
    if (r.ok) { setModal(false); showToast('Advance recorded'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const deleteAdvance = async (a) => {
    const e = empById(a.emp_id)
    if (!window.confirm(`Delete advance of ${fmtRs(a.amount)} for ${e ? e.name : a.emp_id}?\n\nThis cannot be undone.`)) return
    const r = await apiDeleteAdvance(a.id)
    if (r.ok) { showToast('Advance deleted'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Advances</div>
          <div className="page-sub">Cash given to employees — auto-deducted from that month's salary</div>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setForm({ emp: emps[0]?.id || '', amount: '', date: todayStr(), notes: '' })
          setModal(true)
        }}>+ Add Advance</button>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="stat"><div className="stat-label">This Month</div><div className="stat-val text-amber">{fmtRs(thisMonth)}</div></div>
        <div className="stat"><div className="stat-label">Total Entries</div><div className="stat-val">{db.advances.length}</div></div>
      </div>

      <div className="toolbar">
        <input className="search-inp" placeholder="Search by name or ID…"
          value={search} onChange={(e) => setSearch(e.target.value)}/>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Amount</th><th>Date Given</th><th>Notes</th><th>Added By</th><th>Action</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No advances recorded</td></tr>
              ) : (
                filtered.map((a) => {
                  const e = empById(a.emp_id)
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="flex items-center gap8">
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--amber-light)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                            {initials(e ? e.name : a.emp_id)}
                          </div>
                          <div>
                            <div className="fw6">{e ? e.name : a.emp_id}</div>
                            <div className="text-muted text-xs">{a.emp_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="fw7 text-amber">{fmtRs(a.amount)}</td>
                      <td className="text-muted">{fmtDate(a.date)}</td>
                      <td className="text-muted">{a.notes || '—'}</td>
                      <td className="text-muted text-xs">{a.added_by || '—'}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteAdvance(a)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Add Advance<button className="modal-close" onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4 }}>
              <div className="form-grid">
                <div style={{ gridColumn: '1/-1' }}><label className="lbl">Employee</label><select className="inp" value={form.emp} onChange={(e) => setForm((f) => ({ ...f, emp: e.target.value }))}>{emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}</select></div>
                <div><label className="lbl">Amount (₹)</label><input className="inp" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="5000"/></div>
                <div><label className="lbl">Date Given</label><input className="inp" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}/></div>
                <div style={{ gridColumn: '1/-1' }}><label className="lbl">Notes</label><input className="inp" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional"/></div>
              </div>
            </div>
            <div className="modal-foot"><button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveAdvance}>Add Advance</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
