// netlify/functions/camerpay-webhook.js
const {
  respondOK, respondError, respondOptions,
  supabase, validateCamerPaySignature, sendEmail, PLANS
} = require('./_shared/utils');
const crypto = require('node:crypto');

const activateSubscription = async (payment) => {
  const now = new Date();
  const periodEnd = payment.billing_cycle === 'annual'
    ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Check if existing subscription
  const subs = await supabase.select('subscriptions',
    `?user_id=eq.${payment.user_id}&order=created_at.desc&limit=1`
  );
  const existingSub = subs?.[0];

  if (existingSub) {
    // Update existing subscription
    await supabase.update('subscriptions', {
      plan_id: payment.plan_id,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      billing_cycle: payment.billing_cycle,
      last_payment_id: payment.id,
      updated_at: now.toISOString(),
    }, `?id=eq.${existingSub.id}`);
  } else {
    // Create new subscription
    await supabase.insert('subscriptions', {
      id: crypto.randomUUID(),
      user_id: payment.user_id,
      plan_id: payment.plan_id,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      billing_cycle: payment.billing_cycle,
      last_payment_id: payment.id,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }

  // Reset usage for new billing period
  const usages = await supabase.select('usage_tracking', `?user_id=eq.${payment.user_id}&order=created_at.desc&limit=1`);
  if (usages?.[0]) {
    await supabase.update('usage_tracking', {
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
      docs_uploaded: 0,
      ai_requests: 0,
      pages_processed: 0,
      chat_messages: 0,
      updated_at: now.toISOString(),
    }, `?user_id=eq.${payment.user_id}`);
  } else {
    await supabase.insert('usage_tracking', {
      id: crypto.randomUUID(),
      user_id: payment.user_id,
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
      docs_uploaded: 0,
      ai_requests: 0,
      pages_processed: 0,
      storage_bytes: 0,
      chat_messages: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondError('Method not allowed', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respondError('Invalid JSON'); }

  // Validate CamerPay signature
  const signature = event.headers['x-camerpay-signature'] || event.headers['x-signature'] || '';
  const SECRET = process.env.CAMERPAY_WEBHOOK_SECRET || process.env.CAMERPAY_SECRET_KEY || '';

  if (SECRET && signature) {
    try {
      const computedSig = require('node:crypto')
        .createHmac('sha256', SECRET)
        .update(event.body)
        .digest('hex');
      const sigBuffer = Buffer.from(signature.replace('sha256=', ''));
      const computedBuffer = Buffer.from(computedSig);
      if (sigBuffer.length !== computedBuffer.length || !require('node:crypto').timingSafeEqual(sigBuffer, computedBuffer)) {
        console.warn('Webhook signature mismatch');
        return respondError('Invalid signature', 401);
      }
    } catch (sigErr) {
      console.warn('Signature validation error:', sigErr.message);
      // In sandbox mode, allow through
      if (process.env.CAMERPAY_API_KEY && process.env.CAMERPAY_API_KEY !== 'sandbox') {
        return respondError('Signature validation failed', 401);
      }
    }
  }

  const { event: eventType, reference, transaction_id, status, metadata } = body;
  console.log('CamerPay webhook:', eventType, reference, status);

  // Log the event
  await supabase.insert('payment_events', {
    id: crypto.randomUUID(),
    provider: 'camerpay',
    event_type: eventType || status || 'unknown',
    reference,
    transaction_id,
    payload: JSON.stringify(body),
    created_at: new Date().toISOString(),
  }).catch(console.error);

  try {
    // Find the payment record
    const payments = await supabase.select('payments', `?reference=eq.${reference}&select=*`);
    const payment = payments?.[0];

    if (!payment) {
      console.warn('Payment not found for reference:', reference);
      return respondOK({ received: true, warning: 'Payment record not found' });
    }

    const isSuccess = ['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'success', 'successful', 'completed'].includes(status || eventType);
    const isFailed = ['FAILED', 'CANCELLED', 'EXPIRED', 'failed', 'cancelled', 'expired'].includes(status || eventType);

    if (isSuccess) {
      // Update payment to succeeded
      await supabase.update('payments', {
        status: 'succeeded',
        provider_transaction_id: transaction_id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, `?id=eq.${payment.id}`);

      // Activate subscription
      await activateSubscription(payment);

      // Send confirmation email
      const users = await supabase.select('users', `?id=eq.${payment.user_id}&select=email,name`);
      const user = users?.[0];
      if (user) {
        const plan = PLANS[payment.plan_id];
        await sendEmail(user.email, `Norcanto AI ${plan?.name} - Payment Confirmed`, `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2>Payment Confirmed</h2>
            <p>Hello ${user.name},</p>
            <p>Your payment of <strong>${(payment.amount / 100).toFixed(2)} XAF</strong> for Norcanto AI <strong>${plan?.name}</strong> has been confirmed.</p>
            <p>Your subscription is now active.</p>
            <a href="https://quickdocs.norcanto.com/pages/app.html" style="display:inline-block;background:#F5F5F0;color:#0A0A0B;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">Open Norcanto AI</a>
            <p style="margin-top:24px;color:#666;font-size:13px;">Reference: ${payment.reference}</p>
          </div>
        `);
      }
    } else if (isFailed) {
      await supabase.update('payments', {
        status: 'failed',
        failure_reason: body.message || body.error || 'Payment was not completed',
        updated_at: new Date().toISOString(),
      }, `?id=eq.${payment.id}`);

      // Send failure email
      const users = await supabase.select('users', `?id=eq.${payment.user_id}&select=email,name`);
      const user = users?.[0];
      if (user) {
        await sendEmail(user.email, 'Norcanto AI - Payment Not Completed', `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2>Payment Not Completed</h2>
            <p>Hello ${user.name},</p>
            <p>Your recent payment for Norcanto AI was not completed. No charge was made.</p>
            <p>Reason: ${body.message || 'Payment was cancelled or timed out'}</p>
            <a href="https://quickdocs.norcanto.com/pages/pricing.html" style="display:inline-block;background:#F5F5F0;color:#0A0A0B;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">Try Again</a>
          </div>
        `);
      }
    }

    return respondOK({ received: true, status: isSuccess ? 'activated' : isFailed ? 'failed' : 'pending' });

  } catch (err) {
    console.error('Webhook processing error:', err);
    // Always return 200 to CamerPay to prevent retries for internal errors
    return respondOK({ received: true, error: 'Internal processing error' });
  }
};
