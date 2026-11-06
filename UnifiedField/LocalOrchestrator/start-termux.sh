#!/data/data/com.termux/files/usr/bin/bash
# Starts one local llama.cpp runtime and the Unified Field 16-role orchestrator.
# Safe to rerun: healthy matching services are reused; unrelated port occupants are never killed.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
MODEL_PATH="${HF_MODEL_PATH:-$HOME/HeavenzFire/models/qwen2.5-0.5b-instruct-q4_k_m.gguf}"
MODEL_LABEL="${HF_LLAMA_CPP_MODEL:-qwen2.5-0.5b-instruct-q4_k_m.gguf}"
LLAMA_BIN="${HF_LLAMA_CPP_BIN:-$(command -v llama-server 2>/dev/null || true)}"
LLAMA_PORT="${HF_LLAMA_CPP_PORT:-18080}"
ORCHESTRATOR_PORT="${HF_ORCHESTRATOR_PORT:-18797}"
CONTEXT_SIZE="${HF_CONTEXT_SIZE:-1024}"
THREADS="${HF_THREADS:-4}"
STATE_DIR="${HF_UNIFIED_FIELD_STATE_DIR:-$HOME/.cache/heavenzfire/unified-field}"
LLAMA_URL="http://127.0.0.1:$LLAMA_PORT"
ORCHESTRATOR_URL="http://127.0.0.1:$ORCHESTRATOR_PORT"
LLAMA_LOG="$STATE_DIR/llama-server.log"
ORCHESTRATOR_LOG="$STATE_DIR/orchestrator.log"

die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
note() { printf '\n==> %s\n' "$*"; }
port_busy() {
  command -v ss >/dev/null 2>&1 || return 1
  ss -ltn 2>/dev/null | grep -Eq "[:.]$1[[:space:]]"
}

[[ -f "$REPO_ROOT/UnifiedField/LocalOrchestrator/orchestrator.cjs" ]] || die "Run this script from a complete HeavenzFire repository checkout."
command -v node >/dev/null 2>&1 || die "Node.js is required."
command -v curl >/dev/null 2>&1 || die "curl is required."
node -e "if (Number(process.versions.node.split('.')[0]) < 18) process.exit(1)" || die "Node.js 18 or later is required."
[[ -n "$LLAMA_BIN" && -x "$LLAMA_BIN" ]] || die "llama-server not found. Install it or set HF_LLAMA_CPP_BIN."
[[ -f "$MODEL_PATH" ]] || die "GGUF model not found at $MODEL_PATH. Set HF_MODEL_PATH to its exact path."
mkdir -p "$STATE_DIR"

note "Checking local llama.cpp at $LLAMA_URL"
if curl -q --noproxy "*" --fail --silent --max-time 2 "$LLAMA_URL/v1/models" >/dev/null 2>&1; then
  note "Existing llama.cpp endpoint detected; reusing it."
else
  port_busy "$LLAMA_PORT" && die "Port $LLAMA_PORT is occupied but is not a healthy llama.cpp endpoint. No process was stopped."
  note "Starting llama-server on 127.0.0.1 only"
  nohup "$LLAMA_BIN" -m "$MODEL_PATH" --host 127.0.0.1 --port "$LLAMA_PORT" -c "$CONTEXT_SIZE" -t "$THREADS" -ngl 0 >"$LLAMA_LOG" 2>&1 &
  printf '%s\n' "$!" > "$STATE_DIR/llama-server.pid"
  ready=0
  for attempt in $(seq 1 45); do
    if curl -q --noproxy "*" --fail --silent --max-time 2 "$LLAMA_URL/v1/models" >/dev/null 2>&1; then ready=1; break; fi
    if ! kill -0 "$(cat "$STATE_DIR/llama-server.pid")" 2>/dev/null; then
      tail -n 60 "$LLAMA_LOG" >&2 || true
      die "llama-server exited during startup."
    fi
    sleep 2
  done
  [[ "$ready" = 1 ]] || { tail -n 60 "$LLAMA_LOG" >&2 || true; die "Timed out waiting for llama.cpp readiness."; }
fi

note "Running a real local inference smoke test"
HF_LLAMA_CPP_MODEL="$MODEL_LABEL" HF_LLAMA_CPP_URL="$LLAMA_URL" node <<'NODE'
(async () => {
  const response = await fetch(process.env.HF_LLAMA_CPP_URL + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.HF_LLAMA_CPP_MODEL,
      stream: false,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with exactly: UNIFIED_FIELD_LOCAL_INFERENCE_OK' }]
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) throw new Error('llama_cpp_smoke_http_' + response.status);
  const payload = await response.json();
  const answer = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('llama_cpp_smoke_empty_response');
  process.stdout.write('LLAMA_CPP_INFERENCE=PASS MODEL=' + (payload.model || process.env.HF_LLAMA_CPP_MODEL) + '\n');
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
NODE

note "Checking Unified Field orchestrator at $ORCHESTRATOR_URL"
health_file="$STATE_DIR/orchestrator-health.json"
if curl -q --noproxy "*" --fail --silent --max-time 2 "$ORCHESTRATOR_URL/health" -o "$health_file"; then
  HF_EXPECTED_MODEL="$MODEL_LABEL" node - "$health_file" <<'NODE'
const fs = require('node:fs');
const health = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (health.service !== 'heavenzfire-local-16-agent-orchestrator' ||
    health.provider !== 'llama.cpp' ||
    health.model !== process.env.HF_EXPECTED_MODEL ||
    health.bind !== '127.0.0.1') {
  throw new Error('An unrelated or differently configured orchestrator is already using this port.');
}
console.log('ORCHESTRATOR=REUSED PROVIDER=' + health.provider + ' MODEL=' + health.model);
NODE
else
  port_busy "$ORCHESTRATOR_PORT" && die "Port $ORCHESTRATOR_PORT is occupied by an unhealthy or unrelated process. No process was stopped."
  note "Starting the Unified Field orchestrator"
  (
    export HF_ORCHESTRATOR_HOST=127.0.0.1
    export HF_ORCHESTRATOR_PORT="$ORCHESTRATOR_PORT"
    export HF_ORCHESTRATOR_PROVIDER=llama-cpp
    export HF_LLAMA_CPP_URL="$LLAMA_URL"
    export HF_LLAMA_CPP_MODEL="$MODEL_LABEL"
    exec node "$REPO_ROOT/UnifiedField/LocalOrchestrator/orchestrator.cjs"
  ) >"$ORCHESTRATOR_LOG" 2>&1 &
  printf '%s\n' "$!" > "$STATE_DIR/orchestrator.pid"
  ready=0
  for attempt in $(seq 1 20); do
    if curl -q --noproxy "*" --fail --silent --max-time 2 "$ORCHESTRATOR_URL/health" -o "$health_file"; then
      if node - "$health_file" <<'NODE'
const fs = require('node:fs');
const health = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.exit(health.service === 'heavenzfire-local-16-agent-orchestrator' &&
  health.provider === 'llama.cpp' && health.bind === '127.0.0.1' ? 0 : 1);
NODE
      then ready=1; break; fi
    fi
    if ! kill -0 "$(cat "$STATE_DIR/orchestrator.pid")" 2>/dev/null; then
      tail -n 60 "$ORCHESTRATOR_LOG" >&2 || true
      die "Orchestrator exited during startup."
    fi
    sleep 1
  done
  [[ "$ready" = 1 ]] || { tail -n 60 "$ORCHESTRATOR_LOG" >&2 || true; die "Timed out waiting for orchestrator health."; }
fi

printf '\nUNIFIED_FIELD=READY\n'
printf 'LLAMA_CPP=%s\n' "$LLAMA_URL"
printf 'ORCHESTRATOR=%s\n' "$ORCHESTRATOR_URL"
printf 'AGENT_ROLES=16 MAX_PARALLEL=4\n'
printf 'TASK_LEDGER=%s\n' "${HF_TASK_LEDGER_PATH:-$REPO_ROOT/UnifiedField/LocalOrchestrator/data/tasks.jsonl}"
printf 'APPROVAL=FAIL_CLOSED (no trusted human-approval broker configured)\n'
printf 'LOGS=%s\n' "$STATE_DIR"
printf '\n'
curl -q --noproxy "*" --fail --silent "$ORCHESTRATOR_URL/health"
printf '\n'
