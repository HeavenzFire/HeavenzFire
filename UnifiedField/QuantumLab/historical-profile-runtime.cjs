'use strict';

/**
 * Deterministic, local-first historical reasoning profiles.
 *
 * These are historically informed role prompts, not replicas of the people,
 * independent neural networks, or claims of consciousness. One model is used
 * for every profile. Each profile receives a separate in-process memory store.
 */

const PROFILES = Object.freeze({
  hypatia: Object.freeze({
    name: 'Hypatia of Alexandria',
    dates: 'c. 350–415',
    lens: 'mathematical clarity, teaching, careful definitions, and logical consistency',
  }),
  ibn_al_haytham: Object.freeze({
    name: 'Ibn al-Haytham',
    dates: 'c. 965–1040',
    lens: 'empirical observation, controlled tests, explicit hypotheses, and skeptical review',
  }),
  ada_lovelace: Object.freeze({
    name: 'Ada Lovelace',
    dates: '1815–1852',
    lens: 'formal procedures, symbolic representation, computational limits, and testable steps',
  }),
  leonardo: Object.freeze({
    name: 'Leonardo da Vinci',
    dates: '1452–1519',
    lens: 'systems observation, prototypes, mechanisms, and cross-domain design',
  }),
  einstein: Object.freeze({
    name: 'Albert Einstein',
    dates: '1879–1955',
    lens: 'assumptions, invariants, thought experiments, and physical consistency',
  }),
  tesla: Object.freeze({
    name: 'Nikola Tesla',
    dates: '1856–1943',
    lens: 'electrical systems, iterative experiments, mechanisms, and engineering constraints',
  }),
  confucius: Object.freeze({
    name: 'Confucius',
    dates: '551–479 BCE (traditional dates)',
    lens: 'practical wisdom, responsibility, social consequences, and disciplined conduct',
  }),
  mary_shelley: Object.freeze({
    name: 'Mary Shelley',
    dates: '1797–1851',
    lens: 'systems consequences, responsibility for created technology, and failure scenarios',
  }),
});

const DEFAULT_BASE_URL = 'http://127.0.0.1:11800/v1';
const MAX_MESSAGE_CHARS = 4000;
const MAX_MEMORY_TURNS = 20;

class LocalInferenceError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'LocalInferenceError';
    this.code = details.code || 'LOCAL_INFERENCE_FAILED';
    this.httpStatus = details.httpStatus || 502;
    this.retryable = Boolean(details.retryable);
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value || DEFAULT_BASE_URL);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new TypeError('Inference base URL must use HTTP loopback only.');
  }
  return url.toString().replace(/\/$/, '');
}

function buildSystemPrompt(profile) {
  return [
    'You are a historically informed reasoning profile, not the historical person.',
    'Do not claim to be, resurrect, channel, or possess the memories of the historical person.',
    'You are one role prompt routed through one shared local language model.',
    'Answer the current request directly. Preserve the user’s stated project and constraints.',
    'Do not invent a project, tool, measurement, file change, or test result.',
    'For engineering recommendations, provide: next step, failure mode, measurable acceptance test.',
    'If the request is ambiguous, state the specific uncertainty instead of filling space with generic exposition.',
    'Separate observed facts, assumptions, and recommendations. Be concise and operational.',
    'Historical reasoning lens: ' + profile.lens + '.',
  ].join('\n');
}

function createHistoricalRuntime(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const model = String(options.model || 'heavenzfire-qwen-0.5b').trim();
  if (!model || model.length > 120) throw new TypeError('A valid local model identifier is required.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 45000, 120000));
  const memory = new Map();

  function getProfile(profileId) {
    const profile = PROFILES[String(profileId || '')];
    if (!profile) throw new TypeError('Unknown reasoning profile: ' + String(profileId));
    return profile;
  }

  function getHistory(profileId) {
    if (!memory.has(profileId)) memory.set(profileId, []);
    return memory.get(profileId);
  }

  function resetMemory(profileId) {
    getProfile(profileId);
    memory.set(profileId, []);
    return { profileId, turns: 0, reset: true };
  }

  async function respond(input = {}) {
    const profileId = String(input.profileId || '');
    const profile = getProfile(profileId);
    const prompt = String(input.message || '').trim();
    if (!prompt || prompt.length > MAX_MESSAGE_CHARS) {
      throw new TypeError('Message must contain 1–4000 characters.');
    }

    const history = getHistory(profileId);
    const messages = [
      { role: 'system', content: buildSystemPrompt(profile) },
      ...history.slice(-MAX_MEMORY_TURNS * 2).map(turn => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: prompt },
    ];

    let response;
    try {
      response = await fetchImpl(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          temperature: 0,
          top_p: 1,
          seed: 0,
          max_tokens: 220,
        }),
      });
    } catch (error) {
      const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new LocalInferenceError(
        timedOut ? 'Local inference timed out.' : 'Cannot connect to the local inference gateway.',
        { code: timedOut ? 'LOCAL_INFERENCE_TIMEOUT' : 'LOCAL_GATEWAY_UNREACHABLE', httpStatus: 503, retryable: true },
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new LocalInferenceError('Local gateway returned invalid JSON.', {
        code: 'LOCAL_GATEWAY_INVALID_JSON', httpStatus: 502, retryable: false,
      });
    }

    if (!response.ok) {
      const detail = String((data && (data.error && (data.error.message || data.error) || data.message)) || 'No error detail supplied').slice(0, 300);
      throw new LocalInferenceError(
        'Local inference returned HTTP ' + response.status + ': ' + detail,
        { code: 'LOCAL_INFERENCE_HTTP_ERROR', httpStatus: 502, retryable: response.status >= 500 },
      );
    }

    const answer = String(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    if (!answer) {
      throw new LocalInferenceError('Local model returned an empty response.', {
        code: 'LOCAL_INFERENCE_EMPTY_RESPONSE', httpStatus: 502, retryable: false,
      });
    }

    history.push({ role: 'user', content: prompt }, { role: 'assistant', content: answer });
    if (history.length > MAX_MEMORY_TURNS * 2) history.splice(0, history.length - MAX_MEMORY_TURNS * 2);

    return {
      ok: true,
      profileId,
      profile: profile.name,
      model,
      answer,
      turns: history.filter(turn => turn.role === 'user').length,
      deterministicSettings: { temperature: 0, top_p: 1, seed: 0 },
      memoryScope: profileId,
    };
  }

  return Object.freeze({ respond, resetMemory, getProfile, baseUrl, model });
}

module.exports = { PROFILES, LocalInferenceError, buildSystemPrompt, createHistoricalRuntime };
