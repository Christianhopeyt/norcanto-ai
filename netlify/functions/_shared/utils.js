// netlify/functions/_shared/utils.js
// Shared utilities - Norcanto AI (Free platform, no subscriptions)
'use strict';

const crypto = require('node:crypto');

// ─── CORS ─────────────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

const respond    = (code, body, extra = {}) => ({ statusCode: code, headers: { ...corsHeaders, ...extra }, body: JSON.stringify(body) });
const respondOK  = (data)    => respond(200, { success: true,  ...data });
const respondErr = (msg, c=400) => respond(c,  { success: false, error: msg });
const respondOptions = ()    => respond(200, {});

// ─── Supabase (fetch-based, no SDK needed) ─────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = {
  async _req(path, method = 'GET', body = null) {
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');
    const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      method,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  },
  select: (table, q='')    => supabase._req(`/${table}${q}`),
  insert: (table, data)    => supabase._req(`/${table}`, 'POST', data),
  update: (table, data, q) => supabase._req(`/${table}${q}`, 'PATCH', data),
};

// ─── JWT (minimal, no external deps) ──────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'norcanto-dev-secret-change-in-production-min32';

const b64url = (s) => Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const b64dec  = (s) => { const p = s + '==='.slice((s.length+3)%4); return Buffer.from(p.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString(); };

const signJWT = (payload) => {
  const h = b64url(JSON.stringify({ alg:'HS256', typ:'JWT' }));
  const b = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000) }));
  const s = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('binary'));
  return `${h}.${b}.${s}`;
};

const verifyJWT = (token) => {
  try {
    const [h, b, s] = token.split('.');
    const expected  = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('binary'));
    if (s !== expected) return null;
    const p = JSON.parse(b64dec(b));
    if (p.exp && p.exp < Math.floor(Date.now()/1000)) return null;
    return p;
  } catch { return null; }
};

const extractToken = (event) => (event.headers?.authorization || event.headers?.Authorization || '').replace('Bearer ','').trim();

// ─── Password ──────────────────────────────────────────────────────────────────
const hashPassword   = (pw) => crypto.createHmac('sha256', JWT_SECRET).update(pw).digest('hex');
const verifyPassword = (pw, hash) => hashPassword(pw) === hash;

// ─── Rate limiter ──────────────────────────────────────────────────────────────
const rlStore = new Map();
const rateLimit = (key, max=10, windowMs=60000) => {
  const now = Date.now();
  const e   = rlStore.get(key) || { count:0, start:now };
  if (now - e.start > windowMs) { e.count=0; e.start=now; }
  e.count++; rlStore.set(key, e);
  return e.count <= max;
};

// ─── Email (Mailgun, optional) ─────────────────────────────────────────────────
const sendEmail = async (to, subject, html) => {
  const key    = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN || 'norcanto.com';
  if (!key) { console.log(`[EMAIL] To:${to} | ${subject}`); return; }
  await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}` },
    body: new URLSearchParams({ from:`Norcanto AI <noreply@${domain}>`, to, subject, html }),
  });
};

module.exports = { respond, respondOK, respondErr, respondOptions, corsHeaders, supabase, signJWT, verifyJWT, extractToken, hashPassword, verifyPassword, rateLimit, sendEmail };
