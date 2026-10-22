# Live Micro-Sandbox Verification — 2026-10-21

## Scope

Record the observed state of the connected Windows development machine during the Unified Field continuation session. This is a point-in-time evidence delta, not a release certification. It does not replace earlier test reports and does not imply the full repository ecosystem is unified.

## Observed results

| Check | Result | Evidence boundary |
|---|---|---|
| Ollama API | PASS — HTTP 200 | API responded and returned a live model inventory; this alone does not prove a model task completed. |
| Agent service :8790 | PASS — health reported OK | Health only. |
| Gateway :8787 | PASS — health reported OK | Health only. |
| Orchestrator :8788 | PASS — health reported OK | Reported gateway available and circuit closed; health is not task acceptance. |
| Specialist endpoints :18111–:18126 | PASS — all 16 health endpoints responded healthy | They report the same `HeavenzFire-ENHANCED-DUAL` service family. Do not count these endpoints as 16 independent reasoning agents. |
| Inference API :11800 and runtime :11801 | PASS — both returned HTTP 200 from `/v1/models` | Both exposed `heavenzfire-qwen-0.5b`; model inference was not thereby proven. |
| Mesh bridge :8081 | PASS — bounded deterministic hash task completed | 1,000 SHA-256 rounds returned digest `a2b49d23ca2136fd5120a997ec9bcda68a103c44ee2fec9dbdbfb9225979f634`. This verifies the bridge's hash-task execution path, not a full LLM delegation cycle. |
| BraidedPipeline acceptance test | PASS — 10 checks; process exit 0 | Checks included handshake, replay defense, DAG validation, parallel pipeline, and hash-chained trace. |
| Legacy coordinator :8080 | BLOCKED — process owns listening port but HTTP health request could not connect | PID observed as 26448 running `coordinator.py`. The process was not terminated or restarted. |
| Legacy coordinator SQLite queue | EMPTY at inspection | Database counts: 106 completed, 2 failed, 0 queued, 0 in-flight. |
| Model task through :8081 | BLOCKED by resource admission | Windows reported approximately 0.48 GiB free RAM, below the 1-GiB inference threshold. The guard was not bypassed. |

## Key findings

1. The newer loopback mesh bridge can execute a real bounded deterministic task and return a digest.
2. The braided pipeline's current acceptance suite passes its 10 reported checks.
3. The legacy coordinator/worker lane is not currently usable through its HTTP interface: port 8080 is occupied by a process that does not answer the health request. Do not enqueue against this coordinator until recovery and authenticated task round-trip are verified.
4. Model work remains resource-constrained. Preserve the existing RAM admission guard; unload nonessential model processes or recover memory before retrying.
5. The 16 health endpoints are endpoint observations, not evidence of 16 independent agents or successful delegated work.

## Next executable gates

- [ ] Recover the :8080 coordinator using a reviewed, reversible process-management step; do not force-kill it without an explicit approved recovery action.
- [ ] After coordinator recovery, verify unauthenticated access is rejected on protected routes, enqueue one bounded allowlisted hash task with the existing local credential (never print it), poll to a terminal state, and independently reproduce the returned digest.
- [ ] Recheck free RAM before model inference. Do not bypass the 1-GiB admission threshold.
- [ ] Run the relevant mesh adversarial suite and preserve command, exit code, task ID, terminal state, digest, and timestamp.
- [ ] Only after the above passes, update the runtime contract with a new end-to-end evidence reference.

## Reproduction notes and limitations

- Commands were executed against the user's connected Windows machine using PowerShell-compatible checks.
- No secret/token values are included in this report.
- No process was stopped, restarted, or modified as part of this evidence capture.
- The :8080 coordinator remains blocked; its recovery and a fresh authenticated task round-trip are not claimed.
- Results are snapshots and may change when processes or machine resources change.


## Live follow-up — 2026-10-22T03:43:25Z

This follow-up supersedes the earlier coordinator-blocked snapshot for the specific checks below. The original dated observations remain preserved as historical evidence.

| Check | Result | Evidence |
|---|---|---|
| Coordinator :8080 health | PASS — HTTP 200 | Active listener PID 15528; /health returned ok=true, queue length 0, 110 completed and 2 failed tasks. The previously cited PID 26448 no longer existed. No process was stopped or restarted during this follow-up. |
| Protected route without credentials | PASS — HTTP 401 | Unauthenticated GET /stats was rejected. |
| Authenticated worker health | PASS — workers 18101, 18102, 18103 | Each worker's /health response reported authenticated=true. |
| Authenticated queue round-trip | PASS — task completed | Task ID 3581a919-1a33-4a59-b979-6e2941af768c; worker hf-worker-18101; task type hash_task; 1,000 SHA-256 rounds. |
| Independent digest reproduction | PASS | Coordinator result and an independent PowerShell SHA-256 computation matched: 6af6505ac26e0d64beef55bc0fb1498093e3fd3b63f6ff73637b34f723ebda1d. |
| Resource admission | MODEL TASK NOT RUN | Free physical RAM was approximately 0.40 GiB, below the existing 1-GiB model-task threshold. No guard was bypassed. |

### Reproduction metadata

- Task creation timestamp: 2026-10-22T03:43:25.723Z.
- Coordinator task database totals after completion: 110 completed, 2 failed, no queued or in-flight tasks reported by the health endpoint.
- The existing DPAPI-protected local token was read by the test process without printing or committing its value. No credential was added to this evidence file.
- The test was a real authenticated deterministic worker task through the legacy coordinator and SQLite-backed queue. It verifies authentication, dispatch, completion, and digest correctness; it does not prove LLM delegation or model inference.
- The coordinator was already healthy when inspected. This follow-up did not restart it, and does not claim that this session repaired the cause of the earlier outage.
- This evidence is a point-in-time observation from the connected Windows machine; repeat the probes before release decisions.

### Updated gate status

- [x] Coordinator health responds.
- [x] Protected route rejects unauthenticated access.
- [x] Authenticated bounded hash task reaches terminal completed state.
- [x] Independent digest matches the worker result.
- [ ] Recover at least 1 GiB of free RAM and re-run the model-task admission check before attempting local model delegation.
- [ ] Run the mesh adversarial suite against this recovered coordinator/worker state and record its exit code.
- [ ] Verify a genuine end-to-end LLM delegation cycle separately; the deterministic hash task is not evidence of that capability.


### Additional verification — 2026-10-22

- [x] Capsule evidence ledger verification passed read-only with exit code 0: 1,814 events, head sequence 1,814, head hash d4626c884e4c41b22ac412c5e9783556071c9b11b3642074de679a2b6dbea2b1, schema version 1.
- [x] Final coordinator health probe returned ok=true and queue_len=0; unauthenticated GET /stats again returned HTTP 401.
- [ ] GitHub Actions dashboard/local-worker job remains a separate code-quality blocker on the previously observed run: 42/43 tests passed; the failing test expected the literal pattern max_tokens=160 in a worker script, while the script uses a different model-generation contract. This is a test/implementation contract mismatch to review, not a failed live mesh hash task. Do not call CI green until a fresh run passes.
- Safety note: the existing independence_test.py intentionally terminates worker 18102, enqueues batches, and restarts a worker. It was not run during this verification because the non-disruptive authenticated round-trip and ledger verification were sufficient for the current gate.


## Live follow-up — 2026-10-22T04:10:24Z

This follow-up records fresh live probes and test runs from the connected Windows workspace. It supplements, rather than rewrites, the earlier dated evidence. Local source folders are not a Git checkout of the repository, so local-suite results must not be attributed to a remote PR commit unless that exact source was separately fetched and tested below.

### Live endpoint and inference checks

| Check | Result | Evidence boundary |
|---|---|---|
| Ollama inventory `:11434/api/tags` | PASS — HTTP 200 | Returned model inventory including `qwen2.5:0.5b`; inventory is not itself inference evidence. |
| Ollama generation `:11434/api/generate` | PASS | `qwen2.5:0.5b` returned exact sentinel `LOCAL_MODEL_SMOKE_PASS`, with `done=true`. |
| Agent `:8790/health` | PASS — HTTP 200 | Reports agent service healthy, Ollama available, tool service available, and maximum three tool calls per request. |
| Agent `:8790/ask` | PASS — one bounded request | One permitted `health_check` tool trace was present and returned successful structured evidence. No shell command or file modification was requested. |
| Gateway `:8787/health` | PASS — HTTP 200 | Reports the configured model available. |
| Gateway `:8787/generate` | PASS | Returned exact sentinel `HEAVENZFIRE_SMOKE_PASS` from `heavenzfire-qwen-0.5b`. |
| Orchestrator `:8788/health` | PASS — HTTP 200 | Circuit remained closed; no active tasks after the smoke request. |
| Orchestrator `:8788/task` | PASS — one bounded model task | Returned exact sentinel `HF_SINGLE_ORCHESTRATOR_SMOKE_OK`. Completed count increased from 98 to 99; failed count remained 1. This proves one successful task through the shared local model/orchestrator, not four independent agents. |
| Legacy coordinator `:8080/health` | PASS — HTTP 200 | Queue length 0; 116 recorded tasks, 114 completed and 2 failed. Health does not itself prove a new authenticated queue round-trip. |
| Mesh bridge `:8081/health` | PASS — HTTP 200 | Reports loopback binding and bounded queue mode. This follow-up did not enqueue a new task through this bridge. |
| Probe `:8083/health` | NOT A DEFINED HEALTH CONTRACT | Returned HTTP 404. Do not treat this route as a service failure until an expected route is identified. |
| C: free space | OBSERVED — 7.23 GiB | Capacity remains constrained; no cleanup or file deletion was performed. |

### Regression test results

Tests were run in the local workspace with Node.js v22.14.0 and Windows PowerShell 5.1. These are local working-tree results, not a clean-clone or full-ecosystem certification.

| Suite | Result |
|---|---:|
| BrowserBridge task-runner tests | 2/2 passed |
| TaskAdapterVerify transport/inbox/approval tests | 24/24 passed |
| Unified Field FieldCore tests | 31/31 passed |
| EvidenceLedgerVerify tests | 8/8 passed |
| QuantumLab local worker, gateway, adversarial forge, and dashboard-worker tests | 23/23 passed |
| Python agent-worker runtime tests | 3/3 passed |

The local copy did not contain `uf-scoped-executor.test.cjs`; that file was not counted or claimed as tested in the local run.

### Exact GitHub-source snapshot tests

To avoid confusing local working-tree results with remote branch contents, selected PR files were fetched by branch and tested in an isolated temporary workspace:

- PR #65 adversarial worker-forge test: **4/4 passed** after fixing an undeclared `calls` counter in the test's injected-fetch stub. The prior failure (five critical failures instead of one) was caused by the test stub throwing before grading the intended prompt-injection case; it was not evidence that the production grader should weaken its critical-failure rule.
- PR #81 dashboard-worker safety contract: **8/8 passed** against the fetched branch test and its referenced worker/dashboard files.
- PR #80 interchange contract: **5/5 passed** against the fetched schema, example, export, capability registry, and test file.

The dashboard-worker token-budget test initially required 160 tokens while the worker uses 220. A first test edit used a double-escaped regex; the isolated test caught that mistake. The regex was corrected to match the actual `max_tokens\s*=\s*220` source pattern, and the fetched PR #81 dashboard-worker suite then passed 8/8. The identical test-file blob is now present on PR branches #78–#81. This correction was committed to those branches; **GitHub Actions results for the newest commits are still unconfirmed**, so these isolated tests must not be described as fresh CI passes.

### Methodology corrections and remaining blockers

1. Test the edited source in an isolated workspace before committing a test change. A passing textual replacement or a successful GitHub Contents API write is not a test result.
2. Separate local-machine evidence, exact fetched-branch test evidence, and GitHub Actions status in every report.
3. Keep security invariants intact: generated code is not executed; unsafe tool claims remain critical failures; the 1-GiB model admission guard is not bypassed.
4. The `planetary-mesh-global` submodule cleanup error remains unresolved. No valid origin URL has been established, so the submodule was not deleted and no URL was invented.
5. New commits made through the repository connector have no associated fresh workflow runs visible for their exact head SHAs yet. CI is therefore pending, not passed.
6. At the latest metadata check (2026-10-22T04:10Z), PR #78 reported mergeable=true, while PR #65 reported mergeable=false. This is only GitHub's mergeability calculation, not approval to merge; fresh CI for the newest heads remains unconfirmed.

No processes were stopped or restarted, no firewall or credential settings were changed, no files were deleted, and no source repository was merged as part of this follow-up.


### Cross-document inventory sanity check — 2026-10-22T04:10Z

The PR #79 repository inventory JSON was fetched and parsed independently after its documentation update:

- Declared total: 277 repositories; actual JSON entries: 277.
- All 277 entries had a repository name/full name and default branch.
- No duplicate full repository names were found.
- This validates the catalog's internal shape and uniqueness, not that GitHub search was exhaustive. The consolidation plan correctly retains its explicit completeness caveat.
- The PR #81 component map also explicitly distinguishes draft integration work from operational runtime capability and leaves GitHub Actions status unconfirmed.

The newest API-created commits on PRs #65 and #78–#81 do not yet have fresh workflow runs visible for their exact head SHAs. The isolated Windows tests above are evidence for the fetched files only; remote CI remains pending.


### Additional exact-branch worker tests — 2026-10-22T04:12Z

- PR #69 scoped worker and executor tests: **15/15 passed** in an isolated Windows directory using the fetched branch versions of `uf-local-worker.cjs`, `uf-local-worker.test.cjs`, `uf-scoped-executor.cjs`, `uf-scoped-executor.test.cjs`, and `uf-bridge-journal.cjs`. Coverage included bearer authentication, disabled writes without a token, idempotency, restart recovery, corrupt-journal fail-closed behavior, rooted workspace boundaries, symlink/path traversal rejection, no-overwrite semantics, and rejection of arbitrary shell-like actions.
- PR #78 allowlisted browser runner tests: **2/2 passed** in an isolated Windows directory using the fetched branch's `browser-task-runner.cjs` and `browser-task-runner.test.cjs`. Coverage included invalid host/query rejection and a loopback fixture whose out-of-allowlist page resource was blocked.
- These are tests of exact fetched branch source files, run locally; they are not GitHub Actions results. No browser runner or worker was promoted to a trusted execution boundary solely because these tests passed.
