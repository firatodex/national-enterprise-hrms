export const pad = (n) => String(n).padStart(2, '0')

export const fmtRs = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')

export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const nowTime = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const timeToMins = (t) => {
  if (!t) return 0
  const parts = String(t).split(':')
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)
}

export const fmt12 = (t) => {
  if (!t) return ''
  const parts = String(t).split(':')
  const h = parseInt(parts[0])
  const m = parseInt(parts[1])
  if (isNaN(h)) return t
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return h12 + ':' + pad(m) + ' ' + ampm
}

// FIX #12: readable date format DD/MM/YYYY instead of DDMMYYYY
export const fmtDate = (dateStr) => {
  if (!dateStr) return '—'
  const s = String(dateStr).substring(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const parts = s.split('-')
    return parts[2] + '/' + parts[1] + '/' + parts[0]
  }
  return s
}

export const fmtMonthYear = (yr, mo) =>
  new Date(yr, mo - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')

export const initials = (name) =>
  (name || '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export const lunchDeduct = (inM, outM) => {
  const LUNCH_START = 780, LUNCH_END = 840
  if (outM <= LUNCH_START || inM >= LUNCH_END) return 0
  return Math.max(0, Math.min(outM, LUNCH_END) - Math.max(inM, LUNCH_START))
}

export const DEPT_COLORS = {
  Production: '#3b6ef8',
  'Quality Control': '#7c3aed',
  Maintenance: '#f59e0b',
  Logistics: '#00a76f',
  Admin: '#ef4444',
  Management: '#64748b',
}

export const FACTORY_LAT = 23.236361
export const FACTORY_LNG = 72.506111
export const GEOFENCE_RADIUS = 200

const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const checkLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location not supported by this browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          FACTORY_LAT,
          FACTORY_LNG
        )
        if (dist <= GEOFENCE_RADIUS) resolve(Math.round(dist))
        else
          reject(
            new Error(
              `You are ${Math.round(dist)}m away from the factory. Must be within ${GEOFENCE_RADIUS}m to punch.`
            )
          )
      },
      (err) => {
        const msgs = {
          1: 'Location access denied. Please allow location permission.',
          2: 'Could not determine your location. Please try again.',
          3: 'Location request timed out. Please try again.',
        }
        reject(new Error(msgs[err.code] || err.message))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  })

export const calcSalary = (empId, yr, mo, allPunches, users) => {
  const emp = users.find((u) => u.id === empId)
  if (!emp) return null
  const ratePerMinute = emp.daily_wage / 480

  const mp = allPunches.filter((p) => {
    if (p.emp_id !== empId) return false
    const dateStr = String(p.date).substring(0, 10)
    const parts = dateStr.split('-').map(Number)
    return parts[0] === yr && parts[1] === mo
  })

  const dayData = {}
  mp.forEach((p) => {
    if (!p.in_time || !p.out_time) return
    const inM = timeToMins(p.in_time)
    const outM = timeToMins(p.out_time)
    if (outM <= inM) return
    const dt = String(p.date).substring(0, 10)
    if (!dayData[dt]) dayData[dt] = { sessions: [] }
    dayData[dt].sessions.push({
      inTime: p.in_time,
      outTime: p.out_time,
      manual: p.manual_in || p.manual_out,
    })
  })

  let totalMinutes = 0
  let daysPresent = 0
  const dayBreakdown = []

  Object.keys(dayData)
    .sort()
    .forEach((dt) => {
      let dayTotal = 0
      dayData[dt].sessions.forEach((s) => {
        const inM = timeToMins(s.inTime)
        const outM = timeToMins(s.outTime)
        const mins = outM - inM - lunchDeduct(inM, outM)
        if (mins > 0) dayTotal += mins
      })
      if (dayTotal > 0) {
        daysPresent++
        totalMinutes += dayTotal
      }
      dayBreakdown.push({
        date: dt,
        // FIX #5: parse date as local time to avoid UTC-midnight timezone shift
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
          new Date(dt + 'T00:00:00').getDay()
        ],
        sessions: dayData[dt].sessions,
        totalMin: dayTotal,
      })
    })

  return {
    totalMinutes,
    daysPresent,
    ratePerMinute: +ratePerMinute.toFixed(2),
    grossPay: Math.round(totalMinutes * ratePerMinute),
    dailyWage: emp.daily_wage,
    dayBreakdown,
  }
}

export const getAdvanceTotal = (empId, yr, mo, advances) =>
  advances
    .filter((a) => {
      const dt = String(a.date).substring(0, 10)
      const parts = dt.split('-').map(Number)
      return a.emp_id === empId && parts[0] === yr && parts[1] === mo
    })
    .reduce((s, a) => s + Number(a.amount || 0), 0)

export const getCarryForward = (empId, yr, mo, monthCloses) => {
  const prevMo = mo === 1 ? 12 : mo - 1
  const prevYr = mo === 1 ? yr - 1 : yr
  const prev = monthCloses.find(
    // FIX #8: coerce to Number to handle Supabase returning strings
    (mc) => mc.emp_id === empId && Number(mc.year) === prevYr && Number(mc.month) === prevMo
  )
  if (prev && Number(prev.net_pay) < 0) return Math.abs(Number(prev.net_pay))
  return 0
}
