# National Enterprise — HRMS
### Attendance & Payroll System · React + Vite

---

## Quick Start

```bash
npm install
npm run dev
# Opens at http://localhost:3000
```

**Demo credentials:**
| Role    | ID      | PIN  |
|---------|---------|------|
| Owner   | OWNER   | 0000 |
| Admin   | EMP004  | EMP004 |
| Employee| EMP001  | EMP001 |

---

## Project Structure

```
src/
├── App.jsx              # Shell, navigation, routing
├── lib/
│   ├── calc.js          # All salary calculations (pure functions, no side effects)
│   ├── store.jsx        # Global state (React Context + useReducer)
│   └── theme.js         # Design tokens
├── data/
│   └── seed.js          # All 36 employees, loans, advances, closes — real data
├── components/
│   └── UI.jsx           # Avatar, Badge, Btn, Card, Input, Modal, Table, Toast…
└── pages/
    ├── Login.jsx        # PIN numpad login
    ├── Dashboard.jsx    # Present today, dept strength, loan snapshot
    ├── Punch.jsx        # Employee punch in/out with geofence
    ├── Attendance.jsx   # Daily grid with manual punch entry
    ├── Employees.jsx    # Team list, add/edit/deactivate
    ├── Salary.jsx       # Unified close-month page (advances + loans + finalise)
    ├── Loans.jsx        # Loan management with computed balances
    └── Settings.jsx     # Geofence config, admin permissions
```

---

## Every Change from the Current GAS Stack

### 🔴 Critical Bug Fixes

**FIX #1 — Loan `paid` column was NULL for all 21 loans**
- Old: `Loans.paid` was never updated. Progress bars showed 0% forever.
- New: `computeLoanPaid(loan, monthCloses)` sums all `loanDeductions` from closed
  months for that employee. Updates automatically on every close. No stale data.

**FIX #2 — Gross pay couldn't be audited (wage rate not stored)**
- Old: `calcSalary()` read `dailyWage` live. If wage changed mid-month, closed
  records couldn't explain the gross figure.
- New: `dailyWageUsed` stored in every `MonthClose` row at close time. EMP016's
  ₹2,911 discrepancy is now traceable.

**FIX #3 — Advance date used as deduction-month (wrong logic)**
- Old: `getAdvanceTotal()` filtered by `advance.date.month`. Manager entered
  advances on April 5th for March salary → attributed to April.
- New: Each advance has an explicit `deductMonth` field (e.g. `"2026-03"`).
  The Add Advance modal has a month picker. Entering on April 5th for March
  works correctly without backdating.

**FIX #4 — Carry forward never stored; chain breaks after 1 month**
- Old: `carryForward` column in MonthClose was 0 for all records including the
  5 employees with negative netPay.
- New: Carry forward is computed AND stored at close time. Multi-month chain
  works: EMP009 at -₹24,044 in March correctly rolls into April, April into May.

### 🟡 Logic Errors Fixed

**FIX #5 — Overlapping sessions double-counted time**
- Old: EMP022 had identical sessions on same day. Both counted = 18hrs paid.
- New: `mergeSessions()` merges overlapping time ranges before summing.
  Implemented as standard interval-merge algorithm (sort → extend or append).

**FIX #6 — OUT < IN silently gave ₹0 with no warning**
- Old: `if (outM <= inM) return` — session disappeared with zero indication.
- New: `detectAnomalies()` flags these rows. Attendance page shows a persistent
  red alert (not a toast) naming each affected employee and suggesting PM correction.

**FIX #7 — Lunch deduction is now per-day on merged timeline**
- Old: Applied per-session, could interact oddly at session boundaries near 1pm.
- New: `calcPaidMinutes()` applies the 13:00–14:00 deduction once per merged
  segment, eliminating all edge cases.

**FIX #8 — "Close on the 5th for last month" had wrong defaults**
- Old: Month selector defaulted to current calendar month. Manager on April 5th
  saw April, had to manually switch to March.
- New: `activeSalaryPeriod` state. Default period auto-detects: if date ≤ 7th,
  show previous month. Banner shows "Active salary period: March 2026" throughout.

**FIX #9 — Manual punch appended without checking conflicts**
- Old: Admin could add a session overlapping an existing one. No warning.
- New: Store checks for time conflicts before appending. Conflict state surfaced
  to UI. (Foundation laid in reducer; conflict UI connects in Attendance page.)

**FIX #11 — Loan EMI had to be remembered every month**
- Old: Manager typed the deduction amount from memory each close.
- New: `monthlyEMI` field on every loan. Salary preview pre-fills this value.
  Manager sees it, adjusts if needed, clicks finalise. Remaining balance shown inline.

**FIX #12 — Ghost entries (EMP021: 1 minute, ₹1) went unnoticed**
- Old: No threshold. 1 minute was a valid session.
- New: Salary page warns about employees with < 60 minutes total for the month
  before close, listed by name.

### 🔵 Geofence Fixes

**Radius: 200m → 350m**
Factory buildings are typically 80–120m across. GPS drift inside metal-roofed
buildings is 30–80m. 200m left no real margin. 350m is the correct working radius.

**maximumAge: 30000 → 0**
Old code allowed 30-second stale GPS cache. An employee who cached their home
location this morning could punch in from home. Now always requests a fresh fix.

### 🟢 Architecture Changes

**Navigation redesign**
- Loans, Advances, and Close Month were 3 separate tabs requiring cross-tab
  number copying.
- Now: One unified Salary page. Advances entered inline at top, loan EMIs
  pre-filled in table, finalise button at end. Zero tab-switching.

**Persistent errors instead of disappearing toasts**
- Geofence failures, punch errors: now show as inline persistent messages
  with a Retry button. Not a 3.5-second toast that semi-literate users miss.

**Date display**
- Old: `ddMMyyyy` with no separator (e.g. `22042026`).
- New: `22 Apr 2026` everywhere using `fmtDate()`.

**PIN numpad instead of password field**
- Labour staff do not need to type alphanumeric passwords.
- 4-digit PIN with tap numpad. One-tap per digit, auto-submits at 4.
- Shake animation on wrong PIN (persistent error, not toast).

---

## Migrating to Supabase

When you're ready to go live, replace `src/data/seed.js` imports in `store.jsx`
with Supabase queries. The calc functions in `calc.js` are pure — they work
identically with any data source.

### SQL Schema (paste into Supabase SQL editor)

```sql
-- Users
create table users (
  id text primary key,
  name text not null,
  role text not null default 'employee',
  dept text not null default 'Production',
  daily_wage integer not null default 0,
  phone text,
  join_date date,
  active boolean not null default true
);

-- Punches
create table punches (
  id uuid primary key default gen_random_uuid(),
  emp_id text references users(id),
  date date not null,
  in_time time,
  out_time time,
  manual_in boolean default false,
  manual_out boolean default false,
  remark text,
  session integer default 1
);
create index on punches(emp_id, date);

-- Loans
create table loans (
  id text primary key,
  emp_id text references users(id),
  total integer not null,
  monthly_emi integer default 0,
  date date,
  active boolean default true
);

-- Advances (FIX #3: deduct_month is explicit)
create table advances (
  id uuid primary key default gen_random_uuid(),
  emp_id text references users(id),
  amount integer not null,
  date date,
  deduct_month text not null,  -- 'YYYY-MM'
  notes text,
  added_by text
);

-- MonthClose (FIX #2: daily_wage_used stored; FIX #4: carry_forward stored)
create table month_closes (
  id uuid primary key default gen_random_uuid(),
  emp_id text references users(id),
  year integer not null,
  month integer not null,
  total_minutes integer default 0,
  gross_pay integer default 0,
  loan_deductions integer default 0,
  advance_deductions integer default 0,
  carry_forward integer default 0,
  net_pay integer default 0,
  daily_wage_used integer default 0,
  closed_at timestamp default now(),
  closed_by text,
  unique(emp_id, year, month)  -- FIX: prevents double-close
);

-- Row-level security
alter table users        enable row level security;
alter table punches      enable row level security;
alter table loans        enable row level security;
alter table advances     enable row level security;
alter table month_closes enable row level security;
```

### Environment Variables (create `.env.local`)

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Replace seed data with live queries

In `store.jsx`, replace the initial state arrays with:
```js
const { data: employees } = await supabase.from('users').select('*')
const { data: punches }   = await supabase.from('punches').select('*')
  .gte('date', startOfMonth).lte('date', endOfMonth)
// etc.
```

---

## Deploy to Vercel

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/yourname/national-enterprise-hrms
git push -u origin main

# 2. Go to vercel.com → New Project → Import from GitHub
# 3. Add environment variables (Supabase URL + key)
# 4. Deploy — live in ~45 seconds
```

Every subsequent `git push` auto-deploys. No manual URL changes. No GAS
deployment friction.

---

## What's Not Built Yet (Next Steps)

- [ ] PDF salary slip generation (printable per-employee)
- [ ] Salary slip WhatsApp delivery via MSG91
- [ ] Employee self-service view (read-only hours + pay)
- [ ] Payroll CSV export for accountant / bank bulk NEFT
- [ ] Supabase Realtime (dashboard auto-updates on punch)
- [ ] Push notifications (PWA) when employee doesn't punch by 9:30am
- [ ] Leave management (paid leave, sick leave, holidays)
- [ ] Bank account + IFSC fields for NEFT export
