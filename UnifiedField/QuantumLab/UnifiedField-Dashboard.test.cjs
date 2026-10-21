'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const server = fs.readFileSync(path.join(root, 'UnifiedField-Dashboard-Server.cjs'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'UnifiedField-Dashboard.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'Run-LocalAIWorkerSmokeTest.ps1'), 'utf8');

test('server binds loopback and exposes only the fixed worker action', () => {
  assert.match(server, /HOST\s*=\s*['"]127\.0\.0\.1['"]/);
  assert.match(server, /\/api\/worker\/run/);
  assert.match(server, /workerRun\.running/);
  assert.match(server, /powershell\.exe/);
  assert.match(server, /Cross-origin request denied/);
  assert.match(server, /\/api\/overview/);
  assert.doesNotMatch(server, /req\.body\.command|req\.body\.script|exec\(.*req\.body/i);
});

test('dashboard provides live overview, model-worker action, and GitHub route', () => {
  assert.match(dashboard, /id="runModelWorker"/);
  assert.match(dashboard, /fetch\('\/api\/worker\/run'/);
  assert.match(dashboard, /\/api\/overview/);
  assert.match(dashboard, /canvas id="graph"/);
  assert.match(dashboard, /github\.com\/HeavenzFire\/HeavenzFire/);
  assert.match(dashboard, /Generated code is not executed automatically/);
});

test('worker is fixed-scope local Ollama work and never executes model output', () => {
  for (const model of ['qwen2.5:0.5b','heavenzfire-runtime:latest','heavenzfire:latest','llama3.2:1b']) assert.ok(worker.includes(model));
  assert.match(worker, /127\.0\.0\.1:11434\/api\/generate/);
  assert.match(worker, /num_predict/);
  assert.match(worker, /worker-smoke-/);
  assert.doesNotMatch(worker, /Invoke-Expression|\biex\b|ScriptBlock::Create|Start-Process|cmd\.exe/i);
});

test('dashboard embedded JavaScript parses', () => {
  const match = dashboard.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'dashboard script must exist');
  assert.doesNotThrow(() => new vm.Script(match[1]));
});
test('mesh task console exposes bounded hash/model routes only', () => {
  assert.ok(server.includes('/api/mesh/enqueue'));
  assert.ok(server.includes('/api/mesh/task'));
  assert.ok(server.includes('127.0.0.1:8081'));
  assert.ok(dashboard.includes('id="meshHashButton"'));
  assert.ok(dashboard.includes('id="meshModelButton"'));
  assert.ok(dashboard.includes('No shell commands are accepted'));
  assert.doesNotMatch(server, /req\.body\.command|req\.body\.script|exec\(.*req\.body/i);
});
