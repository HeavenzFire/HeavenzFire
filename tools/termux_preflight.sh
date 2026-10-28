#!/data/data/com.termux/files/usr/bin/bash
# Read-only Termux preflight for HeavenzFire's private Tailscale Serve transport.
# No installs, writes, task submissions, token handling, or TLS bypasses.
set -u

printf '%s\n' '=== HeavenzFire Termux preflight ==='
printf 'Platform: '; uname -a 2>/dev/null || true
printf 'HOME=%s\n' "${HOME:-unknown}"
printf 'PREFIX=%s\n' "${PREFIX:-unknown}"
printf '\n%s\n' '--- Utilities ---'
for tool in curl ssh git python python3 openssl tailscale ip; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '[FOUND]   %-10s %s\n' "$tool" "$(command -v "$tool")"
  else
    printf '[MISSING] %s\n' "$tool"
  fi
done

printf '\n%s\n' '--- Shared storage ---'
if [ -d "${HOME:-}/storage/shared" ]; then
  printf '%s\n' 'Shared storage link exists (contents not inspected).'
else
  printf '%s\n' 'Shared storage link absent; not required for network tests.'
fi

if [ "$#" -eq 0 ]; then
  cat <<'HELP'

No network request was made.
Optional read-only health check:
  bash tools/termux_preflight.sh <exact-windows-magicdns-hostname> <windows-tailscale-ip>

Use the exact hostname shown by Tailscale and the current IPv4 address of your
authorized Windows device. This pins the hostname to that IP for one HTTPS
request while retaining normal TLS certificate verification. It does not use
Tailscale Funnel, send a bearer token, or submit/execute a task.
HELP
  exit 0
fi

if [ "$#" -ne 2 ]; then
  printf '%s\n' 'Usage: bash tools/termux_preflight.sh [exact-hostname windows-tailscale-ip]' >&2
  exit 2
fi

HOST="$1"
IP="$2"

# Reject URL syntax, ports, paths, whitespace, and shell-significant characters.
case "$HOST" in
  ''|*[!A-Za-z0-9.-]*|.*|*..*|*.) printf '%s\n' 'Invalid hostname format.' >&2; exit 2 ;;
esac
# Require an IPv4 dotted quad syntactically; curl/Tailscale validates reachability.
case "$IP" in
  ''|*[!0-9.]*|.*|*..*|*.) printf '%s\n' 'Invalid IPv4 format.' >&2; exit 2 ;;
esac
old_ifs="$IFS"; IFS=.; set -- $IP; IFS="$old_ifs"
if [ "$#" -ne 4 ]; then
  printf '%s\n' 'IPv4 address must have four numeric octets.' >&2
  exit 2
fi
for octet in "$@"; do
  if [ "$octet" -gt 255 ] 2>/dev/null; then
    printf '%s\n' 'IPv4 octet is out of range.' >&2
    exit 2
  fi
done

if ! command -v curl >/dev/null 2>&1; then
  printf '%s\n' 'curl is required for the optional health check; no install was attempted.' >&2
  exit 3
fi

printf '\nTesting HTTPS health endpoint (read-only; no task submission)...\n'
curl --silent --show-error --connect-timeout 3 --max-time 8 \
  --resolve "${HOST}:443:${IP}" \
  --write-out '\nHTTP_STATUS:%{http_code}\n' \
  "https://${HOST}/health"
status=$?
if [ "$status" -ne 0 ]; then
  printf 'curl_exit=%s\n' "$status"
  exit "$status"
fi
