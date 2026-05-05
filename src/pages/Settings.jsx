import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiSetPermissions } from '../api'

const PERMS = [
  { key: 'canExportSlip',    title: 'Export Salary Slips',   desc: 'Generate and download PDF salary slips for employees' },
  { key: 'canCloseMonth',    title: 'Close Month',           desc: 'Finalise monthly salary calculations' },
  { key: 'canChangeWage',    title: 'Change Employee Wage',  desc: 'Update daily wage for employees' },
  { key: 'canManageLoan',    title: 'Manage Loans',          desc: 'Add loans, record repayments, close loans' },
  { key: 'canManageAdvance', title: 'Manage Advances',       desc: 'Add advance entries for employees' },
  { key: 'canManualPunch',   title: 'Manual Punch Entry',    desc: 'Add or override punch in/out records' },
]

export default function Settings() {
  const { currentUser, db, refresh } = useAuth()
  const showToast = useToast()
  const [perms, setPerms] = useState({ ...db.adminPerms })

  if (currentUser.role !== 'owner') {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
        Owner access only
      </div>
    )
  }

  const toggle = (key) => setPerms((p) => ({ ...p, [key]: !p[key] }))

  const save = async () => {
    showToast('Saving…', 'var(--accent)')
    const r = await apiSetPermissions(perms)
    if (r.ok) { showToast('Permissions saved'); await refresh() }
    else showToast(r.err, 'var(--red)')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Manage admin permissions and system settings</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-head">Admin Permissions</div>
        <div className="card-body">
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
            Control what <span className="badge b-purple">Admin</span> users can do. Owners always have full access.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PERMS.map((p) => (
              <label
                key={p.key}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  cursor: 'pointer', padding: '12px 14px',
                  borderRadius: 10, border: `1.5px solid ${perms[p.key] ? 'var(--accent)' : 'var(--border)'}`,
                  background: perms[p.key] ? 'var(--accent-light)' : 'transparent',
                  transition: '.15s',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!perms[p.key]}
                  onChange={() => toggle(p.key)}
                  style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{p.desc}</div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <button className="btn btn-primary" onClick={save}>Save Permissions</button>
          </div>
        </div>
      </div>
    </div>
  )
}
