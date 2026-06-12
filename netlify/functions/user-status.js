// netlify/functions/user-status.js
'use strict';
const { respondOK, respondErr, respondOptions, supabase, verifyJWT, extractToken } = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'GET') return respondErr('Method not allowed', 405);

  const token   = extractToken(event);
  if (!token) return respondErr('Unauthorized', 401);
  const payload = verifyJWT(token);
  if (!payload) return respondErr('Invalid or expired session', 401);

  try {
    const users = await supabase.select('users', `?id=eq.${payload.sub}&select=id,email,name,role,created_at`);
    const user  = users?.[0];
    if (!user) return respondErr('User not found', 404);

    const docs = await supabase.select('document_analyses', `?user_id=eq.${payload.sub}&select=id`).catch(() => []);

    return respondOK({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      usage: { docs_analyzed: docs?.length || 0 },
    });
  } catch (err) {
    console.error('Status error:', err);
    return respondErr('Failed to fetch status', 500);
  }
};
