'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createWorkerServer } = require('./uf-local-worker.cjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-worker-'));
  return { dir, journalPath: path.join(dir, 'tasks.jsonl'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function requestWithHost(base, host) {
  const url = new URL('/health', base);
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port: Number(url.port),
      path: '/health',
      headers: { Host: host }
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(body); } catch { data = null; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
  });
}

async function withWorker(options, fn) {
  const f = fixture();
  const worker = createWorkerServer({ journalPath: f.journalPath, ...options });
  const address = await worker.listen(0);
  const base = 'http://127.0.0.1:' + address.port;
  try { await fn(base); }
  finally { await worker.close(); f.cleanup(); }
}
const task = { task_id: 't1', objective: 'Inspect a proposed change', scope: ['github:read'], risk_class: 'LOW', idempotency_key: 'idem-1' };

test('binds loopback and reports explicit non-execution limitations', async () => {
  await withWorker({ token: 'test-token' }, async base => {
    const r = await fetch(base + '/health');
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.equal(data.bind, '127.0.0.1');
    assert.equal(data.execution.requires_approval, true);
    assert.equal(data.execution.approval_verifier_configured, false);
    assert.ok(data.limitations.includes('no-shell-execution'));
    assert.ok(data.limitations.includes('no-network-sync'));
  });
});
test('authenticated handshake negotiates protocol and returns worker identity', async () => {
  await withWorker({ token: 'handshake-token' }, async base => {
    const nonce = 'A'.repeat(32);
    const denied = await fetch(base + '/api/handshake', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ protocol_version: 1, client_nonce: nonce })
    });
    assert.equal(denied.status, 401);

    const mismatch = await fetch(base + '/api/handshake', {
      method: 'POST',
      headers: { authorization: 'Bearer handshake-token', 'content-type': 'application/json' },
      body: JSON.stringify({ protocol_version: 99, client_nonce: nonce })
    });
    assert.equal(mismatch.status, 426);
    assert.equal((await mismatch.json()).supported_protocol_version, 1);

    const accepted = await fetch(base + '/api/handshake', {
      method: 'POST',
      headers: { authorization: 'Bearer handshake-token', 'content-type': 'application/json' },
      body: JSON.stringify({ protocol_version: 1, client_nonce: nonce })
    });
    const data = await accepted.json();
    assert.equal(accepted.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.protocol_version, 1);
    assert.equal(data.client_nonce, nonce);
    assert.match(data.worker_instance_id, /^[a-f0-9]{32}$/);
    assert.ok(data.limitations.includes('no-network-sync'));
  });
});

test('handshake rejects malformed and replayed client nonces', async () => {
  await withWorker({ token: 'handshake-token' }, async base => {
    const sendHandshake = client_nonce => fetch(base + '/api/handshake', {
      method: 'POST',
      headers: { authorization: 'Bearer handshake-token', 'content-type': 'application/json' },
      body: JSON.stringify({ protocol_version: 1, client_nonce })
    });
    assert.equal((await sendHandshake('short')).status, 400);
    const nonce = 'B'.repeat(32);
    assert.equal((await sendHandshake(nonce)).status, 200);
    const replay = await sendHandshake(nonce);
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).error, 'client_nonce_replayed');
    const fresh = await sendHandshake('C'.repeat(32));
    assert.equal(fresh.status, 200);
    assert.equal((await fresh.json()).worker_instance_id, (await (await sendHandshake('D'.repeat(32))).json()).worker_instance_id);
  });
});

test('task list is readable but enqueue requires bearer authentication', async () => {
  await withWorker({ token: 'test-token' }, async base => {
    const denied = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task }) });
    assert.equal(denied.status, 401);
    const accepted = await fetch(base + '/api/tasks', { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ task }) });
    assert.equal(accepted.status, 201);
    const duplicate = await fetch(base + '/api/tasks', { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ task }) });
    assert.equal(duplicate.status, 200);
    const readDenied = await fetch(base + '/api/tasks');
    assert.equal(readDenied.status, 401);
    const readAllowed = await fetch(base + '/api/tasks', { headers: { authorization: 'Bearer test-token' } });
    assert.equal((await readAllowed.json()).tasks.length, 1);
  });
});
test('without configured token, writes are disabled', async () => {
  await withWorker({ token: '' }, async base => {
    const r = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task }) });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'write_token_not_configured');
  });
});
test('replay check reports target revision conflicts without executing', async () => {
  await withWorker({ token: 'test-token' }, async base => {
    await fetch(base + '/api/tasks', { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ task: { ...task, target_commit_sha: 'abc123' } }) });
    const r = await fetch(base + '/api/tasks/t1/replay-check', { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ current_commit_sha: 'new456' }) });
    const data = await r.json();
    assert.equal(data.result.action, 'CONFLICT');
    assert.equal(data.result.reason, 'TARGET_COMMIT_CHANGED');
  });
});
test('unsupported routes and methods are rejected', async () => {
  await withWorker({ token: 'test-token' }, async base => {
    assert.equal((await fetch(base + '/unknown')).status, 404);
    assert.equal((await fetch(base + '/health', { method: 'POST' })).status, 404);
  });
});

test('journal survives worker restart and preserves idempotency', async () => {
  const f = fixture();
  const first = createWorkerServer({ journalPath: f.journalPath, token: 'restart-token' });
  try {
    const a = await first.listen(0);
    const base = 'http://127.0.0.1:' + a.port;
    const queued = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { authorization: 'Bearer restart-token', 'content-type': 'application/json' },
      body: JSON.stringify({ task })
    });
    assert.equal(queued.status, 201);
  } finally {
    await first.close();
  }

  const second = createWorkerServer({ journalPath: f.journalPath, token: 'restart-token' });
  try {
    const a = await second.listen(0);
    const base = 'http://127.0.0.1:' + a.port;
    const read = await fetch(base + '/api/tasks', { headers: { authorization: 'Bearer restart-token' } });
    const data = await read.json();
    assert.equal(read.status, 200);
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].task_id, task.task_id);
    assert.equal(data.tasks[0].status, 'QUEUED');

    const duplicate = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { authorization: 'Bearer restart-token', 'content-type': 'application/json' },
      body: JSON.stringify({ task })
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).duplicate, true);
    const after = await (await fetch(base + '/api/tasks', { headers: { authorization: 'Bearer restart-token' } })).json();
    assert.equal(after.tasks.length, 1);
  } finally {
    await second.close();
    f.cleanup();
  }
});

test('corrupt journal fails closed: health flags it and enqueue is rejected', async () => {
  const f = fixture();
  fs.writeFileSync(f.journalPath, '{broken json\\n', 'utf8');
  const worker = createWorkerServer({ journalPath: f.journalPath, token: 'corrupt-token' });
  try {
    const a = await worker.listen(0);
    const base = 'http://127.0.0.1:' + a.port;
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.writable, false);
    assert.equal(health.journal.corruptLines, 1);

    const rejected = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { authorization: 'Bearer corrupt-token', 'content-type': 'application/json' },
      body: JSON.stringify({ task: { ...task, task_id: 't-corrupt', idempotency_key: 'idem-corrupt' } })
    });
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /writes are blocked/);
    assert.equal(fs.readFileSync(f.journalPath, 'utf8'), '{broken json\\n');
  } finally {
    await worker.close();
    f.cleanup();
  }
});

test('HTTP execution rejects write and arbitrary Node test actions even when caller claims approval', async () => {
  await withWorker({ token: 'execute-token' }, async base => {
    const request = action => fetch(base + '/api/execute', {
      method: 'POST',
      headers: { authorization: 'Bearer execute-token', 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: 'request-1234', approved: true, action, input: { path: 'created.test.cjs', content: 'process.exit(99)' } })
    });
    const write = await request('workspace.write_file');
    assert.equal(write.status, 403);
    assert.equal((await write.json()).error, 'execution_action_not_enabled_over_http');
    const nodeTest = await request('node.test');
    assert.equal(nodeTest.status, 403);
    assert.equal((await nodeTest.json()).error, 'execution_action_not_enabled_over_http');
  });
});


test('HTTP execution fails closed without a server-side approval verifier', async () => {
  let executions = 0;
  const executor = {
    capabilities: () => ({ actions: ['workspace.read_file'], requires_approval: true, arbitrary_shell: false }),
    execute: async () => { executions++; return { ok: true, content: 'should not run' }; }
  };
  await withWorker({ token: 'approval-token', executor }, async base => {
    const response = await fetch(base + '/api/execute', {
      method: 'POST',
      headers: { authorization: 'Bearer approval-token', 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: 'request-approval-1', approved: true, action: 'workspace.read_file', input: { path: 'README.md' } })
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'approval_verifier_not_configured');
    assert.equal(executions, 0);
  });
});

test('HTTP execution requires verifier approval bound to request, action, and input', async () => {
  const seen = [];
  let executions = 0;
  const executor = {
    capabilities: () => ({ actions: ['workspace.read_file'], requires_approval: true, arbitrary_shell: false }),
    execute: async (action, input) => { executions++; return { ok: true, action, path: input.path }; }
  };
  await withWorker({
    token: 'approval-token',
    executor,
    approvalVerifier: async context => {
      seen.push(context);
      return context.approval === 'trusted-approval' &&
        context.requestId === 'request-approval-2' &&
        context.action === 'workspace.read_file' &&
        context.input.path === 'README.md';
    }
  }, async base => {
    const denied = await fetch(base + '/api/execute', {
      method: 'POST',
      headers: { authorization: 'Bearer approval-token', 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: 'request-approval-2', approved: true, action: 'workspace.read_file', input: { path: 'README.md' } })
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, 'server_side_approval_denied');
    assert.equal(executions, 0);

    const accepted = await fetch(base + '/api/execute', {
      method: 'POST',
      headers: { authorization: 'Bearer approval-token', 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: 'request-approval-2', approved: true, approval: 'trusted-approval', action: 'workspace.read_file', input: { path: 'README.md' } })
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).result.path, 'README.md');
    assert.equal(executions, 1);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].approval, undefined);
    assert.equal(seen[1].approval, 'trusted-approval');
  });
});


test('HTTP execution fails closed when the approval verifier throws or returns a non-boolean value', async () => {
  const cases = [
    {
      requestId: 'request-approval-throws',
      approvalVerifier: async () => { throw new Error('verifier unavailable'); }
    },
    {
      requestId: 'request-approval-truthy',
      approvalVerifier: async () => 'true'
    }
  ];

  for (const scenario of cases) {
    let executions = 0;
    const executor = {
      capabilities: () => ({ actions: ['workspace.read_file'], requires_approval: true, arbitrary_shell: false }),
      execute: async () => { executions++; return { ok: true }; }
    };

    await withWorker({
      token: 'approval-token',
      executor,
      approvalVerifier: scenario.approvalVerifier
    }, async base => {
      const response = await fetch(base + '/api/execute', {
        method: 'POST',
        headers: { authorization: 'Bearer approval-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          request_id: scenario.requestId,
          approved: true,
          approval: 'caller-claimed-approval',
          action: 'workspace.read_file',
          input: { path: 'README.md' }
        })
      });

      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, 'server_side_approval_denied');
      assert.equal(executions, 0);
    });
  }
});

test('trusted proxy host is accepted only when exact and configured on loopback worker', async () => {
  await withWorker({ token: 'proxy-token', trustedProxyHost: 'zdh.tailb4ab69.ts.net' }, async base => {
    const trusted = await requestWithHost(base, 'zdh.tailb4ab69.ts.net');
    assert.equal(trusted.status, 200);
    const attacker = await requestWithHost(base, 'attacker.example');
    assert.equal(attacker.status, 400);
    assert.equal(attacker.data.error, 'invalid_host');
  });
});

test('non-loopback proxy host is denied unless explicitly configured', async () => {
  await withWorker({ token: 'proxy-token' }, async base => {
    const denied = await requestWithHost(base, 'zdh.tailb4ab69.ts.net');
    assert.equal(denied.status, 400);
    assert.equal(denied.data.error, 'invalid_host');
  });
});
