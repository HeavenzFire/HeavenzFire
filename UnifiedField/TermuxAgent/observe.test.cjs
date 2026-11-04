'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stripMarkup, isPrivateIp, validatePublicUrl, fetchBounded,
  parsePage, extractSearchResults, isYouTubeUrl
} = require('./observe.cjs');

test('stripMarkup removes scripts, styles, tags, and decodes entities', () => {
  assert.equal(stripMarkup('<h1>Hello&nbsp;world</h1><script>secret()</script><p>A &amp; B</p>'), 'Hello world\nA & B');
});

test('private and reserved IPv4/IPv6 addresses are rejected', () => {
  for (const ip of ['127.0.0.1', '10.0.0.2', '172.16.0.1', '192.168.1.2', '169.254.1.1', '::1', 'fc00::1', 'fe80::1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp('8.8.8.8'), false);
});

test('URL validation rejects non-http, credentials, local hosts, and private DNS answers', async () => {
  await assert.rejects(validatePublicUrl('file:///etc/passwd'), /HTTP/);
  await assert.rejects(validatePublicUrl('https://user:pass@example.com'), /credentials/);
  await assert.rejects(validatePublicUrl('http://localhost/'), /Local and private/);
  await assert.rejects(validatePublicUrl('https://rebind.example/', async () => [{ address: '127.0.0.1', family: 4 }]), /private or reserved/);
  const ok = await validatePublicUrl('https://example.com/', async () => [{ address: '93.184.216.34', family: 4 }]);
  assert.equal(ok.hostname, 'example.com');
});

test('bounded fetch rejects redirects to private destinations', async () => {
  const fetchImpl = async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
  await assert.rejects(fetchBounded('https://example.com/', {
    fetchImpl,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }]
  }), /Local and private|Private or reserved/);
});

test('bounded fetch enforces content size and parses a page', async () => {
  const html = '<html><head><title>Research &amp; Evidence</title><meta name="description" content="A source"></head><body><h1>Finding</h1><a href="/paper">Paper</a><script>bad()</script></body></html>';
  const fetchImpl = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  const result = await fetchBounded('https://example.com/', {
    fetchImpl,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }]
  });
  const page = parsePage(result.html, result.url);
  assert.equal(page.title, 'Research & Evidence');
  assert.equal(page.description, 'A source');
  assert.match(page.text, /Finding/);
  assert.doesNotMatch(page.text, /bad/);
  assert.equal(page.links[0].url, 'https://example.com/paper');
  assert.match(page.content_sha256, /^[a-f0-9]{64}$/);
});

test('search parser extracts result titles and destinations', () => {
  const html = '<a class="result__a" href="https://example.com/a">Example A</a><a class="result__a" href="https://example.org/b">Example B</a>';
  const result = extractSearchResults(html, 'test query');
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].title, 'Example A');
  assert.equal(result.results[1].url, 'https://example.org/b');
});

test('YouTube URL classifier accepts supported hosts only', () => {
  assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=abc123'), true);
  assert.equal(isYouTubeUrl('https://youtu.be/abc123'), true);
  assert.equal(isYouTubeUrl('https://example.com/watch?v=abc123'), false);
});

test('bounded fetch rejects response bodies without a readable stream', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    body: null
  });
  await assert.rejects(fetchBounded('https://example.com/', {
    fetchImpl,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }]
  }), /must expose a readable stream/);
});
