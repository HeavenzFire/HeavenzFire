'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const MAX_BODY_BYTES = Number(process.env.HF_MAX_BODY_BYTES || 1024 * 1024);
const REQUEST_TIMEOUT_MS = Number(process.env.HF_REQUEST_TIMEOUT_MS || 60000);
const DEFAULT_MODEL = process.env.HF_DEFAULT_MODEL || 'gemini-2.5-flash';

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Body must be valid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function authorized(req) {
  const configured = (process.env.HF_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (configured.length === 0) return false;
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  return configured.some(key => {
    const expected = Buffer.from(key);
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  });
}

function extractGeminiText(data) {
  return (data.candidates || []).flatMap(c => c.content?.parts || [])
    .map(p => p.text || '').join('');
}

async function callGemini(model, messages) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('Gemini provider is not configured'), { status: 503, code: 'provider_not_configured' });
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content) }]
  }));
  const system = messages.find(m => m.role === 'system');
  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: String(system.content) }] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error('Gemini provider request failed'), { status: response.status === 429 ? 429 : 502, code: 'provider_error' });
    return extractGeminiText(data);
  } finally {
    clearTimeout(timer);
  }
}

async function callOllama(model, messages) {
  const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal
    });
    if (!response.ok) throw Object.assign(new Error('Local model request failed'), { status: 502, code: 'provider_error' });
    const data = await response.json();
    return data.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(model, messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('OpenAI provider is not configured'), { status: 503, code: 'provider_not_configured' });
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(base + '/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: model || process.env.OPENAI_MODEL || 'gpt-6',
        input: messages.map(message => ({ role: message.role, content: message.content }))
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerCode = data.error && data.error.code ? String(data.error.code) : '';
      const detail = 'OpenAI Responses API request failed (HTTP ' + response.status + (providerCode ? ', ' + providerCode : '') + '). Check model access, API billing, and request limits.';
      throw Object.assign(new Error(detail), { status: response.status === 429 ? 429 : 502, code: 'provider_error' });
    }
    const output = data.output_text || (data.output || [])
      .flatMap(item => item.content || [])
      .filter(part => part.type === 'output_text')
      .map(part => part.text || '')
      .join('');
    if (!output) throw Object.assign(new Error('OpenAI Responses API returned no text output.'), { status: 502, code: 'provider_empty_response' });
    return output;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAICompatible(provider, model, messages) {
  const configs = {
    openai: { key: process.env.OPENAI_API_KEY, base: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', model: process.env.OPENAI_MODEL || 'gpt-4.1-mini' },
    mistral: { key: process.env.MISTRAL_API_KEY, base: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1', model: process.env.MISTRAL_MODEL || 'mistral-small-latest' },
    qwen: { key: process.env.QWEN_API_KEY, base: process.env.QWEN_BASE_URL, model: process.env.QWEN_MODEL || 'qwen-plus' },
    groq: { key: process.env.GROQ_API_KEY, base: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1', model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile' },
    openrouter: { key: process.env.OPENROUTER_API_KEY, base: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1', model: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini' },
    custom: { key: process.env.HF_CUSTOM_API_KEY, base: process.env.HF_CUSTOM_API_BASE_URL, model: process.env.HF_CUSTOM_MODEL }
  };
  const cfg = configs[provider];
  if (!cfg || !cfg.key || !cfg.base) throw Object.assign(new Error(provider + ' provider is not configured'), { status: 503, code: 'provider_not_configured' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(cfg.base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({ model: model || cfg.model, messages, stream: false }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(provider + ' provider request failed'), { status: response.status === 429 ? 429 : 502, code: 'provider_error' });
    return data.choices?.[0]?.message?.content || '';
  } finally { clearTimeout(timer); }
}

async function callAnthropic(model, messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(new Error('Anthropic provider is not configured'), { status: 503, code: 'provider_not_configured' });
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\\n');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
        max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 1024),
        ...(system ? { system } : {}),
        messages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error('Anthropic provider request failed'), { status: response.status === 429 ? 429 : 502, code: 'provider_error' });
    return (data.content || []).filter(p => p.type === 'text').map(p => p.text).join('\\n');
  } finally { clearTimeout(timer); }
}

function configuredProviders() {
  const list = [];
  if (process.env.GEMINI_API_KEY) list.push({ id: process.env.HF_DEFAULT_MODEL || DEFAULT_MODEL, provider: 'gemini' });
  list.push({ id: process.env.HF_LOCAL_MODEL || 'llama3.2:1b', provider: 'ollama' });
  const candidates = [
    ['openai', process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4.1-mini'],
    ['anthropic', process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'],
    ['mistral', process.env.MISTRAL_API_KEY, process.env.MISTRAL_MODEL || 'mistral-small-latest'],
    ['qwen', process.env.QWEN_API_KEY && process.env.QWEN_BASE_URL, process.env.QWEN_MODEL || 'qwen-plus'],
    ['groq', process.env.GROQ_API_KEY, process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'],
    ['openrouter', process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini'],
    ['custom', process.env.HF_CUSTOM_API_KEY && process.env.HF_CUSTOM_API_BASE_URL && process.env.HF_CUSTOM_MODEL, process.env.HF_CUSTOM_MODEL]
  ];
  for (const [provider, enabled, model] of candidates) if (enabled) list.push({ id: model, provider });
  return list;
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'heavenzfire-api',
        version: '0.1.0',
        authConfigured: (process.env.HF_API_KEYS || '').split(',').some(s => s.trim()),
        providers: {
          geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
          openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
          anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
          mistralConfigured: Boolean(process.env.MISTRAL_API_KEY),
          qwenConfigured: Boolean(process.env.QWEN_API_KEY && process.env.QWEN_BASE_URL),
          groqConfigured: Boolean(process.env.GROQ_API_KEY),
          openrouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
          customOpenAICompatibleConfigured: Boolean(process.env.HF_CUSTOM_API_KEY && process.env.HF_CUSTOM_API_BASE_URL && process.env.HF_CUSTOM_MODEL),
          ollamaConfigured: Boolean(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434')
        }
      });
    }
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      if (!authorized(req)) return json(res, 401, { error: { code: 'unauthorized', message: 'A valid Bearer API key is required.' } });
      return json(res, 200, { object: 'list', data: configuredProviders().map(m => ({ id: m.id, object: 'model', owned_by: m.provider })) });
    }
    if (req.method !== 'POST' || !['/v1/chat/completions', '/v1/generate'].includes(url.pathname)) {
      return json(res, 404, { error: { code: 'not_found', message: 'Route not found.' } });
    }
    if (!authorized(req)) return json(res, 401, { error: { code: 'unauthorized', message: 'A valid Bearer API key is required.' } });
    try {
      const input = await readJson(req);
      const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
      const messages = Array.isArray(input.messages) ? input.messages : (prompt ? [{ role: 'user', content: prompt }] : []);
      if (!messages.length || messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
        return json(res, 400, { error: { code: 'invalid_request', message: 'Provide a prompt or a non-empty messages array with supported roles and string content.' } });
      }
      if (messages.reduce((n, m) => n + m.content.length, 0) > 100000) {
        return json(res, 413, { error: { code: 'input_too_large', message: 'Combined message text exceeds 100000 characters.' } });
      }
      const knownProviders = ['gemini', 'ollama', 'openai', 'anthropic', 'mistral', 'qwen', 'groq', 'openrouter', 'custom'];
      let provider = knownProviders.includes(input.provider) ? input.provider : '';
      if (!provider) {
        const requestedModel = String(input.model || '');
        provider = requestedModel.startsWith('llama') ? 'ollama' : requestedModel.startsWith('claude') ? 'anthropic' : requestedModel.startsWith('mistral') ? 'mistral' : requestedModel.startsWith('qwen') ? 'qwen' : requestedModel.startsWith('gpt-') ? 'openai' : 'gemini';
      }
      const defaults = { gemini: DEFAULT_MODEL, ollama: process.env.HF_LOCAL_MODEL || 'llama3.2:1b', openai: process.env.OPENAI_MODEL || 'gpt-4.1-mini', anthropic: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', mistral: process.env.MISTRAL_MODEL || 'mistral-small-latest', qwen: process.env.QWEN_MODEL || 'qwen-plus', groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', openrouter: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini', custom: process.env.HF_CUSTOM_MODEL || '' };
      const model = String(input.model || defaults[provider]);
      let output;
      if (provider === 'ollama') output = await callOllama(model, messages);
      else if (provider === 'gemini') output = await callGemini(model, messages);
      else if (provider === 'anthropic') output = await callAnthropic(model, messages);
      else if (provider === 'openai') output = await callOpenAI(model, messages);
      else output = await callOpenAICompatible(provider, model, messages);
      if (url.pathname === '/v1/generate') return json(res, 200, { provider, model, text: output });
      return json(res, 200, {
        id: 'hf-' + crypto.randomUUID(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: output }, finish_reason: 'stop' }]
      });
    } catch (err) {
      const status = Number.isInteger(err.status) ? err.status : 502;
      return json(res, status, { error: { code: err.code || (err.name === 'AbortError' ? 'provider_timeout' : 'request_failed'), message: err.status ? err.message : 'Provider request failed.' } });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 18796);
  const host = process.env.HF_HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && process.env.HF_ALLOW_REMOTE_BIND !== 'true') {
    console.error('Refusing non-loopback bind. Set HF_ALLOW_REMOTE_BIND=true only behind authenticated TLS/reverse proxy.');
    process.exit(1);
  }
  const server = createServer();
  server.listen(port, host, () => console.log(`HeavenzFire API listening on http://${host}:${server.address().port}`));
}

module.exports = { createServer };
