import { supabase } from '../lib/supabase'
import { todayStr, nowTime } from '../utils/helpers'

export async function fetchAll() {
  const [users, punches, loans, loanPayments, advances, monthCloses, config] =
    await Promise.all([
      supabase.from('users').select('*').order('id'),
      supabase.from('punches').select('*').order('date').order('session').limit(500000),
      supabase.from('loans').select('*').order('date'),
      supabase.from('loan_payments').select('*').order('created_at').limit(10000),
      supabase.from('advances').select('*').order('date').limit(10000),
      supabase.from('month_closes').select('*').order('year').order('month').limit(10000),
      supabase.from('config').select('*'),
    ])

  const cfg = {}
  config.data?.forEach((r) => { cfg[r.key] = r.value })

  let adminPerms = {
    canExportSlip: false,
    canCloseMonth: false,
    canChangeWage: false,
    canManageLoan: true,
    canManualPunch: true,
    canManageAdvance: true,
  }
  try {
    if (cfg.adminPermissions) adminPerms = JSON.parse(cfg.adminPermissions)
  } catch {}

  return {
    users: users.data || [],
    punches: punches.data || [],
    loans: loans.data || [],
    loanPayments: loanPayments.data || [],
    advances: advances.data || [],
    monthCloses: monthCloses.data || [],
    adminPerms,
    nextEmpNum: parseInt(cfg.nextEmpNum) || 1,
    nextLoanNum: parseInt(cfg.nextLoanNum) || 1,
  }
}

export async function apiLogin(uid, pass) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('active', true)

  if (error) return { ok: false, err: error.message }

  const user = data?.find(
    (u) =>
      (u.id.toUpperCase() === uid.toUpperCase() ||
        u.username.toUpperCase() === uid.toUpperCase()) &&
      u.password.toUpperCase() === pass.toUpperCase()
  )

  if (!user) return { ok: false, err: 'Invalid credentials' }
  return { ok: true, user }
}

export async function apiAddEmployee(name, dept, wage, phone, joinDate, password) {
  const { data: users } = await supabase.from('users').select('id')
  let mx = 0
  users?.forEach((u) => {
    const m = u.id.match(/^EMP(\d+)$/i)
    if (m) mx = Math.max(mx, parseInt(m[1]))
  })
  const num = mx + 1
  const id = 'EMP' + String(num).padStart(3, '0')
  const pw = password || id

  const { error } = await supabase.from('users').insert({
    id,
    name,
    role: 'employee',
    username: id,
    password: pw,
    dept: dept || 'General',
    daily_wage: Number(wage) || 0,
    phone: phone || '—',
    join_date: joinDate || todayStr(),
    active: true,
  })

  if (error) return { ok: false, err: error.message }
  await supabase.from('config').upsert({ key: 'nextEmpNum', value: String(num + 1) })
  return { ok: true, id, pw }
}

export async function apiChangePassword(empId, newPass) {
  const { error } = await supabase
    .from('users')
    .update({ password: newPass })
    .eq('id', empId)
  return error ? { ok: false, err: error.message } : { ok: true }
}

export async function apiChangeDailyWage(empId, wage) {
  const { error } = await supabase
    .from('users')
    .update({ daily_wage: Number(wage) })
    .eq('id', empId)
  return error ? { ok: false, err: error.message } : { ok: true }
}

export async function apiChangeRole(empId, newRole) {
  const { error } = await supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', empId)
  return error ? { ok: false, err: error.message } : { ok: true }
}

export async function apiPunchIn(empId) {
  const today = todayStr()
  const time = nowTime()
  const { data: existing } = await supabase
    .from('punches')
    .select('*')
    .eq('emp_id', empId)
    .eq('date', today)

  const open = existing?.find((p) => p.in_time && !p.out_time)
  if (open) return { ok: false, err: 'Open session. Punch OUT first.' }

  const maxSession = existing?.reduce((m, p) => Math.max(m, p.session || 1), 0) || 0

  const { error } = await supabase.from('punches').insert({
    emp_id: empId,
    date: today,
    in_time: time,
    out_time: null,
    manual_in: false,
    manual_out: false,
    remark: '',
    session: maxSession + 1,
  })

  return error
    ? { ok: false, err: error.message }
    : { ok: true, time, session: maxSession + 1 }
}

export async function apiPunchOut(empId) {
  const today = todayStr()
  const time = nowTime()
  const { data: existing } = await supabase
    .from('punches')
    .select('*')
    .eq('emp_id', empId)
    .eq('date', today)

  const openSessions = existing
    ?.filter((p) => p.in_time && !p.out_time)
    .sort((a, b) => (b.session || 1) - (a.session || 1))
  const open = openSessions?.[0]

  if (!open) return { ok: false, err: 'No open punch-in today' }

  const { error } = await supabase
    .from('punches')
    .update({ out_time: time })
    .eq('id', open.id)

  return error ? { ok: false, err: error.message } : { ok: true, time, session: open.session }
}

export async function apiManualPunch(empId, date, type, time, remark) {
  const { data: existing } = await supabase
    .from('punches')
    .select('*')
    .eq('emp_id', empId)
    .eq('date', date)

  if (type === 'in') {
    const maxSession = existing?.reduce((m, p) => Math.max(m, p.session || 1), 0) || 0
    const { error } = await supabase.from('punches').insert({
      emp_id: empId,
      date,
      in_time: time,
      out_time: null,
      manual_in: true,
      manual_out: false,
      remark: remark || 'Manual',
      session: maxSession + 1,
    })
    return error ? { ok: false, err: error.message } : { ok: true }
  } else {
    const open = existing
      ?.filter((p) => !p.out_time)
      .sort((a, b) => (b.session || 1) - (a.session || 1))[0]

    if (open) {
      const { error } = await supabase
        .from('punches')
        .update({ out_time: time, manual_out: true, remark: remark || 'Manual' })
        .eq('id', open.id)
      return error ? { ok: false, err: error.message } : { ok: true }
    } else {
      const { error } = await supabase.from('punches').insert({
        emp_id: empId,
        date,
        in_time: null,
        out_time: time,
        manual_in: false,
        manual_out: true,
        remark: remark || 'Manual',
        session: 1,
      })
      return error ? { ok: false, err: error.message } : { ok: true }
    }
  }
}

export async function apiAddLoan(empId, total, date, note) {
  const { data: loans } = await supabase.from('loans').select('id')
  let mx = 0
  loans?.forEach((l) => {
    const m = l.id.match(/^L(\d+)$/i)
    if (m) mx = Math.max(mx, parseInt(m[1]))
  })
  const num = mx + 1
  const id = 'L' + String(num).padStart(3, '0')

  const { error } = await supabase.from('loans').insert({
    id,
    emp_id: empId,
    type: 'loan',
    total: Number(total),
    paid: 0,
    date: date || todayStr(),
    note: note || '',
    active: true,
  })

  if (error) return { ok: false, err: error.message }
  await supabase.from('config').upsert({ key: 'nextLoanNum', value: String(num + 1) })
  return { ok: true, id }
}

export async function apiRecordLoanPayment(loanId, amt, month, recordedBy) {
  const { data: loan } = await supabase
    .from('loans')
    .select('*')
    .eq('id', loanId)
    .single()
  if (!loan) return { ok: false, err: 'Loan not found' }

  const newPaid = Math.min(Number(loan.total), Number(loan.paid) + Number(amt))
  const closed = newPaid >= Number(loan.total)

  const { error: e1 } = await supabase
    .from('loans')
    .update({ paid: newPaid, active: !closed })
    .eq('id', loanId)
  if (e1) return { ok: false, err: e1.message }

  const { error: e2 } = await supabase.from('loan_payments').insert({
    loan_id: loanId,
    emp_id: loan.emp_id,
    amount: Number(amt),
    month: month || '',
    recorded_by: recordedBy || '',
  })

  return e2 ? { ok: false, err: e2.message } : { ok: true, closed }
}

export async function apiCloseLoan(loanId) {
  const { error } = await supabase
    .from('loans')
    .update({ active: false })
    .eq('id', loanId)
  return error ? { ok: false, err: error.message } : { ok: true }
}

export async function apiAddAdvance(empId, amount, date, notes, addedBy) {
  const { error } = await supabase.from('advances').insert({
    emp_id: empId,
    amount: Number(amount),
    date: date || todayStr(),
    notes: notes || '',
    added_by: addedBy || '',
  })
  return error ? { ok: false, err: error.message } : { ok: true }
}

export async function apiCloseMonth(year, month, salaryData, closedBy) {
  // Double-close protection: check if already closed
  const { data: existing } = await supabase
    .from('month_closes')
    .select('id')
    .eq('year', year)
    .eq('month', month)
    .limit(1)
  if (existing && existing.length > 0) {
    return { ok: false, err: 'This month is already closed.' }
  }

  const rows = salaryData.map((d) => ({
    emp_id: d.empId,
    year,
    month,
    total_minutes: d.totalMinutes,
    gross_pay: d.grossPay,
    loan_deductions: d.loanDed,
    advance_deductions: d.advDed,
    carry_forward: d.carryForward,
    net_pay: d.netPay,
    closed_at: new Date().toISOString(),
    closed_by: closedBy,
  }))
  const { error } = await supabase.from('month_closes').insert(rows)
  return error ? { ok: false, err: error.message } : { ok: true, count: rows.length }
}

export async function apiSetPermissions(perms) {
  const { error } = await supabase
    .from('config')
    .upsert({ key: 'adminPermissions', value: JSON.stringify(perms) })
  return error ? { ok: false, err: error.message } : { ok: true }
}
