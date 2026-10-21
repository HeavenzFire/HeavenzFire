'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const server = fs.readFileSync(path.join(root, 'UnifiedField-Dashboard-Server.cjs'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'UnifiedField-Dashboard.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'Invoke-LocalModelWorkerBatch.ps1'), 'utf8');

test('dashboard server is loopback-only and exposes a fixed worker action', () => {
  assert.match(server, /const HOST\s*=\s*['"]127\.0\.0\.1['"]/);
  assert.match(server, /req\.method===['"]POST['"]&&req\.url===['"]\/api\/worker\/run['"]/);
  assert.match(server, /if\(workerRun\.running\)/);
  assert.match(server, /powershell\.exe/);
  assert.match(server, /Cross-origin request denied/);
  assert.match(server, /req\.url===['"]\/api\/overview['"]/);
  assert.match(server, /modelWorker:\{run:workerRun,latest:latestWorkerResults\(\)\}/);
});

test('dashboard exposes model batch control and renders status from overview', () => {
  assert.match(dashboard, /id="runModelWorker"/);
  assert.match(dashboard, /fetch\('\/api\/worker\/run'/);
  assert.match(dashboard, /renderModelWorker\(x\)/);
  assert.match(dashboard, /qwen2\.5:0\.5b/);
  assert.match(dashboard, /heavenzfire-runtime:latest/);
  assert.match(dashboard, /heavenzfire:latest/);
  assert.match(dashboard, /llama3\.2:1b/);
  assert.match(dashboard, /Generated code is not executed automatically/);
});

test('worker artifacts publish metadata-only review tasks with idempotency and bounded local API', () => {
  assert.match(server, /publishWorkerResultsToJournal/);
  assert.match(server, /HEAVENZFIRE_BRIDGE_TOKEN/);
  assert.match(server, /HEAVENZFIRE_BRIDGE_URL/);
  assert.ok(server.includes('http://127.0.0.1:8798'));
  assert.match(server, /parsed\.hostname!=='127\.0\.0\.1'/);
  assert.match(server, /parsed\.protocol!=='http:'/);
  assert.match(server, /Authorization.*Bearer /);
  assert.ok(server.includes("idempotency_key:'local-worker-result-'"));
  assert.ok(server.includes("scope:['local-artifact-review','independent-verification']"));
  assert.match(server, /Independently review the untrusted local model draft/);
  assert.ok(server.includes('latestWorkerResults(Date.parse(startedAt'));
  assert.doesNotMatch(server, /task\.command\s*=|task\.shell\s*=|task\.script\s*=/);
});

test('worker batch calls local Ollama and records every model outcome', () => {
  for (const model of ['qwen2.5:0.5b', 'heavenzfire-runtime:latest', 'heavenzfire:latest', 'llama3.2:1b']) {
    assert.ok(worker.includes(model), 'missing configured model: ' + model);
  }
  assert.match(worker, /http:\/\/127\.0\.0\.1:11434/);
  assert.match(worker, /stream\s*=\s*\$false/);
  assert.match(worker, /worker-smoke-/);
  assert.match(worker, /item\.error\s*=\s*\$_.Exception.Message/);
  assert.doesNotMatch(worker, /Invoke-Expression|\biex\b/i);
});

test('worker performs static structure and arithmetic checks without evaluating model code', () => {
  assert.match(worker, /function Test-WorkerResponse/);
  assert.match(worker, /ConvertFrom-Json -ErrorAction Stop/);
  assert.match(worker, /test_expected_output_mismatch/);
  assert.match(worker, /Parser\]::ParseInput/);
  assert.match(worker, /powershell_parse_failed/);
  assert.match(worker, /input_iteration_not_verified/);
  assert.match(worker, /item\.validation = Test-WorkerResponse/);
  assert.doesNotMatch(worker, /Invoke-Expression|\biex\b|ScriptBlock::Create|Add-Type/i);
  assert.match(dashboard, /STATIC CHECKS PASSED/);
  assert.match(dashboard, /static checks failed/);
  assert.match(dashboard, /journal handoff/);
  assert.match(dashboard, /attempt\(s\)/);
});

test('worker script never executes generated code or accepts arbitrary task commands', () => {
  assert.doesNotMatch(worker, /Start-Process|cmd\.exe|powershell\.exe\s+-Command/i);
  assert.match(worker, /Do not add fields or claim tests were executed/);
  assert.match(worker, /MaxRepairAttempts = 1/);
  assert.ok(worker.includes('[string[]]$Models = @(\'qwen2.5:0.5b\''));
  assert.match(worker, /foreach \(\$model in \$Models\)/);
  assert.match(worker, /repair_attempted = \$true/);
  assert.match(worker, /repair_validation = Test-WorkerResponse/);
  assert.match(worker, /attempt_count = 2/);
  assert.match(worker, /\$_\.ok -and \$_\.validation\.passed/);
  assert.match(worker, /-not \$_\.ok -or -not \$_\.validation\.passed/);
  assert.match(worker, /num_predict\s*=\s*220/);
  assert.match(worker, /Return ONLY valid JSON/);
  assert.match(worker, /expected_output/);
  assert.match(worker, /Do not add fields/);
});

test('dashboard embedded JavaScript parses successfully', () => {
  const match = dashboard.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'dashboard script element must exist');
  assert.doesNotThrow(() => new vm.Script(match[1]), 'dashboard script must be syntactically valid');
});
