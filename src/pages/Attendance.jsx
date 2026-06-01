import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiManualPunch, apiDeletePunch } from '../api'
import { fmt12, timeToMins, lunchDeduct, todayStr, nowTime, fmtRs, DEPT_COLORS, initials } from '../utils/helpers'
import { roleBadge } from '../utils/badges'

const nd = (val) => String(val || '').substring(0, 10)

export default function Attendance() {
  const { db, refresh } = useAuth()
  const showToast = useToast()
  const [date, setDate] = useState(todayStr())
  const [modal, setModal] = useState(false)
  const [mpForm, setMpForm] = useState({ emp: '', date: todayStr(), type: 'in', time: nowTime(), remark: '' })

  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)

  const sessionsForDate = (empId) =>
    db.punches
      .filter((p) => p.emp_id === empId && nd(p.date) === date)
      .sort((a, b) => (a.session || 1) - (b.session || 1))

  let presentCount = 0
  emps.forEach((e) => { if (sessionsForDate(e.id).some((s) => s.in_time)) presentCount++ })

  const openManual = () => {
    setMpForm({ emp: emps[0]?.id || '', date, type: 'in', time: nowTime(), remark: '' })
    setModal(true)
  }

  const saveManual = async () => {
    if (!mpForm.time) { showToast('Enter time', 'var(--red)'); return }
    const r = await apiManualPunch(mpForm.emp, mpForm.date, mpForm.type, mpForm.time, mpForm.remark)
    if (r.ok) { setModal(false); showToast('Saved'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const deletePunch = async (punch, empName) => {
    const timeStr = punch.in_time ? fmt12(punch.in_time) : fmt12(punch.out_time)
    if (!window.confirm(`Delete punch entry for ${empName}?\nTime: ${timeStr}\n\nThis cannot be undone.`)) return
    const r = await apiDeletePunch(punch.id)
    if (r.ok) { showToast('Punch deleted'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Attendance</div></div>
        <div className="flex gap8 items-center">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="inp" style={{ width: 160 }}/>
          <button className="btn btn-outline" onClick={openManual}>+ Manual Entry</button>
        </div>
      </div>

      <div className="flex gap8 items-center" style={{ marginBottom: 16 }}>
        <span className="badge b-green" style={{ fontSize: 12 }}>Present: <strong>{presentCount}</strong></span>
        <span className="badge b-red" style={{ fontSize: 12 }}>Absent: <strong>{emps.length - presentCount}</strong></span>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Role</th><th>Sessions</th><th>Total Time</th><th>Pay</th></tr>
            </thead>
            <tbody>
              {emps.map((e) => {
                const sessions = sessionsForDate(e.id)
                const hasIn = sessions.some((s) => s.in_time)
                let totalMin = 0
                sessions.forEach((s) => {
                  if (s.in_time && s.out_time) {
                    const inM = timeToMins(s.in_time)
                    const outM = timeToMins(s.out_time)
                    const diff = outM - inM - lunchDeduct(inM, outM)
                    if (diff > 0) totalMin += diff
                  }
                })
                const pay = Math.round(totalMin * (e.daily_wage / 480))
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="flex items-center gap8">
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${DEPT_COLORS[e.dept] || '#888'}20`, color: DEPT_COLORS[e.dept] || '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                          {initials(e.name)}
                        </div>
                        <span className="fw6">{e.name}</span>
                      </div>
                    </td>
                    <td>{roleBadge(e.role)}</td>
                    <td>
                      {sessions.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {sessions.map((s) => (
                            <div key={s.id} className="flex items-center gap8">
                              <span className="text-sm">
                                {fmt12(s.in_time) || '?'}→{fmt12(s.out_time) || '?'}
                                {(s.manual_in || s.manual_out) && (
                                  <span className="badge b-amber" style={{ fontSize: 9, marginLeft: 2 }}>M</span>
                                )}
                              </span>
                              <button
                                className="btn btn-danger btn-sm"
                                style={{ padding: '2px 7px', fontSize: 11 }}
                                onClick={() => deletePunch(s, e.name)}>
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="fw6">
                      {totalMin > 0 ? `${totalMin} min`
                        : hasIn ? <span className="badge b-amber">Active</span>
                        : <span className="badge b-gray">Absent</span>}
                    </td>
                    <td className="fw6 text-green">{totalMin > 0 ? fmtRs(pay) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Manual Punch Entry<button className="modal-close" onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4 }}>
              <div className="form-grid">
                <div style={{ gridColumn: '1/-1' }}><label className="lbl">Employee</label><select className="inp" value={mpForm.emp} onChange={(e) => setMpForm((f) => ({ ...f, emp: e.target.value }))}>{emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}</select></div>
                <div><label className="lbl">Date</label><input className="inp" type="date" value={mpForm.date} onChange={(e) => setMpForm((f) => ({ ...f, date: e.target.value }))}/></div>
                <div><label className="lbl">Type</label><select className="inp" value={mpForm.type} onChange={(e) => setMpForm((f) => ({ ...f, type: e.target.value }))}><option value="in">Punch IN</option><option value="out">Punch OUT</option></select></div>
                <div><label className="lbl">Time</label><input className="inp" type="time" value={mpForm.time} onChange={(e) => setMpForm((f) => ({ ...f, time: e.target.value }))}/></div>
                <div><label className="lbl">Remark</label><input className="inp" value={mpForm.remark} onChange={(e) => setMpForm((f) => ({ ...f, remark: e.target.value }))} placeholder="Optional"/></div>
              </div>
            </div>
            <div className="modal-foot"><button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveManual}>Save</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
