import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { initials, capitalize } from '../utils/helpers'

const NAV_ICONS = {
  '/dashboard': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  '/punch': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  '/employees': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  '/attendance': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  '/payroll': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  '/loans': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  ),
  '/advances': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 8 16 12 12 16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  ),
  '/close-month': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  '/reports': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  '/settings': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
}

const NAV_CONFIG = {
  owner: [
    { g: 'Overview', items: [{ path: '/dashboard', t: 'Dashboard' }] },
    {
      g: 'Manage',
      items: [
        { path: '/employees', t: 'Employees' },
        { path: '/attendance', t: 'Attendance' },
        { path: '/payroll', t: 'Payroll' },
        { path: '/loans', t: 'Loans' },
        { path: '/advances', t: 'Advances' },
        { path: '/close-month', t: 'Close Month' },
      ],
    },
    { g: 'Insights', items: [{ path: '/reports', t: 'Reports' }] },
    { g: 'System', items: [{ path: '/settings', t: 'Settings' }] },
  ],
  admin: [
    { g: 'Overview', items: [{ path: '/dashboard', t: 'Dashboard' }] },
    { g: 'My Work', items: [{ path: '/punch', t: 'Punch In/Out' }] },
    {
      g: 'Manage',
      items: [
        { path: '/employees', t: 'Employees' },
        { path: '/attendance', t: 'Attendance' },
        { path: '/payroll', t: 'Payroll' },
        { path: '/loans', t: 'Loans' },
        { path: '/advances', t: 'Advances' },
        { path: '/close-month', t: 'Close Month' },
      ],
    },
    { g: 'Insights', items: [{ path: '/reports', t: 'Reports' }] },
  ],
  employee: [{ g: 'My Work', items: [{ path: '/punch', t: 'Punch In/Out' }] }],
}

export default function Layout({ children }) {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const navSections = NAV_CONFIG[currentUser?.role] || []
  const allItems = navSections.flatMap((s) => s.items)

  return (
    <div id="appShell">
      <div className="topbar">
        <div className="topbar-brand">
          <div className="topbar-brand-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="18" height="18">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          National Enterprise
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-chip">
          <div className="avatar">{initials(currentUser?.name)}</div>
          <div className="topbar-user">
            <strong>{currentUser?.name}</strong>
            <span>{capitalize(currentUser?.role)}</span>
          </div>
          <button
            className="btn-logout"
            onClick={() => {
              if (window.confirm('Sign out?')) {
                logout()
                navigate('/login')
              }
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="app-body">
        <nav className="sidebar">
          {navSections.map((s) => (
            <div key={s.g}>
              <div className="nav-section">{s.g}</div>
              {s.items.map((item) => (
                <div
                  key={item.path}
                  className={`nav-item${location.pathname === item.path ? ' active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  {NAV_ICONS[item.path]}
                  {item.t}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <nav id="bottomNav">
          {allItems.map((item) => (
            <button
              key={item.path}
              className={`bnav-item${location.pathname === item.path ? ' active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              {NAV_ICONS[item.path]}
              <span>{item.t.replace('My ', '')}</span>
            </button>
          ))}
        </nav>

        <div className="main">{children}</div>
      </div>
    </div>
  )
}
