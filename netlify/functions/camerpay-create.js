// netlify/functions/camerpay-create.js
const {
  respondOK, respondError, respondOptions,
  supabase, verifyJWT, extractToken,
  CAMERPAY_API_KEY, CAMERPAY_BASE_URL, PLANS, rateLimit
} = require('./_shared/utils');
const crypto = require('node:crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondError('Method not allowed', 405);

  const token = extractToken(event);
  if (!token) return respondError('Unauthorized', 401);
  const payload = verifyJWT(token);
  if (!payload) return respondError('Invalid or expired session', 401);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`pay:${payload.sub}`, 5, 60000)) return respondError('Too many requests', 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respondError('Invalid JSON'); }

  const { plan_id, billing_cycle = 'monthly', phone } = body;
  if (!plan_id || !['premium', 'pro'].includes(plan_id)) return respondError('Invalid plan.');
  if (!phone) return respondError('Phone number is required for payment.');

  const plan = PLANS[plan_id];
  if (!plan) return respondError('Plan not found.');

  // Annual discount: 2 months free
  const amount = billing_cycle === 'annual' ? plan.price * 10 : plan.price;
  const amountDisplay = (amount / 100).toFixed(2);

  try {
    const paymentId = crypto.randomUUID();
    const reference = `QD-${paymentId.slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const siteUrl = process.env.URL || 'https://quickdocs.norcanto.com';

    // Log payment intent in DB
    await supabase.insert('payments', {
      id: paymentId,
      user_id: payload.sub,
      reference,
      plan_id,
      billing_cycle,
      amount,
      currency: 'XAF', // CamerPay default currency (CFA Franc)
      status: 'pending',
      provider: 'camerpay',
      phone,
      created_at: now,
      updated_at: now,
    });

    // Call CamerPay API to initiate payment
    const camerpayPayload = {
      amount: amountDisplay,
      currency: 'XAF',
      description: `Norcanto AI ${plan.name} - ${billing_cycle}`,
      external_reference: reference,
      phone_number: phone,
      callback_url: `${siteUrl}/api/payments/camerpay/callback`,
      webhook_url: `${siteUrl}/api/payments/camerpay/webhook`,
      metadata: JSON.stringify({ payment_id: paymentId, user_id: payload.sub, plan_id, billing_cycle }),
    };

    let camerpayResponse = null;
    let useSandbox = !CAMERPAY_API_KEY || CAMERPAY_API_KEY === 'sandbox';

    if (!useSandbox) {
      try {
        const cpRes = await fetch(`${CAMERPAY_BASE_URL}/collect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CAMERPAY_API_KEY}`,
            'X-Api-Key': CAMERPAY_API_KEY,
          },
          body: JSON.stringify(camerpayPayload),
        });
        camerpayResponse = await cpRes.json();

        if (!cpRes.ok) {
          console.error('CamerPay error:', camerpayResponse);
          return respondError(camerpayResponse?.message || 'Payment initiation failed. Please try again.', 400);
        }
      } catch (fetchErr) {
        console.error('CamerPay fetch error:', fetchErr);
        return respondError('Could not connect to payment provider. Please try again.', 503);
      }
    } else {
      // Sandbox mode - return mock response
      camerpayResponse = {
        status: 'PENDING',
        transaction_id: `SANDBOX-${reference}`,
        message: 'Payment initiated (sandbox mode)',
        ussd_code: `*126*1*1*${phone}#`,
      };
    }

    // Update payment with provider transaction ID
    await supabase.update('payments',
      { provider_transaction_id: camerpayResponse.transaction_id, status: 'initiated', updated_at: new Date().toISOString() },
      `?id=eq.${paymentId}`
    );

    return respondOK({
      payment_id: paymentId,
      reference,
      transaction_id: camerpayResponse.transaction_id,
      amount: amountDisplay,
      currency: 'XAF',
      plan: plan_id,
      status: 'initiated',
      ussd_code: camerpayResponse.ussd_code || null,
      message: camerpayResponse.message || 'Payment initiated. Please approve on your mobile phone.',
      sandbox: useSandbox,
    });

  } catch (err) {
    console.error('Payment create error:', err);
    return respondError('Payment initiation failed.', 500);
  }
};
