// Rose Terminal: optional Cloudflare Worker proxy
// Keeps your Gemini API key on the server so visitors can chat without their own key.
//
// Setup (free Cloudflare account):
//   1. npm create cloudflare@latest rose-proxy   (choose "Hello World" Worker)
//   2. Replace src/index.js with this file
//   3. npx wrangler secret put GEMINI_API_KEY      (paste your AI Studio key)
//   4. In wrangler config add:  [vars]  ALLOWED_ORIGIN = "https://<your-username>.github.io"
//   5. npx wrangler deploy  -> copy the URL into CONFIG.PROXY_URL in index.html
//
// Only Flash models are allowed, so a stranger can't burn your quota on bigger models.
// Keep billing OFF on the Google project behind this key: then the worst case is
// hitting the free daily limit, never a bill.

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {status, headers: {...headers, 'Content-Type': 'application/json'}});
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const originOk = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk && origin ? origin : (allowed[0] || '*'),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, {status: originOk ? 204 : 403, headers: cors});
    if (!originOk) return json({error: {message: 'Origin not allowed'}}, 403, cors);
    if (request.method !== 'POST') return json({error: {message: 'Use POST'}}, 405, cors);
    if (!env.GEMINI_API_KEY) return json({error: {message: 'Server has no GEMINI_API_KEY secret'}}, 500, cors);

    let body;
    try { body = await request.json(); } catch { return json({error: {message: 'Bad JSON'}}, 400, cors); }

    const model = String(body.model || env.MODEL || 'gemini-2.5-flash');
    delete body.model;
    if (!/^gemini-[\w.-]+$/.test(model) || !model.includes('flash')) {
      return json({error: {message: 'Only Gemini Flash models are allowed on this demo'}}, 400, cors);
    }
    if (JSON.stringify(body).length > 60000) return json({error: {message: 'Request too large'}}, 413, cors);

    const upstream = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
      body: JSON.stringify(body)
    });
    return new Response(upstream.body, {status: upstream.status, headers: {...cors, 'Content-Type': 'application/json'}});
  }
};
