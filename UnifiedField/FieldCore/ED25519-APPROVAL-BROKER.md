# Ed25519 human approval broker

This module supplies a cryptographic approval primitive for Unified Field. It is intentionally opt-in: adding this module does **not** enable bridge writes or orchestrator execution. The existing production entrypoints remain fail-closed until an operator configures the verifier and private-key custody workflow.

## Contract

An approval envelope is `{ payload, signature }`. The Ed25519 signature covers a canonical, key-sorted JSON representation of the payload. The payload binds:

- exact action name;
- SHA-256 digest of the exact action + subject object;
- canonical approver identity and rationale;
- issue time, expiry (maximum ten minutes), unique approval ID and nonce;
- protocol version and signature method.

Verification rejects a wrong action, changed subject, invalid signature, expired/future-dated envelope, excessive lifetime, malformed nonce, or replay. A successfully verified nonce is claimed with an exclusive file create and fsync; the marker survives process restarts. Use a separate state directory for each independently verifying service when the same signed envelope must be checked by both bridge and orchestrator. Never share private keys with agents or model processes.

## API

```js
const {
  generateEd25519KeyPair,
  signApproval,
  createEd25519ApprovalVerifier
} = require('./ed25519-approval-broker.cjs');

const keys = generateEd25519KeyPair(); // provision once; keep privateKey offline/protected
const subject = { taskId: '...', goalHash: '...' };
const evidence = signApproval({
  privateKey: keys.privateKey,
  action: 'execute_task',
  subject,
  approvedBy: 'operator identity',
  reason: 'Reviewed this exact task'
});
const verifier = createEd25519ApprovalVerifier({
  publicKey: keys.publicKey,
  stateDir: '/protected/path/approval-replay'
});
const verified = await verifier({ action: 'execute_task', subject, evidence });
```

Persist the private key outside the repository with restrictive OS permissions. Distribute only the public key to the service. Do not place either key in GitHub Actions secrets for ordinary CI tests; the tests generate ephemeral keys.

## Release gates not satisfied by this library alone

- No Windows OS-authenticated approval UI or operator identity enrollment is provided.
- No production bridge/orchestrator entrypoint is wired to this verifier yet.
- Replay state directory permissions, backup/restore, multi-process locking and filesystem semantics must be validated on the actual Windows host.
- The signer must run in an operator-controlled process, not an agent or model.
- CI unit tests are not evidence of a real human approval ceremony or host deployment.

Keep `approvalVerifier` unset in production until those gates are addressed. That preserves the current read-only / no-task-execution default.
