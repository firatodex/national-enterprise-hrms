import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiAddLoan, apiRecordLoanPayment, apiCloseLoan } from '../api'
import { fmtRs, fmtDate, todayStr } from '../utils/helpers'

export default function Loans() {
  const { currentUser, db, refresh } = useAuth()
  const showToast = useToast()
  const [modal, setModal] = useState(null)
  const [selLoan, setSelLoan] = useState(null)
  const [addForm, setAddForm] = useState({ emp: '', amount: '', date: todayStr() })
  const [rpForm, setRpForm] = useState({ amount: '', month: '' })

  const emps = db.users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active)
  const empById = (id) => db.users.find((u) => u.id === id)
  const active = db.loans.filter((l) => l.active)
  const outstanding = active.reduce((s, l) => s + (Number(l.total) - Number(l.paid)), 0)

  const addLoan = async () => {
    if (!addForm.amount) { showToast('Enter amount', 'var(--red)'); return }
    const r = await apiAddLoan(addForm.emp, addForm.amount, addForm.date, '')
    if (r.ok) { setModal(null); showToast('Loan added'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const openRP = (loan) => {
    setSelLoan(loan)
    setRpForm({ amount: '', month: '' })
    setModal('pay')
  }

  const recordPayment = async () => {
    if (!rpForm.amount || Number(rpForm.amount) <= 0) { showToast('Enter valid amount', 'var(--red)'); return }
    if (!rpForm.month) { showToast('Enter the month', 'var(--red)'); return }
    const r = await apiRecordLoanPayment(selLoan.id, rpForm.amount, rpForm.month, currentUser.name)
    if (r.ok) { setModal(null); showToast(r.closed ? 'Loan fully repaid!' : `Recorded ${fmtRs(rpForm.amount)}`); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const closeLoan = async (loan) => {
    if (!window.confirm('Close this loan?')) return
    const r = await apiCloseLoan(loan.id)
    if (r.ok) { showToast('Closed'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  const openLedger = (loan) => { setSelLoan(loan); setModal('ledger') }

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Loans</div></div>
        <button className="btn btn-primary" onClick={() => { setAddForm({ emp: emps[0]?.id || '', amount: '', date: todayStr() }); setModal('add') }}>+ Add Loan</button>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="stat"><div className="stat-label">Active Loans</div><div className="stat-val">{active.length}</div></div>
        <div className="stat"><div className="stat-label">Outstanding</div><div className="stat-val text-red">{fmtRs(outstanding)}</div></div>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {db.loans.map((l) => {
                const e = empById(l.emp_id)
                const rem = Number(l.total) - Number(l.paid)
                const pct = Number(l.total) > 0 ? Math.round((Number(l.paid) / Number(l.total)) * 100) : 0
                return (
                  <tr key={l.id}>
                    <td className="fw6">{e ? e.name : '—'} <span className="text-muted text-xs">{l.emp_id}</span></td>
                    <td>{fmtRs(l.total)}</td>
                    <td>
                      <div className="text-green fw6">{fmtRs(l.paid)}</div>
                      <div className="prog" style={{ marginTop: 4, width: 80 }}><div className="prog-fill" style={{ width: `${pct}%`, background: 'var(--green)' }}/></div>
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

      {/* Add Loan */}
      {modal === 'add' && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Add Loan<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4 }}>
              <div className="form-grid">
                <div style={{ gridColumn: '1/-1' }}><label className="lbl">Employee</label><select className="inp" value={addForm.emp} onChange={(e) => setAddForm((f) => ({ ...f, emp: e.target.value }))}>{emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}</select></div>
                <div><label className="lbl">Total Amount (₹)</label><input className="inp" type="number" value={addForm.amount} onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))} placeholder="50000"/></div>
                <div><label className="lbl">Start Date</label><input className="inp" type="date" value={addForm.date} onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}/></div>
              </div>
            </div>
            <div className="modal-foot"><button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={addLoan}>Add Loan</button></div>
          </div>
        </div>
      )}

      {/* Record Payment */}
      {modal === 'pay' && selLoan && (
        <div className="overlay open">
          <div className="modal">
            <div className="modal-head">Record Loan Repayment<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
                <strong>{empById(selLoan.emp_id)?.name || selLoan.emp_id}</strong><br/>
                Total: {fmtRs(selLoan.total)} · Paid: {fmtRs(selLoan.paid)} · <strong>Remaining: {fmtRs(Number(selLoan.total) - Number(selLoan.paid))}</strong>
              </div>
              <div><label className="lbl">Deduction Amount (₹)</label><input className="inp" type="number" value={rpForm.amount} onChange={(e) => setRpForm((f) => ({ ...f, amount: e.target.value }))} placeholder="5000"/></div>
              <div><label className="lbl">Month (deducted from)</label><input className="inp" value={rpForm.month} onChange={(e) => setRpForm((f) => ({ ...f, month: e.target.value }))} placeholder="e.g. March 2026"/></div>
            </div>
            <div className="modal-foot"><button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={recordPayment}>Record</button></div>
          </div>
        </div>
      )}

      {/* Ledger */}
      {modal === 'ledger' && selLoan && (
        <div className="overlay open">
          <div className="modal" style={{ width: 560 }}>
            <div className="modal-head">Loan Payment History<button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 13, padding: 10, background: 'var(--surface2)', borderRadius: 8, marginBottom: 14 }}>
                <strong>{empById(selLoan.emp_id)?.name || selLoan.emp_id}</strong><br/>
                Total: {fmtRs(selLoan.total)} · Paid: <span className="text-green fw6">{fmtRs(selLoan.paid)}</span> · Remaining: <span className="text-red fw6">{fmtRs(Number(selLoan.total) - Number(selLoan.paid))}</span>
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>#</th><th>Amount</th><th>Month</th><th>Recorded By</th></tr></thead>
                  <tbody>
                    {db.loanPayments.filter((p) => p.loan_id === selLoan.id).length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No payments recorded yet</td></tr>
                    ) : (
                      db.loanPayments.filter((p) => p.loan_id === selLoan.id).map((p, i) => (
                        <tr key={p.id}>
                          <td className="text-muted">{i + 1}</td>
                          <td className="fw6 text-green">{fmtRs(p.amount)}</td>
                          <td className="text-muted">{p.month || '—'}</td>
                          <td className="text-muted">{p.recorded_by || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-foot"><button className="btn btn-outline" onClick={() => setModal(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
