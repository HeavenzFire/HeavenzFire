'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkerServer } = require('./uf-local-worker.cjs');
const { publishWorkerResultsToJournal } = require('./uf-model-worker-journal-publisher.cjs');

function artifact(file = 'worker-smoke-test.json') {
  return {
    file,
    results: [
      { model: 'qwen2.5:0.5b', ok: true, response: 'untrusted draft' },
      { model: 'llama3.2:1b', ok: false, error: 'model unavailable' }
    ]
  };
}
function okResponse() {
  return { ok: true, status: 201, json: async () => ({ ok: true, accepted: true }) };
}

test('missing bearer token blocks publication without a network call', async () => {
  let calls = 0;
  const result = await publishWorkerResultsToJournal(artifact(), {
    token: '',
    fetchImpl: async () => { calls++; return okResponse(); }
  });
  assert.equal(result.state, 'blocked');
  assert.equal(result.published, 0);
  assert.equal(calls, 0);
});

test('external, non-HTTP, and credential-bearing journal URLs are rejected before sending a token', async () => {
  for (const baseUrl of [
    'https://example.com',
    'http://192.168.1.2:8798',
    'http://127.0.0.1.evil.example',
    'http://user:pass@127.0.0.1:8798',
    'http://127.0.0.1:8798/?forward=1'
  ]) {
    let calls = 0;
    const result = await publishWorkerResultsToJournal(artifact(), {
      token: 'test-token',
      baseUrl,
      fetchImpl: async () => { calls++; return okResponse(); }
    });
    assert.equal(result.state, 'blocked', baseUrl);
    assert.equal(calls, 0, baseUrl);
  }
});

test('journal handoff sends metadata-only tasks with stable idempotency keys', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options, payload: JSON.parse(options.body) });
    return okResponse();
  };
  const first = await publishWorkerResultsToJournal(artifact(), {
    token: 'test-token',
    fetchImpl
  });
  const second = await publishWorkerResultsToJournal(artifact(), {
    token: 'test-token',
    fetchImpl
  });
  assert.equal(first.state, 'published');
  assert.equal(first.published, 2);
  assert.equal(first.failed, 0);
  assert.equal(second.published, 2);
  assert.equal(requests.length, 4);
  assert.equal(requests[0].url, 'http://127.0.0.1:8798/api/tasks');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(requests[0].payload.task.idempotency_key, requests[2].payload.task.idempotency_key);
  assert.equal(requests[0].payload.task.task_id, requests[2].payload.task.task_id);
  assert.deepEqual(requests[0].payload.task.scope, ['local-artifact-review', 'independent-verification']);
  assert.deepEqual(requests[0].payload.task.evidence_refs, ['worker-smoke-test.json']);
  for (const request of requests) {
    assert.equal(Object.hasOwn(request.payload.task, 'command'), false);
    assert.equal(Object.hasOwn(request.payload.task, 'shell'), false);
    assert.equal(Object.hasOwn(request.payload.task, 'script'), false);
  }
});

test('partial journal failures are reported while later model records continue', async () => {
  let calls = 0;
  const result = await publishWorkerResultsToJournal(artifact(), {
    token: 'test-token',
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503, json: async () => ({ ok: false, error: 'journal_busy' }) };
      return okResponse();
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.state, 'partial');
  assert.equal(result.published, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.errors, [{ model: 'qwen2.5:0.5b', error: 'journal_busy' }]);
});


test('publisher integrates with the real loopback journal and duplicate publication stays idempotent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-journal-publisher-'));
  const token = 'unit-test-only-token';
  const worker = createWorkerServer({ journalPath: path.join(dir, 'queue.jsonl'), token });
  const address = await worker.listen(0);
  const baseUrl = 'http://127.0.0.1:' + address.port;
  try {
    const first = await publishWorkerResultsToJournal(artifact(), { token, baseUrl });
    const second = await publishWorkerResultsToJournal(artifact(), { token, baseUrl });
    assert.equal(first.state, 'published');
    assert.equal(first.published, 2);
    assert.equal(second.state, 'published');
    assert.equal(second.published, 2);

    const response = await fetch(baseUrl + '/api/tasks', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
    });
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    assert.equal(snapshot.tasks.length, 2);
    assert.ok(snapshot.tasks.every(task => task.status === 'QUEUED'));
    assert.ok(snapshot.tasks.every(task => task.scope.includes('independent-verification')));
    assert.ok(snapshot.tasks.every(task => !Object.hasOwn(task, 'command') && !Object.hasOwn(task, 'script')));
    assert.equal(snapshot.corruptLines.length, 0);
  } finally {
    await worker.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid artifact paths are rejected to keep journal references bounded', async () => {
  let calls = 0;
  const result = await publishWorkerResultsToJournal(artifact('../outside.json'), {
    token: 'test-token',
    fetchImpl: async () => { calls++; return okResponse(); }
  });
  assert.equal(result.state, 'blocked');
  assert.equal(calls, 0);
});
