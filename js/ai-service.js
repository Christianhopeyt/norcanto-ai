/* Norcanto AI - AI Service (Gemini API) */
'use strict';

// =====================
// Config - stored in sessionStorage (user provides their own key)
// =====================
const AI_CONFIG = {
  model: 'gemini-1.5-flash-latest',
  apiBase: 'https://generativelanguage.googleapis.com/v1beta/models',
};

const getApiKey = () => sessionStorage.getItem('qd_gemini_key') || '';

// =====================
// Document Analysis
// =====================
const ANALYSIS_PROMPT = (docText, docName) => `
You are an expert document analyst. Analyze the following document and provide a comprehensive intelligence report.

Document Name: ${docName}

Document Content:
${docText}

Provide analysis in the following JSON structure (respond ONLY with valid JSON, no markdown):
{
  "executive_summary": "2-3 paragraph comprehensive summary",
  "plain_language": "Simple explanation a non-expert can understand",
  "key_insights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"],
  "important_dates": [{"date": "date string", "description": "what happens on this date", "urgency": "high|medium|low"}],
  "risks_detected": [{"risk": "risk description", "severity": "high|medium|low", "mitigation": "suggested action"}],
  "obligations": ["obligation 1", "obligation 2", "obligation 3"],
  "action_items": [{"action": "what to do", "priority": "high|medium|low", "deadline": "when or 'No specific deadline'"}],
  "recommended_questions": ["question 1", "question 2", "question 3", "question 4"],
  "document_type": "Contract|Report|Research Paper|Policy|Technical Doc|Legal|Other",
  "complexity_score": 1-10,
  "reading_time_minutes": number
}
`;

const CHAT_SYSTEM_PROMPT = (docText, docName) => `
You are an intelligent document assistant for QuickDocs. You have analyzed the following document and help users understand it.

Document: ${docName}

Content:
${docText}

Guidelines:
- Answer questions clearly and concisely
- Always reference specific sections when possible
- Use plain language
- If something is not in the document, say so clearly
- Format important information with structure
- Keep responses focused and actionable
`;

// =====================
// Call Gemini API
// =====================
const callGemini = async (prompt, systemInstruction = null) => {
  const key = getApiKey();
  if (!key) throw new Error('API_KEY_MISSING');

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      topP: 0.8,
      maxOutputTokens: 4096,
    }
  };

  if (systemInstruction) {
    body.system_instruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(`${AI_CONFIG.apiBase}/${AI_CONFIG.model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error: ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

// =====================
// Analyze Document
// =====================
const analyzeDocument = async (text, fileName) => {
  const truncated = text.slice(0, 30000); // Stay within context limits
  const prompt = ANALYSIS_PROMPT(truncated, fileName);
  const raw = await callGemini(prompt);

  // Parse JSON response
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Fallback parsing
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse analysis response');
  }
};

// =====================
// Chat with Document
// =====================
const chatWithDocument = async (question, docText, docName, history = []) => {
  const system = CHAT_SYSTEM_PROMPT(docText.slice(0, 25000), docName);
  const historyContext = history.slice(-6).map(m =>
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n');

  const fullPrompt = historyContext
    ? `Previous conversation:\n${historyContext}\n\nNew question: ${question}`
    : question;

  return await callGemini(fullPrompt, system);
};

// =====================
// Extract Text from File
// =====================
const extractTextFromFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // For PDF, we use a base64 approach with Gemini's file API
      reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        resolve({ type: 'pdf', base64, name: file.name });
      };
      reader.onerror = () => reject(new Error('Failed to read PDF'));
      reader.readAsDataURL(file);
    } else if (file.name.endsWith('.docx')) {
      // DOCX - basic extraction (in production would use mammoth.js)
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read DOCX'));
      reader.readAsText(file);
    } else {
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    }
  });
};

// =====================
// Analyze PDF with Gemini Vision
// =====================
const analyzePDF = async (base64Data, fileName) => {
  const key = getApiKey();
  if (!key) throw new Error('API_KEY_MISSING');

  const prompt = ANALYSIS_PROMPT('[PDF document - analyze based on visual content]', fileName) +
    '\nNote: This is a PDF document. Extract and analyze all text content visible in the document.';

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: base64Data } },
        { text: prompt }
      ]
    }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
  };

  const res = await fetch(`${AI_CONFIG.apiBase}/gemini-1.5-flash-latest:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error: ${res.status}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse analysis response');
  }
};

// =====================
// API Key Management
// =====================
const setApiKey = (key) => sessionStorage.setItem('qd_gemini_key', key.trim());
const clearApiKey = () => sessionStorage.removeItem('qd_gemini_key');
const hasApiKey = () => !!getApiKey();

// =====================
// Validate API Key
// =====================
const validateApiKey = async (key) => {
  try {
    const res = await fetch(`${AI_CONFIG.apiBase}/gemini-1.5-flash-latest:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 10 }
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

// Export
window.QDai = {
  analyzeDocument,
  analyzePDF,
  chatWithDocument,
  extractTextFromFile,
  setApiKey,
  clearApiKey,
  hasApiKey,
  validateApiKey,
  getApiKey,
};
