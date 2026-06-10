/* Norcanto AI — Auth State Manager (no subscriptions, fully free platform) */
'use strict';

const QDAuth = (() => {
  const TOKEN_KEY = 'qd_token';
  const USER_KEY  = 'qd_user';

  // ── Storage ──────────────────────────────────────────────────────────────────
  const save   = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const load   = (k)    => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const remove = (k)    => { try { localStorage.removeItem(k); } catch {} };

  // ── Token ────────────────────────────────────────────────────────────────────
  const getToken   = () => localStorage.getItem(TOKEN_KEY) || '';
  const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => remove(TOKEN_KEY);

  const decodeToken = (token) => {
    if (!token) return null;
    try {
      const b = token.split('.')[1];
      const p = b + '==='.slice((b.length + 3) % 4);
      return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return null; }
  };

  const isExpired = (token) => {
    const p = decodeToken(token);
    return !p || (p.exp && p.exp * 1000 < Date.now());
  };

  // ── Auth state ───────────────────────────────────────────────────────────────
  const isLoggedIn = () => { const t = getToken(); return !!t && !isExpired(t); };
  const getUser    = () => { const t = getToken(); return t ? decodeToken(t) : null; };

  const saveSession = ({ token, user }) => {
    if (token) setToken(token);
    if (user)  save(USER_KEY, user);
  };

  const logout = () => {
    clearToken();
    remove(USER_KEY);
    window.location.href = '/';
  };

  // ── API helpers ──────────────────────────────────────────────────────────────
  const authFetch = (url, opts = {}) => {
    const token = getToken();
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
  };

  // ── Register ─────────────────────────────────────────────────────────────────
  const register = async (name, email, password) => {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Registration failed');
    saveSession(data);
    return data;
  };

  // ── Login ────────────────────────────────────────────────────────────────────
  const login = async (email, password) => {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Login failed');
    saveSession(data);
    return data;
  };

  // ── Nav state ────────────────────────────────────────────────────────────────
  const initNavState = () => {
    const user = getUser();
    if (!user || !isLoggedIn()) return;

    // Show user name, hide generic buttons
    document.querySelectorAll('[data-nav-signin]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('[data-nav-getstarted]').forEach(el => {
      el.textContent = 'Dashboard';
      el.href = '/pages/app.html';
    });
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = user.name?.split(' ')[0] || 'Account';
    });
    document.querySelectorAll('[data-nav-user]').forEach(el => {
      el.style.display = 'flex';
    });
  };

  return { getToken, isLoggedIn, getUser, saveSession, register, login, logout, authFetch, initNavState };
})();

// ── Cookie consent banner ────────────────────────────────────────────────────
const initCookieBanner = () => {
  if (localStorage.getItem('qd_cookies_ok')) return;
  const b = document.createElement('div');
  b.id = 'cookie-banner';
  b.style.cssText = [
    'position:fixed','bottom:16px','left:50%','transform:translateX(-50%)',
    'z-index:3000','background:var(--brand-charcoal)','border:1px solid var(--brand-border)',
    'border-radius:12px','padding:14px 18px','display:flex','align-items:center',
    'gap:14px','font-size:13px','color:var(--text-secondary)',
    'max-width:560px','width:calc(100% - 32px)','box-shadow:var(--shadow-lg)',
    'animation:fadeUp 0.35s ease'
  ].join(';');
  b.innerHTML = `
    <span style="flex:1;line-height:1.5">We use cookies to keep you signed in and improve your experience. <a href="/pages/cookie-policy.html" style="color:var(--text-primary);text-decoration:underline;text-underline-offset:3px">Learn more</a></span>
    <div style="display:flex;gap:8px;flex-shrink:0">
      <button onclick="document.getElementById('cookie-banner').remove()" style="padding:6px 12px;border-radius:6px;border:1px solid var(--brand-border);background:transparent;color:var(--text-secondary);font-size:12px;cursor:pointer;white-space:nowrap">Decline</button>
      <button onclick="localStorage.setItem('qd_cookies_ok','1');document.getElementById('cookie-banner').remove()" style="padding:6px 12px;border-radius:6px;border:none;background:var(--accent);color:var(--text-inverse);font-size:12px;cursor:pointer;font-weight:500;white-space:nowrap">Accept</button>
    </div>`;
  document.body.appendChild(b);
};

document.addEventListener('DOMContentLoaded', () => {
  QDAuth.initNavState();
  initCookieBanner();
});
