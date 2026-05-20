import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiAddLoan, apiRecordLoanPayment, apiCloseLoan } from '../api'
import { fmtRs, fmtDate, todayStr, pad, fmtMonthYear } from '../utils/helpers'

// Generate last 12 months as dropdown options
function getMonthOptions() {
  const options = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    let mo = now.getMonth() + 1 - i
    let yr = now.getFullYear()
    if (mo <= 0) { mo += 12; yr -= 1 }
    // value stored as "YYYY-MM" internally, displayed as "Month YYYY"
    options.push({ value: `${yr}-${pad(mo)}`, label: fmtMonthYear(yr, mo) })
  }
  return options
}

const MONTH_OPTIONS = getMonthOptions()

export default function Loans() {
  const { currentUser, db, refresh } = useAuth()
  const showToast = useToast()
  const [modal, setModal] = useState(null)
  const [selLoan, setSelLoan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [addForm, setAddForm] = useState({ emp: '', amount: '', date: todayStr() })
  // FIX: month is now a dropdown value "YYYY-MM", not free text
  const [rpForm, setRpForm] = useState({ amount: '', month: MONTH_OPTIONS[0].value })

  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)
  const empById = (id) => db.users.find((u) => u.id === id)
  const active = db.loans.filter((l) => l.active)
  const outstanding = active.reduce((s, l) => s + (Number(l.total) - Number(l.paid)), 0)

  const addLoan = async () => {
    if (!addForm.amount || Number(addForm.amount) <= 0) { showToast('Enter valid amount', 'var(--red)'); return }
    if (!addForm.emp) { showToast('Select employee', 'var(--red)'); return }
    setBusy(true)
    const r = await apiAddLoan(addForm.emp, addForm.amount, addForm.date, '')
    setBusy(false)
    if (r.ok) { setModal(null); showToast('Loan added'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const openRP = (loan) => {
    setSelLoan(loan)
    setRpForm({ amount: '', month: MONTH_OPTIONS[0].value })
    setModal('pay')
  }

  const recordPayment = async () => {
    if (!rpForm.amount || Number(rpForm.amount) <= 0) { showToast('Enter valid amount', 'var(--red)'); return }
    if (!rpForm.month) { showToast('Select month', 'var(--red)'); return }

    // Validate amount doesn't exceed remaining balance
    const remaining = Number(selLoan.total) - Number(selLoan.paid)
    if (Number(rpForm.amount) > remaining) {
      showToast(`Amount exceeds remaining balance of ${fmtRs(remaining)}`, 'var(--red)')
      return
    }

    setBusy(true)
    // Store month as "YYYY-MM" format — consistent, no spelling mistakes
    const r = await apiRecordLoanPayment(selLoan.id, rpForm.amount, rpForm.month, currentUser.name)
    setBusy(false)
    if (r.ok) {
      setModal(null)
      showToast(r.closed ? 'Loan fully repaid! 🎉' : `Recorded ${fmtRs(rpForm.amount)}`)
      await refresh()
    } else showToast(r.err, 'var(--red)')
  }

  const closeLoan = async (loan) => {
    if (!window.confirm('Mark this loan as closed? This cannot be undone.')) return
    setBusy(true)
    const r = await apiCloseLoan(loan.id)
    setBusy(false)
    if (r.ok) { showToast('Loan closed'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const openLedger = (loan) => { setSelLoan(loan); setModal('ledger') }

  // Format month value "YYYY-MM" to display label
  const fmtMonthVal = (val) => {
    if (!val) return '—'
    const opt = MONTH_OPTIONS.find(o => o.value === val)
    if (opt) return opt.label
    // Fallback for old free-text values stored before this fix
    return val
  }

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Loans</div></div>
        <button className="btn btn-primary" onClick={() => {
          setAddForm({ emp: emps[0]?.id || '', amount: '', date: todayStr() })
          setModal('add')
        }}>+ Add Loan</button>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="stat"><div className="stat-label">Active Loans</div><div className="stat-val">{active.length}</div></div>
        <div className="stat"><div className="stat-label">Outstanding</div><div className="stat-val text-red">{fmtRs(outstanding)}</div></div>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Date</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {db.loans.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No loans recorded</td></tr>
              ) : db.loans.map((l) => {
                const e = empById(l.emp_id)
                const rem = Number(l.total) - Number(l.paid)
                const pct = Number(l.total) > 0 ? Math.round((Number(l.paid) / Number(l.total)) * 100) : 0
                return (
                  <tr key={l.id}>
                    <td className="fw6">{e ? e.name : '—'} <span className="text-muted text-xs">{l.emp_id}</span></td>
                    <td>{fmtRs(l.total)}</td>
                    <td>
                      <div className="text-green fw6">{fmtRs(l.paid)}</div>
                      <div className="prog" style={{ marginTop: 4, width: 80 }}>
                        <div className="prog-fill" style={{ width: `${pct}%`, background: 'var(--green)' }}/>
                      </div>
                    </td>
                    <td className="text-red fw6">{fmtRs(rem)}</td>
                    <td className="text-muted">{fmtDate(l.date)}</td>
                    <td><span className={`badge ${l.active ? 'b-green' : 'b-gray'}`}>{l.active ? 'Active' : 'Closed'}</span></td>
                    <td>
                      <div className="flex gap8">
                        <button className="btn btn-outline btn-sm" onClick={() => openLedger(l)}>History</button>
                        {l.active && <button className="btn btn-success btn-sm" onClick={() => openRP(l)}>+ Deduct</button>}
                        {l.active && <button className="btn btn-danger btn-sm" onClick={() => closeLoan(l)}>Close</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Loan Modal */}
      {modal === 'add' && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Add Loan<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4 }}>
              <div className="form-grid">
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Employee</label>
                  <select className="inp" value={addForm.emp} onChange={(e) => setAddForm((f) => ({ ...f, emp: e.target.value }))}>
                    {emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Total Loan Amount (₹)</label>
                  <input className="inp" type="number" min="1" value={addForm.amount}
                    onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))} placeholder="50000"/>
                </div>
                <div>
                  <label className="lbl">Loan Start Date</label>
                  <input className="inp" type="date" value={addForm.date}
                    onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}/>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={addLoan} disabled={busy}>
                {busy ? 'Adding…' : 'Add Loan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record EMI Payment Modal */}
      {modal === 'pay' && selLoan && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Record Loan EMI Deduction<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Loan summary */}
              <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8, fontSize: 13 }}>
                <div className="fw6" style={{ marginBottom: 6 }}>{empById(selLoan.emp_id)?.name || selLoan.emp_id}</div>
                <div className="flex justify-between">
                  <span className="text-muted">Total Loan</span>
                  <span className="fw6">{fmtRs(selLoan.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Already Paid</span>
                  <span className="fw6 text-green">{fmtRs(selLoan.paid)}</span>
                </div>
                <div className="flex justify-between" style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  <span className="fw6">Remaining</span>
                  <span className="fw7 text-red">{fmtRs(Number(selLoan.total) - Number(selLoan.paid))}</span>
                </div>
              </div>

              <div>
                <label className="lbl">EMI Amount Being Deducted (₹)</label>
                <input className="inp" type="number" min="1"
                  max={Number(selLoan.total) - Number(selLoan.paid)}
                  value={rpForm.amount}
                  onChange={(e) => setRpForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="e.g. 3000"/>
              </div>

              {/* FIX: Dropdown instead of free text */}
              <div>
                <label className="lbl">Deducting from which month's salary?</label>
                <select className="inp" value={rpForm.month}
                  onChange={(e) => setRpForm((f) => ({ ...f, month: e.target.value }))}>
                  {MONTH_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  This will be auto-deducted when that month is closed
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={recordPayment} disabled={busy}>
                {busy ? 'Recording…' : 'Record Deduction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loan History / Ledger Modal */}
      {modal === 'ledger' && selLoan && (
        <div className="overlay open">
          <div className="modal" style={{ width: 560 }}>
            <div className="modal-head">Loan Payment History<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 13, padding: 12, background: 'var(--surface2)', borderRadius: 8, marginBottom: 14 }}>
                <div className="fw6" style={{ marginBottom: 6 }}>{empById(selLoan.emp_id)?.name || selLoan.emp_id}</div>
                <div className="flex justify-between">
                  <span>Total:</span><span className="fw6">{fmtRs(selLoan.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid:</span><span className="fw6 text-green">{fmtRs(selLoan.paid)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Remaining:</span><span className="fw6 text-red">{fmtRs(Number(selLoan.total) - Number(selLoan.paid))}</span>
                </div>
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>#</th><th>Amount</th><th>Month</th><th>Recorded By</th></tr></thead>
                  <tbody>
                    {(() => {
                      const payments = db.loanPayments.filter((p) => p.loan_id === selLoan.id)
                      if (payments.length === 0) {
                        return <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No payments recorded yet</td></tr>
                      }
                      return payments.map((p, i) => (
                        <tr key={p.id}>
                          <td className="text-muted">{i + 1}</td>
                          <td className="fw6 text-green">{fmtRs(p.amount)}</td>
                          <td className="text-muted">{fmtMonthVal(p.month)}</td>
                          <td className="text-muted">{p.recorded_by || '—'}</td>
                        </tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
