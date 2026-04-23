import { useState } from 'react'
import { StoreProvider, useStore } from './lib/store.jsx'
import { T } from './lib/theme.js'
import LoginPage     from './pages/Login.jsx'
import DashboardPage from './pages/Dashboard.jsx'
import PunchPage     from './pages/Punch.jsx'
import AttendancePage from './pages/Attendance.jsx'
import EmployeesPage from './pages/Employees.jsx'
import SalaryPage    from './pages/Salary.jsx'
import LoansPage     from './pages/Loans.jsx'
import SettingsPage  from './pages/Settings.jsx'
import { Avatar, Badge } from './components/UI.jsx'

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icons = {
  dashboard:  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  punch:      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  attendance: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  employees:  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  salary:     <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  loans:      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  settings:   <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
}

const NAV_OWNER = [
  { id:'dashboard',  label:'Dashboard',  icon:Icons.dashboard  },
  { id:'punch',      label:'Punch',      icon:Icons.punch      },
  { id:'attendance', label:'Attendance', icon:Icons.attendance },
  { id:'employees',  label:'Team',       icon:Icons.employees  },
  { id:'salary',     label:'Salary',     icon:Icons.salary     },
  { id:'loans',      label:'Loans',      icon:Icons.loans      },
  { id:'settings',   label:'Settings',   icon:Icons.settings   },
]
const NAV_ADMIN = [
  { id:'dashboard',  label:'Dashboard',  icon:Icons.dashboard  },
  { id:'punch',      label:'Punch',      icon:Icons.punch      },
  { id:'attendance', label:'Attendance', icon:Icons.attendance },
  { id:'employees',  label:'Team',       icon:Icons.employees  },
  { id:'salary',     label:'Salary',     icon:Icons.salary     },
  { id:'loans',      label:'Loans',      icon:Icons.loans      },
]
const NAV_EMP = [
  { id:'punch',      label:'Punch',      icon:Icons.punch      },
]

const PAGES = {
  dashboard:  DashboardPage,
  punch:      PunchPage,
  attendance: AttendancePage,
  employees:  EmployeesPage,
  salary:     SalaryPage,
  loans:      LoansPage,
  settings:   SettingsPage,
}

function Shell() {
  const { state, dispatch } = useStore()
  const { currentUser } = state
  const [page, setPage] = useState(currentUser?.role === 'employee' ? 'punch' : 'dashboard')

  if (!currentUser) return <LoginPage/>

  const navItems = currentUser.role === 'owner' ? NAV_OWNER :
                   currentUser.role === 'admin'  ? NAV_ADMIN : NAV_EMP

  const Screen = PAGES[page] || PunchPage

  return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'flex', flexDirection:'column' }}>
      {/* Top bar */}
      <div style={{
        height:58, background:T.surface, borderBottom:`1px solid ${T.border}`,
        display:'flex', alignItems:'center', padding:'0 24px', gap:12,
        position:'sticky', top:0, zIndex:200, boxShadow:'0 1px 0 rgba(0,0,0,.04)',
        flexShrink:0,
      }}>
        {/* Brand */}
        <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:0 }}>
          <div style={{ width:32, height:32, background:T.brand, borderRadius:T.r8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <span style={{ fontSize:14, fontWeight:800, color:T.n800, whiteSpace:'nowrap' }}>National Enterprise</span>
        </div>

        {/* Desktop nav — centered */}
        <div style={{ flex:1, display:'flex', justifyContent:'center', gap:2 }} className="desktop-nav">
          {navItems.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{
              display:'flex', alignItems:'center', gap:7,
              padding:'7px 13px', borderRadius:T.r8, border:'none',
              background: page===n.id ? T.brandLight : 'transparent',
              color: page===n.id ? T.brand : T.n500,
              fontSize:T.sm, fontWeight: page===n.id ? 700 : 600,
              cursor:'pointer', transition:'all .12s', fontFamily:'inherit',
            }}>
              <span style={{ opacity: page===n.id ? 1 : .7 }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>

        {/* User chip */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <Avatar name={currentUser.name} dept={currentUser.dept||'Management'} size={30}/>
          <div style={{ lineHeight:1.3 }} className="user-info">
            <div style={{ fontSize:T.sm, fontWeight:700, color:T.n700 }}>{currentUser.name.split(' ')[0]}</div>
            <div style={{ fontSize:T.xs, color:T.n400, textTransform:'capitalize' }}>{currentUser.role}</div>
          </div>
          <button onClick={() => dispatch({ type:'LOGOUT' })} style={{
            padding:'6px 12px', border:`1.5px solid ${T.border}`, borderRadius:T.r8,
            background:'transparent', fontSize:T.xs, fontWeight:700, color:T.n500,
            cursor:'pointer', fontFamily:'inherit', transition:'all .12s',
          }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, maxWidth:1160, width:'100%', margin:'0 auto', padding:'28px 24px 100px', boxSizing:'border-box' }}>
        <Screen/>
      </div>

      {/* Mobile bottom nav */}
      <div style={{
        display:'none', position:'fixed', bottom:0, left:0, right:0,
        height:64, background:T.surface, borderTop:`1px solid ${T.border}`,
        zIndex:200, overflowX:'auto', flexShrink:0,
      }} className="mobile-nav">
        {navItems.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)} style={{
            flex:1, minWidth:52, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', gap:3,
            border:'none', background:'transparent', padding:'6px 4px',
            color: page===n.id ? T.brand : T.n400,
            fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
            borderTop: page===n.id ? `2px solid ${T.brand}` : '2px solid transparent',
            transition:'all .12s',
          }}>
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-nav  { display: flex !important; }
          .user-info   { display: none; }
        }
        @media (max-width: 480px) {
          div[style*="padding: 28px 24px"] { padding: 16px 12px 80px !important; }
        }
      `}</style>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell/>
    </StoreProvider>
  )
}
