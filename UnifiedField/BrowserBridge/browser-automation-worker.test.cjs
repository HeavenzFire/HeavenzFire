'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isReadOnlySpec } = require('./chrome-automation-worker.cjs');

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