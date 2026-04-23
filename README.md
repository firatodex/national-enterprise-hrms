# National Enterprise HRMS — Design Package

Complete blueprint for building the HRMS app. This package contains everything a developer needs to begin implementation: database schema, business logic, API specification, and UI design references.

---

## Contents

| File | Purpose |
|------|---------|
| `README.md` | This file — overview and build order |
| `schema.sql` | PostgreSQL schema, 11 tables, views, seed data |
| `salary_calculation.txt` | Pseudocode for salary logic with 10 edge cases |
| `api_endpoints.txt` | Full API spec: 36 endpoints, errors, client lifecycle |

Visual mockups (employee screen, admin salary calculation, salary slip) were shown in the design conversation. They can be re-rendered on request.

---

## The Product in One Paragraph

National Enterprise HRMS tracks punches, wages, advances, loans, and salaries for labourers at a single workplace near Ahmedabad. Employees punch in and out from a mobile phone — login only works within 200m of the workplace (geofenced). Wages are calculated per minute from a configurable daily wage. Minutes between 1–2 PM (lunch) don't count. Minutes after 5:30 PM are tagged as overtime but paid at the same rate. Admins run the business day-to-day; the owner has ultimate control. Salaries are calculated on the 5th of the next month, with advances and EMIs entered manually by the admin at that time.

---

## Core Business Rules

| Rule | Implementation |
|------|----------------|
| Lunch break 1–2 PM | Zero minutes count in this window |
| Overtime starts 5:30 PM | Same per-minute rate, tagged separately |
| Geofence | 200m radius from 23°14'10.8"N, 72°30'22.2"E |
| Multiple punches per day | All pairs summed |
| Attendance rule | Came to work = paid for minutes worked. No punches = no salary. No holiday logic. |
| Session | Lifetime persistent — never auto-logout |
| Open punch (forgotten punch-out) | Admin must close manually via Pending Verifications tab |
| Finalized month | Locked; reopening creates audit trail |

---

## Roles

**Employee** — Single screen with Punch In / Punch Out buttons, live clock, today's sessions, current status. Nothing else.

**Admin** — Full operational dashboard: employees, attendance, manual entries, wage changes, advances, loans, salary calculation, pending verifications, audit log (view).

**Owner** — Everything admin can do, plus: create/delete employees, promote/demote admins, delete advances, reopen finalized months, delete audit entries, edit system config.

---

## The Four-Ledger Deduction Model

This is the mental model that makes salary calculation clean:

1. **Work Ledger** — auto-populated from punches. Minutes × per-minute rate = gross.
2. **Advance Ledger** — admin logs cash advances as they happen during the month (status: PENDING). On salary day, admin types the total; pending advances get marked SETTLED.
3. **Loan Ledger** — one row per loan with running balance. EMI is not scheduled — admin types whatever amount on salary day (0, 2000, 20000, anything). Balance reduces by that amount.
4. **Carry-Forward Ledger** — if net salary goes negative, it flows into next month's calculation as a starting debt.

On the 5th of each month:
```
Gross Earned (auto)                +
Previous Month Carry-Forward       ±
─────────────────────────────────
Subtotal
Advance Deduction (admin input)    −
Loan EMI (admin input)             −
Other Deduction (admin input)      −
─────────────────────────────────
NET PAYABLE
```

If net is negative, it becomes next month's carry-forward.

---

## The Auto-Logout Bug — Fixed by Design

The previous app's auto-logout issue is addressed through:

1. **Sessions table** in the schema — refresh tokens stored server-side, never expire.
2. **Short-lived access tokens** (1 hour) + **long-lived refresh tokens** (no expiry).
3. **Silent refresh** via `POST /auth/refresh` when access token nears expiry.
4. **Refresh tokens stored in secure device storage** (Keychain on iOS, Keystore on Android).
5. **Sessions revoke only** on explicit logout or password change.

Implementation details in `api_endpoints.txt` under the AUTHENTICATION section.

---

## Recommended Build Order

**Week 1** — Foundation
- Set up PostgreSQL with `schema.sql`
- Implement authentication (login, refresh, logout, change-password)
- Seed owner account and 1–2 test employees
- Build session management infrastructure (the auto-logout fix)

**Week 2** — Employee punch flow (end-to-end)
- Single-screen mobile UI
- Geofence check on punch-in
- GET /me/today polling
- Open session detection and modal
- Test with real GPS at the workplace

**Week 3** — Admin dashboard basics
- Employee list and profile
- Attendance view (calendar + punch list)
- Manual punch entry with check-overlap flow
- Wage change with effective-date history

**Week 4** — Ledgers
- Advances CRUD
- Loans CRUD with EMI history display
- Pending Verifications tab

**Week 5** — Salary engine
- GET /salary/period (draft computation)
- POST /salary/period/preview (live-update during data entry)
- POST /salary/period/finalize (atomic transaction)
- PDF slip generation

**Week 6** — Polish
- Audit log viewer
- Dashboard KPIs and live feed
- Owner-only endpoints
- End-to-end testing with a month of real data

---

## Tech Stack Recommendation

| Layer | Choice | Reason |
|-------|--------|--------|
| Database | PostgreSQL 15+ | ACID transactions, JSONB for audit log |
| Backend | Node.js + TypeScript (Express or Fastify) | Mature ecosystem, JSON-native |
| Mobile | React Native | Single codebase iOS + Android |
| Web | React + Tailwind | Matches mobile component patterns |
| Auth | JWT (access) + opaque token (refresh) | Refresh stored server-side, see sessions table |
| PDF | PDFKit or Puppeteer | Slip generation |
| Hosting | Any Linux VPS + managed Postgres | Low ops overhead |

---

## Critical Implementation Notes

**Money math** — All amounts stored and transmitted as integer paise (₹1 = 100 paise). Never use floats for money at any layer. Convert to rupees only at display.

**Timezone** — Server stores timestamps in UTC. All display and business logic (lunch window, OT boundary) computed in IST (Asia/Kolkata). Server trusts its own `NOW()`, never the client's clock.

**Geofence** — Haversine formula, validated server-side on every punch. Client-side GPS is for UX only; security is server-enforced.

**Overlap detection** — Separate endpoint (`check-overlap`) so the client can show the warning modal without writing state. Admin explicitly acknowledges with `override_overlap: true` on the submit.

**Atomic salary finalization** — The finalize endpoint is one database transaction. Either all slips are created and the period is locked, or nothing happens. No partial state.

**Audit everything** — Every admin/owner write goes to `audit_log` with before/after JSONB. Non-negotiable for disputes and legal defense.

---

## Open Items (Developer Decisions)

Small decisions left to the developer's discretion:

1. **EMI exceeds loan balance** — the pseudocode suggests blocking this with a 422 error. An alternative is to allow it and auto-close the loan with a warning. Pick one and document.
2. **Admin's own punches** — admins and owner can punch in/out like employees. This is allowed by the schema. UX decision: show a separate "Punch" section in the admin dashboard, or redirect admin to the employee screen when they need to punch.
3. **PDF delivery** — owner opted out of automated delivery. Admin downloads slip PDF from the dashboard and distributes manually. No endpoint needed beyond `GET /salary/slips/:id/pdf`.
4. **Bulk CSV export of attendance / salary** — not specified. Easy to add later via `?format=csv` query param on existing list endpoints.

---

## What's NOT in This Package (by design, per owner's decisions)

- Multi-language support (English only)
- Selfie-on-punch
- Offline punch queue
- SMS / WhatsApp notifications
- Profile photos
- Festival / holiday calendar
- Undo-last-punch
- Auto-close for forgotten punches
- Employee access to anything beyond the punch screen

These were evaluated and explicitly excluded based on the owner's product decisions.

---

## Contact

This design was produced during a strategic planning session. Follow-up design questions, developer clarifications, and additional mockups can be requested.
