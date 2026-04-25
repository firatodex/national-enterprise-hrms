// Shared API client — handles auth and auto-refresh
(function() {
  const API_BASE = '/api/v1';

  let refreshPromise = null;

  async function refreshAccessToken() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const refresh = localStorage.getItem('refresh_token');
      if (!refresh) throw new Error('No refresh token');
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh })
      });
      if (!res.ok) {
        localStorage.clear();
        window.location.href = '/';
        throw new Error('Refresh failed');
      }
      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      return data.access_token;
    })();
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('access_token');
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {},
      token ? { 'Authorization': `Bearer ${token}` } : {}
    );

    let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
      try {
        const newToken = await refreshAccessToken();
        const retryHeaders = { ...headers, 'Authorization': `Bearer ${newToken}` };
        res = await fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders });
      } catch (e) {
        throw e;
      }
    }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const err = new Error((data && data.error && data.error.message) || 'Request failed');
      err.status = res.status;
      err.code = data && data.error ? data.error.code : null;
      err.details = data && data.error ? data.error.details : null;
      throw err;
    }
    return data;
  }

  function logout() {
    const refresh = localStorage.getItem('refresh_token');
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      },
      body: JSON.stringify({ refresh_token: refresh })
    }).catch(() => {});
    localStorage.clear();
    window.location.href = '/';
  }

  function getCurrentUser() {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  }

  function formatMoney(paise) {
    if (paise == null || isNaN(paise)) return '₹0';
    const rupees = paise / 100;
    const sign = rupees < 0 ? '-' : '';
    const abs = Math.abs(rupees);
    return sign + '₹' + abs.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function formatMinutes(min) {
    if (!min) return '0m';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${String(m).padStart(2,'0')}m`;
  }

  function formatDateIST(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTimeIST(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function formatDateTimeIST(iso) {
    return formatDateIST(iso) + ', ' + formatTimeIST(iso);
  }

  window.API = { apiFetch, logout, getCurrentUser, refreshAccessToken };
  window.FMT = { formatMoney, formatMinutes, formatDateIST, formatTimeIST, formatDateTimeIST };
})();
