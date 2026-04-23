import { useState, useEffect } from 'react'
import { useStore } from '../lib/store.jsx'
import { T } from '../lib/theme.js'
import { fmtRs, fmtMin, fmt12, todayISO, pad, mergeSessions, calcPaidMinutes } from '../lib/calc.js'
import { Card, CardHead, Badge } from '../components/UI.jsx'

const FACTORY_LAT = 23.236361
const FACTORY_LNG = 72.506111
const GEOFENCE_R  = 350  // FIX: was 200, now 350m

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = d => d*Math.PI/180
  const dLat = toR(lat2-lat1), dLng = toR(lng2-lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLng/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

function checkGeofence() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Location not supported')); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = Math.round(haversine(pos.coords.latitude, pos.coords.longitude, FACTORY_LAT, FACTORY_LNG))
        dist <= GEOFENCE_R ? resolve(dist) : reject(new Error(`You are ${dist}m away from the factory. Must be within ${GEOFENCE_R}m.`))
      },
      err => {
        if (err.code === 1) reject(new Error('Location access denied. Please allow location in your browser settings.'))
        else if (err.code === 2) reject(new Error('Could not get your location. Please try again.'))
        else reject(new Error('Location check timed out. Please try again.'))
      },
      { enableHighAccuracy:true, timeout:12000, maximumAge:0 }  // FIX: maximumAge was 30000, now 0
    )
  })
}

export default function PunchPage() {
  const { state, dispatch } = useStore()
  const { currentUser, punches } = state
  const [now,    setNow]    = useState(new Date())
  const [status, setStatus] = useState(null)  // null | 'checking' | 'error'
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const today       = todayISO()
  const myPunches   = punches.filter(p => p.empId === currentUser.id && p.date === today)
    .sort((a,b) => (a.session||1)-(b.session||1))

  const hasOpen     = myPunches.some(p => p.inTime && !p.outTime)
  const canIn       = !hasOpen
  const canOut      = hasOpen

  // Salary today
  const merged      = mergeSessions(myPunches)
  const totalMin    = calcPaidMinutes(merged)
  const todayPay    = Math.round(totalMin * ((currentUser.dailyWage||0)/480))

  const currentTime = () => `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`

  const doPunch = async type => {
    setStatus('checking')
    setErrMsg('')
    try {
      // In production: await checkGeofence()
      // For demo: simulate success after short delay
      await new Promise(r => setTimeout(r, 800))
      const t = currentTime()
      dispatch({ type: type === 'in' ? 'PUNCH_IN' : 'PUNCH_OUT', empId: currentUser.id, time: t })
      setStatus(null)
    } catch (e) {
      setStatus('error')
      setErrMsg(e.message)
    }
  }

  const timeStr  = now.toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit',hour12:true})
  const dateStr  = now.toLocaleDateString('en-IN', {weekday:'long',day:'numeric',month:'long',year:'numeric'})

  return (
    <div style={{ maxWidth:540, margin:'0 auto' }}>

      {/* Clock hero */}
      <div style={{
        background:'linear-gradient(145deg, #0D2E52 0%, #1A56DB 60%, #3B82F6 100%)',
        borderRadius:T.r20, padding:'36px 28px 32px', marginBottom:16,
        color:'#fff', position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute',top:-50,right:-50,width:220,height:220,borderRadius:'50%',background:'rgba(255,255,255,.05)',pointerEvents:'none' }}/>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ fontSize:T.sm, color:'rgba(255,255,255,.6)', marginBottom:6 }}>{dateStr}</div>
          <div style={{ fontSize:56, fontWeight:800, letterSpacing:'-2px', lineHeight:1, fontVariantNumeric:'tabular-nums', marginBottom:4 }}>
            {timeStr}
          </div>
          <div style={{ fontSize:T.sm, color:'rgba(255,255,255,.4)', marginBottom:32 }}>
            Lunch deducted automatically · 1:00 PM – 2:00 PM
          </div>

          {/* Punch buttons */}
          <div style={{ display:'flex', gap:10 }}>
            <button
              onClick={() => canIn && status !== 'checking' && doPunch('in')}
              disabled={!canIn || status==='checking'}
              style={{
                flex:1, padding:'15px', borderRadius:T.r16, border:'none', fontFamily:'inherit',
                background: canIn ? '#fff' : 'rgba(255,255,255,.12)',
                color: canIn ? T.green : 'rgba(255,255,255,.3)',
                fontSize:15, fontWeight:800, cursor: canIn&&status!=='checking'?'pointer':'not-allowed',
                transition:'all .15s',
              }}
            >
              {status==='checking'&&canIn ? '📍 Checking…' : canIn ? '▶  Punch IN' : '● Working…'}
            </button>
            <button
              onClick={() => canOut && status !== 'checking' && doPunch('out')}
              disabled={!canOut || status==='checking'}
              style={{
                flex:1, padding:'15px', borderRadius:T.r16, fontFamily:'inherit',
                border:'1.5px solid rgba(255,255,255,.25)',
                background: canOut ? 'rgba(255,255,255,.12)' : 'transparent',
                color: canOut ? '#fff' : 'rgba(255,255,255,.2)',
                fontSize:15, fontWeight:800, cursor: canOut&&status!=='checking'?'pointer':'not-allowed',
                transition:'all .15s',
              }}
            >
              {status==='checking'&&canOut ? '📍 Checking…' : '◼  Punch OUT'}
            </button>
          </div>

          {/* Persistent error (not toast) */}
          {status === 'error' && (
            <div style={{
              marginTop:14, padding:'11px 14px', borderRadius:T.r12,
              background:'rgba(220,38,38,.25)', border:'1px solid rgba(220,38,38,.5)',
              fontSize:T.sm, color:'#FCA5A5',
            }}>
              ⚠ {errMsg}
              <button onClick={() => { setStatus(null); setErrMsg('') }}
                style={{ marginLeft:10, background:'none', border:'none', color:'#FCA5A5', cursor:'pointer', fontWeight:700, fontSize:T.sm }}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r16, padding:'18px 20px', boxShadow:T.shadow }}>
          <div style={{ fontSize:T.xs, fontWeight:700, color:T.n400, textTransform:'uppercase', letterSpacing:'1px', marginBottom:8 }}>Today's Hours</div>
          <div style={{ fontSize:28, fontWeight:800, color:T.brand, letterSpacing:'-1px' }}>{totalMin>0?fmtMin(totalMin):'—'}</div>
          <div style={{ fontSize:T.xs, color:T.n400, marginTop:4 }}>Lunch excluded</div>
        </div>
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r16, padding:'18px 20px', boxShadow:T.shadow }}>
          <div style={{ fontSize:T.xs, fontWeight:700, color:T.n400, textTransform:'uppercase', letterSpacing:'1px', marginBottom:8 }}>Today's Pay</div>
          <div style={{ fontSize:28, fontWeight:800, color:T.green, letterSpacing:'-1px' }}>{totalMin>0?fmtRs(todayPay):'—'}</div>
          <div style={{ fontSize:T.xs, color:T.n400, marginTop:4 }}>₹{currentUser.dailyWage||0}/day rate</div>
        </div>
      </div>

      {/* Sessions */}
      <Card p="0">
        <CardHead>
          Today's Sessions
          <Badge color="blue">{myPunches.length} session{myPunches.length!==1?'s':''}</Badge>
        </CardHead>

        {myPunches.length === 0 ? (
          <div style={{ padding:'36px', textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>⏰</div>
            <div style={{ fontSize:T.md, fontWeight:700, color:T.n600, marginBottom:4 }}>Not punched in yet</div>
            <div style={{ fontSize:T.sm, color:T.n400 }}>Tap Punch IN when you arrive at the factory</div>
          </div>
        ) : (
          <>
            {myPunches.map((s, i) => {
              const seg    = mergeSessions([s])
              const mins   = calcPaidMinutes(seg)
              const pay    = Math.round(mins*((currentUser.dailyWage||0)/480))
              const active = s.inTime && !s.outTime
              return (
                <div key={i} style={{
                  display:'flex', alignItems:'center', gap:14,
                  padding:'14px 20px', borderBottom:`1px solid ${T.border2}`,
                }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:active?T.amber:T.green, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:T.base, fontWeight:700, color:T.n700, display:'flex', alignItems:'center', gap:6 }}>
                      Session {s.session||i+1}
                      {(s.manualIn||s.manualOut) && <Badge color="amber">Manual</Badge>}
                    </div>
                    <div style={{ fontSize:T.sm, color:T.n400, marginTop:3 }}>
                      {fmt12(s.inTime)} → {s.outTime ? fmt12(s.outTime) : <span style={{color:T.amber}}>Active</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    {mins > 0 ? (
                      <>
                        <div style={{ fontSize:T.base, fontWeight:700, color:T.n700 }}>{fmtMin(mins)}</div>
                        <div style={{ fontSize:T.sm, color:T.green, fontWeight:600 }}>{fmtRs(pay)}</div>
                      </>
                    ) : active ? (
                      <Badge color="amber" dot>Active</Badge>
                    ) : (
                      <Badge color="gray">—</Badge>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Total row */}
            {totalMin > 0 && (
              <div style={{
                padding:'13px 20px', background:T.n50,
                display:'flex', justifyContent:'space-between', alignItems:'center',
              }}>
                <span style={{ fontSize:T.sm, fontWeight:700, color:T.n600 }}>Total (lunch excluded)</span>
                <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                  <span style={{ fontSize:T.base, fontWeight:800, color:T.n700 }}>{fmtMin(totalMin)}</span>
                  <span style={{ fontSize:T.base, fontWeight:800, color:T.green }}>{fmtRs(todayPay)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Rate info */}
      <div style={{ marginTop:14, textAlign:'center', fontSize:T.xs, color:T.n400 }}>
        Rate: ₹{currentUser.dailyWage||0}/day ÷ 480 min = ₹{((currentUser.dailyWage||0)/480).toFixed(2)}/min
      </div>
    </div>
  )
}
