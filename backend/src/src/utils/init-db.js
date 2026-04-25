const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'db', 'hrms.db');
const DB_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Creating schema...');

db.exec(`
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('EMPLOYEE','ADMIN','OWNER')),
    phone TEXT,
    joined_on TEXT NOT NULL DEFAULT (date('now')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by INTEGER REFERENCES users(id)
);

CREATE TABLE wage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    daily_wage_paise INTEGER NOT NULL CHECK (daily_wage_paise >= 0),
    effective_from TEXT NOT NULL,
    change_recorded_on TEXT NOT NULL,
    reason TEXT,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_wage_user_date ON wage_history(user_id, effective_from DESC);

CREATE TABLE punches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    punch_in TEXT NOT NULL,
    punch_out TEXT,
    punch_in_lat REAL,
    punch_in_lng REAL,
    punch_out_lat REAL,
    punch_out_lng REAL,
    is_manual INTEGER NOT NULL DEFAULT 0,
    entered_by INTEGER REFERENCES users(id),
    override_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_punches_user_date ON punches(user_id, punch_in);
CREATE UNIQUE INDEX idx_punches_one_open_per_user ON punches(user_id) WHERE punch_out IS NULL;

CREATE TABLE salary_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FINALIZED','REOPENED')),
    finalized_on TEXT,
    finalized_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (period_year, period_month)
);

CREATE TABLE advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    given_on TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SETTLED')),
    settled_in_period INTEGER REFERENCES salary_periods(id),
    given_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_advances_user_status ON advances(user_id, status);

CREATE TABLE loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    original_paise INTEGER NOT NULL CHECK (original_paise > 0),
    issued_on TEXT NOT NULL,
    note TEXT,
    is_closed INTEGER NOT NULL DEFAULT 0,
    issued_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_loans_user_open ON loans(user_id) WHERE is_closed = 0;

CREATE TABLE loan_emi_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL REFERENCES loans(id),
    salary_period_id INTEGER NOT NULL REFERENCES salary_periods(id),
    emi_paise INTEGER NOT NULL CHECK (emi_paise >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE salary_slips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    salary_period_id INTEGER NOT NULL REFERENCES salary_periods(id),
    days_worked INTEGER NOT NULL DEFAULT 0,
    regular_minutes INTEGER NOT NULL DEFAULT 0,
    overtime_minutes INTEGER NOT NULL DEFAULT 0,
    regular_salary_paise INTEGER NOT NULL DEFAULT 0,
    overtime_salary_paise INTEGER NOT NULL DEFAULT 0,
    gross_paise INTEGER NOT NULL DEFAULT 0,
    carry_forward_paise INTEGER NOT NULL DEFAULT 0,
    advance_deduction_paise INTEGER NOT NULL DEFAULT 0,
    loan_emi_paise INTEGER NOT NULL DEFAULT 0,
    other_deduction_paise INTEGER NOT NULL DEFAULT 0,
    other_deduction_note TEXT,
    net_paise INTEGER NOT NULL DEFAULT 0,
    next_month_carry_paise INTEGER NOT NULL DEFAULT 0,
    finalized_on TEXT,
    finalized_by INTEGER REFERENCES users(id),
    UNIQUE (user_id, salary_period_id)
);

CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    actor_role TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target_user_id INTEGER REFERENCES users(id),
    target_entity TEXT,
    target_entity_id INTEGER,
    before_data TEXT,
    after_data TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_log(target_user_id, created_at DESC);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    refresh_token_hash TEXT NOT NULL,
    device_info TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id) WHERE revoked_at IS NULL;

CREATE TABLE system_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    geofence_lat REAL NOT NULL DEFAULT 23.2363333,
    geofence_lng REAL NOT NULL DEFAULT 72.5061667,
    geofence_radius_meters INTEGER NOT NULL DEFAULT 200,
    lunch_start_minute INTEGER NOT NULL DEFAULT 780,
    lunch_end_minute INTEGER NOT NULL DEFAULT 840,
    ot_start_minute INTEGER NOT NULL DEFAULT 1050,
    working_minutes_per_day INTEGER NOT NULL DEFAULT 480,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO system_config (id) VALUES (1);
`);

console.log('Seeding users...');

const insertUser = db.prepare(`
  INSERT INTO users (employee_code, full_name, password_hash, role, phone, joined_on, is_active)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`);
const insertWage = db.prepare(`
  INSERT INTO wage_history (user_id, daily_wage_paise, effective_from, change_recorded_on, reason, changed_by)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const ownerHash = bcrypt.hashSync('OWNER', 10);
const ownerId = insertUser.run('OWNER', 'Owner', ownerHash, 'OWNER', null, '2023-01-01').lastInsertRowid;

const adminHash = bcrypt.hashSync('ADMIN001', 10);
const adminId = insertUser.run('ADMIN001', 'Admin User', adminHash, 'ADMIN', '+919800000001', '2023-01-01').lastInsertRowid;
insertWage.run(adminId, 100000, '2023-01-01', '2023-01-01', 'Initial wage', ownerId);

const employees = [
  { code: 'EMP001', name: 'Ramesh Patel',  phone: '+919825012345', wage: 70000 },
  { code: 'EMP002', name: 'Suresh Shah',   phone: '+919825012346', wage: 65000 },
  { code: 'EMP003', name: 'Mahesh Kumar',  phone: '+919825012347', wage: 60000 },
  { code: 'EMP004', name: 'Kiran Joshi',   phone: '+919825012348', wage: 60000 },
  { code: 'EMP005', name: 'Dinesh Modi',   phone: '+919825012349', wage: 55000 }
];

for (const emp of employees) {
  const hash = bcrypt.hashSync(emp.code, 10);
  const id = insertUser.run(emp.code, emp.name, hash, 'EMPLOYEE', emp.phone, '2023-06-01').lastInsertRowid;
  insertWage.run(id, emp.wage, '2023-06-01', '2023-06-01', 'Initial wage', ownerId);
}

console.log('\nDatabase ready at:', DB_PATH);
console.log('\nLogin credentials:');
console.log('  Owner:    OWNER / OWNER');
console.log('  Admin:    ADMIN001 / ADMIN001');
console.log('  Employees: EMP001..EMP005 / same as code');

db.close();
