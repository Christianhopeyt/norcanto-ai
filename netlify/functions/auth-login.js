// netlify/functions/auth-login.js
'use strict';
const { respondOK, respondErr, respondOptions, supabase, signJWT, verifyPassword, rateLimit } = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondErr('Method not allowed', 405);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`login:${ip}`, 10, 60000)) return respondErr('Too many attempts. Try again later.', 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respondErr('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return respondErr('Email and password are required.');

  try {
    const users = await supabase.select('users', `?email=eq.${encodeURIComponent(email.toLowerCase())}&select=*`);
    if (!users?.length) return respondErr('Invalid email or password.', 401);

    const user = users[0];
    if (!verifyPassword(password, user.password_hash)) return respondErr('Invalid email or password.', 401);

    const token = signJWT({
      sub: user.id, email: user.email, name: user.name, role: user.role,
      exp: Math.floor(Date.now()/1000) + 30 * 24 * 60 * 60,
    });

    return respondOK({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    return respondErr('Login failed. Please try again.', 500);
  }
};
