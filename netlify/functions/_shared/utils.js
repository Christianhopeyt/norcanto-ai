// netlify/functions/_shared/utils.js
// Shared utilities across all serverless functions
// Uses Node.js built-in modules only — no external dependencies needed

const crypto = require('node:crypto');

// ─── CORS Headers ──────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

const respond = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { ...corsHeaders, ...extraHeaders },
  body: JSON.stringify(body),
});

const respondOK = (data) => respond(200, { success: true, ...data });
const respondError = (msg, code = 400) => respond(code, { success: false, error: msg });
const respondOptions = () => respond(200, {});

// ─── Supabase Client (lightweight fetch-based) ────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = {
  async query(path, method = 'GET', body = null) {
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');
    const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      method,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : 'return=representation',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase error ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  },

  async select(table, query = '') {
    return this.query(`/${table}${query}`);
  },

  async insert(table, data) {
    return this.query(`/${table}`, 'POST', data);
  },

  async update(table, data, query) {
    return this.query(`/${table}${query}`, 'PATCH', data);
  },

  async upsert(table, data, onConflict = '') {
    const path = `/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`;
    const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(data),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase upsert error ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  },
};

// ─── KV Storage (Netlify Blobs as lightweight KV) ─────────────────────────────
// For environments without Supabase, use in-memory + Netlify Blobs
// In production, replace with Supabase calls

// ─── JWT (minimal implementation for session tokens) ─────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'quickdocs-dev-secret-change-in-production';

const base64UrlEncode = (str) =>
  Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const base64UrlDecode = (str) => {
  const padded = str + '==='.slice((str.length + 3) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
};

const signJWT = (payload) => {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('binary')
  );
  return `${header}.${body}.${sig}`;
};

const verifyJWT = (token) => {
  try {
    const [header, body, sig] = token.split('.');
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('binary')
    );
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(base64UrlDecode(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

const extractToken = (event) => {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  return auth.replace('Bearer ', '').trim();
};

// ─── Password hashing ─────────────────────────────────────────────────────────
const hashPassword = (password) =>
  crypto.createHmac('sha256', JWT_SECRET).update(password).digest('hex');

const verifyPassword = (password, hash) => hashPassword(password) === hash;

// ─── CamerPay helpers ────────────────────────────────────────────────────────
const CAMERPAY_SECRET = process.env.CAMERPAY_SECRET_KEY || '';
const CAMERPAY_API_KEY = process.env.CAMERPAY_API_KEY || '';
const CAMERPAY_BASE_URL = 'https://app.camerpay.com/api/v1';

const validateCamerPaySignature = (payload, receivedSig) => {
  const computed = crypto
    .createHmac('sha256', CAMERPAY_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(receivedSig));
};

// ─── Rate limiter (in-memory per function invocation) ─────────────────────────
const rateLimitStore = new Map();
const rateLimit = (key, maxRequests = 10, windowMs = 60000) => {
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, start: now };
  if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
  entry.count++;
  rateLimitStore.set(key, entry);
  return entry.count <= maxRequests;
};

// ─── Plan definitions ─────────────────────────────────────────────────────────
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    docs_per_month: 5,
    pages_per_doc: 20,
    ai_requests_per_month: 20,
    storage_mb: 50,
    chat_messages_per_doc: 10,
    has_risk_detection: false,
    has_action_items: false,
    has_export: false,
    has_priority: false,
  },
  trial: {
    id: 'trial',
    name: 'Trial',
    price: 0,
    docs_per_month: 20,
    pages_per_doc: 100,
    ai_requests_per_month: 100,
    storage_mb: 200,
    chat_messages_per_doc: 30,
    has_risk_detection: true,
    has_action_items: true,
    has_export: true,
    has_priority: false,
    trial_days: 14,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 999, // cents
    price_display: '$9.99',
    docs_per_month: 100,
    pages_per_doc: 200,
    ai_requests_per_month: 500,
    storage_mb: 1024,
    chat_messages_per_doc: 100,
    has_risk_detection: true,
    has_action_items: true,
    has_export: true,
    has_priority: true,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 1999, // cents
    price_display: '$19.99',
    docs_per_month: -1, // unlimited
    pages_per_doc: 1000,
    ai_requests_per_month: -1,
    storage_mb: 10240,
    chat_messages_per_doc: -1,
    has_risk_detection: true,
    has_action_items: true,
    has_export: true,
    has_priority: true,
    has_multi_doc: true,
    has_advanced_chat: true,
  },
};

const getPlanLimits = (planId) => PLANS[planId] || PLANS.free;

// ─── Email helpers (via Netlify environment + fetch to email API) ─────────────
const sendEmail = async (to, subject, htmlBody) => {
  // Uses Mailgun or SendGrid if configured, otherwise logs
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'norcanto.com';

  if (!MAILGUN_API_KEY) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    return;
  }

  const formData = new URLSearchParams({
    from: `Norcanto AI <noreply@${MAILGUN_DOMAIN}>`,
    to,
    subject,
    html: htmlBody,
  });

  await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}`,
    },
    body: formData,
  });
};

module.exports = {
  respond,
  respondOK,
  respondError,
  respondOptions,
  corsHeaders,
  supabase,
  signJWT,
  verifyJWT,
  extractToken,
  hashPassword,
  verifyPassword,
  validateCamerPaySignature,
  CAMERPAY_SECRET,
  CAMERPAY_API_KEY,
  CAMERPAY_BASE_URL,
  rateLimit,
  PLANS,
  getPlanLimits,
  sendEmail,
};
