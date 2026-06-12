// netlify/functions/analyze.js
// Server-side Gemini AI analysis
'use strict';
const { respondOK, respondErr, respondOptions, supabase, verifyJWT, extractToken, rateLimit } = require('./_shared/utils');
const crypto = require('node:crypto');

const GEMINI_KEY   = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';

const PROMPT = (text, name, language = 'en') => `You are an expert document analyst for Norcanto AI. Analyze this document comprehensively.
Write every generated field in ${language === 'fr' ? 'natural professional French' : 'clear professional English'}.

Document: ${name}
Content:
${text}

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "executive_summary": "2-3 paragraph comprehensive summary",
  "plain_language": "Simple explanation anyone can understand (2-3 paragraphs)",
  "key_insights": ["insight 1","insight 2","insight 3","insight 4","insight 5"],
  "important_dates": [{"date":"date string","description":"what happens","urgency":"high|medium|low"}],
  "risks_detected": [{"risk":"description","severity":"high|medium|low","mitigation":"suggested action"}],
  "obligations": ["obligation 1","obligation 2","obligation 3"],
  "action_items": [{"action":"what to do","priority":"high|medium|low","deadline":"when or none"}],
  "recommended_questions": ["question 1","question 2","question 3","question 4"],
  "document_type": "Contract|Report|Research Paper|Policy|Technical Doc|Legal|Other",
  "complexity_score": 5,
  "reading_time_minutes": 10,
  "word_count": 1000
}`;

const callGemini = async (contents, retries = 2) => {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_NOT_CONFIGURED');
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 4096 } }),
      });
      if (res.status === 429) { if (i < retries) { await new Promise(r => setTimeout(r, 2000*(i+1))); continue; } throw new Error('AI rate limited. Please try again in a moment.'); }
      if (!res.ok) { const t = await res.text(); throw new Error(`AI error ${res.status}: ${t.slice(0,200)}`); }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch(err) { if (i === retries) throw err; await new Promise(r => setTimeout(r, 1000*(i+1))); }
  }
};

const parseJSON = (raw) => {
  const c = raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  try { return JSON.parse(c); } catch {
    const m = c.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Could not parse AI response');
  }
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondErr('Method not allowed', 405);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`analyze:${ip}`, 20, 60000)) return respondErr('Too many requests. Please wait a moment.', 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respondErr('Invalid request body'); }

  const { text, file_name, file_type, base64_data, pages = 1, language = 'en' } = body;
  if (!file_name) return respondErr('file_name is required');
  if (!text && !base64_data) return respondErr('text or base64_data is required');

  try {
    let raw;
    if (base64_data && (file_type === 'application/pdf' || file_name.endsWith('.pdf'))) {
      raw = await callGemini([{ role:'user', parts:[
        { inline_data: { mime_type:'application/pdf', data:base64_data } },
        { text: PROMPT('[PDF document — extract and analyze all text]', file_name, language) }
      ]}]);
    } else {
      raw = await callGemini([{ role:'user', parts:[{ text: PROMPT((text||'').slice(0,30000), file_name, language) }] }]);
    }

    const analysis = parseJSON(raw);

    // Optionally store if user is authenticated
    const token   = extractToken(event);
    const payload = token ? verifyJWT(token) : null;
    let documentId = null;
    if (payload?.sub) {
      documentId = crypto.randomUUID();
      await supabase.insert('document_analyses', {
        id: documentId,
        user_id: payload.sub,
        file_name,
        file_type: file_type || 'text/plain',
        pages_analyzed: pages,
        analysis: JSON.stringify(analysis),
        created_at: new Date().toISOString(),
      }).catch(console.error);
    }

    return respondOK({ analysis, document_id: documentId });
  } catch (err) {
    console.error('Analysis error:', err);
    if (err.message === 'GEMINI_API_NOT_CONFIGURED') return respondErr('AI service not configured. Contact support.', 503);
    return respondErr(err.message || 'Analysis failed. Please try again.', 500);
  }
};
