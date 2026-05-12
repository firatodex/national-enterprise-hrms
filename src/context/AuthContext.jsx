import { createContext, useContext, useState, useEffect } from 'react'
import { fetchAll, apiLogin as _apiLogin } from '../api'

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
    const init = async () => {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        try {
          const savedUser = JSON.parse(saved)
          // Restore session immediately so UI shows without waiting for fetchAll
          setCurrentUser(savedUser)
          // Then validate role from Supabase in background
          const data = await fetchAll()
          if (data) {
            setDb(data)
            const freshUser = data.users.find((u) => u.id === savedUser.id)
            if (freshUser && freshUser.active) {
              const validated = {
                id: freshUser.id,
                name: freshUser.name,
                role: freshUser.role,
                username: freshUser.username,
                dept: freshUser.dept,
                daily_wage: freshUser.daily_wage,
                phone: freshUser.phone,
                join_date: freshUser.join_date,
                active: freshUser.active,
              }
              setCurrentUser(validated)
              localStorage.setItem(SESSION_KEY, JSON.stringify(validated))
            } else {
              // User deactivated — force logout
              setCurrentUser(null)
              localStorage.removeItem(SESSION_KEY)
            }
          }
        } catch (e) {
          console.error('Session restore failed', e)
          localStorage.removeItem(SESSION_KEY)
          setCurrentUser(null)
        }
      }
      setLoading(false)
    }
    init()
  }, [])

  const loadData = async () => {
    try {
      const data = await fetchAll()
      if (data) setDb(data)
      return data
    } catch (e) {
      console.error('loadData error', e)
      return null
    }
  }

  const login = async (uid, pass) => {
    // Step 1: authenticate — fast, only hits users table
    const result = await _apiLogin(uid, pass)
    if (!result.ok) return result

    // Step 2: set user immediately so navigate works without delay
    const user = { ...result.user }
    delete user.password
    setCurrentUser(user)
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))

    // Step 3: load full DB in background — don't block login on this
    loadData()

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
