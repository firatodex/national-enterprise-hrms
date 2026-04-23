-- =====================================================================
-- NATIONAL ENTERPRISE HRMS — POSTGRESQL SCHEMA
-- =====================================================================
-- Design notes:
--   * Money stored as INTEGER paise (₹1 = 100 paise) to avoid float errors
--   * Timestamps in UTC; display converts to IST (Asia/Kolkata)
--   * Ledger tables are append-only; corrections = new rows
--   * All admin/owner actions generate audit_log entries
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. USERS (employees, admins, owner — single table, role-based)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id                  SERIAL PRIMARY KEY,
    employee_code       VARCHAR(20) UNIQUE NOT NULL,      -- EMP001, OWNER, etc.
    full_name           VARCHAR(100) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,            -- bcrypt
    role                VARCHAR(20) NOT NULL
                        CHECK (role IN ('EMPLOYEE','ADMIN','OWNER')),
    phone               VARCHAR(15),
    joined_on           DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          INTEGER REFERENCES users(id)
);

CREATE INDEX idx_users_code ON users(employee_code);
CREATE INDEX idx_users_role ON users(role) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------
-- 2. WAGE HISTORY (append-only ledger of daily-wage changes)
--    To find wage on any date: latest row where effective_from <= date
-- ---------------------------------------------------------------------
CREATE TABLE wage_history (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id),
    daily_wage_paise    INTEGER NOT NULL CHECK (daily_wage_paise >= 0),
    effective_from      DATE NOT NULL,                    -- applies from this date
    change_recorded_on  DATE NOT NULL,                    -- when admin entered it
    reason              TEXT,
    changed_by          INTEGER NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wage_user_date ON wage_history(user_id, effective_from DESC);

-- ---------------------------------------------------------------------
-- 3. PUNCHES (the source of truth for work time)
--    punch_out NULL = session still open (must be closed by admin)
-- ---------------------------------------------------------------------
CREATE TABLE punches (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id),
    punch_in            TIMESTAMPTZ NOT NULL,
    punch_out           TIMESTAMPTZ,                      -- NULL = open session
    punch_in_lat        NUMERIC(10,7),                    -- captured at punch-in
    punch_in_lng        NUMERIC(10,7),
    punch_out_lat       NUMERIC(10,7),
    punch_out_lng       NUMERIC(10,7),
    is_manual           BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE if admin-entered
    entered_by          INTEGER REFERENCES users(id),     -- admin who entered manually
    override_note       TEXT,                             -- used when overlap was overridden
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_punches_user_date ON punches(user_id, punch_in);
CREATE INDEX idx_punches_open ON punches(user_id) WHERE punch_out IS NULL;

-- A user can only have ONE open punch at a time
CREATE UNIQUE INDEX idx_punches_one_open_per_user
    ON punches(user_id) WHERE punch_out IS NULL;

-- ---------------------------------------------------------------------
-- 4. ADVANCES (cash given to employee during the month)
--    Status flows: PENDING -> SETTLED (when included in a salary calc)
-- ---------------------------------------------------------------------
CREATE TABLE advances (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id),
    amount_paise        INTEGER NOT NULL CHECK (amount_paise > 0),
    given_on            DATE NOT NULL,
    note                TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SETTLED')),
    settled_in_period   INTEGER REFERENCES salary_periods(id),  -- fwd-ref, added below
    given_by            INTEGER NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_advances_user_status ON advances(user_id, status);

-- ---------------------------------------------------------------------
-- 5. LOANS (one row per loan issued)
--    Balance = original - SUM(loan_emi_payments for this loan)
-- ---------------------------------------------------------------------
CREATE TABLE loans (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id),
    original_paise      INTEGER NOT NULL CHECK (original_paise > 0),
    issued_on           DATE NOT NULL,
    note                TEXT,
    is_closed           BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE when balance = 0
    issued_by           INTEGER NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loans_user_open ON loans(user_id) WHERE is_closed = FALSE;

-- ---------------------------------------------------------------------
-- 6. LOAN EMI PAYMENTS (one row per month per loan; ties to salary period)
-- ---------------------------------------------------------------------
CREATE TABLE loan_emi_payments (
    id                  SERIAL PRIMARY KEY,
    loan_id             INTEGER NOT NULL REFERENCES loans(id),
    salary_period_id    INTEGER NOT NULL,                 -- FK added after salary_periods
    emi_paise           INTEGER NOT NULL CHECK (emi_paise >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emi_loan ON loan_emi_payments(loan_id);

-- ---------------------------------------------------------------------
-- 7. SALARY PERIODS (one row per month — the "lock" mechanism)
-- ---------------------------------------------------------------------
CREATE TABLE salary_periods (
    id                  SERIAL PRIMARY KEY,
    period_year         INTEGER NOT NULL,                 -- e.g. 2026
    period_month        INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN','FINALIZED','REOPENED')),
    finalized_on        TIMESTAMPTZ,
    finalized_by        INTEGER REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (period_year, period_month)
);

-- Now add the deferred foreign keys
ALTER TABLE advances
    ADD CONSTRAINT fk_advances_period
    FOREIGN KEY (settled_in_period) REFERENCES salary_periods(id);

ALTER TABLE loan_emi_payments
    ADD CONSTRAINT fk_emi_period
    FOREIGN KEY (salary_period_id) REFERENCES salary_periods(id);

-- ---------------------------------------------------------------------
-- 8. SALARY SLIPS (one per employee per finalized period — the payslip)
-- ---------------------------------------------------------------------
CREATE TABLE salary_slips (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER NOT NULL REFERENCES users(id),
    salary_period_id        INTEGER NOT NULL REFERENCES salary_periods(id),

    -- Work computed
    days_worked             INTEGER NOT NULL DEFAULT 0,
    regular_minutes         INTEGER NOT NULL DEFAULT 0,
    overtime_minutes        INTEGER NOT NULL DEFAULT 0,
    regular_salary_paise    INTEGER NOT NULL DEFAULT 0,
    overtime_salary_paise   INTEGER NOT NULL DEFAULT 0,
    gross_paise             INTEGER NOT NULL DEFAULT 0,

    -- Deductions (entered by admin on salary day)
    carry_forward_paise     INTEGER NOT NULL DEFAULT 0,   -- negative = owed from last month
    advance_deduction_paise INTEGER NOT NULL DEFAULT 0,
    loan_emi_paise          INTEGER NOT NULL DEFAULT 0,
    other_deduction_paise   INTEGER NOT NULL DEFAULT 0,
    other_deduction_note    TEXT,

    -- Final
    net_paise               INTEGER NOT NULL DEFAULT 0,   -- can be negative
    next_month_carry_paise  INTEGER NOT NULL DEFAULT 0,   -- flows forward if net < 0

    finalized_on            TIMESTAMPTZ,
    finalized_by            INTEGER REFERENCES users(id),
    UNIQUE (user_id, salary_period_id)
);

CREATE INDEX idx_slips_user ON salary_slips(user_id);
CREATE INDEX idx_slips_period ON salary_slips(salary_period_id);

-- ---------------------------------------------------------------------
-- 9. AUDIT LOG (immutable — every admin/owner action logged here)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    actor_user_id       INTEGER NOT NULL REFERENCES users(id),
    actor_role          VARCHAR(20) NOT NULL,
    action_type         VARCHAR(50) NOT NULL,             -- e.g. 'WAGE_CHANGE','MANUAL_PUNCH'
    target_user_id      INTEGER REFERENCES users(id),
    target_entity       VARCHAR(50),                      -- e.g. 'punches','salary_slips'
    target_entity_id    INTEGER,
    before_data         JSONB,
    after_data          JSONB,
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_log(target_user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action_type, created_at DESC);

-- ---------------------------------------------------------------------
-- 10. SESSIONS (refresh tokens — the fix for auto-logout bug)
--    Never expires server-side; only invalidated on explicit logout
--    or password change
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             INTEGER NOT NULL REFERENCES users(id),
    refresh_token_hash  VARCHAR(255) NOT NULL,
    device_info         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at          TIMESTAMPTZ                       -- NULL = active
);

CREATE INDEX idx_sessions_user ON sessions(user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- 11. SYSTEM CONFIG (single row — tunable constants)
-- ---------------------------------------------------------------------
CREATE TABLE system_config (
    id                          INTEGER PRIMARY KEY DEFAULT 1
                                CHECK (id = 1),           -- singleton
    geofence_lat                NUMERIC(10,7) NOT NULL DEFAULT 23.2363333,
    geofence_lng                NUMERIC(10,7) NOT NULL DEFAULT 72.5061667,
    geofence_radius_meters      INTEGER NOT NULL DEFAULT 200,
    lunch_start_minute          INTEGER NOT NULL DEFAULT 780,   -- 13:00 = 780
    lunch_end_minute            INTEGER NOT NULL DEFAULT 840,   -- 14:00 = 840
    ot_start_minute             INTEGER NOT NULL DEFAULT 1050,  -- 17:30 = 1050
    working_minutes_per_day     INTEGER NOT NULL DEFAULT 480,   -- 8 hours
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by                  INTEGER REFERENCES users(id)
);

INSERT INTO system_config (id) VALUES (1);

-- ---------------------------------------------------------------------
-- SEED: Owner account
-- ---------------------------------------------------------------------
INSERT INTO users (employee_code, full_name, password_hash, role)
VALUES ('OWNER', 'Owner', '$2b$10$PLACEHOLDER_HASH_REPLACE_ON_DEPLOY', 'OWNER');

-- =====================================================================
-- HELPFUL VIEWS
-- =====================================================================

-- Current wage for every user (latest effective row)
CREATE VIEW current_wages AS
SELECT DISTINCT ON (user_id)
    user_id,
    daily_wage_paise,
    effective_from
FROM wage_history
WHERE effective_from <= CURRENT_DATE
ORDER BY user_id, effective_from DESC;

-- Open punch sessions (forgotten punch-outs) — drives Pending Verifications tab
CREATE VIEW open_punches AS
SELECT
    p.id,
    p.user_id,
    u.employee_code,
    u.full_name,
    p.punch_in,
    (NOW() - p.punch_in) AS open_duration
FROM punches p
JOIN users u ON u.id = p.user_id
WHERE p.punch_out IS NULL
ORDER BY p.punch_in ASC;

-- Outstanding loan balances
CREATE VIEW loan_balances AS
SELECT
    l.id AS loan_id,
    l.user_id,
    l.original_paise,
    COALESCE(SUM(e.emi_paise), 0) AS paid_paise,
    l.original_paise - COALESCE(SUM(e.emi_paise), 0) AS balance_paise,
    l.is_closed
FROM loans l
LEFT JOIN loan_emi_payments e ON e.loan_id = l.id
GROUP BY l.id;
