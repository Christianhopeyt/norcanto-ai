// netlify/functions/analyze.js
// Server-side Gemini AI analysis - users never see the API key
const {
  respondOK, respondError, respondOptions,
  supabase, verifyJWT, extractToken,
  getPlanLimits, rateLimit
} = require('./_shared/utils');
const crypto = require('node:crypto');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-1.5-flash-latest';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const ANALYSIS_PROMPT = (text, fileName) => `You are an expert document analyst. Analyze this document and provide a comprehensive intelligence report.

Document: ${fileName}

Content:
${text}

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "executive_summary": "2-3 paragraph comprehensive summary",
  "plain_language": "Simple explanation a non-expert can understand (2-3 paragraphs)",
  "key_insights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"],
  "important_dates": [{"date": "date string", "description": "what happens on this date", "urgency": "high|medium|low"}],
  "risks_detected": [{"risk": "risk description", "severity": "high|medium|low", "mitigation": "suggested action"}],
  "obligations": ["obligation 1", "obligation 2", "obligation 3"],
  "action_items": [{"action": "what to do", "priority": "high|medium|low", "deadline": "when or none"}],
  "recommended_questions": ["question 1", "question 2", "question 3", "question 4"],
  "document_type": "Contract|Report|Research Paper|Policy|Technical Doc|Legal|Other",
  "complexity_score": 5,
  "reading_time_minutes": 10,
  "word_count": 1000
}`;

const callGemini = async (contents, retries = 2) => {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_NOT_CONFIGURED');

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 4096 },
          safetySettings: [
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          ],
        }),
      });

      if (res.status === 429) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
        throw new Error('Rate limited by AI provider. Please try again in a moment.');
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI API error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
};

const parseAnalysisJSON = (raw) => {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse AI response');
  }
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  if (event.httpMethod !== 'POST') return respondError('Method not allowed', 405);

  const token = extractToken(event);
  if (!token) return respondError('Unauthorized - please sign in', 401);
  const payload = verifyJWT(token);
  if (!payload) return respondError('Invalid or expired session', 401);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(`analyze:${payload.sub}`, 10, 60000)) return respondError('Too many requests. Please wait a moment.', 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respondError('Invalid request body'); }

  const { text, file_name, file_type, base64_data, pages = 1 } = body;
  if (!file_name) return respondError('file_name is required');
  if (!text && !base64_data) return respondError('text or base64_data is required');

  // Check subscription + limits
  try {
    const subs = await supabase.select('subscriptions', `?user_id=eq.${payload.sub}&order=created_at.desc&limit=1`);
    const sub = subs?.[0];
    const now = new Date();

    let planId = 'free';
    if (sub?.status === 'trialing' && new Date(sub.trial_end) > now) planId = 'trial';
    else if (sub?.status === 'active' && new Date(sub.current_period_end) > now) planId = sub.plan_id;

    const limits = getPlanLimits(planId);

    // Check usage
    const usages = await supabase.select('usage_tracking', `?user_id=eq.${payload.sub}&order=created_at.desc&limit=1`);
    const usage = usages?.[0] || {};

    if (limits.ai_requests_per_month !== -1 && (usage.ai_requests || 0) >= limits.ai_requests_per_month) {
      return respondError('Monthly AI analysis limit reached. Please upgrade your plan.', 403);
    }
    if (limits.docs_per_month !== -1 && (usage.docs_uploaded || 0) >= limits.docs_per_month) {
      return respondError('Monthly document limit reached. Please upgrade your plan.', 403);
    }
    if (pages > limits.pages_per_doc) {
      return respondError(`Document exceeds page limit for your plan (${limits.pages_per_doc} pages max).`, 403);
    }

    // Call Gemini
    let rawResult;
    if (base64_data && file_type === 'application/pdf') {
      rawResult = await callGemini([{
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: base64_data } },
          { text: ANALYSIS_PROMPT('[PDF - analyze all text content]', file_name) }
        ]
      }]);
    } else {
      const truncatedText = (text || '').slice(0, 30000);
      rawResult = await callGemini([{
        role: 'user',
        parts: [{ text: ANALYSIS_PROMPT(truncatedText, file_name) }]
      }]);
    }

    const analysis = parseAnalysisJSON(rawResult);

    // Store analysis in DB
    const docId = crypto.randomUUID();
    await supabase.insert('document_analyses', {
      id: docId,
      user_id: payload.sub,
      file_name,
      file_type: file_type || 'text/plain',
      plan_at_analysis: planId,
      analysis: JSON.stringify(analysis),
      pages_analyzed: pages,
      created_at: new Date().toISOString(),
    }).catch(console.error);

    // Increment usage counters
    const newUsage = {
      ai_requests: (usage.ai_requests || 0) + 1,
      docs_uploaded: (usage.docs_uploaded || 0) + 1,
      pages_processed: (usage.pages_processed || 0) + pages,
      updated_at: new Date().toISOString(),
    };
    if (usage.id) {
      await supabase.update('usage_tracking', newUsage, `?user_id=eq.${payload.sub}`).catch(console.error);
    }

    // Apply plan restrictions to response
    const filteredAnalysis = { ...analysis };
    if (!limits.has_risk_detection) {
      filteredAnalysis.risks_detected = [{ risk: 'Upgrade to Premium to view risk detection', severity: 'locked', mitigation: '' }];
    }
    if (!limits.has_action_items) {
      filteredAnalysis.action_items = [{ action: 'Upgrade to Premium to view action items', priority: 'locked', deadline: '' }];
    }

    return respondOK({
      analysis: filteredAnalysis,
      document_id: docId,
      plan: planId,
      usage: {
        ai_requests: newUsage.ai_requests,
        docs_uploaded: newUsage.docs_uploaded,
        limit_ai: limits.ai_requests_per_month,
        limit_docs: limits.docs_per_month,
      },
    });

  } catch (err) {
    console.error('Analysis error:', err);
    if (err.message === 'GEMINI_API_NOT_CONFIGURED') {
      return respondError('AI service not configured. Contact support.', 503);
    }
    return respondError(err.message || 'Analysis failed. Please try again.', 500);
  }
};
