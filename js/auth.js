/* Norcanto AI - Auth & Subscription State Manager */
'use strict';

const QDAuth = (() => {
  const TOKEN_KEY = 'qd_token';
  const USER_KEY = 'qd_user';
  const SUB_KEY = 'qd_sub';

  // ── Storage ────────────────────────────────────────────────────────────────
  const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));
  const load = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const remove = (key) => localStorage.removeItem(key);

  // ── Token management ───────────────────────────────────────────────────────
  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => remove(TOKEN_KEY);

  // Decode JWT payload (no verification - server handles that)
  const decodeToken = (token) => {
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      const padded = payload + '==='.slice((payload.length + 3) % 4);
      return JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return null; }
  };

  const isTokenExpired = (token) => {
    const p = decodeToken(token);
    return !p || (p.exp && p.exp * 1000 < Date.now());
  };

  // ── Auth state ─────────────────────────────────────────────────────────────
  const isLoggedIn = () => {
    const token = getToken();
    return !!token && !isTokenExpired(token);
  };

  const getUser = () => {
    const token = getToken();
    if (!token) return null;
    return decodeToken(token);
  };

  const getSubscription = () => load(SUB_KEY);

  const saveSession = ({ token, user, subscription }) => {
    if (token) setToken(token);
    if (user) save(USER_KEY, user);
    if (subscription) save(SUB_KEY, subscription);
  };

  const logout = () => {
    clearToken();
    remove(USER_KEY);
    remove(SUB_KEY);
    window.location.href = '/';
  };

  // ── API helpers ────────────────────────────────────────────────────────────
  const authFetch = async (url, options = {}) => {
    const token = getToken();
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  };

  // ── Register ───────────────────────────────────────────────────────────────
  const register = async (name, email, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Registration failed');
    saveSession(data);
    return data;
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Login failed');
    saveSession(data);
    return data;
  };

  // ── Fetch current status from server ──────────────────────────────────────
  const refreshStatus = async () => {
    if (!isLoggedIn()) return null;
    try {
      const res = await authFetch('/api/user/status');
      if (!res.ok) return null;
      const data = await res.json();
      if (data.success) {
        save(SUB_KEY, data.subscription);
        save(USER_KEY, data.user);
      }
      return data;
    } catch { return null; }
  };

  // ── Plan helpers ───────────────────────────────────────────────────────────
  const PLAN_RANK = { free: 0, trial: 1, premium: 2, pro: 3 };

  const getPlanId = () => {
    const sub = getSubscription();
    return sub?.plan || getUser()?.plan || 'free';
  };

  const hasPlan = (minPlan) => {
    const current = getPlanId();
    return (PLAN_RANK[current] || 0) >= (PLAN_RANK[minPlan] || 0);
  };

  const isTrialing = () => {
    const sub = getSubscription();
    return sub?.status === 'trialing';
  };

  const getTrialDaysLeft = () => {
    const sub = getSubscription();
    if (!sub?.trial_end) return 0;
    return Math.max(0, Math.ceil((new Date(sub.trial_end) - Date.now()) / 86400000));
  };

  const isSubscriptionExpired = () => {
    const sub = getSubscription();
    return ['expired', 'cancelled'].includes(sub?.status);
  };

  // ── Init nav state ─────────────────────────────────────────────────────────
  const initNavState = () => {
    const user = getUser();
    const signinBtn = document.querySelector('[data-nav-signin]');
    const getStartedBtn = document.querySelector('[data-nav-getstarted]');
    const userMenu = document.querySelector('[data-nav-user]');

    if (user && isLoggedIn()) {
      if (signinBtn) signinBtn.style.display = 'none';
      if (getStartedBtn) { getStartedBtn.textContent = 'Dashboard'; getStartedBtn.href = '/pages/app.html'; }
      if (userMenu) {
        userMenu.style.display = 'flex';
        const nameEl = userMenu.querySelector('[data-user-name]');
        if (nameEl) nameEl.textContent = user.name?.split(' ')[0] || 'Account';
      }
    }
  };

  // ── Show trial reminder banner ─────────────────────────────────────────────
  const initTrialBanner = () => {
    if (!isLoggedIn()) return;
    const sub = getSubscription();
    if (!sub) return;

    const banner = document.getElementById('trial-banner');
    if (!banner) return;

    if (sub.status === 'trialing') {
      const days = getTrialDaysLeft();
      const daysEl = banner.querySelector('[data-trial-days]');
      if (daysEl) daysEl.textContent = `${days} day${days !== 1 ? 's' : ''}`;
      banner.classList.add('visible');
    } else if (sub.status === 'expired' && sub.plan === 'free') {
      banner.classList.add('visible', 'expired');
      const msgEl = banner.querySelector('[data-trial-msg]');
      if (msgEl) msgEl.textContent = 'Your trial has expired.';
    }
  };

  // ── Redirect if not logged in ──────────────────────────────────────────────
  const requireAuth = (redirectTo = '/pages/signin.html') => {
    if (!isLoggedIn()) {
      window.location.href = `${redirectTo}?next=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }
    return true;
  };

  const requirePlan = (minPlan, redirectTo = '/pages/pricing.html') => {
    if (!hasPlan(minPlan)) {
      window.location.href = `${redirectTo}?upgrade=${minPlan}`;
      return false;
    }
    return true;
  };

  return {
    getToken, isLoggedIn, getUser, getSubscription,
    register, login, logout, refreshStatus,
    getPlanId, hasPlan, isTrialing, getTrialDaysLeft, isSubscriptionExpired,
    initNavState, initTrialBanner, requireAuth, requirePlan, authFetch,
    saveSession,
  };
})();

// ── CamerPay Checkout Manager ──────────────────────────────────────────────────
const QDCheckout = (() => {
  let currentPaymentId = null;
  let pollInterval = null;

  const PLAN_DETAILS = {
    premium: { name: 'Premium', monthly: '$9.99', annual: '$99.90', monthlyXAF: '6,500 XAF', annualXAF: '65,000 XAF' },
    pro: { name: 'Pro', monthly: '$19.99', annual: '$199.90', monthlyXAF: '13,000 XAF', annualXAF: '130,000 XAF' },
  };

  const openCheckout = (planId, billingCycle = 'monthly') => {
    if (!QDAuth.isLoggedIn()) {
      window.location.href = `/pages/signin.html?next=${encodeURIComponent('/pages/pricing.html')}&upgrade=${planId}`;
      return;
    }

    const plan = PLAN_DETAILS[planId];
    if (!plan) return;

    const modal = document.getElementById('checkout-modal');
    if (!modal) { renderCheckoutModal(); }

    document.getElementById('checkout-plan-name').textContent = plan.name;
    document.getElementById('checkout-plan-price').textContent = billingCycle === 'annual' ? plan.annualXAF : plan.monthlyXAF;
    document.getElementById('checkout-plan-period').textContent = billingCycle === 'annual' ? '/year' : '/month';
    document.getElementById('checkout-plan-id').value = planId;
    document.getElementById('checkout-billing').value = billingCycle;

    showCheckoutStep('phone');
    document.getElementById('checkout-modal').classList.add('open');
  };

  const renderCheckoutModal = () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal-overlay" id="checkout-modal">
        <div class="modal checkout-modal">
          <div class="modal-header">
            <div class="modal-title">Complete Subscription</div>
            <button class="modal-close" onclick="document.getElementById('checkout-modal').classList.remove('open')">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <input type="hidden" id="checkout-plan-id">
          <input type="hidden" id="checkout-billing">

          <!-- Step: Phone -->
          <div id="step-phone">
            <div class="plan-selected-preview">
              <div class="plan-selected-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div>
                <div class="plan-selected-name" id="checkout-plan-name">Premium</div>
                <div class="plan-selected-price">
                  <strong id="checkout-plan-price">6,500 XAF</strong>
                  <span id="checkout-plan-period">/month</span>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Mobile Money Phone Number</label>
              <input type="tel" class="form-input" id="checkout-phone" placeholder="e.g. 237 6XX XXX XXX" autocomplete="tel">
              <div class="phone-hint">MTN Mobile Money or Orange Money accepted</div>
            </div>

            <div id="checkout-error" style="font-size:13px;color:var(--danger);margin-bottom:12px;display:none;"></div>

            <button class="btn btn-primary btn-lg form-btn" onclick="QDCheckout.submitPhone()">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              Initiate Payment
            </button>

            <div class="payment-steps" style="margin-top:16px;">
              <div class="payment-step"><div class="payment-step-num">1</div><span>Enter your Mobile Money number above</span></div>
              <div class="payment-step"><div class="payment-step-num">2</div><span>You will receive a USSD prompt on your phone</span></div>
              <div class="payment-step"><div class="payment-step-num">3</div><span>Approve the payment and your subscription activates instantly</span></div>
            </div>
          </div>

          <!-- Step: Pending -->
          <div id="step-pending" style="display:none;">
            <div class="payment-pending-card">
              <div class="payment-spinner"></div>
              <div style="font-size:16px;font-weight:600;color:var(--text-primary)">Awaiting Payment Approval</div>
              <div style="font-size:14px;color:var(--text-secondary);max-width:300px;text-align:center;">Check your phone for the Mobile Money prompt. Approve the payment to activate your subscription.</div>
              <div id="ussd-display" class="ussd-display" style="display:none;"></div>
              <div style="font-size:12px;color:var(--text-muted)" id="checkout-ref-display"></div>
            </div>
            <button class="btn btn-ghost btn-lg form-btn" onclick="QDCheckout.cancelPoll()" style="margin-top:8px;">Cancel</button>
          </div>

          <!-- Step: Success -->
          <div id="step-success" style="display:none;">
            <div style="text-align:center;padding:32px 0;">
              <div style="width:56px;height:56px;border-radius:50%;background:var(--tint-green);border:2px solid rgba(34,197,94,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Subscription Activated</div>
              <div style="font-size:14px;color:var(--text-secondary);margin-bottom:24px;">Your plan is now active. Welcome aboard!</div>
              <button class="btn btn-primary btn-lg form-btn" onclick="window.location.href='/pages/app.html'">Go to Dashboard</button>
            </div>
          </div>

          <!-- Step: Failed -->
          <div id="step-failed" style="display:none;">
            <div style="text-align:center;padding:32px 0;">
              <div style="width:56px;height:56px;border-radius:50%;background:var(--tint-red);border:2px solid rgba(239,68,68,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F87171" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
              <div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Payment Not Completed</div>
              <div style="font-size:14px;color:var(--text-secondary);margin-bottom:24px;">No charge was made. Please try again or contact support.</div>
              <button class="btn btn-primary form-btn" onclick="QDCheckout.retryPayment()">Try Again</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div.firstElementChild);

    // Close on overlay click
    document.getElementById('checkout-modal').addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('open');
    });
  };

  const showCheckoutStep = (step) => {
    ['phone', 'pending', 'success', 'failed'].forEach(s => {
      const el = document.getElementById(`step-${s}`);
      if (el) el.style.display = s === step ? 'block' : 'none';
    });
  };

  const submitPhone = async () => {
    const phone = document.getElementById('checkout-phone')?.value?.trim();
    const planId = document.getElementById('checkout-plan-id')?.value;
    const billingCycle = document.getElementById('checkout-billing')?.value || 'monthly';
    const errorEl = document.getElementById('checkout-error');

    if (!phone || phone.length < 8) {
      if (errorEl) { errorEl.textContent = 'Please enter a valid phone number.'; errorEl.style.display = 'block'; }
      return;
    }
    if (errorEl) errorEl.style.display = 'none';

    const btn = document.querySelector('#step-phone .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Initiating...'; }

    try {
      const res = await QDAuth.authFetch('/api/payments/camerpay/create', {
        method: 'POST',
        body: JSON.stringify({ plan_id: planId, billing_cycle: billingCycle, phone }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Payment initiation failed');

      currentPaymentId = data.payment_id;
      showCheckoutStep('pending');

      const refEl = document.getElementById('checkout-ref-display');
      if (refEl) refEl.textContent = `Reference: ${data.reference}`;

      if (data.ussd_code) {
        const ussdEl = document.getElementById('ussd-display');
        if (ussdEl) { ussdEl.textContent = data.ussd_code; ussdEl.style.display = 'block'; }
      }

      startPolling(data.payment_id);
    } catch (err) {
      if (errorEl) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Initiate Payment'; }
    }
  };

  const startPolling = (paymentId) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes
    pollInterval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) { clearInterval(pollInterval); showCheckoutStep('failed'); return; }

      try {
        const res = await QDAuth.authFetch(`/api/payments/camerpay/verify?payment_id=${paymentId}`);
        const data = await res.json();
        if (!data.success) return;

        if (data.status === 'succeeded') {
          clearInterval(pollInterval);
          // Update local session
          if (data.subscription) {
            QDAuth.saveSession({ subscription: { plan: data.subscription.plan, status: data.subscription.status } });
          }
          showCheckoutStep('success');
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          showCheckoutStep('failed');
        }
      } catch (err) {
        console.warn('Poll error:', err);
      }
    }, 5000); // Poll every 5 seconds
  };

  const cancelPoll = () => {
    clearInterval(pollInterval);
    document.getElementById('checkout-modal')?.classList.remove('open');
  };

  const retryPayment = () => {
    clearInterval(pollInterval);
    showCheckoutStep('phone');
    const errorEl = document.getElementById('checkout-error');
    if (errorEl) errorEl.style.display = 'none';
  };

  // Init: render modal on page load
  const init = () => {
    if (!document.getElementById('checkout-modal')) renderCheckoutModal();

    // Bind all checkout buttons
    document.querySelectorAll('[data-checkout-plan]').forEach(btn => {
      btn.addEventListener('click', () => {
        const planId = btn.dataset.checkoutPlan;
        const billing = document.querySelector('.billing-option.active')?.dataset?.billing || 'monthly';
        openCheckout(planId, billing);
      });
    });
  };

  return { init, openCheckout, submitPhone, startPolling, cancelPoll, retryPayment };
})();

// ── Pricing page toggle ────────────────────────────────────────────────────────
const initBillingToggle = () => {
  const options = document.querySelectorAll('.billing-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const billing = opt.dataset.billing;
      document.querySelectorAll('[data-monthly-price]').forEach(el => {
        el.textContent = billing === 'annual' ? el.dataset.annualPrice : el.dataset.monthlyPrice;
      });
      document.querySelectorAll('[data-annual-note]').forEach(el => {
        el.style.display = billing === 'annual' ? 'block' : 'none';
      });
    });
  });
};

document.addEventListener('DOMContentLoaded', () => {
  QDAuth.initNavState();
  QDAuth.initTrialBanner();
  QDCheckout.init();
  initBillingToggle();
});
