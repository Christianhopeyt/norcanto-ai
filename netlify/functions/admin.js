// netlify/functions/admin.js
const {
  respondOK, respondError, respondOptions,
  supabase, verifyJWT, extractToken
} = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();

  const token = extractToken(event);
  if (!token) return respondError('Unauthorized', 401);
  const payload = verifyJWT(token);
  if (!payload || payload.role !== 'admin') return respondError('Admin access required', 403);

  const path = event.path.replace('/api/admin/', '').replace('/.netlify/functions/admin/', '');

  try {
    if (path === 'stats' || path === '') {
      const [users, subs, payments, usage] = await Promise.all([
        supabase.select('users', '?select=id,email,name,created_at,role&order=created_at.desc&limit=100'),
        supabase.select('subscriptions', '?select=*&order=created_at.desc&limit=200'),
        supabase.select('payments', '?select=*&order=created_at.desc&limit=200'),
        supabase.select('usage_tracking', '?select=*&order=created_at.desc&limit=100'),
      ]);

      const now = new Date();
      const totalRevenue = (payments || []).filter(p => p.status === 'succeeded').reduce((s, p) => s + (p.amount || 0), 0);
      const activeTrials = (subs || []).filter(s => s.status === 'trialing' && new Date(s.trial_end) > now).length;
      const activeSubs = (subs || []).filter(s => s.status === 'active' && new Date(s.current_period_end) > now).length;
      const failedPayments = (payments || []).filter(p => p.status === 'failed').length;

      return respondOK({
        stats: {
          total_users: (users || []).length,
          active_trials: activeTrials,
          active_subscriptions: activeSubs,
          total_revenue_cents: totalRevenue,
          failed_payments: failedPayments,
          total_payments: (payments || []).length,
        },
        users: users || [],
        subscriptions: subs || [],
        payments: payments || [],
        usage: usage || [],
      });
    }

    return respondError('Unknown admin endpoint', 404);
  } catch (err) {
    console.error('Admin error:', err);
    return respondError('Admin request failed', 500);
  }
};
