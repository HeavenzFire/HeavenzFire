# Family Medical-Billing Accountability Kit

Status: **proposal / educational workflow**. This repository does not provide legal advice, determine liability, or promise reimbursement. Verify rules and deadlines for the state, plan, service date, and specific claim.

## Privacy and safety first

- Do not upload names, dates of birth, addresses, account/member IDs, claim numbers, medical records, diagnosis details, bills, signatures, or contact information to a public repository, issue, pull request, or public AI chat.
- Keep originals in a family-controlled private location. Share only the minimum necessary with a verified advocate, insurer, provider, regulator, or attorney.
- Use a random case code. Keep the identity-to-case-code key offline and separately protected.
- Do not stop necessary cancer treatment or ignore court papers because a bill is disputed. Ask the provider and insurer about financial assistance, payment holds, appeal timelines, and continuity of care in writing.
- Do not publicly accuse an organization of theft based on a bill alone. Record facts, source documents, disputed issues, and unknowns separately.

## 1. Open a private case record

Record a random case code, service date range, state, coverage type, provider and billing entity, insurer or plan administrator, collector if any, timeline, requested remedy, status, and deadlines. Keep claim/account identifiers only in private case storage. Every deadline must include its source and be verified; never guess.

Suggested statuses: NEW, DOCUMENTS_REQUESTED, UNDER_REVIEW, APPEAL_PENDING, COMPLAINT_PENDING, RESOLVED, UNRESOLVED.

## 2. Collect and reconcile evidence

Obtain copies where applicable:

1. Itemized provider bill and account ledger.
2. Insurer Explanation of Benefits (EOB), claim determination, denial reason, and plan language.
3. Payment receipts, bank/card proof, refunds, adjustments, and assistance awards.
4. Financial-assistance policy and the family's application, decision, and correspondence.
5. Collection letters and credit-report entries, if relevant.
6. Written call notes: date/time, representative, department, reference number, and exact commitments.

Build a reconciliation table in private storage:

| Line item | Provider charge | Insurer allowed/paid | Assistance/adjustments | Family paid | Current claimed balance | Evidence / open question |
|---|---:|---:|---:|---:|---:|---|
| Private case data only | | | | | | |

Do not infer that a balance is unlawful solely because it is high or financially devastating. Identify the applicable rule or contract, service date, facts, and evidence.

## 3. Check common review paths

- **Billing or coding error:** request an itemized bill, coding review, corrected claim, and written explanation of the balance.
- **Insurance denial or underpayment:** follow appeal instructions and deadlines in the denial and plan documents; ask whether expedited appeal or external review is available.
- **Financial assistance / charity care:** request the hospital's written policy, application, eligibility criteria, and whether collections can be paused while review is pending. For tax-exempt hospitals, have a qualified adviser review applicable Section 501(r) financial-assistance and billing/collection obligations.
- **Potential surprise-billing issue:** check whether the federal No Surprises Act or state law applies to this service and plan; contact the CMS No Surprises Help Desk for guidance.
- **Debt collection or credit-reporting issue:** request validation where applicable, dispute inaccurate information in writing, preserve delivery proof, and use the relevant consumer-protection complaint channel.
- **Possible misconduct or repeated pattern:** preserve primary documents and submit a factual complaint to the regulator with jurisdiction. Request investigation; do not state a legal conclusion as established unless supported by a competent authority or adjudication.
- **Refund or restitution:** calculate the amount from documented payments and the specific rule, contract, or correction supporting repayment. Request an itemized explanation and written refund decision. Consult a qualified attorney or legal-aid service about limitation periods, litigation, class actions, and damages.

## 4. Calculate a defensible remedy

For each disputed item, record the amount actually paid by the family; amounts reversed, refunded, or credited; amount requested back; exact basis; supporting document IDs and dates; response received; and next deadline.

Keep separate totals for **confirmed overpayment**, **requested refund**, **disputed outstanding balance**, and **unverified estimate**. A requested refund is not a recovered refund.

## 5. Escalation packet

Prepare a short factual packet containing:
1. One-page chronology.
2. Itemized amount reconciliation.
3. Relevant bill, EOB/denial, assistance decision, payments, and prior written requests.
4. Precise requested outcome and response date.
5. Applicable rule/policy citations verified for this case.
6. Exhibit index and redaction checklist.

Ask the recipient to preserve records, explain disputed lines in writing, pause collections where required or voluntarily agreed, correct errors, reprocess claims, review assistance eligibility, and refund documented overpayments when supported. Avoid threats, harassment, or unsupported public allegations.

## 6. Outcome measures for the Unified Field

Aggregate only opt-in, de-identified case data. Do not publish small groups that could identify a family.

Track cases opened/completed; days to first substantive response and resolution; dollars billed, disputed, confirmed corrected, and actually refunded as separate metrics; collection holds and credit corrections confirmed in writing; appeal outcomes and reasons; and unresolved cases, missed deadlines, and adverse outcomes.

Report denominators, time period, source, missingness, and uncertainty. A complaint is not a finding of wrongdoing.

## Starter source directory (verify current versions)

- CMS No Surprises Act and Help Desk: https://www.cms.gov/nosurprises
- CMS hospital price transparency: https://www.cms.gov/priorities/key-initiatives/hospital-price-transparency
- IRS tax-exempt hospital requirements / Section 501(r): https://www.irs.gov/charities-non-profits/charitable-organizations/requirements-for-501c3-organizations
- Consumer Financial Protection Bureau complaint portal: https://www.consumerfinance.gov/complaint/
- CFPB consumer credit information: https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/
- HealthCare.gov appeals: https://www.healthcare.gov/appeal-insurance-company-decision/
- Legal Services Corporation legal-aid locator: https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help

## Acceptance criteria for future implementation

- Local-first storage by default; no patient-level information sent to a remote model without explicit informed consent and privacy/security review.
- Redaction and export preview before any share/export.
- Auditable record of changes to case status and remedy amounts.
- Every legal/policy assertion includes jurisdiction, applicable date, source URL, and review date.
- Reminders show their source deadline and require human confirmation.
- Never autonomously submit complaints, contact providers, make payments, or publish accusations.
- Tests cover redaction, duplicate evidence, conflicting amounts, missing sources, stale deadlines, access control, export leakage, and retention policy.
