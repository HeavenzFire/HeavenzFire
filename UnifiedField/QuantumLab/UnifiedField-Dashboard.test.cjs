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

test('compression status endpoint is tied to on-disk HFQLOSS1 manifest and dashboard panel', () => {
  assert.match(server, /\/api\/compression\/status/);
  assert.match(server, /round_trip_exact/);
  assert.match(server, /verified_from_disk/);
  assert.match(server, /actualContainerBytes===manifest\.container_bytes/);
  assert.match(dashboard, /id="compressionCard"/);
  assert.match(dashboard, /fetch\('\/api\/compression\/status'/);
});

test('advanced compression research is surfaced without relabeling baseline as SRAC', () => {
  assert.match(server, /\/api\/compression\/research/);
  assert.match(server, /srac-engine\.js/);
  assert.match(server, /tensor_gyroid_toroid\.py/);
  assert.match(server, /physical_field_verified/);
  assert.match(dashboard, /SRAC · Gyroid \/ Toroid \/ Predictive Research/);
  assert.match(dashboard, /refreshCompressionResearch/);
});

test('mesh task console exposes only bounded hash/model task routes', () => {
  assert.match(server, /\/api\/mesh\/enqueue/);
  assert.match(server, /\/api\/mesh\/task/);
  assert.match(server, /127\.0\.0\.1:8081/);
  assert.match(server, /Cross-origin request denied/);
  assert.match(dashboard, /id="dispatchMeshTask"/);
  assert.match(dashboard, /id="meshTaskType"/);
  assert.match(dashboard, /id="meshTaskInput"/);
  assert.match(dashboard, /fetch\('\/api\/mesh\/enqueue'/);
  assert.match(dashboard, /arbitrary shell\/code execution is not exposed/);
});


test('live mesh queue exposes recent bounded worker jobs in the dashboard', () => {
  const bridge = fs.readFileSync(path.join(root, 'heavenzfire-mesh-bridge.cjs'), 'utf8');
  assert.match(bridge, /\/api\/mesh\/tasks/);
  assert.match(server, /\/api\/mesh\/tasks/);
  assert.match(dashboard, /id="meshQueueCount"/);
  assert.match(dashboard, /id="meshQueueList"/);
  assert.match(dashboard, /refreshMeshQueue/);
  assert.match(dashboard, /Model output is evidence, not verified code/);
  assert.match(dashboard, /api\/build\/tasks/);
  assert.match(dashboard, /persistent journal/);
});
test('bounded source-build worker is allowlisted, hash-pinned, approval-gated, and rollback-capable', () => {
  assert.match(server, /\/api\/build\/targets/);
  assert.match(server, /\/api\/build\/source\?/);
  assert.match(server, /\/api\/build\/apply/);
  assert.match(server, /BUILD_TARGETS\.includes\(name\)/);
  assert.match(server, /explicit_approval_required/);
  assert.match(server, /source_changed_since_review/);
  assert.match(server, /regression_failed_rollback_applied/);
  assert.match(server, /BUILD_JOURNAL\.setState\(taskId,'DONE'/);
  assert.match(server, /BUILD_JOURNAL\.setState\(taskId,'FAILED'/);
  assert.match(dashboard, /id="buildTargetFile"/);
  assert.match(dashboard, /id="approveBuildPatch"/);
  assert.match(dashboard, /\/api\/build\/apply/);
  assert.match(dashboard, /Load current source/);
});
test('proposal inbox requires explicit bounded approval and idempotent mesh dispatch', () => {
  const bridge = fs.readFileSync(path.join(root, 'heavenzfire-mesh-bridge.cjs'), 'utf8');
  assert.match(server, /\/api\/inbox\/tasks/);
  assert.match(server, /\/api\/inbox\/dispatch-approved/);
  assert.match(server, /b\.approved!==true/);
  assert.match(server, /meta\.executionAllowed!==true/);
  assert.match(server, /meta\.test===true/);
  assert.match(server, /APPROVAL_LEDGER/);
  assert.match(server, /payloadSha256/);
  assert.match(server, /client_task_id:task\.taskId/);
  assert.match(bridge, /source_task_id:t\.source_task_id/);
  assert.match(bridge, /b\.client_task_id/);
  assert.match(dashboard, /id="inboxTaskList"/);
  assert.match(dashboard, /Approve &amp; dispatch/);
  assert.match(dashboard, /window\.confirm/);
});
test('five-role build endpoint is loopback-only, bounded, serialized, and visible in the dashboard', () => {
  const pipeline = fs.readFileSync(path.join(root, 'five-agent-build-pipeline.cjs'), 'utf8');
  assert.match(server, /require\('\.\/five-agent-build-pipeline\.cjs'\)/);
  assert.match(server, /\/api\/build-agents\/run/);
  assert.match(server, /\/api\/build-agents\/status/);
  assert.match(server, /modelWorkloadBusy\(\)/);
  assert.match(server, /modelWorkloadAdmission\(\)/);
  assert.match(server, /objective\.trim\(\)\.length<20/);
  assert.match(dashboard, /id="runFiveAgentBuild"/);
  assert.match(dashboard, /id="fiveAgentBuildStatus"/);
  assert.match(dashboard, /id="fiveAgentBuildResults"/);
  assert.match(dashboard, /fetch\('\/api\/build-agents\/run'/);
  assert.match(dashboard, /fetch\('\/api\/build-agents\/status'/);
  assert.match(pipeline, /independent_processes: false/);
  assert.match(pipeline, /code_executed: false/);
  assert.match(pipeline, /const AGENTS = Object\.freeze\(\[/);
});
