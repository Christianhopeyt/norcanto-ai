// netlify/functions/usage-track.js
const {
  respondOK, respondError, respondOptions,
  supabase, verifyJWT, extractToken, rateLimit
} = require('./_shared/utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondError('Method not allowed', 405);

  const token = extractToken(event);
  if (!token) return respondError('Unauthorized', 401);
  const payload = verifyJWT(token);
  if (!payload) return respondError('Invalid session', 401);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`usage:${ip}`, 30, 60000)) return respondError('Too many requests', 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respondError('Invalid JSON'); }

  const { type, value = 1 } = body;
  const validTypes = ['docs_uploaded', 'ai_requests', 'pages_processed', 'chat_messages', 'storage_bytes'];
  if (!validTypes.includes(type)) return respondError('Invalid usage type');

  try {
    const usages = await supabase.select('usage_tracking', `?user_id=eq.${payload.sub}&order=created_at.desc&limit=1`);
    const usage = usages?.[0];

    if (usage) {
      const current = usage[type] || 0;
      await supabase.update('usage_tracking',
        { [type]: current + value, updated_at: new Date().toISOString() },
        `?user_id=eq.${payload.sub}`
      );
    }

    return respondOK({ tracked: true, type, value });
  } catch (err) {
    console.error('Usage track error:', err);
    return respondError('Failed to track usage', 500);
  }
};
