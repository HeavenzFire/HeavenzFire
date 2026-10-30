# Unified Field Remote Task Transport (Tailscale Serve)

**Status:** implementation and automated tests are in PR #110; live two-device deployment is not yet verified.

## Security model

- The worker listens only on `127.0.0.1` (default port `8798`).
- Tailscale Serve provides HTTPS within the tailnet and proxies to the loopback worker.
- The worker accepts the configured Serve hostname only when the TCP peer is loopback and the Host header exactly matches `HEAVENZFIRE_TRUSTED_PROXY_HOST`.
- The remote client requires HTTPS, the exact hostname allowlist, no redirects, a bounded timeout, and the worker's bearer token.
- The endpoint queues a proposal; it does not execute the proposal.
- Never use Tailscale Funnel for this service. Funnel is public internet exposure, not tailnet-only access.

Official Serve reference: https://tailscale.com/docs/reference/tailscale-cli/serve

## Windows deployment checklist

Run from an elevated or ordinary PowerShell window as appropriate for your existing Node/Tailscale installation. Do not paste the bearer token into a GitHub issue, commit, or chat.

1. Confirm Tailscale is connected and inspect the current Serve configuration:

   ```powershell
   tailscale status
   tailscale serve status
   ```

2. Set the exact MagicDNS hostname shown by Tailscale. Do not guess it:

   ```powershell
   $env:HEAVENZFIRE_TRUSTED_PROXY_HOST = 'YOUR-EXACT-DEVICE-NAME.YOUR-TAILNET.ts.net'
   $env:HEAVENZFIRE_BRIDGE_PORT = '8798'
   $env:HEAVENZFIRE_BRIDGE_JOURNAL = Join-Path $env:LOCALAPPDATA 'HeavenzFire\UnifiedFieldRuntime\state\remote-tasks.jsonl'
   ```

3. Set `HEAVENZFIRE_BRIDGE_TOKEN` to a long, unique secret using your password manager or a secure secret-generation tool. Keep the same token only on the authorized client device. Do not put it in the repository or command history.

4. Start the worker from the repository root:

   ```powershell
   node .\UnifiedField\QuantumLab\uf-local-worker.cjs
   ```

   In a second PowerShell window, set the same `HEAVENZFIRE_TRUSTED_PROXY_HOST` and run:

   ```powershell
   tailscale serve --bg 8798
   tailscale serve status
   ```

   Verify the Serve hostname and that the target is `http://127.0.0.1:8798`. Keep tailnet ACLs limited to the devices/users that should access this API.

5. On the authorized remote client, configure `createRemoteTaskClient` with:
   - `baseUrl`: `https://YOUR-EXACT-DEVICE-NAME.YOUR-TAILNET.ts.net/`
   - `allowedHosts`: an array containing only that exact hostname
   - `token`: the matching bearer secret

6. Call `connect()`, then `listTasks()` or `submitTask(task)`. A successful handshake alone is not proof that proposal submission works; verify the returned task status.

7. Verify the live service from the remote device. Submit only a harmless test proposal with a unique task ID and idempotency key, list tasks, submit the identical proposal again, and confirm it is reported as a duplicate rather than creating a second record. Confirm no task is executed.

8. Stop sharing when not needed with `tailscale serve off`. This disables Serve; it does not stop the local worker. Stop the worker separately with Ctrl+C.

## Android/Termux diagnostic when MagicDNS does not resolve

A hostname lookup failure is not proof that the worker is down. First confirm the Android Tailscale app says **Connected** and shows the Windows device online. Copy the Windows device's current Tailscale IPv4 address from Tailscale; do not guess it.

A no-install, read-only preflight script is available at `tools/termux_preflight.sh`. From a checkout of this repository in Termux, run:

```sh
bash tools/termux_preflight.sh
```

This inventories common utilities without installing packages or changing settings. To test the read-only health endpoint while isolating MagicDNS resolution, pass the exact Windows MagicDNS hostname and its current Tailscale IPv4 address:

```sh
bash tools/termux_preflight.sh 'YOUR-EXACT-DEVICE-NAME.YOUR-TAILNET.ts.net' '100.x.y.z'
```

The script uses `curl --resolve` to pin the hostname to the supplied IP for this request while keeping the HTTPS hostname for certificate validation. It does not disable TLS verification, expose the service publicly, send the bearer token, or submit/execute a task. Do not use `-k` or disable certificate validation.

Interpret the result:

- `HTTP_STATUS:200` with JSON containing `"ok":true`: the private route, Serve proxy, and worker health endpoint responded.
- `HTTP_STATUS:400` with `invalid_host`: the worker's `HEAVENZFIRE_TRUSTED_PROXY_HOST` does not match the exact HTTPS hostname being used, or the request is not arriving through the expected local proxy.
- `HTTP_STATUS:502` or `503`: inspect `tailscale serve status` and confirm the worker is listening on `127.0.0.1:8798`; the precise response body matters.
- `HTTP_STATUS:000`, timeout, or connection failure: verify both devices are connected to the same tailnet, the copied IP is current, and ACL/device approval permits the path. This result alone does not identify which of those is at fault.
- A TLS certificate error: re-check the exact MagicDNS hostname and system time. Do not use `-k` or disable certificate validation.

If the IP-pinned request works but the normal hostname request fails, investigate MagicDNS/DNS settings. If both fail, continue with tailnet reachability and Serve/worker checks before changing application code.

## Rollback and failure behavior

- If hostname, TLS, token, handshake, or task validation fails, do not weaken the checks to force success.
- If the hostname changes, update the worker's exact trusted-host setting and the client allowlist together.
- If the tailnet ACLs are broader than intended, turn Serve off until the ACL policy is corrected.
- The worker's in-memory handshake nonce cache is not a distributed replay store; it is suitable for this loopback handshake, not a multi-instance production authorization service.
- This transport does not implement durable approval expiry/consumption and does not enable execution. Those remain separate release blockers.
