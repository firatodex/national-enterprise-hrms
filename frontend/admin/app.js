// =========================================================
// National Enterprise HRMS — Admin Dashboard
// =========================================================

const user = API.getCurrentUser();
if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
  window.location.href = '/';
}

document.getElementById('sidebarUserName').textContent = user.full_name;
document.getElementById('sidebarUserRole').textContent = user.role;
document.getElementById('logoutLink').addEventListener('click', () => API.logout());
document.getElementById('mobileMenuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

const isOwner = user.role === 'OWNER';
const viewContainer = document.getElementById('viewContainer');
const modalContainer = document.getElementById('modalContainer');

// ========== NAVIGATION ==========
const navLinks = document.querySelectorAll('#navList a');
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view;
    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
    loadView(view);
  });
});

async function loadView(view) {
  switch(view) {
    case 'dashboard': return renderDashboard();
    case 'employees': return renderEmployees();
    case 'attendance': return renderAttendance();
    case 'pending': return renderPending();
    case 'salary': return renderSalary();
    case 'loans': return renderLoans();
    case 'advances': return renderAdvances();
    case 'audit': return renderAudit();
    case 'punch': return renderMyPunch();
  }
}

// ========== MODAL HELPERS ==========
function showModal(content) {
  modalContainer.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${content}</div></div>`;
  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
}
function closeModal() { modalContainer.innerHTML = ''; }

function showToast(message, kind = 'success') {
  const bg = kind === 'success' ? 'var(--success)' : 'var(--danger)';
  const div = document.createElement('div');
  div.style.cssText = `position:fixed; top:20px; right:20px; background:${bg}; color:#fff; padding:12px 18px; border-radius:10px; z-index:9999; box-shadow:var(--shadow-lg); font-size:14px;`;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// ========== PENDING BADGE POLLING ==========
async function refreshPendingBadge() {
  try {
    const data = await API.apiFetch('/admin/pending-verifications');
    const badge = document.getElementById('pendingBadge');
    if (data.total > 0) {
      badge.textContent = data.total;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) {}
}
refreshPendingBadge();
setInterval(refreshPendingBadge, 30000);

// =====================================================================
// DASHBOARD VIEW
// =====================================================================
async function renderDashboard() {
  viewContainer.innerHTML = '<h1>Dashboard</h1><p class="page-sub">Overview of today and this month</p><div id="dashKpis"></div><div id="dashEmployeeStatus"></div>';
  try {
    const summary = await API.apiFetch('/admin/dashboard/summary');
    const employees = await API.apiFetch('/admin/employees');

    document.getElementById('dashKpis').innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="label">Punched in now</div>
          <div class="value">${summary.live.currently_punched_in}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Total active employees</div>
          <div class="value">${summary.live.total_active_employees}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Absent today</div>
          <div class="value">${summary.live.absent_today}</div>
        </div>
        <div class="kpi-card ${summary.live.pending_verifications > 0 ? 'alert' : ''}">
          <div class="label">Pending verifications</div>
          <div class="value">${summary.live.pending_verifications}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Advances given (${summary.current_month.month}/${summary.current_month.year})</div>
          <div class="value">${FMT.formatMoney(summary.current_month.total_advances_given_paise)}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Outstanding loans</div>
          <div class="value">${FMT.formatMoney(summary.current_month.outstanding_loans_paise)}</div>
        </div>
      </div>
    `;

    const rows = employees.employees
      .filter(e => e.role === 'EMPLOYEE' || e.role === 'ADMIN')
      .map(e => `
        <tr>
          <td>
            <div style="font-weight:500;">${e.full_name}</div>
            <div class="sub-text">${e.employee_code} · ${e.role}</div>
          </td>
          <td class="text-center">
            ${e.has_open_punch
              ? '<span class="chip open">Punched in</span>'
              : '<span class="chip closed">Not in</span>'}
          </td>
          <td class="text-right mono">${FMT.formatMoney(e.current_daily_wage_paise || 0)}</td>
        </tr>
      `).join('');

    document.getElementById('dashEmployeeStatus').innerHTML = `
      <h2 style="font-size:15px; font-weight:500; margin: 24px 0 10px;">Today's Status</h2>
      <div class="data-table">
        <table>
          <thead><tr><th>Employee</th><th class="text-center">Status</th><th class="text-right">Daily wage</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (e) {
    viewContainer.innerHTML = `<div class="error-text">Error loading: ${e.message}</div>`;
  }
}

// =====================================================================
// EMPLOYEES VIEW
// =====================================================================
async function renderEmployees() {
  viewContainer.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <h1>Employees</h1>
      ${isOwner ? '<button class="btn-primary" id="addEmpBtn">+ Add Employee</button>' : ''}
    </div>
    <p class="page-sub">All employees and admins</p>
    <div id="empList"></div>
  `;
  if (isOwner) document.getElementById('addEmpBtn').addEventListener('click', showAddEmployeeModal);

  try {
    const data = await API.apiFetch('/admin/employees');
    const rows = data.employees.map(e => `
      <tr data-id="${e.id}" style="cursor:pointer;">
        <td>
          <div style="font-weight:500;">${e.full_name}</div>
          <div class="sub-text">${e.employee_code}</div>
        </td>
        <td>${e.role}</td>
        <td class="text-right mono">${FMT.formatMoney(e.current_daily_wage_paise || 0)}</td>
        <td class="text-center">
          ${e.has_open_punch ? '<span class="chip open">Open</span>' : '<span class="chip closed">—</span>'}
        </td>
        <td>${e.phone || ''}</td>
      </tr>
    `).join('');
    document.getElementById('empList').innerHTML = `
      <div class="data-table">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th class="text-right">Daily Wage</th><th class="text-center">Current punch</th><th>Phone</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    document.querySelectorAll('#empList tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => showEmployeeProfile(tr.dataset.id));
    });
  } catch (e) {
    document.getElementById('empList').innerHTML = `<div class="error-text">${e.message}</div>`;
  }
}

function showAddEmployeeModal() {
  showModal(`
    <h2>Add Employee</h2>
    <p class="sub">Create a new employee account</p>
    <label><span>Employee Code</span><input type="text" id="newCode" placeholder="EMP006" /></label>
    <label><span>Full Name</span><input type="text" id="newName" /></label>
    <label><span>Role</span>
      <select id="newRole"><option value="EMPLOYEE">Employee</option><option value="ADMIN">Admin</option></select>
    </label>
    <label><span>Phone</span><input type="tel" id="newPhone" /></label>
    <label><span>Daily Wage (₹)</span><input type="number" id="newWage" placeholder="700" /></label>
    <label><span>Effective From</span><input type="date" id="newEffFrom" value="${new Date().toISOString().substring(0,10)}" /></label>
    <label><span>Initial Password</span><input type="text" id="newPass" placeholder="Defaults to Employee Code" /></label>
    <div id="addEmpError" class="error-text hidden"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="saveNewEmp">Create</button>
    </div>
  `);
  document.getElementById('saveNewEmp').addEventListener('click', async () => {
    const code = document.getElementById('newCode').value.trim().toUpperCase();
    const name = document.getElementById('newName').value.trim();
    const role = document.getElementById('newRole').value;
    const phone = document.getElementById('newPhone').value.trim();
    const wage = Number(document.getElementById('newWage').value) * 100;
    const effFrom = document.getElementById('newEffFrom').value;
    const pass = document.getElementById('newPass').value.trim() || code;
    const errEl = document.getElementById('addEmpError');
    if (!code || !name || !wage || !effFrom) {
      errEl.textContent = 'All fields except phone and password are required';
      errEl.classList.remove('hidden');
      return;
    }
    try {
      await API.apiFetch('/admin/employees', {
        method: 'POST',
        body: JSON.stringify({
          employee_code: code, full_name: name, role, phone,
          initial_daily_wage_paise: wage,
          wage_effective_from: effFrom,
          initial_password: pass
        })
      });
      closeModal();
      showToast('Employee created');
      renderEmployees();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ========== EMPLOYEE PROFILE ==========
let currentEmpId = null;
async function showEmployeeProfile(id) {
  currentEmpId = id;
  viewContainer.innerHTML = `
    <button class="btn-ghost" onclick="renderEmployees()">← Back to employees</button>
    <div id="empProfile" style="margin-top:12px;"></div>
  `;
  try {
    const data = await API.apiFetch(`/admin/employees/${id}`);
    const e = data.employee;
    document.getElementById('empProfile').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h1>${e.full_name}</h1>
          <p class="page-sub">${e.employee_code} · ${e.role} · Joined ${FMT.formatDateIST(e.joined_on)}</p>
        </div>
        <button class="btn-secondary" id="resetPassBtn">Reset Password</button>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card"><div class="label">Current daily wage</div><div class="value">${FMT.formatMoney(e.current_daily_wage_paise)}</div></div>
        <div class="kpi-card"><div class="label">Pending advance</div><div class="value">${FMT.formatMoney(e.pending_advance_total_paise)}</div></div>
        <div class="kpi-card"><div class="label">Loan balance</div><div class="value">${FMT.formatMoney(e.active_loan_balance_paise)}</div></div>
      </div>

      <div class="tabs">
        <div class="tab active" data-tab="pAttendance">Attendance</div>
        <div class="tab" data-tab="pWages">Wage Changes</div>
        <div class="tab" data-tab="pAdvances">Advances</div>
        <div class="tab" data-tab="pLoans">Loans</div>
        <div class="tab" data-tab="pSlips">Salary Slips</div>
      </div>
      <div id="pTabContent"></div>
    `;
    document.getElementById('resetPassBtn').addEventListener('click', () => showResetPasswordModal(id, e.full_name));
    document.querySelectorAll('#empProfile .tab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('#empProfile .tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        loadProfileTab(t.dataset.tab);
      });
    });
    loadProfileTab('pAttendance');
  } catch (err) {
    document.getElementById('empProfile').innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

function showResetPasswordModal(id, name) {
  showModal(`
    <h2>Reset Password</h2>
    <p class="sub">Reset password for ${name}</p>
    <label><span>New Password</span><input type="text" id="rpPass" /></label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="rpSave">Reset</button>
    </div>
  `);
  document.getElementById('rpSave').addEventListener('click', async () => {
    const pass = document.getElementById('rpPass').value.trim();
    if (!pass) return;
    try {
      await API.apiFetch(`/admin/employees/${id}/reset-password`, {
        method: 'POST', body: JSON.stringify({ new_password: pass })
      });
      closeModal();
      showToast('Password reset');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function loadProfileTab(tab) {
  const c = document.getElementById('pTabContent');
  c.innerHTML = '<p class="muted" style="padding:20px;">Loading...</p>';
  const id = currentEmpId;
  try {
    if (tab === 'pAttendance') {
      const today = new Date();
      const month = today.toISOString().substring(0, 7);
      const from = month + '-01';
      const to = month + '-31';
      const data = await API.apiFetch(`/admin/employees/${id}/punches?from=${from}&to=${to}`);
      c.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <h3 style="font-size:15px; font-weight:500;">This month's punches</h3>
          <button class="btn-primary" id="manualPunchBtn">+ Manual Entry</button>
        </div>
        <div class="data-table">
          <table>
            <thead><tr><th>Date</th><th>In</th><th>Out</th><th class="text-right">Regular</th><th class="text-right">OT</th><th>Source</th><th></th></tr></thead>
            <tbody>
              ${data.punches.length === 0 ? '<tr><td colspan="7" class="empty-state">No punches this month</td></tr>' :
                data.punches.map(p => `
                  <tr>
                    <td>${FMT.formatDateIST(p.punch_in)}</td>
                    <td class="mono">${FMT.formatTimeIST(p.punch_in)}</td>
                    <td class="mono">${p.punch_out ? FMT.formatTimeIST(p.punch_out) : '<span class="chip open">Open</span>'}</td>
                    <td class="text-right mono">${FMT.formatMinutes(p.regular_minutes)}</td>
                    <td class="text-right mono">${FMT.formatMinutes(p.overtime_minutes)}</td>
                    <td>${p.is_manual ? '<span class="chip pending">Manual</span>' : '<span class="chip closed">Auto</span>'}</td>
                    <td><button class="btn-ghost" onclick="editPunch(${p.id}, '${p.punch_in}', ${p.punch_out ? `'${p.punch_out}'` : 'null'})">Edit</button></td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      `;
      document.getElementById('manualPunchBtn').addEventListener('click', () => showManualPunchModal(id));
    } else if (tab === 'pWages') {
      const data = await API.apiFetch(`/admin/employees/${id}/wage-history`);
      c.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <h3 style="font-size:15px; font-weight:500;">Wage history</h3>
          <button class="btn-primary" id="changeWageBtn">Change Wage</button>
        </div>
        <div class="data-table">
          <table>
            <thead><tr><th>Effective From</th><th class="text-right">Daily Wage</th><th>Changed On</th><th>Changed By</th><th>Reason</th></tr></thead>
            <tbody>
              ${data.wage_history.map(w => `
                <tr>
                  <td>${FMT.formatDateIST(w.effective_from)}</td>
                  <td class="text-right mono">${FMT.formatMoney(w.daily_wage_paise)}</td>
                  <td>${FMT.formatDateIST(w.change_recorded_on)}</td>
                  <td>${w.changed_by_name || '—'}</td>
                  <td>${w.reason || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      document.getElementById('changeWageBtn').addEventListener('click', () => showChangeWageModal(id));
    } else if (tab === 'pAdvances') {
      const data = await API.apiFetch(`/admin/employees/${id}/advances`);
      c.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <h3 style="font-size:15px; font-weight:500;">Advances · Pending: ${FMT.formatMoney(data.pending_total_paise)}</h3>
          <button class="btn-primary" id="addAdvBtn">+ Add Advance</button>
        </div>
        <div class="data-table">
          <table>
            <thead><tr><th>Given On</th><th class="text-right">Amount</th><th>Status</th><th>Note</th><th></th></tr></thead>
            <tbody>
              ${data.advances.length === 0 ? '<tr><td colspan="5" class="empty-state">No advances</td></tr>' :
                data.advances.map(a => `
                  <tr>
                    <td>${FMT.formatDateIST(a.given_on)}</td>
                    <td class="text-right mono">${FMT.formatMoney(a.amount_paise)}</td>
                    <td><span class="chip ${a.status === 'PENDING' ? 'pending' : 'settled'}">${a.status}</span></td>
                    <td>${a.note || '—'}</td>
                    <td>${isOwner && a.status === 'PENDING' ? `<button class="btn-ghost" onclick="deleteAdvance(${a.id})">Delete</button>` : ''}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      `;
      document.getElementById('addAdvBtn').addEventListener('click', () => showAddAdvanceModal(id));
    } else if (tab === 'pLoans') {
      const data = await API.apiFetch(`/admin/employees/${id}/loans`);
      c.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <h3 style="font-size:15px; font-weight:500;">Loans</h3>
          <button class="btn-primary" id="addLoanBtn">+ Add Loan</button>
        </div>
        ${data.loans.length === 0 ? '<div class="empty-state">No loans</div>' :
          data.loans.map(l => `
            <div class="data-table" style="padding:14px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div style="font-weight:500;">Loan issued ${FMT.formatDateIST(l.issued_on)}</div>
                  <div class="muted" style="font-size:13px;">${l.note || 'No note'}</div>
                </div>
                <div class="text-right">
                  <div style="font-size:20px; font-weight:500;" class="mono">${FMT.formatMoney(l.balance_paise)}</div>
                  <div class="muted" style="font-size:12px;">of ${FMT.formatMoney(l.original_paise)}</div>
                  <span class="chip ${l.is_closed ? 'closed' : 'pending'}">${l.is_closed ? 'Closed' : 'Active'}</span>
                </div>
              </div>
              ${l.emi_history.length > 0 ? `
                <h4 style="font-size:12px; margin-top:14px; color:var(--text-muted);">EMI HISTORY</h4>
                <table style="width:100%; margin-top:6px;">
                  ${l.emi_history.map(e => `<tr><td style="padding:4px 0;">${e.period_year}-${String(e.period_month).padStart(2,'0')}</td><td class="text-right mono">${FMT.formatMoney(e.emi_paise)}</td></tr>`).join('')}
                </table>
              ` : ''}
            </div>
          `).join('')
        }
      `;
      document.getElementById('addLoanBtn').addEventListener('click', () => showAddLoanModal(id));
    } else if (tab === 'pSlips') {
      const data = await API.apiFetch(`/admin/salary/employees/${id}/slips`);
      c.innerHTML = `
        <div class="data-table">
          <table>
            <thead><tr><th>Period</th><th class="text-right">Gross</th><th class="text-right">Net</th><th>Finalized</th><th></th></tr></thead>
            <tbody>
              ${data.slips.length === 0 ? '<tr><td colspan="5" class="empty-state">No slips yet</td></tr>' :
                data.slips.map(s => `
                  <tr>
                    <td>${s.period_year}-${String(s.period_month).padStart(2,'0')}</td>
                    <td class="text-right mono">${FMT.formatMoney(s.gross_paise)}</td>
                    <td class="text-right mono ${s.net_paise < 0 ? 'negative' : ''}">${FMT.formatMoney(s.net_paise)}</td>
                    <td>${s.finalized_on ? FMT.formatDateIST(s.finalized_on) : '—'}</td>
                    <td><button class="btn-ghost" onclick="viewSlip(${s.id})">View</button></td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (err) {
    c.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

window.editPunch = (id, punchIn, punchOut) => {
  const inVal = punchIn ? toLocalInputValue(punchIn) : '';
  const outVal = punchOut ? toLocalInputValue(punchOut) : '';
  showModal(`
    <h2>Edit Punch</h2>
    <label><span>Punch In</span><input type="datetime-local" id="epIn" value="${inVal}" /></label>
    <label><span>Punch Out</span><input type="datetime-local" id="epOut" value="${outVal}" /></label>
    <label><span>Reason</span><input type="text" id="epReason" /></label>
    <div id="epErr" class="error-text hidden"></div>
    <div class="modal-actions">
      <button class="btn-danger" id="epDelete">Delete</button>
      <div style="flex:1;"></div>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="epSave">Save</button>
    </div>
  `);
  document.getElementById('epSave').addEventListener('click', async () => {
    try {
      const inIso = fromLocalInputValue(document.getElementById('epIn').value);
      const outIso = document.getElementById('epOut').value ? fromLocalInputValue(document.getElementById('epOut').value) : null;
      await API.apiFetch(`/admin/punches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ punch_in: inIso, punch_out: outIso, reason: document.getElementById('epReason').value })
      });
      closeModal();
      showToast('Updated');
      loadProfileTab('pAttendance');
    } catch (err) {
      document.getElementById('epErr').textContent = err.message;
      document.getElementById('epErr').classList.remove('hidden');
    }
  });
  document.getElementById('epDelete').addEventListener('click', async () => {
    if (!confirm('Delete this punch?')) return;
    try {
      await API.apiFetch(`/admin/punches/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: document.getElementById('epReason').value })
      });
      closeModal();
      showToast('Deleted');
      loadProfileTab('pAttendance');
    } catch (err) {
      document.getElementById('epErr').textContent = err.message;
      document.getElementById('epErr').classList.remove('hidden');
    }
  });
};

window.deleteAdvance = async (id) => {
  if (!confirm('Delete this advance?')) return;
  try {
    await API.apiFetch(`/admin/advances/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: 'Deleted by owner' }) });
    showToast('Deleted');
    loadProfileTab('pAdvances');
  } catch (err) { showToast(err.message, 'error'); }
};

window.viewSlip = async (id) => {
  try {
    const data = await API.apiFetch(`/admin/salary/slips/${id}`);
    showSlipModal(data.slip);
  } catch (err) { showToast(err.message, 'error'); }
};

// ===== helpers =====
function toLocalInputValue(iso) {
  // Convert UTC ISO to local datetime-input format (yyyy-MM-ddTHH:mm) in IST
  const d = new Date(iso);
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mi = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function fromLocalInputValue(value) {
  // Treat value as IST, convert to UTC ISO
  const d = new Date(value + '+05:30');
  return d.toISOString();
}

// ========== MANUAL PUNCH MODAL ==========
function showManualPunchModal(userId) {
  showModal(`
    <h2>Manual Punch Entry</h2>
    <p class="sub">Add a punch for this employee</p>
    <label><span>Punch In</span><input type="datetime-local" id="mpIn" /></label>
    <label><span>Punch Out</span><input type="datetime-local" id="mpOut" /></label>
    <label><span>Note</span><input type="text" id="mpNote" placeholder="Why is this entered manually?" /></label>
    <div id="mpResult"></div>
    <div id="mpErr" class="error-text hidden"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="mpSave">Save</button>
    </div>
  `);
  document.getElementById('mpSave').addEventListener('click', async () => {
    const inVal = document.getElementById('mpIn').value;
    const outVal = document.getElementById('mpOut').value;
    const note = document.getElementById('mpNote').value;
    const err = document.getElementById('mpErr');
    err.classList.add('hidden');
    if (!inVal || !outVal) {
      err.textContent = 'Both punch in and out required';
      err.classList.remove('hidden');
      return;
    }
    const inIso = fromLocalInputValue(inVal);
    const outIso = fromLocalInputValue(outVal);

    // Check overlap first
    try {
      const overlap = await API.apiFetch(`/admin/employees/${userId}/punches/check-overlap`, {
        method: 'POST',
        body: JSON.stringify({ punch_in: inIso, punch_out: outIso })
      });
      if (overlap.has_overlap) {
        const proceed = await showOverlapConfirmation(overlap);
        if (!proceed) return;
      }
      await API.apiFetch(`/admin/employees/${userId}/punches`, {
        method: 'POST',
        body: JSON.stringify({ punch_in: inIso, punch_out: outIso, override_note: note, override_overlap: overlap.has_overlap })
      });
      closeModal();
      showToast('Manual entry saved');
      loadProfileTab('pAttendance');
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove('hidden');
    }
  });
}

function showOverlapConfirmation(overlap) {
  return new Promise(resolve => {
    const rows = overlap.full_day_history.map(p => `
      <tr>
        <td class="mono">${FMT.formatTimeIST(p.punch_in)} → ${p.punch_out ? FMT.formatTimeIST(p.punch_out) : 'open'}</td>
        <td class="text-right mono">${FMT.formatMinutes(p.regular_minutes)}</td>
        <td class="text-right mono">${FMT.formatMinutes(p.overtime_minutes)}</td>
      </tr>
    `).join('');
    showModal(`
      <h2>⚠️ Time Conflict Detected</h2>
      <div class="warning-text">${overlap.message}</div>
      <h4 style="margin:14px 0 6px; font-size:12px; color:var(--text-muted);">ENTIRE DAY HISTORY</h4>
      <div class="data-table">
        <table>
          <thead><tr><th>Time</th><th class="text-right">Regular</th><th class="text-right">OT</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted" style="font-size:13px; margin-top:14px;">Proceeding will save the new entry alongside these existing ones. Review carefully.</p>
      <div class="modal-actions">
        <button class="btn-secondary" id="ovCancel">Cancel</button>
        <button class="btn-danger" id="ovProceed">Override & Save Anyway</button>
      </div>
    `);
    document.getElementById('ovCancel').addEventListener('click', () => { closeModal(); resolve(false); });
    document.getElementById('ovProceed').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

function showChangeWageModal(userId) {
  showModal(`
    <h2>Change Daily Wage</h2>
    <label><span>New Daily Wage (₹)</span><input type="number" id="cwWage" /></label>
    <label><span>Effective From</span><input type="date" id="cwFrom" value="${new Date().toISOString().substring(0,10)}" /></label>
    <label><span>Change Recorded On</span><input type="date" id="cwRec" value="${new Date().toISOString().substring(0,10)}" /></label>
    <label><span>Reason</span><input type="text" id="cwReason" /></label>
    <div id="cwErr" class="error-text hidden"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="cwSave">Save</button>
    </div>
  `);
  document.getElementById('cwSave').addEventListener('click', async () => {
    try {
      await API.apiFetch(`/admin/employees/${userId}/wage-change`, {
        method: 'POST',
        body: JSON.stringify({
          new_daily_wage_paise: Number(document.getElementById('cwWage').value) * 100,
          effective_from: document.getElementById('cwFrom').value,
          change_recorded_on: document.getElementById('cwRec').value,
          reason: document.getElementById('cwReason').value
        })
      });
      closeModal();
      showToast('Wage updated');
      loadProfileTab('pWages');
    } catch (err) {
      document.getElementById('cwErr').textContent = err.message;
      document.getElementById('cwErr').classList.remove('hidden');
    }
  });
}

function showAddAdvanceModal(userId) {
  showModal(`
    <h2>Add Advance</h2>
    <label><span>Amount (₹)</span><input type="number" id="advAmt" /></label>
    <label><span>Given On</span><input type="date" id="advDate" value="${new Date().toISOString().substring(0,10)}" /></label>
    <label><span>Note</span><input type="text" id="advNote" /></label>
    <div id="advErr" class="error-text hidden"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="advSave">Save</button>
    </div>
  `);
  document.getElementById('advSave').addEventListener('click', async () => {
    try {
      await API.apiFetch(`/admin/employees/${userId}/advances`, {
        method: 'POST',
        body: JSON.stringify({
          amount_paise: Number(document.getElementById('advAmt').value) * 100,
          given_on: document.getElementById('advDate').value,
          note: document.getElementById('advNote').value
        })
      });
      closeModal(); showToast('Advance added'); loadProfileTab('pAdvances');
    } catch (err) {
      document.getElementById('advErr').textContent = err.message;
      document.getElementById('advErr').classList.remove('hidden');
    }
  });
}

function showAddLoanModal(userId) {
  showModal(`
    <h2>Add Loan</h2>
    <label><span>Loan Amount (₹)</span><input type="number" id="loanAmt" /></label>
    <label><span>Issued On</span><input type="date" id="loanDate" value="${new Date().toISOString().substring(0,10)}" /></label>
    <label><span>Note</span><input type="text" id="loanNote" /></label>
    <div id="loanErr" class="error-text hidden"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="loanSave">Save</button>
    </div>
  `);
  document.getElementById('loanSave').addEventListener('click', async () => {
    try {
      await API.apiFetch(`/admin/employees/${userId}/loans`, {
        method: 'POST',
        body: JSON.stringify({
          original_paise: Number(document.getElementById('loanAmt').value) * 100,
          issued_on: document.getElementById('loanDate').value,
          note: document.getElementById('loanNote').value
        })
      });
      closeModal(); showToast('Loan added'); loadProfileTab('pLoans');
    } catch (err) {
      document.getElementById('loanErr').textContent = err.message;
      document.getElementById('loanErr').classList.remove('hidden');
    }
  });
}

// =====================================================================
// ATTENDANCE VIEW (all employees for a date range)
// =====================================================================
async function renderAttendance() {
  const today = new Date().toISOString().substring(0, 10);
  viewContainer.innerHTML = `
    <h1>Attendance</h1>
    <p class="page-sub">View all punches across employees</p>
    <div style="display:flex; gap:10px; margin-bottom:16px; align-items:end; flex-wrap:wrap;">
      <label style="flex:1; min-width:150px;"><span>Employee</span><select id="attEmp"></select></label>
      <label style="min-width:150px;"><span>From</span><input type="date" id="attFrom" value="${today.substring(0,8)}01" /></label>
      <label style="min-width:150px;"><span>To</span><input type="date" id="attTo" value="${today}" /></label>
      <button class="btn-primary" id="attLoad">Load</button>
    </div>
    <div id="attResult"></div>
  `;
  try {
    const emps = await API.apiFetch('/admin/employees');
    const select = document.getElementById('attEmp');
    select.innerHTML = emps.employees.map(e => `<option value="${e.id}">${e.full_name} (${e.employee_code})</option>`).join('');
    document.getElementById('attLoad').addEventListener('click', loadAtt);
    loadAtt();
  } catch (e) {
    document.getElementById('attResult').innerHTML = `<div class="error-text">${e.message}</div>`;
  }
}
async function loadAtt() {
  const id = document.getElementById('attEmp').value;
  const from = document.getElementById('attFrom').value;
  const to = document.getElementById('attTo').value;
  const c = document.getElementById('attResult');
  c.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const data = await API.apiFetch(`/admin/employees/${id}/punches?from=${from}&to=${to}`);
    const totalReg = data.punches.reduce((s, p) => s + p.regular_minutes, 0);
    const totalOT = data.punches.reduce((s, p) => s + p.overtime_minutes, 0);
    c.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><div class="label">Punches in range</div><div class="value">${data.punches.length}</div></div>
        <div class="kpi-card"><div class="label">Total regular</div><div class="value">${FMT.formatMinutes(totalReg)}</div></div>
        <div class="kpi-card"><div class="label">Total OT</div><div class="value">${FMT.formatMinutes(totalOT)}</div></div>
      </div>
      <div class="data-table">
        <table>
          <thead><tr><th>Date</th><th>In</th><th>Out</th><th class="text-right">Regular</th><th class="text-right">OT</th><th>Source</th><th></th></tr></thead>
          <tbody>
            ${data.punches.length === 0 ? '<tr><td colspan="7" class="empty-state">No punches</td></tr>' :
              data.punches.map(p => `
                <tr>
                  <td>${FMT.formatDateIST(p.punch_in)}</td>
                  <td class="mono">${FMT.formatTimeIST(p.punch_in)}</td>
                  <td class="mono">${p.punch_out ? FMT.formatTimeIST(p.punch_out) : '<span class="chip open">Open</span>'}</td>
                  <td class="text-right mono">${FMT.formatMinutes(p.regular_minutes)}</td>
                  <td class="text-right mono">${FMT.formatMinutes(p.overtime_minutes)}</td>
                  <td>${p.is_manual ? '<span class="chip pending">Manual</span>' : '<span class="chip closed">Auto</span>'}</td>
                  <td><button class="btn-ghost" onclick="editPunch(${p.id}, '${p.punch_in}', ${p.punch_out ? `'${p.punch_out}'` : 'null'})">Edit</button></td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    c.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

// =====================================================================
// PENDING VERIFICATIONS VIEW
// =====================================================================
async function renderPending() {
  viewContainer.innerHTML = `
    <h1>Pending Verifications</h1>
    <p class="page-sub">Unclosed punches that need admin resolution</p>
    <div id="pendingList"></div>
  `;
  try {
    const data = await API.apiFetch('/admin/pending-verifications');
    if (data.pending.length === 0) {
      document.getElementById('pendingList').innerHTML = '<div class="empty-state">✓ No pending verifications. All punches are properly closed.</div>';
      return;
    }
    document.getElementById('pendingList').innerHTML = data.pending.map(p => `
      <div class="data-table" style="padding:18px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
          <div>
            <div style="font-weight:500; font-size:15px;">${p.full_name}</div>
            <div class="muted" style="font-size:13px;">${p.employee_code}</div>
          </div>
          <div style="text-align:right;">
            <div class="muted" style="font-size:12px;">Punched in</div>
            <div style="font-weight:500;" class="mono">${FMT.formatDateTimeIST(p.punch_in)}</div>
            <div class="muted" style="font-size:12px; margin-top:2px;">Open for ${p.open_duration_hours}h</div>
          </div>
        </div>
        <div class="warning-text">What time did ${p.full_name.split(' ')[0]} actually leave?</div>
        <div style="display:flex; gap:10px; margin-top:12px; align-items:end; flex-wrap:wrap;">
          <label style="flex:1; min-width:180px; margin-bottom:0;">
            <span>Set punch-out time</span>
            <input type="datetime-local" id="close-${p.punch_id}" value="${toLocalInputValue(p.punch_in).substring(0,10)}T17:30" />
          </label>
          <label style="flex:2; min-width:180px; margin-bottom:0;">
            <span>Note</span>
            <input type="text" id="note-${p.punch_id}" placeholder="How did you verify this time?" />
          </label>
        </div>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn-secondary" onclick="resolveAbsent(${p.punch_id})">Mark day absent</button>
          <button class="btn-primary" onclick="resolveClose(${p.punch_id})">Save punch-out</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('pendingList').innerHTML = `<div class="error-text">${e.message}</div>`;
  }
}

window.resolveClose = async (punchId) => {
  const outVal = document.getElementById(`close-${punchId}`).value;
  const note = document.getElementById(`note-${punchId}`).value;
  if (!outVal) { showToast('Enter punch-out time', 'error'); return; }
  try {
    await API.apiFetch(`/admin/pending-verifications/${punchId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action: 'CLOSE', punch_out: fromLocalInputValue(outVal), note })
    });
    showToast('Resolved');
    renderPending();
    refreshPendingBadge();
  } catch (e) { showToast(e.message, 'error'); }
};

window.resolveAbsent = async (punchId) => {
  if (!confirm('Mark this day as absent and delete the punch?')) return;
  try {
    await API.apiFetch(`/admin/pending-verifications/${punchId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action: 'MARK_ABSENT', note: 'Marked absent' })
    });
    showToast('Marked absent');
    renderPending();
    refreshPendingBadge();
  } catch (e) { showToast(e.message, 'error'); }
};

// =====================================================================
// SALARY VIEW
// =====================================================================
async function renderSalary() {
  const today = new Date();
  // Default to previous month since salary is run on the 5th
  let defYear = today.getFullYear();
  let defMonth = today.getMonth(); // 0-indexed, so this is actually previous month
  if (defMonth === 0) { defMonth = 12; defYear--; }

  viewContainer.innerHTML = `
    <h1>Salary Calculation</h1>
    <p class="page-sub">Calculate and finalize monthly salaries</p>
    <div style="display:flex; gap:10px; margin-bottom:16px; align-items:end;">
      <label><span>Year</span><input type="number" id="salYear" value="${defYear}" style="width:100px;" /></label>
      <label><span>Month</span>
        <select id="salMonth" style="width:140px;">
          ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((n, i) => `<option value="${i+1}" ${i+1 === defMonth ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <button class="btn-primary" id="salLoad">Load</button>
    </div>
    <div id="salResult"></div>
  `;
  document.getElementById('salLoad').addEventListener('click', loadSalary);
  loadSalary();
}

let salaryState = { drafts: [], inputs: {}, finalized: false, period: null };

async function loadSalary() {
  const year = Number(document.getElementById('salYear').value);
  const month = Number(document.getElementById('salMonth').value);
  const c = document.getElementById('salResult');
  c.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const data = await API.apiFetch(`/admin/salary/period?year=${year}&month=${month}`);
    salaryState = { year, month, drafts: data.drafts || [], inputs: {}, finalized: data.is_finalized, period: data.period, blockers: data.blockers };

    if (data.is_finalized) {
      c.innerHTML = renderFinalizedSalary(data);
      return;
    }

    // Initialize inputs with suggested values
    for (const d of data.drafts) {
      if (!d.has_blocker) {
        salaryState.inputs[d.user.id] = {
          advance_deduction_paise: d.suggested_advance_deduction_paise || 0,
          loan_emi_paise: 0,
          other_deduction_paise: 0
        };
      }
    }

    c.innerHTML = renderDraftSalary(data);
    attachSalaryHandlers();
    await refreshSalaryPreviews();
  } catch (e) {
    c.innerHTML = `<div class="error-text">${e.message}</div>`;
  }
}

function renderDraftSalary(data) {
  const hasBlockers = (data.blockers.pending_verifications || []).length > 0;
  const rows = data.drafts.map(d => {
    if (d.has_blocker) {
      return `<tr class="blocked">
        <td>
          <div style="font-weight:500;">${d.user.full_name}</div>
          <div class="sub-text">${d.user.employee_code} · has open punch</div>
        </td>
        <td colspan="8" class="text-center">${d.blocker_reason}</td>
      </tr>`;
    }
    const sug = d.suggested_advance_deduction_paise || 0;
    return `<tr data-uid="${d.user.id}">
      <td>
        <div style="font-weight:500;">${d.user.full_name}</div>
        <div class="sub-text">${d.user.employee_code}</div>
      </td>
      <td class="text-right mono">${d.days_worked}</td>
      <td class="text-right mono">${FMT.formatMinutes(d.regular_minutes)}<div class="sub-text">OT ${FMT.formatMinutes(d.overtime_minutes)}</div></td>
      <td class="text-right mono">${FMT.formatMoney(d.gross_paise)}</td>
      <td class="text-right mono ${d.carry_forward_paise < 0 ? 'negative' : 'dim'}">${FMT.formatMoney(d.carry_forward_paise)}</td>
      <td class="text-right">
        <input type="number" data-field="advance" data-uid="${d.user.id}" value="${sug/100}" />
        <div class="sub-text">Pending: ${FMT.formatMoney(d.pending_advance_total_paise)}</div>
      </td>
      <td class="text-right">
        <input type="number" data-field="emi" data-uid="${d.user.id}" value="0" />
        <div class="sub-text">Balance: ${FMT.formatMoney(d.active_loan_balance_paise)}</div>
      </td>
      <td class="text-right">
        <input type="number" data-field="other" data-uid="${d.user.id}" value="0" />
      </td>
      <td class="text-right mono" data-net-for="${d.user.id}" style="font-weight:500;">—</td>
    </tr>`;
  }).join('');

  return `
    ${hasBlockers ? `<div class="warning-text" style="margin-bottom:14px;">${data.blockers.pending_verifications.length} employee(s) have unresolved open punches. Resolve in Pending Verifications first.</div>` : ''}
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th class="text-right">Days</th>
            <th class="text-right">Regular / OT</th>
            <th class="text-right">Gross</th>
            <th class="text-right">Carry fwd</th>
            <th class="text-right">Advance (₹)</th>
            <th class="text-right">EMI (₹)</th>
            <th class="text-right">Other (₹)</th>
            <th class="text-right">Net</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="display:flex; justify-content:flex-end; margin-top:16px; gap:10px;">
      <button class="btn-primary" id="finalizeBtn" ${hasBlockers ? 'disabled' : ''}>Finalize ${salaryState.year}-${String(salaryState.month).padStart(2,'0')}</button>
    </div>
    <p class="muted" style="text-align:right; margin-top:8px; font-size:12px;">Negative nets will auto-carry to next month. Once finalized, this month is locked.</p>
  `;
}

function attachSalaryHandlers() {
  document.querySelectorAll('#salResult input[data-field]').forEach(input => {
    input.addEventListener('input', () => {
      const uid = Number(input.dataset.uid);
      const field = input.dataset.field;
      if (!salaryState.inputs[uid]) salaryState.inputs[uid] = { advance_deduction_paise: 0, loan_emi_paise: 0, other_deduction_paise: 0 };
      const paise = Math.round(Number(input.value || 0) * 100);
      if (field === 'advance') salaryState.inputs[uid].advance_deduction_paise = paise;
      if (field === 'emi') salaryState.inputs[uid].loan_emi_paise = paise;
      if (field === 'other') salaryState.inputs[uid].other_deduction_paise = paise;
      debouncedPreview();
    });
  });
  const finalizeBtn = document.getElementById('finalizeBtn');
  if (finalizeBtn) finalizeBtn.addEventListener('click', finalizeSalary);
}

let previewTimer = null;
function debouncedPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshSalaryPreviews, 350);
}

async function refreshSalaryPreviews() {
  const entries = Object.entries(salaryState.inputs).map(([uid, v]) => ({ user_id: Number(uid), ...v }));
  if (entries.length === 0) return;
  try {
    const res = await API.apiFetch('/admin/salary/period/preview', {
      method: 'POST',
      body: JSON.stringify({ year: salaryState.year, month: salaryState.month, entries })
    });
    for (const p of res.previews) {
      const cell = document.querySelector(`[data-net-for="${p.user_id}"]`);
      if (cell) {
        cell.textContent = FMT.formatMoney(p.net_paise);
        cell.classList.toggle('negative', p.net_paise < 0);
        cell.classList.toggle('positive', p.net_paise > 0);
      }
    }
  } catch (e) { console.error(e); }
}

async function finalizeSalary() {
  if (!confirm(`Finalize salary for ${salaryState.year}-${String(salaryState.month).padStart(2,'0')}? This locks the month permanently.`)) return;
  const entries = Object.entries(salaryState.inputs).map(([uid, v]) => ({ user_id: Number(uid), ...v }));
  try {
    await API.apiFetch('/admin/salary/period/finalize', {
      method: 'POST',
      body: JSON.stringify({ year: salaryState.year, month: salaryState.month, entries })
    });
    showToast('Salary finalized');
    loadSalary();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderFinalizedSalary(data) {
  const rows = (data.slips || []).map(s => `
    <tr>
      <td>
        <div style="font-weight:500;">${s.full_name}</div>
        <div class="sub-text">${s.employee_code}</div>
      </td>
      <td class="text-right mono">${s.days_worked}</td>
      <td class="text-right mono">${FMT.formatMoney(s.gross_paise)}</td>
      <td class="text-right mono">${FMT.formatMoney(s.advance_deduction_paise)}</td>
      <td class="text-right mono">${FMT.formatMoney(s.loan_emi_paise)}</td>
      <td class="text-right mono ${s.net_paise < 0 ? 'negative' : 'positive'}" style="font-weight:500;">${FMT.formatMoney(s.net_paise)}</td>
      <td><button class="btn-ghost" onclick="viewSlip(${s.id})">View slip</button></td>
    </tr>
  `).join('');
  return `
    <div class="warning-text" style="margin-bottom:16px;">✓ This period is finalized on ${FMT.formatDateTimeIST(data.period.finalized_on)}. Contact the owner to reopen.</div>
    <div class="data-table">
      <table>
        <thead><tr><th>Employee</th><th class="text-right">Days</th><th class="text-right">Gross</th><th class="text-right">Advance</th><th class="text-right">EMI</th><th class="text-right">Net</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ========== SLIP MODAL (the beautiful one) ==========
function showSlipModal(slip) {
  const regHours = Math.floor(slip.regular_minutes / 60);
  const regMin = slip.regular_minutes % 60;
  const otHours = Math.floor(slip.overtime_minutes / 60);
  const otMin = slip.overtime_minutes % 60;
  const earned = slip.gross_paise;
  const negative = slip.net_paise < 0;

  showModal(`
    <div class="slip">
      <div class="slip-head">
        <h2>NATIONAL ENTERPRISE</h2>
        <p>Salary slip · ${slip.period_year}-${String(slip.period_month).padStart(2,'0')}</p>
      </div>
      <div class="slip-emp">
        <div>
          <div style="font-weight:500;">${slip.full_name}</div>
          <div class="muted" style="font-size:12px;">${slip.employee_code}</div>
        </div>
        <div style="text-align:right;">
          <div class="muted" style="font-size:12px;">Daily wage</div>
          <div style="font-weight:500;" class="mono">${FMT.formatMoney(slip.daily_wage_paise)}</div>
        </div>
      </div>

      <div class="slip-summary">
        <div class="slot"><div class="label">DAYS WORKED</div><div class="value">${slip.days_worked}</div></div>
        <div class="slot"><div class="label">REGULAR</div><div class="value">${regHours}h ${String(regMin).padStart(2,'0')}m</div></div>
        <div class="slot ot"><div class="label">OVERTIME</div><div class="value">${otHours}h ${String(otMin).padStart(2,'0')}m</div></div>
      </div>

      <h4>EARNINGS</h4>
      <div class="earnings">
        <div class="line"><span>Regular salary</span><span class="amt mono">${FMT.formatMoney(slip.regular_salary_paise)}</span></div>
        <div class="line"><span style="color:#6E4A00;">Overtime salary · well earned</span><span class="amt bonus mono">+ ${FMT.formatMoney(slip.overtime_salary_paise)}</span></div>
        <div class="line total"><span>You earned</span><span class="mono" style="color:var(--success);">${FMT.formatMoney(earned)}</span></div>
      </div>

      <h4 style="margin-top:18px;">DEDUCTIONS</h4>
      <div class="deductions">
        ${slip.carry_forward_paise !== 0 ? `<div class="line"><span>Previous month balance</span><span class="amt mono">${FMT.formatMoney(slip.carry_forward_paise)}</span></div>` : ''}
        ${slip.advance_deduction_paise > 0 ? `<div class="line"><span>Advance taken</span><span class="amt mono">- ${FMT.formatMoney(slip.advance_deduction_paise)}</span></div>` : ''}
        ${slip.loan_emi_paise > 0 ? `<div class="line"><span>Loan EMI</span><span class="amt mono">- ${FMT.formatMoney(slip.loan_emi_paise)}</span></div>` : ''}
        ${slip.other_deduction_paise > 0 ? `<div class="line"><span>Other ${slip.other_deduction_note ? `(${slip.other_deduction_note})` : ''}</span><span class="amt mono">- ${FMT.formatMoney(slip.other_deduction_paise)}</span></div>` : ''}
        ${(slip.carry_forward_paise === 0 && slip.advance_deduction_paise === 0 && slip.loan_emi_paise === 0 && slip.other_deduction_paise === 0) ? '<div class="muted" style="font-size:13px; padding:6px 0;">No deductions this month</div>' : ''}
      </div>

      <div class="slip-net ${negative ? 'negative' : ''}" style="margin-top:20px;">
        <div>
          <div class="label">${negative ? 'CARRIED TO NEXT MONTH' : 'NET PAYABLE'}</div>
          <div class="sub">${negative ? 'Balance owed · next month' : 'Paid on 5th of next month'}</div>
        </div>
        <div class="value mono">${FMT.formatMoney(slip.net_paise)}</div>
      </div>

      ${slip.loan_balance_after_paise > 0 ? `
        <div class="slip-footer">
          <span>Loan balance remaining</span>
          <span class="mono">${FMT.formatMoney(slip.loan_balance_after_paise)}</span>
        </div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="window.print()">Print</button>
      <button class="btn-primary" onclick="closeModal()">Close</button>
    </div>
  `);
}

// =====================================================================
// LOANS VIEW (all employees)
// =====================================================================
async function renderLoans() {
  viewContainer.innerHTML = `<h1>Loans</h1><p class="page-sub">All active loans across employees</p><div id="loansList"></div>`;
  try {
    const emps = await API.apiFetch('/admin/employees');
    const allLoans = [];
    for (const e of emps.employees) {
      const d = await API.apiFetch(`/admin/employees/${e.id}/loans`);
      for (const l of d.loans) allLoans.push({ ...l, employee: e });
    }
    if (allLoans.length === 0) {
      document.getElementById('loansList').innerHTML = '<div class="empty-state">No loans in the system</div>';
      return;
    }
    document.getElementById('loansList').innerHTML = `
      <div class="data-table">
        <table>
          <thead><tr><th>Employee</th><th>Issued</th><th class="text-right">Original</th><th class="text-right">Paid</th><th class="text-right">Balance</th><th>Status</th></tr></thead>
          <tbody>
            ${allLoans.map(l => `
              <tr style="cursor:pointer;" onclick="showEmployeeProfile(${l.employee.id})">
                <td>${l.employee.full_name}<div class="sub-text">${l.employee.employee_code}</div></td>
                <td>${FMT.formatDateIST(l.issued_on)}</td>
                <td class="text-right mono">${FMT.formatMoney(l.original_paise)}</td>
                <td class="text-right mono">${FMT.formatMoney(l.paid_paise)}</td>
                <td class="text-right mono" style="font-weight:500;">${FMT.formatMoney(l.balance_paise)}</td>
                <td><span class="chip ${l.is_closed ? 'closed' : 'pending'}">${l.is_closed ? 'Closed' : 'Active'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    document.getElementById('loansList').innerHTML = `<div class="error-text">${e.message}</div>`;
  }
}

// =====================================================================
// ADVANCES VIEW (all employees)
// =====================================================================
async function renderAdvances() {
  viewContainer.innerHTML = `<h1>Advances</h1><p class="page-sub">All advances across employees</p><div id="advList"></div>`;
  try {
    const emps = await API.apiFetch('/admin/employees');
    const allAdv = [];
    for (const e of emps.employees) {
      const d = await API.apiFetch(`/admin/employees/${e.id}/advances`);
      for (const a of d.advances) allAdv.push({ ...a, employee: e });
    }
    allAdv.sort((x, y) => new Date(y.given_on) - new Date(x.given_on));
    const pending = allAdv.filter(a => a.status === 'PENDING').reduce((s, a) => s + a.amount_paise, 0);
    document.getElementById('advList').innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><div class="label">Total pending</div><div class="value">${FMT.formatMoney(pending)}</div></div>
        <div class="kpi-card"><div class="label">Records</div><div class="value">${allAdv.length}</div></div>
      </div>
      ${allAdv.length === 0 ? '<div class="empty-state">No advances</div>' : `
        <div class="data-table">
          <table>
            <thead><tr><th>Employee</th><th>Given on</th><th class="text-right">Amount</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>
              ${allAdv.map(a => `
                <tr style="cursor:pointer;" onclick="showEmployeeProfile(${a.employee.id})">
                  <td>${a.employee.full_name}<div class="sub-text">${a.employee.employee_code}</div></td>
                  <td>${FMT.formatDateIST(a.given_on)}</td>
                  <td class="text-right mono">${FMT.formatMoney(a.amount_paise)}</td>
                  <td><span class="chip ${a.status === 'PENDING' ? 'pending' : 'settled'}">${a.status}</span></td>
                  <td>${a.note || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;
  } catch (e) {
    document.getElementById('advList').innerHTML = `<div class="error-text">${e.message}</div>`;
  }
}

// =====================================================================
// AUDIT VIEW
// =====================================================================
async function renderAudit() {
  viewContainer.innerHTML = `<h1>Audit Log</h1><p class="page-sub">Every admin/owner action is recorded here</p><div id="auditList"></div>`;
  try {
    const data = await API.apiFetch('/admin/audit-log?limit=200');
    if (data.entries.length === 0) {
      document.getElementById('auditList').innerHTML = '<div class="empty-state">No audit entries yet</div>';
      return;
    }
    document.getElementById('auditList').innerHTML = `
      <div class="data-table">
        <table>
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Note</th></tr></thead>
          <tbody>
            ${data.entries.map(e => `
              <tr>
                <td class="mono" style="font-size:12px;">${FMT.formatDateTimeIST(e.created_at.replace(' ', 'T') + 'Z')}</td>
                <td>${e.actor_name || e.actor_user_id}<div class="sub-text">${e.actor_role}</div></td>
                <td><span class="chip closed">${e.action_type}</span></td>
                <td>${e.target_name || (e.target_entity ? e.target_entity : '—')}</td>
                <td style="font-size:13px;">${e.note || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    document.getElementById('auditList').innerHTML = `<div class="error-text">${e.message}</div>`;
  }
}

// =====================================================================
// MY PUNCH VIEW (admin/owner punch screen)
// =====================================================================
async function renderMyPunch() {
  viewContainer.innerHTML = `
    <h1>My Punch</h1>
    <p class="page-sub">Punch in and out — the same feature your employees use</p>
    <div id="myPunchCard"></div>
  `;
  refreshMyPunch();
}

async function refreshMyPunch() {
  try {
    const data = await API.apiFetch('/me/today');
    const serverTime = new Date(data.server_time);
    const open = data.open_session;
    const sessions = data.today_sessions || [];
    const totalMin = sessions.reduce((s, p) => s + (p.minutes_so_far || 0), 0);

    document.getElementById('myPunchCard').innerHTML = `
      <div style="max-width:460px; margin: 0 auto;">
        <div class="emp-clock" style="margin-bottom:20px;">
          <div class="time mono" id="adminClockTime">${serverTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}</div>
          <div class="date">${serverTime.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>

        <div class="emp-status ${open ? 'working' : 'idle'}">
          <div class="dot"></div>
          <div>
            <div class="title">${open ? 'You are working' : 'You are not punched in'}</div>
            <div class="sub">${open ? 'Since ' + FMT.formatTimeIST(open.punch_in) : 'Tap Punch In to start'}</div>
          </div>
        </div>

        <div class="emp-buttons">
          <button class="emp-btn emp-btn-in" id="myIn" ${open ? 'disabled' : ''}>▶ PUNCH IN</button>
          <button class="emp-btn emp-btn-out" id="myOut" ${!open ? 'disabled' : ''}>■ PUNCH OUT</button>
        </div>

        <div class="emp-sessions">
          <h3>TODAY'S SESSIONS · TOTAL ${FMT.formatMinutes(totalMin)}</h3>
          <ul>
            ${sessions.length === 0 ? '<li><span class="muted">No sessions yet today</span></li>' :
              sessions.map(s => `<li><span>${FMT.formatTimeIST(s.punch_in)} → ${s.punch_out ? FMT.formatTimeIST(s.punch_out) : 'now'}</span><span>${FMT.formatMinutes(s.minutes_so_far)}</span></li>`).join('')}
          </ul>
        </div>
      </div>
    `;

    document.getElementById('myIn').addEventListener('click', adminPunchIn);
    document.getElementById('myOut').addEventListener('click', adminPunchOut);
  } catch (e) {
    document.getElementById('myPunchCard').innerHTML = `<div class="error-text">${e.message}</div>`;
  }
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS not available'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(new Error(err.code === 1 ? 'Location permission denied' : 'Could not get location')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  });
}

async function adminPunchIn() {
  const btn = document.getElementById('myIn');
  btn.disabled = true; btn.textContent = 'Getting location...';
  try {
    const loc = await getLocation();
    await API.apiFetch('/punches/in', { method: 'POST', body: JSON.stringify(loc) });
    showToast('Punched in');
    refreshMyPunch();
  } catch (err) {
    showToast(err.code === 'GEOFENCE_VIOLATION' ? `Not at workplace (${err.details.distance_meters}m away)` : err.message, 'error');
    refreshMyPunch();
  }
}

async function adminPunchOut() {
  const btn = document.getElementById('myOut');
  btn.disabled = true; btn.textContent = 'Punching out...';
  try {
    let loc = {}; try { loc = await getLocation(); } catch(_) {}
    await API.apiFetch('/punches/out', { method: 'POST', body: JSON.stringify(loc) });
    showToast('Punched out');
    refreshMyPunch();
  } catch (err) {
    showToast(err.message, 'error');
    refreshMyPunch();
  }
}

// Initial load
renderDashboard();
