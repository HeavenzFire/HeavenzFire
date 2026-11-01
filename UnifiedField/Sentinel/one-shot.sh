#!/usr/bin/env bash
# HeavenzFire Sentinel one-shot runner.
# Safe-by-default: fast-forward only, never stash/reset/overwrite local changes.
set -eu

BRANCH="feature/sentinel-bootstrap"
REPO_URL="https://github.com/HeavenzFire/HeavenzFire.git"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SENTINEL_DIR="$SCRIPT_DIR"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" || {
  echo "STOP: Sentinel must be run from a Git checkout."
  exit 2
}
REPORT_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/heavenzfire"
mkdir -p "$REPORT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$REPORT_DIR/sentinel-$STAMP.log"
TMP_REPORT="$REPORT.tmp"

exec > >(tee "$TMP_REPORT") 2>&1

echo "HEAVENZFIRE SENTINEL — ONE-SHOT ACCEPTANCE"
echo "UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Repository: $REPO_ROOT"
echo

fail() {
  echo "RESULT: BLOCKED"
  echo "Reason: $1"
  mv "$TMP_REPORT" "$REPORT"
  echo "Report: $REPORT"
  exit 2
}

command -v git >/dev/null 2>&1 || fail "Git is not installed."
command -v node >/dev/null 2>&1 || fail "Node.js is not installed."
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18 or newer is required; found $(node --version)."

cd "$REPO_ROOT"
CURRENT_BRANCH="$(git branch --show-current)"
if [ -n "$(git status --porcelain)" ]; then
  fail "Working tree has local changes. Nothing was stashed, reset, or overwritten; commit or back up those changes, then rerun."
fi

echo "[1/4] Synchronizing the approved Sentinel branch..."
git fetch origin "$BRANCH:refs/remotes/origin/$BRANCH" || fail "Could not fetch origin/$BRANCH."
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH" || fail "Could not switch to $BRANCH."
else
  git checkout -b "$BRANCH" --track "origin/$BRANCH" || fail "Could not create local tracking branch."
fi
git pull --ff-only origin "$BRANCH" || fail "Branch is not a safe fast-forward. No reset or force update was attempted."
echo "PASS: branch synchronized to origin/$BRANCH"
echo "Commit: $(git rev-parse --short HEAD)"
echo

echo "[2/4] Checking JavaScript syntax..."
node --check UnifiedField/Sentinel/scope-policy.cjs
node --check UnifiedField/Sentinel/passive-assessment.cjs
node --check UnifiedField/FieldCore/evidence-ledger.cjs
echo "PASS: core modules parse"
echo

echo "[3/4] Running offline acceptance suite..."
node UnifiedField/Sentinel/acceptance-test.cjs || fail "Offline acceptance suite failed. See report for the failing assertion."
echo

echo "[4/4] Recording reproducible run metadata..."
{
  echo
  echo "RUN_METADATA"
  echo "branch=$BRANCH"
  echo "commit=$(git rev-parse HEAD)"
  echo "node=$(node --version)"
  echo "platform=$(uname -srm 2>/dev/null || echo unknown)"
  echo "mode=offline"
  echo "network_assessment=not_performed"
} 
mv "$TMP_REPORT" "$REPORT"
echo
echo "RESULT: PASS"
echo "Report: $REPORT"
echo "No target was contacted. No production files were changed."
