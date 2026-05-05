import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiPunchIn, apiPunchOut } from '../api'
import { fmt12, fmtRs, timeToMins, lunchDeduct, todayStr, checkLocation } from '../utils/helpers'

export default function Punch() {
  const { currentUser, db, refresh } = useAuth()
  const showToast = useToast()
  const [clockTime, setClockTime] = useState('')
  const [clockDate, setClockDate] = useState('')
  const [busy, setBusy] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setClockTime(n.toLocaleTimeString('en-IN', { hour12: true }))
      setClockDate(n.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    }
    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const today = todayStr()
  const todayPunches = db.punches
    .filter((p) => p.emp_id === currentUser.id && String(p.date).substring(0, 10) === today)
    .sort((a, b) => (a.session || 1) - (b.session || 1))

  const hasOpen = todayPunches.some((p) => p.in_time && !p.out_time)

  let todayMinutes = 0
  todayPunches.forEach((p) => {
    if (p.in_time && p.out_time) {
      const inM = timeToMins(p.in_time)
      const outM = timeToMins(p.out_time)
      const diff = outM - inM - lunchDeduct(inM, outM)
      if (diff > 0) todayMinutes += diff
    }
  })
  const todayPay = Math.round(todayMinutes * (currentUser.daily_wage / 480))

  const doPunchIn = async () => {
    setBusy(true)
    try {
      await checkLocation()
      const r = await apiPunchIn(currentUser.id)
      if (r.ok) {
        showToast(`Punched IN at ${fmt12(r.time)} (Session ${r.session})`)
        await refresh()
      } else {
        showToast(r.err, 'var(--red)')
      }
    } catch (e) {
      showToast(e.message, 'var(--red)')
    }
    setBusy(false)
  }

  const doPunchOut = async () => {
    setBusy(true)
    try {
      await checkLocation()
      const r = await apiPunchOut(currentUser.id)
      if (r.ok) {
        showToast(`Punched OUT at ${fmt12(r.time)}`)
        await refresh()
      } else {
        showToast(r.err, 'var(--red)')
      }
    } catch (e) {
      showToast(e.message, 'var(--red)')
    }
    setBusy(false)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Punch In / Out</div>
      </div>

      <div className="punch-hero">
        <div className="punch-clock">{clockTime}</div>
        <div className="punch-date-str">{clockDate}</div>
        <div className="punch-actions">
          <button className="punch-btn pbtn-in" onClick={doPunchIn} disabled={hasOpen || busy}>
            {hasOpen ? '● Working…' : '▶ Punch IN'}
          </button>
          <button className="punch-btn pbtn-out" onClick={doPunchOut} disabled={!hasOpen || busy}>
            {hasOpen ? '◼ Punch OUT' : '—'}
          </button>
        </div>
        <div className="punch-status-msg">
          {hasOpen
            ? 'Session active — punch out when leaving'
            : todayPunches.length > 0
            ? `Today: ${todayPunches.length} session(s), ${Math.floor(todayMinutes / 60)}h ${todayMinutes % 60}m`
            : 'Tap Punch IN when you arrive'}
        </div>
      </div>

      <div className="card">
        <div className="card-head">Today's Sessions</div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>IN</th>
                  <th>OUT</th>
                  <th>Minutes</th>
                  <th>Pay</th>
                </tr>
              </thead>
              <tbody>
                {todayPunches.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                      No punches today
                    </td>
                  </tr>
                ) : (
                  todayPunches.map((p) => {
                    const inM = timeToMins(p.in_time)
                    const outM = timeToMins(p.out_time)
                    const mins =
                      p.in_time && p.out_time
                        ? Math.max(0, outM - inM - lunchDeduct(inM, outM))
                        : 0
                    const pay = Math.round(mins * (currentUser.daily_wage / 480))
                    return (
                      <tr key={p.id}>
                        <td className="text-muted">{p.session || 1}</td>
                        <td className="text-green fw6">
                          {fmt12(p.in_time) || '—'}
                          {p.manual_in && (
                            <span className="badge b-amber" style={{ fontSize: 9, marginLeft: 4 }}>M</span>
                          )}
                        </td>
                        <td className="text-accent fw6">
                          {fmt12(p.out_time) || '—'}
                          {p.manual_out && (
                            <span className="badge b-amber" style={{ fontSize: 9, marginLeft: 4 }}>M</span>
                          )}
                        </td>
                        <td>
                          {mins > 0 ? (
                            `${mins} min`
                          ) : p.in_time && !p.out_time ? (
                            <span className="badge b-amber">Active</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="fw6">{mins > 0 ? fmtRs(pay) : '—'}</td>
                      </tr>
                    )
                  })
                )}
                {todayPunches.length > 0 && (
                  <tr style={{ background: 'var(--surface2)' }}>
                    <td colSpan={3} className="fw7">Total</td>
                    <td className="fw7">
                      {todayMinutes} min ({Math.floor(todayMinutes / 60)}h {todayMinutes % 60}m)
                    </td>
                    <td className="fw7 text-green">{fmtRs(todayPay)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
