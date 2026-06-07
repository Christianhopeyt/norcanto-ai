// netlify/functions/user-status.js
const {
  respondOK, respondError, respondOptions,
  supabase, verifyJWT, extractToken, getPlanLimits
} = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'GET') return respondError('Method not allowed', 405);

  const token = extractToken(event);
  if (!token) return respondError('Unauthorized', 401);
  const payload = verifyJWT(token);
  if (!payload) return respondError('Invalid or expired session', 401);

  try {
    const subs = await supabase.select('subscriptions',
      `?user_id=eq.${payload.sub}&order=created_at.desc&limit=1`
    );
    const sub = subs?.[0];
    const now = new Date();

    let planId = 'free';
    let subStatus = 'none';
    let trialEnd = null;
    let currentPeriodEnd = null;

    if (sub) {
      subStatus = sub.status;
      trialEnd = sub.trial_end;
      currentPeriodEnd = sub.current_period_end;

      if (sub.status === 'trialing' && new Date(sub.trial_end) > now) {
        planId = 'trial';
      } else if (sub.status === 'trialing' && new Date(sub.trial_end) <= now) {
        planId = 'free';
        subStatus = 'expired';
        await supabase.update('subscriptions', { status: 'expired', updated_at: now.toISOString() }, `?id=eq.${sub.id}`);
      } else if (sub.status === 'active') {
        if (new Date(sub.current_period_end) > now) {
          planId = sub.plan_id;
        } else {
          planId = 'free';
          subStatus = 'expired';
          await supabase.update('subscriptions', { status: 'expired', updated_at: now.toISOString() }, `?id=eq.${sub.id}`);
        }
      }
    }

    // Get usage
    const usages = await supabase.select('usage_tracking',
      `?user_id=eq.${payload.sub}&order=created_at.desc&limit=1`
    );
    const usage = usages?.[0] || {};

    const limits = getPlanLimits(planId);
    const daysLeft = trialEnd ? Math.max(0, Math.ceil((new Date(trialEnd) - now) / (1000 * 60 * 60 * 24))) : null;

    return respondOK({
      user: { id: payload.sub, email: payload.email, name: payload.name, role: payload.role },
      subscription: { plan: planId, status: subStatus, trial_end: trialEnd, days_left: daysLeft, current_period_end: currentPeriodEnd },
      limits,
      usage: {
        docs_uploaded: usage.docs_uploaded || 0,
        ai_requests: usage.ai_requests || 0,
        pages_processed: usage.pages_processed || 0,
        storage_bytes: usage.storage_bytes || 0,
        chat_messages: usage.chat_messages || 0,
      },
    });

  } catch (err) {
    console.error('User status error:', err);
    return respondError('Failed to fetch status', 500);
  }
};
