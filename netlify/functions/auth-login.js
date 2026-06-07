// netlify/functions/auth-login.js
const {
  respondOK, respondError, respondOptions,
  supabase, signJWT, verifyPassword, rateLimit
} = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondError('Method not allowed', 405);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`login:${ip}`, 10, 60000)) return respondError('Too many login attempts. Try again later.', 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respondError('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return respondError('Email and password are required.');

  try {
    const users = await supabase.select('users', `?email=eq.${encodeURIComponent(email.toLowerCase())}&select=*`);
    if (!users || users.length === 0) return respondError('Invalid email or password.', 401);

    const user = users[0];
    if (!verifyPassword(password, user.password_hash)) return respondError('Invalid email or password.', 401);

    // Get active subscription
    const subs = await supabase.select('subscriptions',
      `?user_id=eq.${user.id}&order=created_at.desc&limit=1`
    );
    const sub = subs?.[0];
    const now = new Date();

    let planId = 'free';
    let subStatus = 'none';
    let trialEnd = null;

    if (sub) {
      subStatus = sub.status;
      trialEnd = sub.trial_end;
      if (sub.status === 'trialing') {
        planId = new Date(sub.trial_end) > now ? 'trial' : 'free';
        if (new Date(sub.trial_end) <= now) {
          // Expire trial
          await supabase.update('subscriptions', { status: 'expired', updated_at: now.toISOString() },
            `?id=eq.${sub.id}`);
          subStatus = 'expired';
        }
      } else if (sub.status === 'active') {
        planId = sub.plan_id;
      }
    }

    const token = signJWT({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      plan: planId,
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    });

    return respondOK({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      subscription: { plan: planId, status: subStatus, trial_end: trialEnd },
    });

  } catch (err) {
    console.error('Login error:', err);
    return respondError('Login failed. Please try again.', 500);
  }
};
