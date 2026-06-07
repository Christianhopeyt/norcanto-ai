// netlify/functions/camerpay-callback.js
// Called by CamerPay after payment (redirect from mobile)
const {
  respondOK, respondError, respondOptions,
  supabase, CAMERPAY_API_KEY, CAMERPAY_BASE_URL
} = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();

  const params = event.queryStringParameters || {};
  const { reference, status, transaction_id } = params;

  const siteUrl = process.env.URL || 'https://quickdocs.norcanto.com';

  // Find payment
  try {
    if (reference) {
      const payments = await supabase.select('payments', `?reference=eq.${reference}&select=*`);
      const payment = payments?.[0];

      if (payment && ['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes((status || '').toUpperCase())) {
        // Redirect to success page
        return {
          statusCode: 302,
          headers: {
            Location: `${siteUrl}/pages/payment-success.html?ref=${reference}&plan=${payment.plan_id}`,
          },
          body: '',
        };
      }
    }
  } catch (err) {
    console.error('Callback error:', err);
  }

  // Default redirect
  return {
    statusCode: 302,
    headers: {
      Location: `${siteUrl}/pages/payment-verify.html?ref=${reference || ''}&status=${status || 'pending'}`,
    },
    body: '',
  };
};
