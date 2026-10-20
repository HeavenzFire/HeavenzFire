# Unified Field Evidence Ledger

The evidence ledger records compact, source-attributed observations as newline-delimited JSON. Each entry includes a sequence number, the preceding entry hash, a SHA-256 digest of its canonical payload, a task ID, an event kind, a bounded summary, an optional HTTP(S) source URL, an actor, an observation timestamp, and an optional SHA-256 digest for a separately stored artifact.

## API

Use Node.js 20 or newer:

```js
const { appendEvidence, verifyLedger } = require('./evidence-ledger.cjs');

appendEvidence(process.env.HF_EVIDENCE_LEDGER_FILE, {
  taskId: 'task-123',
  kind: 'source_observation',
  summary: 'The source page states that the report was published on the recorded date.',
  sourceUrl: 'https://example.org/report',
  actor: 'human-review'
});

const integrity = verifyLedger(process.env.HF_EVIDENCE_LEDGER_FILE);
console.log(integrity);
```

Set `HF_EVIDENCE_LEDGER_FILE` to a path chosen for the local environment. Do not commit private evidence, personal data, credentials, or restricted source material to this repository. Keep only a minimal factual summary and the source locator when appropriate.

## Integrity and limits

- The ledger is append-oriented and hash-chained; verification detects accidental edits, malformed entries, broken sequence numbers, and changed hashes.
- This is **tamper-evident, not tamper-proof**. An actor who can rewrite the whole file can recompute the chain. For stronger auditability, periodically export the final head hash to an independently controlled system or signed release.
- The implementation assumes a single writer. Do not have multiple processes append to the same ledger concurrently without adding an inter-process lock or transactional storage.
- A URL records provenance, not truth. It does not prove the source is accurate, that a page remains available, or that the cited claim follows from it.
- Artifact hashes identify bytes only when the artifact is retained and independently re-hashed. They do not establish authorship or legality.
- The module does not fetch URLs, execute tasks, grant approvals, or make legal/clinical determinations.
- Avoid putting sensitive or unnecessary personal information in summaries; ledger entries are plain text.

## Tests

```powershell
node --check .\UnifiedField\FieldCore\evidence-ledger.cjs
node --test .\UnifiedField\FieldCore\evidence-ledger.test.cjs
```
