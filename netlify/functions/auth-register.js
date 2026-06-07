// netlify/functions/auth-register.js
const {
  respondOK, respondError, respondOptions,
  supabase, signJWT, hashPassword, rateLimit,
  sendEmail, PLANS
} = require('./_shared/utils');

const crypto = require('node:crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondError('Method not allowed', 405);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`register:${ip}`, 5, 60000)) return respondError('Too many requests. Try again later.', 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respondError('Invalid JSON'); }

  const { email, password, name } = body;
  if (!email || !password || !name) return respondError('Name, email, and password are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respondError('Invalid email address.');
  if (password.length < 8) return respondError('Password must be at least 8 characters.');
  if (name.trim().length < 2) return respondError('Name must be at least 2 characters.');

  try {
    // Check if email already exists
    const existing = await supabase.select('users', `?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id`);
    if (existing && existing.length > 0) return respondError('An account with this email already exists.');

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Create user
    const [user] = await supabase.insert('users', {
      id: userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password_hash: hashPassword(password),
      role: 'user',
      created_at: now,
      updated_at: now,
    });

    // Create trial subscription
    const subId = crypto.randomUUID();
    await supabase.insert('subscriptions', {
      id: subId,
      user_id: userId,
      plan_id: 'trial',
      status: 'trialing',
      trial_start: now,
      trial_end: trialEnd,
      current_period_start: now,
      current_period_end: trialEnd,
      created_at: now,
      updated_at: now,
    });

    // Initialize usage tracking
    await supabase.insert('usage_tracking', {
      id: crypto.randomUUID(),
      user_id: userId,
      period_start: now,
      period_end: trialEnd,
      docs_uploaded: 0,
      ai_requests: 0,
      pages_processed: 0,
      storage_bytes: 0,
      chat_messages: 0,
      created_at: now,
      updated_at: now,
    });

    // Send welcome email
    await sendEmail(email, 'Welcome to Norcanto AI - Your 14-day trial has started!', `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#0A0A0B">Welcome to Norcanto AI, ${name}!</h2>
        <p>Your 14-day free trial of Norcanto AI Premium has started.</p>
        <p>During your trial you get:</p>
        <ul>
          <li>20 document analyses</li>
          <li>Full AI summaries, risk detection & action items</li>
          <li>Unlimited AI document chat</li>
          <li>Export reports</li>
        </ul>
        <p>Your trial ends on <strong>${new Date(trialEnd).toLocaleDateString('en-US', { dateStyle: 'long' })}</strong>.</p>
        <a href="https://quickdocs.norcanto.com/pages/app.html" style="display:inline-block;background:#F5F5F0;color:#0A0A0B;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">Open Norcanto AI</a>
        <p style="margin-top:32px;color:#666;font-size:13px;">Questions? Reply to this email or contact us at hello@norcanto.com</p>
      </div>
    `);

    // Generate session token
    const token = signJWT({
      sub: userId,
      email: user.email,
      name: user.name,
      role: user.role,
      plan: 'trial',
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    });

    return respondOK({
      token,
      user: { id: userId, email: user.email, name: user.name, role: user.role },
      subscription: { plan: 'trial', status: 'trialing', trial_end: trialEnd },
      message: 'Account created. Your 14-day trial has started!',
    });

  } catch (err) {
    console.error('Register error:', err);
    return respondError('Registration failed. Please try again.', 500);
  }
};
