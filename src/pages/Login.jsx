import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [uid, setUid] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { login, currentUser } = useAuth()
  const navigate = useNavigate()

  // Already logged in → redirect immediately
  if (currentUser) {
    return <Navigate to={currentUser.role === 'employee' ? '/punch' : '/dashboard'} replace />
  }

  const doLogin = async () => {
    if (!uid || !pass) { setErr('Please enter Employee ID and password'); return }
    setBusy(true)
    setErr('Signing in…')
    const result = await login(uid.trim().toUpperCase(), pass.trim())
    if (result.ok) {
      navigate(result.user?.role === 'employee' ? '/punch' : '/dashboard', { replace: true })
    } else {
      setErr(result.err || 'Invalid credentials')
      setBusy(false)
    }
  }

  return (
    <div id="loginScreen" style={{ display: 'flex' }}>
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="24" height="24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div className="login-logo-text">
            <strong>National Enterprise</strong>
            <span>Human Resource Management</span>
          </div>
        </div>
        <div className="login-heading">Welcome back</div>
        <div className="login-sub">Sign in with your employee code to continue</div>
        <div className="field">
          <label>Employee ID</label>
          <input
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            placeholder="e.g. EMP001"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••"
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
        </div>
        <button className="btn-login" onClick={doLogin} disabled={busy}>
          {busy ? 'Please wait…' : 'Sign In'}
        </button>
        <div
          className="login-err"
          style={{ color: err === 'Signing in…' ? 'var(--muted)' : 'var(--red)' }}
        >
          {err}
        </div>
      </div>
    </div>
  )
}
