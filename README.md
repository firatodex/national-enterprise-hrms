# National Enterprise HRMS

Complete HRMS application for National Enterprise. Tracks employee punches, wages, advances, loans, and monthly salaries.

## Quick Start (3 commands)

```bash
cd backend
npm install
npm run init-db
npm start
```

Then open: **http://localhost:3000**

## Login Credentials

| Role     | Employee ID | Password  |
|----------|-------------|-----------|
| Owner    | `OWNER`     | `OWNER`   |
| Admin    | `ADMIN001`  | `ADMIN001`|
| Employee | `EMP001`    | `EMP001`  |
| Employee | `EMP002`    | `EMP002`  |
| Employee | `EMP003`    | `EMP003`  |
| Employee | `EMP004`    | `EMP004`  |
| Employee | `EMP005`    | `EMP005`  |

## Features Built

- **Employee screen**: single-screen punch in/out with live clock, geofence check (200m around 23°14'10.8"N 72°30'22.2"E), status card, today's sessions list
- **Admin dashboard** with 9 sections:
  - Dashboard — KPIs, today's status of all employees
  - Employees — list + profile (attendance, wages, advances, loans, slips)
  - Attendance — any employee's punches for any date range
  - Pending Verifications — unresolved open punches, badge counter
  - Salary — monthly calculation, live preview, atomic finalization
  - Loans — all active loans system-wide
  - Advances — all advances system-wide
  - Audit Log — every admin/owner action logged
  - My Punch — admins/owner punch in/out like employees
- **Owner-only**: Add employees, delete pending advances
- **Salary slip** modal (print-ready) with psychological design — overtime highlighted, net payable in green card
- **Manual punch entry** with overlap detection popup showing full day's history
- **Wage change** with effective-date history
- **Carry-forward** logic for negative salaries
- **Session persistence** — silent JWT refresh, never auto-logs out

## Business Rules Implemented

- Lunch 1–2 PM: zero minutes count
- Overtime after 5:30 PM: same rate, tagged separately
- Geofence: 200m radius, server-enforced
- Multiple punches per day: all pairs summed
- Came to work = paid for minutes worked. Absent = ₹0. No holiday logic.
- Forgotten punch-out: never auto-closed. Admin must resolve in Pending Verifications.
- Finalized month: locked. Employee cannot punch in until their open session is closed by admin.

## Technical Details

- **Backend**: Node.js + Express + SQLite (better-sqlite3)
- **Frontend**: Vanilla HTML/CSS/JS (no build step, no framework)
- **Auth**: JWT access tokens (1 hour) + server-side refresh tokens (never expire)
- **Money**: Stored as integer paise
- **Timezone**: UTC internally, IST for all display and business logic

## File Structure

```
hrms-app/
├── backend/
│   ├── package.json
│   ├── db/hrms.db (created by init-db)
│   └── src/
│       ├── server.js
│       ├── middleware/auth.js
│       ├── routes/
│       │   ├── auth.js
│       │   ├── punches.js
│       │   ├── admin.js
│       │   └── salary.js
│       └── utils/
│           ├── db.js
│           ├── salary.js
│           └── init-db.js
└── frontend/
    ├── index.html (login)
    ├── shared/
    │   ├── api.js
    │   └── style.css
    ├── employee/
    │   └── index.html
    └── admin/
        ├── index.html
        └── app.js
```

## Testing the Geofence

The geofence is set to the workplace coordinates (23.2363333°N, 72.5061667°E) with a 200m radius. To test from a different location, edit `backend/src/utils/init-db.js` — change `geofence_lat` and `geofence_lng` in the `system_config` insert, or update the `system_config` table directly.

## Re-initializing

To reset the database (wipes all data):

```bash
npm run init-db
```

## Production Notes

Before deploying:

1. Change `JWT_SECRET` in `backend/src/middleware/auth.js`
2. Change default passwords (owner/admin should set new passwords on first login)
3. Serve over HTTPS (geolocation API requires it on mobile)
4. Back up `backend/db/hrms.db` regularly
5. Consider moving to PostgreSQL for multi-user scaling (schema is already provided in earlier designs)
