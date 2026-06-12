'use strict';
const crypto = require('node:crypto');
const { respondOK, respondErr, respondOptions, supabase, verifyJWT, extractToken } = require('./_shared/utils');

const authenticate = (event) => verifyJWT(extractToken(event));

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondOptions();
  const user = authenticate(event);
  if (!user?.sub) return respondErr('Unauthorized', 401);

  try {
    if (event.httpMethod === 'GET') {
      const docs = await supabase.select('document_analyses',
        `?user_id=eq.${user.sub}&select=*&order=created_at.desc`);
      return respondOK({ documents: docs || [] });
    }

    const body = JSON.parse(event.body || '{}');
    if (event.httpMethod === 'POST') {
      const incoming = Array.isArray(body.documents) ? body.documents.slice(0, 100) : [];
      const rows = incoming.filter((doc) => doc?.analysis && doc?.name).map((doc) => ({
        id: crypto.randomUUID(),
        user_id: user.sub,
        file_name: String(doc.name).slice(0, 250),
        title: String(doc.title || doc.name).slice(0, 250),
        file_type: doc.ext || 'unknown',
        analysis: doc.analysis,
        metadata: { notes: doc.notes || '', chatHistory: doc.chatHistory || [], completedActions: doc.completedActions || [] },
        favorite: Boolean(doc.favorite),
        archived: Boolean(doc.archived),
        created_at: doc.date || new Date().toISOString()
      }));
      if (rows.length) await supabase.insert('document_analyses', rows);
      return respondOK({ imported: rows.length });
    }

    const id = encodeURIComponent(body.id || '');
    if (!id) return respondErr('Document id required');
    if (event.httpMethod === 'PATCH') {
      const changes = {};
      ['archived', 'favorite', 'title', 'metadata'].forEach((key) => {
        if (body[key] !== undefined) changes[key] = body[key];
      });
      const updated = await supabase.update('document_analyses', changes, `?id=eq.${id}&user_id=eq.${user.sub}`);
      return respondOK({ document: updated?.[0] || null });
    }
    if (event.httpMethod === 'DELETE') {
      await supabase.delete('document_analyses', `?id=eq.${id}&user_id=eq.${user.sub}`);
      return respondOK({ deleted: true });
    }
    return respondErr('Method not allowed', 405);
  } catch (error) {
    console.error('Documents error:', error);
    return respondErr('Unable to update document history', 500);
  }
};
