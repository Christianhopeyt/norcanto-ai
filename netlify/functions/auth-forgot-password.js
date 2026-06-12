'use strict';
const { respondOK, respondErr, respondOptions, supabase, sendEmail, rateLimit } = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondErr('Method not allowed', 405);
  if (!rateLimit(`forgot:${event.headers['x-forwarded-for'] || 'unknown'}`, 5, 60000)) return respondErr('Please wait before trying again.', 429);
  const { email } = JSON.parse(event.body || '{}');
  if (!email) return respondErr('Email is required');
  const users = await supabase.select('users', `?email=eq.${encodeURIComponent(email.toLowerCase())}&select=email,name`).catch(() => []);
  if (users?.[0]) {
    await sendEmail(email, 'Norcanto AI password help',
      `<p>Hello ${users[0].name || ''},</p><p>Password reset is currently handled by support. Reply to this email or contact hello@norcanto.com and we will help verify your account.</p>`);
  }
  return respondOK({ message:'If an account exists, password-help instructions have been sent.' });
};
