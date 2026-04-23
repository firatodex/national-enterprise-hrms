import { createContext, useContext, useReducer, useCallback } from 'react'
import { USERS, LOANS, ADVANCES_SEED, MONTH_CLOSES_SEED, PUNCHES_SEED, CONFIG } from '../data/seed.js'
import { todayISO, pad } from './calc.js'

const Ctx = createContext(null)

const initialState = {
  currentUser:   null,
  employees:     USERS,
  punches:       PUNCHES_SEED,
  loans:         LOANS,
  advances:      ADVANCES_SEED,
  monthCloses:   MONTH_CLOSES_SEED,
  config:        CONFIG,
  // FIX #8: Active salary period concept
  activeSalaryPeriod: null,  // { year, month } — set when manager opens salary prep
  adminPerms:    CONFIG.adminPermissions,
  nextEmpNum:    37,
  nextLoanNum:   22,
  nextAdvNum:    21,
}

function reducer(state, action) {
  switch (action.type) {

    case 'LOGIN':
      return { ...state, currentUser: action.user }

    case 'LOGOUT':
      return { ...state, currentUser: null, activeSalaryPeriod: null }

    case 'PUNCH_IN': {
      const today = todayISO()
      // FIX #5: Guard — never create a second open session if one already exists
      const hasOpenSession = state.punches.some(
        p => p.empId === action.empId && p.date === today && p.inTime && !p.outTime
      )
      if (hasOpenSession) return state
      const existing = state.punches.filter(p => p.empId === action.empId && p.date === today)
      const maxSess  = existing.reduce((m, p) => Math.max(m, p.session || 1), 0)
      return {
        ...state,
        punches: [...state.punches, {
          empId: action.empId, date: today,
          inTime: action.time, outTime: null,
          manualIn: false, manualOut: false,
          remark: null, session: maxSess + 1,
        }]
      }
    }

    case 'PUNCH_OUT': {
      const today = todayISO()
      const openIdx = state.punches.reduce((found, p, i) => {
        if (p.empId === action.empId && p.date === today && p.inTime && !p.outTime) {
          return found === -1 || (p.session || 1) > (state.punches[found].session || 1) ? i : found
        }
        return found
      }, -1)
      if (openIdx === -1) return state
      return {
        ...state,
        punches: state.punches.map((p, i) => i === openIdx ? { ...p, outTime: action.time } : p)
      }
    }

    case 'MANUAL_PUNCH': {
      const { empId, date, punchType: type, time, remark } = action
      if (type === 'in') {
        const existing = state.punches.filter(p => p.empId === empId && p.date === date)
        // FIX #9: Check for conflicts before appending
        const conflicts = existing.filter(p => {
          if (!p.inTime) return false
          const newInM = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1])
          const pInM   = parseInt(p.inTime.split(':')[0]) * 60 + parseInt(p.inTime.split(':')[1])
          const pOutM  = p.outTime ? parseInt(p.outTime.split(':')[0]) * 60 + parseInt(p.outTime.split(':')[1]) : 9999
          return newInM >= pInM && newInM <= pOutM
        })
        if (conflicts.length > 0 && !action.forceAdd) {
          return { ...state, _conflict: { empId, date, type, time, remark } }
        }
        const maxSess = existing.reduce((m, p) => Math.max(m, p.session || 1), 0)
        return {
          ...state,
          _conflict: null,
          punches: [...state.punches, {
            empId, date, inTime: time, outTime: null,
            manualIn: true, manualOut: false, remark: remark || 'Manual', session: maxSess + 1,
          }]
        }
      } else {
        // punch out: find open session for that date or append
        const openIdx = state.punches.reduce((found, p, i) => {
          if (p.empId === empId && p.date === date && p.inTime && !p.outTime) {
            return found === -1 || (p.session||1) > (state.punches[found]?.session||1) ? i : found
          }
          return found
        }, -1)
        if (openIdx !== -1) {
          return {
            ...state,
            punches: state.punches.map((p, i) =>
              i === openIdx ? { ...p, outTime: time, manualOut: true, remark: remark || 'Manual' } : p
            )
          }
        }
        return state
      }
    }

    case 'ADD_EMPLOYEE': {
      const num = state.nextEmpNum
      const id  = `EMP${pad(num)}`
      return {
        ...state,
        nextEmpNum: num + 1,
        employees: [...state.employees, {
          id, name: action.name, role: 'employee', username: id, password: id,
          dept: action.dept, dailyWage: action.wage, phone: action.phone || '',
          joinDate: todayISO(), active: true,
        }]
      }
    }

    case 'UPDATE_WAGE':
      return {
        ...state,
        employees: state.employees.map(e =>
          e.id === action.empId ? { ...e, dailyWage: action.wage } : e
        )
      }

    case 'UPDATE_ROLE':
      return {
        ...state,
        employees: state.employees.map(e =>
          e.id === action.empId ? { ...e, role: action.role } : e
        )
      }

    case 'UPDATE_PASSWORD':
      return {
        ...state,
        employees: state.employees.map(e =>
          e.id === action.empId ? { ...e, password: action.password } : e
        )
      }

    case 'DEACTIVATE_EMPLOYEE':
      return {
        ...state,
        employees: state.employees.map(e =>
          e.id === action.empId ? { ...e, active: false } : e
        )
      }

    case 'ADD_LOAN': {
      const n  = state.nextLoanNum
      const id = `L${pad(n)}`
      return {
        ...state,
        nextLoanNum: n + 1,
        loans: [...state.loans, {
          id, empId: action.empId, total: action.total,
          monthlyEMI: action.emi || 0,
          date: todayISO(), active: true,
        }]
      }
    }

    case 'UPDATE_LOAN_EMI':
      return {
        ...state,
        loans: state.loans.map(l =>
          l.id === action.loanId ? { ...l, monthlyEMI: action.emi } : l
        )
      }

    case 'CLOSE_LOAN':
      return {
        ...state,
        loans: state.loans.map(l =>
          l.id === action.loanId ? { ...l, active: false } : l
        )
      }

    case 'ADD_ADVANCE': {
      const n = state.nextAdvNum
      return {
        ...state,
        nextAdvNum: n + 1,
        advances: [...state.advances, {
          id: `A${pad(n)}`, empId: action.empId, amount: action.amount,
          date: todayISO(), deductMonth: action.deductMonth,
          notes: action.notes || '', addedBy: action.addedBy,
        }]
      }
    }

    case 'SET_SALARY_PERIOD':
      return { ...state, activeSalaryPeriod: action.period }

    // FIX #1 + #4: Close month stores carryForward and updates loan paid
    case 'CLOSE_MONTH': {
      const { year, month, rows, closedBy } = action
      // FIX: Idempotency guard — silently reject if already closed
      const alreadyClosed = state.monthCloses.some(mc => mc.year === year && mc.month === month)
      if (alreadyClosed) return state
      const closedAt = todayISO()
      const newCloses = rows.map(r => ({
        empId:             r.empId,
        year, month,
        totalMinutes:      r.totalMinutes,
        grossPay:          r.grossPay,
        loanDeductions:    r.loanDed,
        advanceDeductions: r.advDed,
        carryForward:      r.carryFwd,    // FIX #4: stored
        netPay:            r.netPay,
        dailyWageUsed:     r.dailyWageUsed, // FIX #2: stored
        closedAt, closedBy,
      }))
      // FIX #1: Update loan paid from MonthClose records
      const allCloses = [...state.monthCloses, ...newCloses]
      const updatedLoans = state.loans.map(loan => {
        const paid = allCloses
          .filter(mc => mc.empId === loan.empId)
          .reduce((s, mc) => s + (mc.loanDeductions || 0), 0)
        const fullyPaid = paid >= loan.total && loan.total > 0
        return { ...loan, paid, active: fullyPaid ? false : loan.active }
      })
      return {
        ...state,
        monthCloses:        allCloses,
        loans:              updatedLoans,
        activeSalaryPeriod: null,
      }
    }

    case 'SET_ADMIN_PERMS':
      return { ...state, adminPerms: { ...state.adminPerms, ...action.perms } }

    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, ...action.config } }

    case 'CLEAR_CONFLICT':
      return { ...state, _conflict: null }

    default:
      return state
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const login = useCallback((id, pin) => {
    const user = state.employees.find(e =>
      (e.id.toUpperCase() === id.toUpperCase() || e.username?.toUpperCase() === id.toUpperCase()) &&
      e.password?.toUpperCase() === pin.toUpperCase() &&
      e.active !== false
    )
    if (user) {
      dispatch({ type: 'LOGIN', user: { ...user, password: undefined } })
      return true
    }
    return false
  }, [state.employees])

  const value = { state, dispatch, login }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
