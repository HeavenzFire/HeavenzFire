'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isReadOnlySpec, recoverInterruptedTask } = require('./chrome-automation-worker.cjs');

const base = {
  id: 'HF-WORKER-TEST01',
  url: 'https://example.com/',
  allowedOrigins: ['https://example.com', 'https://www.iana.org'],
  timeoutMs: 10000,
  actions: [{ type: 'extractText', selector: 'body', maxChars: 4000 }],
  assertions: [{ type: 'titleEquals', expected: 'Example Domain' }]
};

test('autonomous worker accepts exact-origin read-only navigation and extraction', () => {
  const result = isReadOnlySpec(base);
  assert.equal(result.task.id, base.id);
  assert.equal(result.origins.length, 2);
});

test('autonomous worker rejects form filling and clicks even when task is otherwise valid', () => {
  assert.throws(() => isReadOnlySpec({ ...base, actions: [{ type: 'click', selector: 'a' }] }), /read-only/);
  assert.throws(() => isReadOnlySpec({ ...base, actions: [{ type: 'fill', selector: 'input', value: 'x' }] }), /read-only/);
});

test('autonomous worker rejects navigation to an origin outside the allowlist', () => {
  assert.throws(() => isReadOnlySpec({ ...base, actions: [{ type: 'navigate', url: 'https://not-allowed.invalid/' }] }), /allowlisted origin/);
});
test('worker restart invalidates approval for interrupted jobs instead of replaying them', () => {
  const task = {
    id: 'HF-RECOVERY-TEST01',
    status: 'BrowserRunning',
    browserAutomation: {
      status: 'Running',
      approved: true,
      startedAt: '2026-11-14T10:00:00.000Z',
      spec: base
    },
    events: []
  };
  assert.equal(recoverInterruptedTask(task), true);
  assert.equal(task.status, 'ReviewRequired');
  assert.equal(task.browserAutomation.status, 'ReviewRequired');
  assert.equal(task.browserAutomation.approved, false);
  assert.ok(task.browserAutomation.approvalInvalidatedAt);
  assert.match(task.browserAutomation.recoveryReason, /fresh operator approval/);
  assert.equal(task.events.at(-1).event, 'BrowserWorkerInterruptedApprovalInvalidated');
  assert.equal(recoverInterruptedTask(task), false);
});

test('worker recovery leaves queued, not-yet-started approvals intact', () => {
  const task = {
    status: 'BrowserQueued',
    browserAutomation: { status: 'Queued', approved: true },
    events: []
  };
  assert.equal(recoverInterruptedTask(task), false);
  assert.equal(task.browserAutomation.approved, true);
  assert.equal(task.status, 'BrowserQueued');
});
