'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createScopedExecutor } = require('./uf-scoped-executor.cjs');

test('workspace read/write are rooted and bounded', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-executor-'));
  try {
    const ex = createScopedExecutor({ workspaceRoot: root });
    const write = await ex.execute('workspace.write_file', { path: 'notes/task.txt', content: 'approved write' });
    assert.equal(write.ok, true);
    assert.equal(fs.readFileSync(path.join(root, 'notes', 'task.txt'), 'utf8'), 'approved write');
    const read = await ex.execute('workspace.read_file', { path: 'notes/task.txt' });
    assert.equal(read.content, 'approved write');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('path traversal and absolute paths are rejected', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-executor-'));
  try {
    const ex = createScopedExecutor({ workspaceRoot: root });
    assert.equal((await ex.execute('workspace.write_file', { path: '../outside.txt', content: 'x' })).ok, false);
    assert.equal((await ex.execute('workspace.read_file', { path: path.join(root, 'outside.txt') })).ok, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('existing file is not overwritten implicitly', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-executor-'));
  try {
    fs.writeFileSync(path.join(root, 'fixed.txt'), 'original');
    const ex = createScopedExecutor({ workspaceRoot: root });
    const result = await ex.execute('workspace.write_file', { path: 'fixed.txt', content: 'replacement' });
    assert.equal(result.ok, false);
    assert.equal(fs.readFileSync(path.join(root, 'fixed.txt'), 'utf8'), 'original');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('arbitrary shell-like actions are rejected', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-executor-'));
  try {
    const ex = createScopedExecutor({ workspaceRoot: root });
    assert.equal((await ex.execute('powershell', { command: 'Remove-Item *' })).ok, false);
    assert.equal(ex.capabilities().arbitrary_shell, false);
    assert.equal(ex.capabilities().requires_approval, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('execution is disabled without an explicit existing workspace root', async () => {
  const ex = createScopedExecutor({ workspaceRoot: '' });
  assert.equal(ex.capabilities().workspace_root_configured, false);
  assert.deepEqual(ex.capabilities().actions, []);
  assert.equal((await ex.execute('workspace.read_file', { path: 'anything.txt' })).ok, false);
});

test('symlink paths cannot escape the workspace', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-executor-symlink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-executor-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside');
    fs.symlinkSync(outside, path.join(root, 'linked'), 'dir');
    const ex = createScopedExecutor({ workspaceRoot: root });
    assert.equal((await ex.execute('workspace.read_file', { path: 'linked/secret.txt' })).ok, false);
    assert.equal((await ex.execute('workspace.write_file', { path: 'linked/new.txt', content: 'no' })).ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('no-overwrite creation remains exclusive when a target already exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-executor-exclusive-'));
  try {
    const ex = createScopedExecutor({ workspaceRoot: root });
    const first = await ex.execute('workspace.write_file', { path: 'exclusive.txt', content: 'first' });
    const second = await ex.execute('workspace.write_file', { path: 'exclusive.txt', content: 'second' });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(fs.readFileSync(path.join(root, 'exclusive.txt'), 'utf8'), 'first');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
