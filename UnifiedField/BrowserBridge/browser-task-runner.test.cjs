'use strict';

const testRunner = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { validateTask, runTask } = require('./browser-task-runner.cjs');

testRunner('rejects query strings, wildcard hosts, and unlisted initial hosts before launching a browser', () => {
  const base = { id: 'validate-1', url: 'http://127.0.0.1:18896/fixture', allowedOrigins: ['http://127.0.0.1:18896'], actions: [], assertions: [] };
  assert.throws(() => validateTask({ ...base, url: base.url + '?token=secret' }), /without credentials, query strings, or fragments/);
  assert.throws(() => validateTask({ ...base, allowedOrigins: ['*'] }), /allowedOrigins entries/);
  assert.throws(() => validateTask({ ...base, allowedOrigins: ['http://localhost:18896'] }), /initial URL origin/);
});

testRunner('runs a local browser task and blocks a page resource outside the exact origin allowlist', { timeout: 30000 }, async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><title>HF Local Fixture</title></head><body><button id="go" onclick="document.getElementById(&quot;status&quot;).textContent=&quot;clicked&quot;">Run</button><p id="status">ready</p><img src="https://example.invalid/blocked.png" alt="blocked test resource"></body></html>');
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-browser-runner-test-'));
  const evidence = path.join(temp, 'evidence.jsonl');
  const oldEvidence = process.env.HF_BROWSER_EVIDENCE_PATH;
  process.env.HF_BROWSER_EVIDENCE_PATH = evidence;
  try {
    const result = await runTask({
      id: 'local-smoke-001',
      url: 'http://127.0.0.1:' + port + '/fixture',
      allowedOrigins: ['http://127.0.0.1:' + port],
      timeoutMs: 10000,
      actions: [{ type: 'click', selector: '#go' }],
      assertions: [
        { type: 'titleEquals', expected: 'HF Local Fixture' },
        { type: 'pathEquals', expected: '/fixture' },
        { type: 'textEquals', selector: '#status', expected: 'clicked' }
      ]
    });
    assert.equal(result.status, 'PASS', JSON.stringify(result));
    assert.equal(result.externalCallsAllowed, false);
    assert.ok(result.blockedOrigins.includes('https://example.invalid'), JSON.stringify(result.blockedOrigins));
    assert.equal(result.assertionResults.length, 3);
    assert.equal(fs.existsSync(evidence), true);
    const record = JSON.parse(fs.readFileSync(evidence, 'utf8').trim());
    assert.equal(record.taskId, 'local-smoke-001');
    assert.equal(record.status, 'PASS');
  } finally {
    if (oldEvidence === undefined) delete process.env.HF_BROWSER_EVIDENCE_PATH;
    else process.env.HF_BROWSER_EVIDENCE_PATH = oldEvidence;
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});