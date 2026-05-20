import { createContext, useContext, useState, useEffect, useRef } from 'react'
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
  const currentUserRef = useRef(null)

  // Keep ref in sync so async callbacks always have latest value
  useEffect(() => {
    currentUserRef.current = currentUser
  }, [currentUser])

  useEffect(() => {
    const init = async () => {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        try {
          const savedUser = JSON.parse(saved)
          // FIX: Restore session immediately — never wipe it due to network issues
          setCurrentUser(savedUser)
          setLoading(false)

          // Validate in background — only update, never wipe on network failure
          try {
            const data = await fetchAll()
            if (data) {
              setDb(data)
              const freshUser = data.users.find((u) => u.id === savedUser.id)
              if (freshUser) {
                if (!freshUser.active) {
                  // Only sign out if EXPLICITLY deactivated in DB
                  setCurrentUser(null)
                  localStorage.removeItem(SESSION_KEY)
                } else {
                  // Update with fresh data from DB
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
                }
              }
              // If freshUser not found (network partial load) — keep existing session
            }
            // If fetchAll fails — keep existing session, try again on next refresh
          } catch (fetchErr) {
            console.warn('Background validation failed, keeping session:', fetchErr)
            // Do NOT sign out — network error should not kick users out
          }
          return // loading already set to false above
        } catch (e) {
          // Only clear if JSON.parse itself fails (corrupted data)
          console.error('Corrupted session data, clearing:', e)
          localStorage.removeItem(SESSION_KEY)
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
    const result = await _apiLogin(uid, pass)
    if (!result.ok) return result

    const user = { ...result.user }
    delete user.password
    setCurrentUser(user)
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))

    // Load data in background — don't block navigation
    loadData()

    return result
  }

  const logout = () => {
    setCurrentUser(null)
    currentUserRef.current = null
    localStorage.removeItem(SESSION_KEY)
    setDb({
      users: [], punches: [], loans: [], loanPayments: [],
      advances: [], monthCloses: [], adminPerms: {}, nextEmpNum: 1, nextLoanNum: 1,
    })
  }

  const refresh = async () => {
    const data = await loadData()
    // FIX: use ref to get current value — avoids stale closure bug
    const user = currentUserRef.current
    if (data && user) {
      const fresh = data.users.find((u) => u.id === user.id)
      if (fresh) {
        const updated = {
          ...user,
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
