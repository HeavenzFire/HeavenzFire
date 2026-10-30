#!/data/data/com.termux/files/usr/bin/bash
# Reproducible validation for HeavenzFire's Termux local-first agent.
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$SCRIPT_DIR/../../..")"
cd "$REPO_ROOT"
printf '%s\n' '== Runtime =='
node --version
node -e "if (Number(process.versions.node.split('.')[0]) < 18) { console.error('Node.js 18+ required for built-in fetch'); process.exit(1); }"
printf '%s\n' '== Syntax checks =='
for file in agent.cjs github.cjs github-write.cjs github-cli.cjs orchestrate.cjs remote-task-cli.cjs; do node --check "UnifiedField/TermuxAgent/$file"; done
printf '%s\n' '== Automated tests =='
for file in agent.test.cjs github.test.cjs github-write.test.cjs orchestrate.test.cjs remote-task-cli.test.cjs; do node --test "UnifiedField/TermuxAgent/$file"; done
if [ "${HF_LOCAL_SMOKE:-0}" = "1" ]; then
  printf '%s\n' '== Live local inference smoke test =='
  node - <<'NODE'
const { askLocal } = require('./UnifiedField/TermuxAgent/agent.cjs');
const endpoint = process.env.HF_LOCAL_ENDPOINT || 'http://127.0.0.1:8080/v1/chat/completions';
const model = process.env.HF_LOCAL_MODEL || 'local-model';
askLocal({ endpoint, model, timeoutMs: 30000, messages: [{ role: 'user', content: 'Reply with exactly: HEAVENZFIRE_LOCAL_SMOKE_OK' }] })
  .then(answer => { console.log('Endpoint:', endpoint); console.log('Model label:', model); console.log('Response:', answer); if (!answer.trim()) process.exitCode = 1; })
  .catch(error => { console.error('Live inference smoke test failed:', error.message || error); process.exitCode = 1; });
NODE
else
  printf '%s\n' 'Live inference not attempted. Set HF_LOCAL_SMOKE=1 after starting your local llama-server.'
fi
printf '%s\n' 'Verification script completed.'
