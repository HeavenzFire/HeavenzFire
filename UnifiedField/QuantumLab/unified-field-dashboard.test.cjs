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
const publisher = fs.readFileSync(path.join(root, 'uf-model-worker-journal-publisher.cjs'), 'utf8');
const resultStore = fs.readFileSync(path.join(root, 'worker-result-store.cjs'), 'utf8');
const validator = fs.readFileSync(path.join(root, 'Test-LocalModelWorkerResponse.ps1'), 'utf8');
const validatorTests = fs.readFileSync(path.join(root, 'Test-LocalModelWorkerResponse.Tests.ps1'), 'utf8');

test('dashboard server is loopback-only and exposes a fixed worker action', () => {
  assert.match(server, /const HOST\s*=\s*['"]127\.0\.0\.1['"]/);
  assert.match(server, /req\.method===['"]POST['"]&&req\.url===['"]\/api\/forge\/validate['"]/);
  assert.match(server, /req\.method===['"]POST['"]&&\(req\.url===['"]\/api\/worker\/run['"]\|\|req\.url===['"]\/api\/worker\/retry['"]\)\)/);
  assert.match(server, /if\(modelWorkloadBusy\(\)\)/);
  assert.match(server, /powershell\.exe/);
  assert.match(server, /Cross-origin request denied/);
  assert.match(server, /req\.url===['"]\/api\/overview['"]/);
  assert.match(server, /modelWorker:\{run:workerRun,latest:latestWorkerResults\(\)\}/);
});

test('dashboard exposes model batch control and renders status from overview', () => {
  assert.match(server, /\/api\/forge\/validate/);
  assert.match(server, /\/api\/forge\/draft/);
  assert.match(server, /\/api\/forge\/evaluate/);
  assert.match(server, /\/api\/forge\/registry/);
  assert.match(server, /\/api\/forge\/register/);
  assert.match(server, /\/api\/forge\/attach-artifact/);
  assert.match(server, /\/api\/forge\/remediate/);
  assert.match(server, /remediateBlueprint/);
  assert.match(server, /artifact_not_adversarial_smoke_evidence/);
  assert.match(server, /workerRegistry\.recordSmoke/);
  assert.match(server, /\/api\/forge\/evaluation-status/);
  assert.match(server, /runAdversarialSmokeSuite/);
  assert.match(server, /modelWorkloadBusy/);
  assert.match(server, /modelWorkloadAdmission/);
  assert.match(server, /available RAM is below 1 GiB/);
  assert.match(server, /draftWorkerBlueprint/);
  assert.match(server, /\/api\/forge\/plan/);
  assert.match(server, /\/api\/worker\/status/);
  assert.match(server, /\/api\/worker\/retry/);
  assert.match(server, /WORKER_MODEL_ALLOWLIST\.includes\(model\)/);
  assert.match(server, /Retry requires a unique, non-empty list of allowlisted model tags/);
  assert.match(server, /args\.push\('-Models',\.\.\.requestedModels\)/);
  assert.match(server, /buildEvaluationMatrix\(FORGE_AXES/);
  assert.ok(server.indexOf("require('./worker-forge.cjs')") < server.indexOf('const FORGE_AXES='), 'Worker Forge must load before its constants are referenced');
  assert.match(server, /Cross-origin request denied/);
  assert.match(dashboard, /id="runModelWorker"/);
  assert.match(dashboard, /id="retryFailedModels"/);
  assert.match(dashboard, /fetch\('\/api\/worker\/retry'/);
  assert.match(dashboard, /Retry failed models/);
  assert.match(dashboard, /fetch\('\/api\/worker\/run'/);
  assert.match(dashboard, /renderModelWorker\(x\)/);
  assert.match(dashboard, /heavenzfire-qwen-0\.5b/);
  assert.match(dashboard, /Generated code is not executed automatically/);
  assert.match(dashboard, /id="workerBlueprint"/);
  assert.match(dashboard, /id="generateChildBlueprint"/);
  assert.match(dashboard, /id="runAdversarialSmoke"/);
  assert.match(dashboard, /id="registerWorkerCandidate"/);
  assert.match(dashboard, /id="workerRegistryList"/);
  assert.match(dashboard, /id="attachSmokeArtifact"/);
  assert.match(dashboard, /id="remediateWorkerCandidate"/);
  assert.match(dashboard, /Create remediation version/);
  assert.match(dashboard, /not model-weight training/);
  assert.match(dashboard, /data-load-worker-hash/);
  assert.match(dashboard, /fetch\('\/api\/forge\/attach-artifact'/);
  assert.match(dashboard, /NOT QUALIFIED/);
  assert.match(dashboard, /fetch\('\/api\/forge\/evaluate'/);
  assert.match(dashboard, /SMOKE PASS.*NOT QUALIFIED/);
  assert.match(dashboard, /x\.progress/);
  assert.match(dashboard, /PROFILES/);
  assert.match(dashboard, /CHILD TEMPLATE GENERATED.*MODEL DRAFT REJECTED/);
  assert.match(dashboard, /deterministic_template_fallback/);
  assert.match(dashboard, /fetch\('\/api\/forge\/draft'/);
  assert.match(dashboard, /id="validateWorkerBlueprint"/);
  assert.match(dashboard, /id="buildWorkerEvalPlan"/);
  assert.match(dashboard, /validateForgeBlueprint/);
  assert.match(dashboard, /buildWorkerEvalPlan/);
});

test('worker artifacts publish metadata-only review tasks with idempotency and bounded local API', () => {
  assert.match(server, /latestWorkerResults\(LOCALAI\)/);
  assert.match(resultStore, /newestByModel/);
  assert.match(resultStore, /artifact_file/);
  assert.match(server, /publishWorkerResultsToJournal/);
  assert.match(server, /uf-model-worker-journal-publisher\.cjs/);
  assert.match(publisher, /HEAVENZFIRE_BRIDGE_TOKEN/);
  assert.match(publisher, /HEAVENZFIRE_BRIDGE_URL/);
  assert.ok(publisher.includes('http://127.0.0.1:8798'));
  assert.match(publisher, /parsed\.hostname\s*!==\s*'127\.0\.0\.1'/);
  assert.match(publisher, /parsed\.protocol\s*!==\s*'http:'/);
  assert.match(publisher, /Authorization.*Bearer /);
  assert.ok(publisher.includes("idempotency_key: 'local-worker-result-'"));
  assert.ok(publisher.includes("'local-artifact-review'"));
  assert.ok(publisher.includes("'local-model-failure-triage'"));
  assert.match(publisher, /Independently review the untrusted local model draft/);
  assert.ok(server.includes('latestWorkerResults(LOCALAI,Date.parse(startedAt'));
  assert.doesNotMatch(publisher, /task\.command\s*=|task\.shell\s*=|task\.script\s*=/);
});

test('worker batch uses the shared HeavenzFire gateway and records the canonical model outcome', () => {
  assert.ok(worker.includes('heavenzfire-qwen-0.5b'), 'canonical model must be configured');
  assert.match(worker, /http:\/\/127\.0\.0\.1:11800\/v1/);
  assert.match(worker, /chat\/completions/);
  assert.match(worker, /stream\s*=\s*\$false/);
  assert.match(worker, /worker-smoke-/);
  assert.match(worker, /ConvertTo-Json -InputObject @\(\$results\)/);
  assert.match(worker, /item\.error\s*=\s*\$_.Exception.Message/);
  assert.doesNotMatch(worker, /Invoke-Expression|\biex\b/i);
});
test('worker performs static structure and arithmetic checks without evaluating model code', () => {
  assert.match(worker, /Test-LocalModelWorkerResponse\.ps1/);
  assert.match(validator, /function Test-WorkerResponse/);
  assert.match(validator, /ConvertFrom-Json -ErrorAction Stop/);
  assert.match(validator, /test_expected_output_mismatch/);
  assert.match(validator, /Parser\]::ParseInput/);
  assert.match(validator, /powershell_parse_failed/);
  assert.match(validator, /parsed_json_array_from_string/);
  assert.match(validator, /trimmed_terminal_period_from_code/);
  assert.match(validator, /normalized_response/);
  assert.match(validator, /input_iteration_not_verified/);
  assert.match(validatorTests, /VALIDATOR_TESTS=PASS/);
  assert.doesNotMatch(validator, /Invoke-Expression|\biex\b|ScriptBlock::Create|Add-Type/i);
  assert.match(dashboard, /Normalization:/);
  assert.match(dashboard, /STATIC CHECKS PASSED/);
  assert.match(dashboard, /static checks failed/);
  assert.match(dashboard, /journal handoff/);
  assert.match(dashboard, /duplicate/);
  assert.match(dashboard, /attempt\(s\)/);
  assert.match(dashboard, /Checks: /);
});

test('worker script never executes generated code or accepts arbitrary task commands', () => {
  assert.doesNotMatch(worker, /Start-Process|cmd\.exe|powershell\.exe\s+-Command/i);
  assert.match(worker, /Do not add fields or claim tests were executed/);
  assert.match(worker, /MaxRepairAttempts = 1/);
  assert.match(worker, /foreach \(\$model in \$Models\)/);
  assert.match(worker, /repair_attempted = \$true/);
  assert.match(worker, /repair_validation = Test-WorkerResponse/);
  assert.match(worker, /attempt_count = 2/);
  assert.match(worker, /\$_\.ok -and \$_\.validation\.passed/);
  assert.match(worker, /-not \$_\.ok -or -not \$_\.validation\.passed/);
  assert.match(worker, /max_tokens\s*=\s*220/);
  assert.match(worker, /Return ONLY valid JSON/);
  assert.match(worker, /expected_output/);
  assert.match(worker, /Do not add fields/);
});

test('dashboard model list is declared and matches the server allowlist', () => {
  const uiMatch = dashboard.match(/const expected\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/);
  assert.ok(uiMatch, 'dashboard must declare its expected model list before rendering');
  const uiModels = Array.from(uiMatch[1].matchAll(/['"]([^'"]+)['"]/g), match => match[1]);
  const serverMatch = server.match(/WORKER_MODEL_ALLOWLIST\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/);
  assert.ok(serverMatch, 'server must expose a fixed model allowlist');
  const serverModels = Array.from(serverMatch[1].matchAll(/['"]([^'"]+)['"]/g), match => match[1]);
  assert.deepEqual(uiModels, serverModels, 'dashboard model list must match server allowlist');
  assert.ok(dashboard.indexOf('const expected=') < dashboard.indexOf('function renderModelWorker'), 'model list must be declared before rendering');
});

test('dashboard embedded JavaScript parses successfully', () => {
  const match = dashboard.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'dashboard script element must exist');
  assert.doesNotThrow(() => new vm.Script(match[1]), 'dashboard script must be syntactically valid');
});


test('model-worker expected model list is scoped inside its renderer', () => {
  assert.match(dashboard, /function renderModelWorker\(x\)\{[\s\S]*?const expected=\['heavenzfire-qwen-0\.5b'\]/);
  assert.ok(!dashboard.includes('Register candidate</button>Validate worker blueprint</button>'));
});
