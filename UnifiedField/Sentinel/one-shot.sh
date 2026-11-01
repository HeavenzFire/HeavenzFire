#!/usr/bin/env bash
# HeavenzFire Sentinel preservation-first one-shot runner.
# Runs against the CURRENT checkout. Never switches branches, fetches, pulls,
# stashes, resets, cleans, installs packages, or modifies project files.
set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" || {
  echo "STOP: Sentinel must be inside a Git checkout."
  exit 2
}
REPORT_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/heavenzfire"
mkdir -p "$REPORT_DIR" || exit 2
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$REPORT_DIR/sentinel-$STAMP.log"
: > "$REPORT" || exit 2
exec > >(tee -a "$REPORT") 2>&1

PASS=0
WARN=0
FAIL=0
BLOCK=0

pass() { PASS=$((PASS+1)); echo "PASS: $1"; }
warn() { WARN=$((WARN+1)); echo "WARN: $1"; }
fail() { FAIL=$((FAIL+1)); echo "FAIL: $1"; }
block() { BLOCK=$((BLOCK+1)); echo "BLOCKED: $1"; }

echo "HEAVENZFIRE — PRESERVATION-FIRST ONE-SHOT"
echo "UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Repository: $REPO_ROOT"
cd "$REPO_ROOT" || exit 2

if ! command -v git >/dev/null 2>&1; then
  block "Git unavailable; cannot inventory repository state."
else
  echo
  echo "[1] Repository state — read only"
  echo "Branch: $(git branch --show-current)"
  echo "HEAD: $(git rev-parse HEAD)"
  STATUS="$(git status --porcelain=v1 -uall 2>&1)"
  STATUS_RC=$?
  if [ "$STATUS_RC" -eq 0 ]; then
    if [ -n "$STATUS" ]; then
      echo "Working-tree changes:"
      printf '%s\n' "$STATUS"
      warn "Existing changes detected and preserved; tests will run against current files."
    else
      pass "Working tree clean."
    fi
    echo "Diff summary:"
    git diff --stat
    echo "Staged summary:"
    git diff --cached --stat
    echo "Untracked top-level paths:"
    git ls-files --others --exclude-standard
  else
    fail "Could not read Git status: $STATUS"
  fi
fi

echo
echo "[2] Runtime prerequisites"
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node --version)"
  NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null)"
  echo "Node: $NODE_VERSION"
  if [ "${NODE_MAJOR:-0}" -ge 18 ]; then pass "Node.js 18+ available."; else block "Node.js 18+ required; found $NODE_VERSION."; fi
else
  block "Node.js unavailable; no package installation attempted."
fi

echo
echo "[3] Sentinel module syntax"
if command -v node >/dev/null 2>&1; then
  for FILE in \
    UnifiedField/Sentinel/scope-policy.cjs \
    UnifiedField/Sentinel/passive-assessment.cjs \
    UnifiedField/Sentinel/acceptance-test.cjs \
    UnifiedField/FieldCore/evidence-ledger.cjs
  do
    if [ -f "$FILE" ]; then
      if node --check "$FILE"; then pass "Syntax: $FILE"; else fail "Syntax check: $FILE"; fi
    else
      fail "Required file missing: $FILE"
    fi
  done
else
  block "Syntax checks skipped because Node.js is unavailable."
fi

echo
echo "[4] Offline acceptance tests"
if command -v node >/dev/null 2>&1 && [ -f UnifiedField/Sentinel/acceptance-test.cjs ]; then
  if node UnifiedField/Sentinel/acceptance-test.cjs; then
    pass "Sentinel offline acceptance runner."
  else
    fail "Sentinel offline acceptance runner returned nonzero."
  fi
else
  block "Acceptance tests unavailable."
fi

echo
echo "[5] Run metadata"
echo "branch=$(git branch --show-current 2>/dev/null || echo unknown)"
echo "commit=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
echo "node=$(node --version 2>/dev/null || echo unavailable)"
echo "platform=$(uname -srm 2>/dev/null || echo unknown)"
echo "mode=offline-current-checkout"
echo "network_assessment=not_performed"
echo "project_mutations=none"

echo
echo "SUMMARY: PASS=$PASS WARN=$WARN FAIL=$FAIL BLOCKED=$BLOCK"
if [ "$FAIL" -gt 0 ] || [ "$BLOCK" -gt 0 ]; then
  echo "RESULT: NEEDS_ATTENTION"
  echo "Report: $REPORT"
  exit 1
fi
echo "RESULT: ACCEPTANCE_CHECKS_PASSED"
echo "Report: $REPORT"
