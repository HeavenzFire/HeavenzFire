'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SCHEMA, createTaskRecord } = require('./task-record.js');

test('browser bridge emits the shared proposed/pending contract', () => {
  const task = createTaskRecord('Reviewed page excerpt', 20);
  assert.equal(task.schema, 'heavenzfire.shared-task.v1');
  assert.equal(task.source, 'heavenzfire-browser-bridge');
  assert.equal(task.status, 'proposed');
  assert.equal(task.approvalState, 'pending');
  assert.equal(task.metadata.capturedSelectionChars, 20);
  assert.equal(task.goal, 'Reviewed page excerpt');
  assert.ok(task.taskId);
  assert.ok(task.createdAt);
});

test('proposal goal is bounded and cannot be empty', () => {
  assert.throws(() => createTaskRecord('  '), /non-empty/);
  assert.throws(() => createTaskRecord('x'.repeat(12001)), /12000/);
  assert.throws(() => createTaskRecord('ok', 12001), /selectionChars/);
});

test('extension uses only activeTab/scripting and the loopback task inbox', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'scripting'].sort());
  assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1:18796/*']);
  assert.equal(manifest.permissions.includes('tabs'), false);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.equal(manifest.content_security_policy.extension_pages.includes("'unsafe-eval'"), false);
});

test('submission is a user-click action and no automatic page script is registered', () => {
  const popup = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  assert.match(popup, /submitButton\.addEventListener\('click'/);
  assert.match(popup, /http:\/\/127\.0\.0\.1:18796\/api\/tasks/);
  assert.equal(Object.prototype.hasOwnProperty.call(manifest, 'content_scripts'), false);
  assert.equal(SCHEMA, 'heavenzfire.shared-task.v1');
});
