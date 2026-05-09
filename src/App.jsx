import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Punch from './pages/Punch'
import Employees from './pages/Employees'
import Attendance from './pages/Attendance'
import Payroll from './pages/Payroll'
import Loans from './pages/Loans'
import Advances from './pages/Advances'
import CloseMonth from './pages/CloseMonth'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

// Checks login only
function PrivateRoute({ children }) {
  const { currentUser, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)', fontSize: 15 }}>
        Loading…
      </div>
    )
  }
  if (!currentUser) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

// Checks login AND role — redirects employees to /punch if they try to access admin pages
function AdminRoute({ children }) {
  const { currentUser, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)', fontSize: 15 }}>
        Loading…
      </div>
    )
  }
  if (!currentUser) return <Navigate to="/login" replace />
  if (currentUser.role === 'employee') return <Navigate to="/punch" replace />
  return <Layout>{children}</Layout>
}

// Owner-only route
function OwnerRoute({ children }) {
  const { currentUser, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)', fontSize: 15 }}>
        Loading…
      </div>
    )
  }
  if (!currentUser) return <Navigate to="/login" replace />
  if (currentUser.role !== 'owner') return <Navigate to="/dashboard" replace />
  return <Layout>{children}</Layout>
}

function DefaultRedirect() {
  const { currentUser } = useAuth()
  return <Navigate to={currentUser?.role === 'employee' ? '/punch' : '/dashboard'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><DefaultRedirect /></PrivateRoute>} />

            {/* Employee + Admin + Owner */}
            <Route path="/punch" element={<PrivateRoute><Punch /></PrivateRoute>} />

            {/* Admin + Owner only */}
            <Route path="/dashboard"   element={<AdminRoute><Dashboard /></AdminRoute>} />
            <Route path="/employees"   element={<AdminRoute><Employees /></AdminRoute>} />
            <Route path="/attendance"  element={<AdminRoute><Attendance /></AdminRoute>} />
            <Route path="/payroll"     element={<AdminRoute><Payroll /></AdminRoute>} />
            <Route path="/loans"       element={<AdminRoute><Loans /></AdminRoute>} />
            <Route path="/advances"    element={<AdminRoute><Advances /></AdminRoute>} />
            <Route path="/close-month" element={<AdminRoute><CloseMonth /></AdminRoute>} />
            <Route path="/reports"     element={<AdminRoute><Reports /></AdminRoute>} />

            {/* Owner only */}
            <Route path="/settings" element={<OwnerRoute><Settings /></OwnerRoute>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
