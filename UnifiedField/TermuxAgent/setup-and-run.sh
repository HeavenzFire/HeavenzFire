#!/data/data/com.termux/files/usr/bin/bash
# HeavenzFire Termux Local Agent bootstrap/runner.
# Downloads the agent, runs tests, locates/builds llama-server, discovers a GGUF model,
# starts the server if needed, and launches the interactive agent.
set -Eeuo pipefail

REPO_ROOT="${HF_REPO_ROOT:-$HOME/src/llama.cpp}"
AGENT_DIR="${HF_AGENT_DIR:-$HOME/HeavenzFire/TermuxAgent}"
BRANCH="main"
RAW_BASE="https://raw.githubusercontent.com/HeavenzFire/HeavenzFire/$BRANCH/UnifiedField/TermuxAgent"
HOST="127.0.0.1"
PORT="${HF_SERVER_PORT:-8080}"
CONTEXT="${HF_CONTEXT_SIZE:-2048}"
JOBS="${HF_BUILD_JOBS:-2}"
MODEL="${HF_MODEL_PATH:-}"
ENDPOINT="http://127.0.0.1:$PORT/v1/chat/completions"
SERVER_LOG="$AGENT_DIR/llama-server.log"
SERVER_PID_FILE="$AGENT_DIR/llama-server.pid"

die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
note() { printf '\n==> %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

[[ "$PREFIX" == *"/com.termux/"* ]] || printf 'Warning: this script is designed for Android Termux.\n' >&2
need curl
need node
mkdir -p "$AGENT_DIR"

note "Downloading HeavenzFire Local Agent files"
for file in agent.cjs agent.test.cjs README.md; do
  curl --fail --silent --show-error --location "$RAW_BASE/$file" -o "$AGENT_DIR/$file.tmp" ||
    die "Could not download $file from branch $BRANCH"
  [[ -s "$AGENT_DIR/$file.tmp" ]] || die "Downloaded file is empty: $file"
  mv "$AGENT_DIR/$file.tmp" "$AGENT_DIR/$file"
done

note "Checking JavaScript syntax and running tests"
node --check "$AGENT_DIR/agent.cjs"
node --test "$AGENT_DIR/agent.test.cjs"

find_server() {
  local candidate
  for candidate in \
    "$REPO_ROOT/build/bin/llama-server" \
    "$REPO_ROOT/build/bin/server" \
    "$PREFIX/bin/llama-server" \
    "$HOME/bin/llama-server"; do
    if [[ -x "$candidate" ]]; then printf '%s\n' "$candidate"; return 0; fi
  done
  command -v llama-server 2>/dev/null || return 1
}

SERVER_BIN=""
if SERVER_BIN="$(find_server)"; then
  note "Found llama server: $SERVER_BIN"
else
  [[ -d "$REPO_ROOT" && -f "$REPO_ROOT/CMakeLists.txt" ]] ||
    die "llama-server is missing and llama.cpp source was not found at $REPO_ROOT. Set HF_REPO_ROOT to the source directory."
  need cmake
  note "llama-server not found; building target from existing llama.cpp source (parallel jobs: $JOBS)"
  [[ -f "$REPO_ROOT/build/CMakeCache.txt" ]] ||
    cmake -S "$REPO_ROOT" -B "$REPO_ROOT/build" -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF
  cmake --build "$REPO_ROOT/build" --target llama-server --parallel "$JOBS" ||
    die "llama-server build failed. The source/build error must be fixed before a local inference session can start."
  SERVER_BIN="$(find_server)" || die "Build completed but llama-server binary was not found."
fi

if [[ -z "$MODEL" ]]; then
  note "Searching common local model directories for a GGUF file"
  for dir in "$HOME/models" "$HOME/Models" "$HOME/storage/shared/Download" "$HOME/storage/shared/Downloads" "$HOME"; do
    [[ -d "$dir" ]] || continue
    MODEL="$(find "$dir" -maxdepth 4 -type f -iname '*.gguf' -print -quit 2>/dev/null || true)"
    [[ -n "$MODEL" ]] && break
  done
fi
[[ -n "$MODEL" && -f "$MODEL" ]] ||
  die "No GGUF model found. Put a model under ~/models or rerun with HF_MODEL_PATH=/absolute/path/to/model.gguf $0"
case "$MODEL" in *.gguf|*.GGUF) ;; *) die "Model path must point to a .gguf file: $MODEL" ;; esac

note "Checking whether the local inference endpoint is already responding"
if curl --fail --silent --max-time 2 "http://127.0.0.1:$PORT/v1/models" >/dev/null; then
  note "An OpenAI-compatible inference server responds on port $PORT; reusing it without starting a duplicate."
else
  note "Starting llama-server on loopback only"
  nohup "$SERVER_BIN" -m "$MODEL" --host "$HOST" --port "$PORT" -c "$CONTEXT" >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  printf '%s\n' "$SERVER_PID" > "$SERVER_PID_FILE"
  ready=0
  for _ in $(seq 1 90); do
    if curl --fail --silent --max-time 2 "$ENDPOINT" >/dev/null 2>&1; then ready=1; break; fi
    # /v1/models is a GET readiness route; avoid sending an invalid POST to chat completions.
    if curl --fail --silent --max-time 2 "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1; then ready=1; break; fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      tail -n 80 "$SERVER_LOG" >&2 || true
      die "llama-server exited during startup; see $SERVER_LOG"
    fi
    sleep 2
  done
  [[ "$ready" == 1 ]] || { tail -n 80 "$SERVER_LOG" >&2 || true; die "Timed out waiting for llama-server; see $SERVER_LOG"; }
fi

note "Launching HeavenzFire Local Agent"
export HF_LOCAL_ENDPOINT="$ENDPOINT"
export HF_LOCAL_MODEL="${HF_LOCAL_MODEL:-local-model}"
cd "$AGENT_DIR"
exec node ./agent.cjs
