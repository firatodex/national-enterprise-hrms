import { createContext, useContext, useState, useEffect } from 'react'
import { fetchAll } from '../api'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const SESSION_KEY = 'ne_hrms_user'

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [db, setDb] = useState({
    users: [],
    punches: [],
    loans: [],
    loanPayments: [],
    advances: [],
    monthCloses: [],
    adminPerms: {},
    nextEmpNum: 1,
    nextLoanNum: 1,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved))
      } catch {}
    }
    setLoading(false)
  }, [])

  const loadData = async () => {
    try {
      const data = await fetchAll()
      setDb(data)
      return data
    } catch (e) {
      console.error('loadData error', e)
      return null
    }
  }

  const login = async (uid, pass) => {
    const { apiLogin } = await import('../api')
    const result = await apiLogin(uid, pass)
    if (result.ok) {
      const user = { ...result.user }
      delete user.password
      setCurrentUser(user)
      localStorage.setItem(SESSION_KEY, JSON.stringify(user))
      await loadData()
    }
    return result
  }

  const logout = () => {
    setCurrentUser(null)
    localStorage.removeItem(SESSION_KEY)
    setDb({
      users: [], punches: [], loans: [], loanPayments: [],
      advances: [], monthCloses: [], adminPerms: {}, nextEmpNum: 1, nextLoanNum: 1,
    })
  }

  const refresh = async () => {
    const data = await loadData()
    if (data && currentUser) {
      const fresh = data.users.find((u) => u.id === currentUser.id)
      if (fresh) {
        const updated = {
          ...currentUser,
          daily_wage: fresh.daily_wage,
          dept: fresh.dept,
          name: fresh.name,
          role: fresh.role,
        }
        setCurrentUser(updated)
        localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
      }
    }
  }

  const canDo = (action) => {
    if (currentUser?.role === 'owner') return true
    if (currentUser?.role === 'admin') return db.adminPerms[action] !== false
    return false
  }

  return (
    <AuthContext.Provider
      value={{ currentUser, db, loading, login, logout, refresh, canDo, loadData }}
    >
      {children}
    </AuthContext.Provider>
  )
}
