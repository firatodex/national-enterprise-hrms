import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { T } from '../lib/theme.js'
import { Btn } from '../components/UI.jsx'

const BuildingIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)

export default function LoginPage() {
  const { login } = useStore()
  const [empId, setEmpId] = useState('')
  const [pin,   setPin]   = useState('')
  const [err,   setErr]   = useState('')
  const [shake, setShake] = useState(false)
  const [busy,  setBusy]  = useState(false)

  const handleDigit = d => {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setErr('')
    if (next.length === 4) {
      setBusy(true)
      setTimeout(() => {
        const ok = login(empId.trim(), next)
        if (!ok) {
          setErr('Invalid ID or PIN. Please try again.')
          setPin('')
          setShake(true)
          setTimeout(() => setShake(false), 500)
        }
        setBusy(false)
      }, 400)
    }
  }

  const handleBack = () => { setPin(p => p.slice(0, -1)); setErr('') }

  const KEYS = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['',  '0','⌫'],
  ]

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(160deg, #0D2E52 0%, #1A56DB 55%, #3B82F6 100%)',
    }}>
      {/* Decorative blobs */}
      <div style={{ position:'absolute', top:'-15%', right:'-10%', width:500, height:500, borderRadius:'50%', background:'rgba(255,255,255,.04)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', bottom:'-10%', left:'-8%',  width:400, height:400, borderRadius:'50%', background:'rgba(255,255,255,.04)', pointerEvents:'none' }}/>

      <div style={{
        background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(20px)',
        borderRadius: T.r24, padding: '44px 40px 36px', width: 380, maxWidth: '100%',
        boxShadow: '0 32px 80px rgba(0,0,0,.28)', position: 'relative', zIndex: 1,
        ...(shake ? { animation: 'shake .4s ease' } : {}),
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:32 }}>
          <div style={{ width:44, height:44, background:T.brand, borderRadius:T.r12, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <BuildingIcon/>
          </div>
          <div>
            <div style={{ fontSize:T.lg, fontWeight:800, color:T.n800, lineHeight:1.2 }}>National Enterprise</div>
            <div style={{ fontSize:T.xs, color:T.n400, marginTop:2 }}>Attendance & Payroll System</div>
          </div>
        </div>

        {/* ID field */}
        <div style={{ marginBottom:24 }}>
          <label style={{ display:'block', fontSize:T.sm, fontWeight:700, color:T.n600, marginBottom:7 }}>
            Employee ID
          </label>
          <input
            value={empId}
            onChange={e => { setEmpId(e.target.value.toUpperCase()); setErr(''); setPin('') }}
            placeholder="EMP001 or OWNER"
            autoComplete="off"
            style={{
              width:'100%', padding:'11px 14px',
              border:`1.5px solid ${err ? T.red : T.border}`,
              borderRadius:T.r12, fontSize:T.md, fontFamily:'inherit',
              outline:'none', background:T.n50, color:T.n800,
              textTransform:'uppercase', letterSpacing:'.5px',
            }}
          />
          <div style={{ fontSize:T.xs, color:T.n400, marginTop:5 }}>
            Demo: <strong>OWNER</strong> / 0000 &nbsp;·&nbsp; <strong>EMP001</strong> / 0001
          </div>
        </div>

        {/* PIN dots */}
        <div style={{ marginBottom:20 }}>
          <label style={{ display:'block', fontSize:T.sm, fontWeight:700, color:T.n600, marginBottom:12 }}>
            4-Digit PIN
          </label>
          <div style={{ display:'flex', justifyContent:'center', gap:14, marginBottom:20 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width:14, height:14, borderRadius:'50%', transition:'all .15s',
                background: i < pin.length ? T.brand : T.border,
                transform: i < pin.length ? 'scale(1.1)' : 'scale(1)',
              }}/>
            ))}
          </div>

          {/* Numpad */}
          {KEYS.map((row, ri) => (
            <div key={ri} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
              {row.map((key, ki) => (
                <button
                  key={ki}
                  onClick={() => { if(key === '⌫') handleBack(); else if(key !== '') handleDigit(key) }}
                  disabled={busy || key === '' || (key !== '⌫' && pin.length >= 4)}
                  style={{
                    padding:'16px 8px',
                    border:`1.5px solid ${key === '' ? 'transparent' : T.border}`,
                    borderRadius:T.r12,
                    background: key === '' ? 'transparent' : T.surface,
                    fontSize: key === '⌫' ? 18 : 22,
                    fontWeight:700, color: key==='⌫' ? T.red : T.n700,
                    cursor: key===''||busy ? 'default' : 'pointer',
                    opacity: key==='' ? 0 : pin.length>=4&&key!=='⌫' ? .4 : 1,
                    transition:'all .1s',
                    fontFamily:'inherit',
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Error — persistent inline, not toast */}
        <div style={{ minHeight:20, marginBottom:8, textAlign:'center' }}>
          {err && (
            <span style={{ fontSize:T.sm, color:T.red, fontWeight:600 }}>
              {err}
            </span>
          )}
          {busy && (
            <span style={{ fontSize:T.sm, color:T.n400 }}>Signing in…</span>
          )}
        </div>

        <Btn full variant="primary" size="lg" disabled={!empId || pin.length < 4 || busy}
          onClick={() => {}}>
          Sign In →
        </Btn>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform:translateX(0) }
          20%      { transform:translateX(-8px) }
          40%      { transform:translateX(8px) }
          60%      { transform:translateX(-6px) }
          80%      { transform:translateX(6px) }
        }
      `}</style>
    </div>
  )
}
