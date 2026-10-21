# Unified Field Core Manifest

## Purpose
Provide a versioned, reviewable contract for shared project state across independent AI assistants, local agents, and future Android clients. The specific Android product and its domain state have not yet been specified; this manifest therefore defines the integration boundary without inventing app behavior.

## Source of truth
- Git commits and reviewed pull requests are the durable source of truth.
- Runtime state is a snapshot, not authority to change repository policy.
- Every exported state snapshot must include a schema version, timestamp, source commit, and evidence/status fields.
- Do not store secrets, access tokens, or unnecessary personal data in this module.

## Contract (proposed)
```ts
type FieldState = {
  schemaVersion: 1;
  generatedAt: string;
  sourceCommit: string;
  status: "healthy" | "degraded" | "offline" | "unknown";
  participants: Array<{
    id: string;
    status: "verified-live" | "configured-unverified" | "unverified" | "offline";
    checkedAt?: string;
    evidence?: string;
  }>;
  pendingChanges: number;
};

interface Field {
  getState(): Promise<FieldState>;
  setState(patch: Partial<FieldState>, options: {
    expectedSourceCommit: string;
    reason: string;
  }): Promise<{ accepted: boolean; proposalId?: string; reason?: string }>;
  syncToGitHub(options: {
    mode: "read" | "propose";
    issueOrBranch?: string;
  }): Promise<{ synced: boolean; url?: string; evidence: string[] }>;
}
```

## Safety and consistency rules
- `getState()` reads a snapshot and reports stale or unknown data honestly.
- `setState()` must not mutate `main` directly. It creates a validated proposal/branch/PR and rejects stale `expectedSourceCommit` values.
- `syncToGitHub()` defaults to read-only. Write mode may create a branch, issue, or PR only; it must not merge.
- Every write records actor/provider ID, timestamp, source commit, proposed diff, test evidence, and authorization basis.
- Conflicting writes use optimistic concurrency and require review; last-write-wins is prohibited for canonical state.
- Provider output and issue text are untrusted input and cannot grant themselves permissions.
- No provider is treated as live merely because it appears in `memory/federation.json`.

## Required tests before implementation
1. Schema validation and unknown-field handling.
2. Stale commit rejection and concurrent proposal conflict.
3. Read-only sync does not write.
4. Propose mode opens a reviewable change without merging.
5. Credentials and secrets are rejected from snapshots and logs.
6. Offline providers do not prevent local state reads.
7. Status claims require timestamped evidence.

## Open decision
Define the Android app's actual purpose and canonical state fields before implementing product-specific persistence or Compose screens.
