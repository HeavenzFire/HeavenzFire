#!/usr/bin/env bash
# Regression guard: the read-only health probe must ignore curl config and proxies.
set -euo pipefail

script="tools/termux_preflight.sh"
if ! grep -Eq '(^|[[:space:]])curl[[:space:]]+-q([[:space:]]|$)' "$script"; then
  echo "FAIL: health probe must pass -q to disable user curl configuration" >&2
  exit 1
fi
if ! grep -Fq -- "--noproxy '*'" "$script"; then
  echo "FAIL: health probe must bypass configured proxies" >&2
  exit 1
fi

echo "PASS: curl configuration and proxy isolation flags are present"
