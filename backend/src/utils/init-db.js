require('dotenv').config();
const { pool } = require('./db');

async function init() {
  const client = await pool.connect();
  try {
    console.log('Connected to Supabase PostgreSQL.');

    // Check if tables already exist
    const existing = await client.query(`
      SELECT COUNT(*) as c FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    `);

    if (parseInt(existing.rows[0].c) > 0 && !process.argv.includes('--force')) {
      console.log('Tables already exist. Run with --force to reset.');
      return;
    }

    if (process.argv.includes('--force')) {
      console.log('Dropping existing tables...');
      await client.query(`
        DROP TABLE IF EXISTS audit_log, sessions, loan_emi_payments, salary_slips,
          advances, loans, salary_periods, punches, wage_history, users, system_config CASCADE;
      `);
    }

    console.log('Creating schema...');
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        employee_code TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('EMPLOYEE','ADMIN','OWNER')),
        phone TEXT,
        joined_on TEXT NOT NULL DEFAULT CURRENT_DATE::TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT,
        created_by INTEGER REFERENCES users(id)
      );

      CREATE TABLE wage_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        daily_wage_paise INTEGER NOT NULL CHECK (daily_wage_paise >= 0),
        effective_from TEXT NOT NULL,
        change_recorded_on TEXT NOT NULL,
        reason TEXT,
        changed_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
      );
      CREATE INDEX idx_wage_user_date ON wage_history(user_id, effective_from DESC);

      CREATE TABLE punches (
        id SERIAL PRIMARY KEY,
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
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT,
        updated_at TEXT NOT NULL DEFAULT NOW()::TEXT
      );
      CREATE INDEX idx_punches_user_date ON punches(user_id, punch_in);

      CREATE TABLE salary_periods (
        id SERIAL PRIMARY KEY,
        period_year INTEGER NOT NULL,
        period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FINALIZED','REOPENED')),
        finalized_on TEXT,
        finalized_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT,
        UNIQUE (period_year, period_month)
      );

      CREATE TABLE advances (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
        given_on TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SETTLED')),
        settled_in_period INTEGER REFERENCES salary_periods(id),
        given_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
      );

      CREATE TABLE loans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        original_paise INTEGER NOT NULL CHECK (original_paise > 0),
        issued_on TEXT NOT NULL,
        note TEXT,
        is_closed INTEGER NOT NULL DEFAULT 0,
        issued_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
      );

      CREATE TABLE loan_emi_payments (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id),
        salary_period_id INTEGER NOT NULL REFERENCES salary_periods(id),
        emi_paise INTEGER NOT NULL CHECK (emi_paise >= 0),
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
      );

      CREATE TABLE salary_slips (
        id SERIAL PRIMARY KEY,
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
        id SERIAL PRIMARY KEY,
        actor_user_id INTEGER NOT NULL REFERENCES users(id),
        actor_role TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_user_id INTEGER REFERENCES users(id),
        target_entity TEXT,
        target_entity_id INTEGER,
        before_data TEXT,
        after_data TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        refresh_token_hash TEXT NOT NULL,
        device_info TEXT,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT,
        last_used_at TEXT NOT NULL DEFAULT NOW()::TEXT,
        revoked_at TEXT
      );

      CREATE TABLE system_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        geofence_lat REAL NOT NULL DEFAULT 23.2363,
        geofence_lng REAL NOT NULL DEFAULT 72.5062,
        geofence_radius_meters INTEGER NOT NULL DEFAULT 200,
        lunch_start_minute INTEGER NOT NULL DEFAULT 780,
        lunch_end_minute INTEGER NOT NULL DEFAULT 840,
        ot_start_minute INTEGER NOT NULL DEFAULT 1050,
        working_minutes_per_day INTEGER NOT NULL DEFAULT 480,
        updated_at TEXT NOT NULL DEFAULT NOW()::TEXT
      );

      INSERT INTO system_config (id) VALUES (1);
    `);

    console.log('Schema created. Tables already have your real data in Supabase — no seeding needed.');
    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

init().catch(err => {
  console.error('Init failed:', err.message);
  process.exit(1);
});
