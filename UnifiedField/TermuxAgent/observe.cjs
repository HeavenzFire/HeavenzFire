'use strict';

const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');

const execFileAsync = promisify(execFile);
const USER_AGENT = 'HeavenzFire-Observer/0.1 (+local-first research agent)';
const MAX_HTML_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 40_000;
const MAX_SEARCH_RESULTS = 10;

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripMarkup(html) {
  const text = decodeEntities(String(html || '')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ');
  return text.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
}

function isPrivateIp(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const p = address.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224;
  }
  if (family === 6) {
    const a = address.toLowerCase();
    return a === '::' || a === '::1' || a.startsWith('fc') ||
      a.startsWith('fd') || /^fe[89ab]/.test(a) ||
      a.startsWith('::ffff:') && isPrivateIp(a.slice(7));
  }
  return true;
}

async function validatePublicUrl(input, lookup = dns.lookup) {
  let url;
  try { url = new URL(input); } catch { throw new Error('A valid absolute URL is required.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (url.username || url.password) throw new Error('URLs containing credentials are not allowed.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
    throw new Error('Local and private network destinations are blocked.');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private or reserved IP destinations are blocked.');
  } else {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some(record => isPrivateIp(record.address))) {
      throw new Error('The hostname resolves to a private or reserved address.');
    }
  }
  return url;
}

async function readBodyLimited(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const bytes = await readBodyLimited(response, maxBytes);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Page exceeds the configured response-size limit.');
      }
      chunks.push(part.value);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchBounded(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const lookup = options.lookup || dns.lookup;
  const timeoutMs = options.timeoutMs || 15000;
  const maxBytes = options.maxBytes || MAX_HTML_BYTES;
  let current = url;
  for (let hop = 0; hop <= 5; hop += 1) {
    const parsed = await validatePublicUrl(current, lookup);
    const response = await fetchImpl(parsed, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect response did not include a Location header.');
      if (hop === 5) throw new Error('Redirect limit exceeded.');
      current = new URL(location, parsed).toString();
      continue;
    }
    if (!response.ok) throw new Error('Page request failed with HTTP ' + response.status + '.');
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (type && !/(text\/html|application\/xhtml\+xml|text\/plain)/.test(type)) {
      throw new Error('Unsupported content type: ' + type.split(';')[0]);
    }
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('Page exceeds the configured response-size limit.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error('Page exceeds the configured response-size limit.');
    return { url: parsed.toString(), status: response.status, contentType: type, html: new TextDecoder().decode(bytes) };
  }
  throw new Error('Redirect limit exceeded.');
}

function parsePage(html, sourceUrl) {
  const title = decodeEntities((String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1])
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const descriptionMatch = String(html).match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
    String(html).match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i);
  const description = decodeEntities(descriptionMatch?.[1] || '').slice(0, 2000);
  const links = [];
  const linkRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRe.exec(String(html))) && links.length < 100) {
    try {
      const href = new URL(decodeEntities(match[1]), sourceUrl);
      if (['http:', 'https:'].includes(href.protocol)) {
        const text = stripMarkup(match[2]).slice(0, 240);
        if (text) links.push({ text, url: href.toString() });
      }
    } catch {}
  }
  const text = stripMarkup(html).slice(0, MAX_TEXT_CHARS);
  return {
    schema: 'heavenzfire.observation.v1',
    observed_at: new Date().toISOString(),
    source: { url: sourceUrl, kind: 'web-page' },
    title: title.slice(0, 500),
    description,
    text,
    links,
    content_sha256: crypto.createHash('sha256').update(text).digest('hex'),
    truncated: stripMarkup(html).length > MAX_TEXT_CHARS,
    evidence_type: 'retrieved-html-text',
    visual_inspection: false
  };
}

function extractSearchResults(html, query) {
  const results = [];
  const re = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && results.length < MAX_SEARCH_RESULTS) {
    let href = decodeEntities(match[1]);
    try {
      const parsed = new URL(href, 'https://html.duckduckgo.com');
      const redirected = parsed.searchParams.get('uddg');
      if (redirected) href = decodeURIComponent(redirected);
      const target = new URL(href);
      if (!['http:', 'https:'].includes(target.protocol)) continue;
      const title = stripMarkup(match[2]).slice(0, 300);
      if (title) results.push({ title, url: target.toString() });
    } catch {}
  }
  return {
    schema: 'heavenzfire.search-observation.v1',
    observed_at: new Date().toISOString(),
    query,
    provider: 'DuckDuckGo HTML',
    results,
    evidence_type: 'search-result-list',
    visual_inspection: false
  };
}

async function searchWeb(query, options = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 500) {
    throw new Error('Search query must contain 1-500 characters.');
  }
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query.trim());
  const result = await fetchBounded(url, options);
  return extractSearchResults(result.html, query.trim());
}

async function observePage(input, options = {}) {
  const result = await fetchBounded(input, options);
  return parsePage(result.html, result.url);
}

function isYouTubeUrl(input) {
  try {
    const u = new URL(input);
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(u.hostname.toLowerCase());
  } catch { return false; }
}

async function observeYouTube(input, options = {}) {
  if (!isYouTubeUrl(input)) throw new Error('A YouTube video URL is required.');
  const binary = options.ytDlpPath || 'yt-dlp';
  const timeout = options.timeoutMs || 30000;
  const metadataRun = await execFileAsync(binary, [
    '--dump-single-json', '--skip-download', '--no-warnings', '--no-playlist', '--no-call-home', input
  ], { timeout, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  let metadata;
  try { metadata = JSON.parse(metadataRun.stdout); }
  catch { throw new Error('yt-dlp did not return valid video metadata.'); }

  const result = {
    schema: 'heavenzfire.observation.v1',
    observed_at: new Date().toISOString(),
    source: { url: input, kind: 'youtube-video' },
    video: {
      id: metadata.id || null,
      title: metadata.title || null,
      channel: metadata.channel || metadata.uploader || null,
      duration_seconds: Number.isFinite(metadata.duration) ? metadata.duration : null,
      upload_date: metadata.upload_date || null,
      view_count: Number.isFinite(metadata.view_count) ? metadata.view_count : null,
      description: String(metadata.description || '').slice(0, 5000),
      webpage_url: metadata.webpage_url || input
    },
    captions: null,
    evidence_type: 'youtube-metadata',
    visual_inspection: false
  };

  if (options.captions === true) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-youtube-captions-'));
    try {
      await execFileAsync(binary, [
        '--skip-download', '--no-warnings', '--no-playlist', '--no-call-home',
        '--write-subs', '--write-auto-subs', '--sub-langs', 'en,en-US',
        '--sub-format', 'vtt', '-o', path.join(dir, '%(id)s.%(ext)s'), input
      ], { timeout, maxBuffer: 1024 * 1024, windowsHide: true });
      const files = (await fs.readdir(dir)).filter(name => name.endsWith('.vtt')).slice(0, 2);
      if (files.length) {
        const contents = await fs.readFile(path.join(dir, files[0]), 'utf8');
        result.captions = {
          language_file: files[0],
          text: stripMarkup(contents.replace(/^\uFEFF/, '')).slice(0, 30000),
          truncated: contents.length > 30000
        };
        result.evidence_type = 'youtube-metadata-and-captions';
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  return result;
}

async function main(argv) {
  const [command, ...rest] = argv;
  let result;
  if (command === 'search') result = await searchWeb(rest.join(' '));
  else if (command === 'page') result = await observePage(rest[0]);
  else if (command === 'youtube') result = await observeYouTube(rest[0], { captions: rest.includes('--captions') });
  else {
    console.error('Usage: node observe.cjs search <query> | page <https-url> | youtube <youtube-url> [--captions]');
    process.exitCode = 2;
    return;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Observation failed: ' + String(error.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  decodeEntities, stripMarkup, isPrivateIp, validatePublicUrl, readBodyLimited, fetchBounded,
  parsePage, extractSearchResults, searchWeb, observePage, isYouTubeUrl, observeYouTube
};
