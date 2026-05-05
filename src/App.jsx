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

function PrivateRoute({ children }) {
  const { currentUser, loading } = useAuth()
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--muted)',
          fontSize: 15,
          gap: 12,
        }}
      >
        Loading…
      </div>
    )
  }
  if (!currentUser) return <Navigate to="/login" replace />
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
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <DefaultRedirect />
                </PrivateRoute>
              }
            />
            <Route path="/dashboard"   element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/punch"       element={<PrivateRoute><Punch /></PrivateRoute>} />
            <Route path="/employees"   element={<PrivateRoute><Employees /></PrivateRoute>} />
            <Route path="/attendance"  element={<PrivateRoute><Attendance /></PrivateRoute>} />
            <Route path="/payroll"     element={<PrivateRoute><Payroll /></PrivateRoute>} />
            <Route path="/loans"       element={<PrivateRoute><Loans /></PrivateRoute>} />
            <Route path="/advances"    element={<PrivateRoute><Advances /></PrivateRoute>} />
            <Route path="/close-month" element={<PrivateRoute><CloseMonth /></PrivateRoute>} />
            <Route path="/reports"     element={<PrivateRoute><Reports /></PrivateRoute>} />
            <Route path="/settings"    element={<PrivateRoute><Settings /></PrivateRoute>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
