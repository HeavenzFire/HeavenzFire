# Public-record evidence adapter

The adapter accepts an already-retrieved public record envelope and appends a normalized evidence event to the local evidence ledger. It does not perform network requests, scrape websites, or treat a record as independently verified.

## Usage

```js
const { ingestPublicRecord } = require('./public-record-adapter.cjs');

const result = ingestPublicRecord({
  ledgerPath: process.env.HF_EVIDENCE_LEDGER_FILE,
  allowedHosts: ['api.example.gov'],
  record: {
    taskId: 'audit-task-01',
    sourceName: 'Example public records API',
    recordId: 'record-123',
    title: 'Public award record',
    summary: 'Short factual summary based on the retrieved record.',
    sourceUrl: 'https://api.example.gov/v1/records/record-123',
    retrievedAt: new Date().toISOString(),
    rawContent: JSON.stringify(retrievedRecord)
  },
  actor: 'human-review'
});
console.log(result.ledgerEntry.entryHash);
```

Replace the example with a documented public endpoint. Pass an explicit host allowlist for the intended source; matching is exact-host or subdomain matching, not substring matching. The adapter requires HTTPS and rejects embedded URL credentials. If raw content is supplied, it is limited to 1 MiB and its SHA-256 is recorded; the raw content itself is not stored in the ledger by this adapter.

## Boundaries

- Retrieval is deliberately separate. A caller must fetch the source, record the retrieval timestamp, and preserve the raw response separately if retention is appropriate.
- The URL and artifact hash are provenance metadata, not proof that a record is authentic, complete, legally obtained, or correctly interpreted.
- The adapter does not infer fraud, misconduct, or intent. Investigative conclusions require source review, corroboration, and documented reasoning.
- Do not place secrets, restricted data, or unnecessary personal information in ledger summaries.
- The ledger is tamper-evident but not tamper-proof and assumes a single writer; see [EVIDENCE-LEDGER.md](./EVIDENCE-LEDGER.md).

## Tests

```powershell
node --check .\UnifiedField\FieldCore\public-record-adapter.cjs
node --test .\UnifiedField\FieldCore\public-record-adapter.test.cjs
```
