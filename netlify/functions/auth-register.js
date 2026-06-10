// netlify/functions/auth-register.js
// Free platform — all features unlocked, no subscription required
'use strict';

const { respondOK, respondErr, respondOptions, supabase, signJWT, hashPassword, rateLimit, sendEmail } = require('./_shared/utils');
const crypto = require('node:crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondErr('Method not allowed', 405);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`reg:${ip}`, 5, 60000)) return respondErr('Too many requests. Try again later.', 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respondErr('Invalid JSON'); }

  const { email, password, name } = body;
  if (!email || !password || !name) return respondErr('Name, email and password are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respondErr('Invalid email address.');
  if (password.length < 8) return respondErr('Password must be at least 8 characters.');
  if (name.trim().length < 2) return respondErr('Name must be at least 2 characters.');

  try {
    const existing = await supabase.select('users', `?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id`);
    if (existing?.length > 0) return respondErr('An account with this email already exists.');

    const userId = crypto.randomUUID();
    const now    = new Date().toISOString();

    await supabase.insert('users', {
      id: userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password_hash: hashPassword(password),
      role: 'user',
      created_at: now,
      updated_at: now,
    });

    await sendEmail(email, 'Welcome to Norcanto AI!', `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
        <h2>Welcome to Norcanto AI, ${name}!</h2>
        <p>Your account is ready. All features are free — no credit card needed.</p>
        <p>Upload any PDF, DOCX, or TXT document and get instant AI intelligence: summaries, risk detection, key dates, action items, and more.</p>
        <a href="https://norcanto.com/pages/app.html" style="display:inline-block;background:#F5F5F0;color:#0A0A0B;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">Open Norcanto AI</a>
        <p style="margin-top:32px;color:#666;font-size:13px;">Questions? hello@norcanto.com</p>
      </div>
    `);

    const token = signJWT({
      sub: userId, email: email.toLowerCase().trim(), name: name.trim(), role: 'user',
      exp: Math.floor(Date.now()/1000) + 30 * 24 * 60 * 60,
    });

    return respondOK({ token, user: { id: userId, email: email.toLowerCase().trim(), name: name.trim(), role: 'user' }, message: 'Account created successfully!' });
  } catch (err) {
    console.error('Register error:', err);
    return respondErr('Registration failed. Please try again.', 500);
  }
};
