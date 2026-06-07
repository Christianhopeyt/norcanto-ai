// netlify/functions/camerpay-verify.js
// Poll payment status - called by frontend during checkout
const {
  respondOK, respondError, respondOptions,
  supabase, verifyJWT, extractToken,
  CAMERPAY_API_KEY, CAMERPAY_BASE_URL, rateLimit
} = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return respondError('Method not allowed', 405);

  const token = extractToken(event);
  if (!token) return respondError('Unauthorized', 401);
  const payload = verifyJWT(token);
  if (!payload) return respondError('Invalid session', 401);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`verify:${ip}`, 30, 60000)) return respondError('Too many requests', 429);

  const { payment_id, reference } = event.queryStringParameters || {};
  if (!payment_id && !reference) return respondError('payment_id or reference required');

  try {
    const query = payment_id
      ? `?id=eq.${payment_id}&user_id=eq.${payload.sub}&select=*`
      : `?reference=eq.${reference}&user_id=eq.${payload.sub}&select=*`;

    const payments = await supabase.select('payments', query);
    const payment = payments?.[0];

    if (!payment) return respondError('Payment not found', 404);

    let remoteStatus = payment.status;

    // Query CamerPay for real-time status if not yet succeeded
    if (!['succeeded', 'failed'].includes(payment.status)) {
      const isSandbox = !CAMERPAY_API_KEY || CAMERPAY_API_KEY === 'sandbox';

      if (!isSandbox && payment.provider_transaction_id) {
        try {
          const cpRes = await fetch(`${CAMERPAY_BASE_URL}/transactions/${payment.provider_transaction_id}`, {
            headers: { 'Authorization': `Bearer ${CAMERPAY_API_KEY}` },
          });
          if (cpRes.ok) {
            const cpData = await cpRes.json();
            const cpStatus = (cpData.status || '').toUpperCase();
            if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(cpStatus)) {
              remoteStatus = 'succeeded';
              // Trigger activation
              const { activateSubscription } = require('./camerpay-webhook');
              // Update payment
              await supabase.update('payments', {
                status: 'succeeded',
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, `?id=eq.${payment.id}`);
            } else if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(cpStatus)) {
              remoteStatus = 'failed';
              await supabase.update('payments', {
                status: 'failed',
                updated_at: new Date().toISOString(),
              }, `?id=eq.${payment.id}`);
            }
          }
        } catch (fetchErr) {
          console.error('CamerPay status check error:', fetchErr);
        }
      }
    }

    // Get current subscription
    const subs = await supabase.select('subscriptions', `?user_id=eq.${payload.sub}&order=created_at.desc&limit=1`);
    const sub = subs?.[0];

    return respondOK({
      payment_id: payment.id,
      reference: payment.reference,
      status: remoteStatus,
      plan: payment.plan_id,
      amount: payment.amount,
      currency: payment.currency,
      created_at: payment.created_at,
      subscription: sub ? {
        status: sub.status,
        plan: sub.plan_id,
        current_period_end: sub.current_period_end,
      } : null,
    });

  } catch (err) {
    console.error('Verify error:', err);
    return respondError('Verification failed', 500);
  }
};
