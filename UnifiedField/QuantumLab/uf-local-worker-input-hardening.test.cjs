'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkerServer } = require('./uf-local-worker.cjs');

test('rejects non-object execution inputs before verifier or executor run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-approval-input-'));
  const calls = { verifier: 0, executor: 0 };
  const worker = createWorkerServer({
    journalPath: path.join(dir, 'tasks.jsonl'),
    token: 'test-approval-token',
    approvalVerifier: async () => { calls.verifier++; return true; },
    executor: {
      capabilities: () => ({ actions: ['workspace.read_file'], requires_approval: true, arbitrary_shell: false }),
      execute: async () => { calls.executor++; return { ok: true }; }
    }
  });
  try {
    const address = await worker.listen(0);
    const base = 'http://127.0.0.1:' + address.port;
    for (const input of [null, [], 'README.md', 7, false]) {
      const response = await fetch(base + '/api/execute', {
        method: 'POST',
        headers: { authorization: 'Bearer test-approval-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          request_id: 'approval-input-test-1',
          action: 'workspace.read_file',
          input,
          approval: 'fixture-approval'
        })
      });
      assert.equal(response.status, 400, 'input=' + JSON.stringify(input));
      assert.equal((await response.json()).error, 'execution_input_must_be_object');
    }
    assert.equal(calls.verifier, 0, 'malformed input must not reach approval verification');
    assert.equal(calls.executor, 0, 'malformed input must not execute');
  } finally {
    await worker.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing execution input is normalized once to an empty object for verifier and executor', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-approval-input-'));
  let verifiedInput;
  let executedInput;
  const worker = createWorkerServer({
    journalPath: path.join(dir, 'tasks.jsonl'),
    token: 'test-approval-token',
    approvalVerifier: async context => { verifiedInput = context.input; return true; },
    executor: {
      capabilities: () => ({ actions: ['workspace.read_file'], requires_approval: true, arbitrary_shell: false }),
      execute: async (_action, input) => { executedInput = input; return { ok: true }; }
    }
  });
  try {
    const address = await worker.listen(0);
    const response = await fetch('http://127.0.0.1:' + address.port + '/api/execute', {
      method: 'POST',
      headers: { authorization: 'Bearer test-approval-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        request_id: 'approval-input-test-2',
        action: 'workspace.read_file',
        approval: 'fixture-approval'
      })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(verifiedInput, {});
    assert.deepEqual(executedInput, {});
    assert.strictEqual(verifiedInput, executedInput, 'verifier and executor must receive the identical input object');
    assert.notEqual(verifiedInput, undefined);
  } finally {
    await worker.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
