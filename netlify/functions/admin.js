// netlify/functions/admin.js
'use strict';
const { respondOK, respondErr, respondOptions, supabase, verifyJWT, extractToken } = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();

  const token   = extractToken(event);
  if (!token) return respondErr('Unauthorized', 401);
  const payload = verifyJWT(token);
  if (!payload || payload.role !== 'admin') return respondErr('Admin access required', 403);

  try {
    const [users, docs] = await Promise.all([
      supabase.select('users', '?select=id,email,name,role,created_at&order=created_at.desc&limit=200'),
      supabase.select('document_analyses', '?select=id,user_id,file_name,file_type,created_at&order=created_at.desc&limit=200'),
    ]);

    const totalUsers  = (users  || []).length;
    const totalDocs   = (docs   || []).length;
    const todayStart  = new Date(); todayStart.setHours(0,0,0,0);
    const docsToday   = (docs || []).filter(d => new Date(d.created_at) >= todayStart).length;

    return respondOK({
      stats: { total_users: totalUsers, total_analyses: totalDocs, analyses_today: docsToday },
      users:     users || [],
      analyses:  docs  || [],
    });
  } catch (err) {
    console.error('Admin error:', err);
    return respondErr('Admin request failed', 500);
  }
};
