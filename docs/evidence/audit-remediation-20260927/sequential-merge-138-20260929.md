# PR #138 sequential verification — 2026-09-29

This slice changes only receipt date formatting/font byte caching and synthetic benchmark documentation. No migration, payment activation, receipt issuance or notification is required to deploy its code. The prior #137 application must merge first; its separately approved schema is already applied.

Updated local tree after merging predecessor 32e4c85:

- `bun test --isolate` with explicit local RLS 52321 and checkout DB 57322: exit 0; 2825 pass, 83 skip, 0 fail; 8632 assertions.
- `bun run typecheck`: exit 0.
- `bun run lint`: exit 0; 52 warnings and zero errors.
- `bun run build` with fixture configuration: exit 0; generated route tree unchanged.
- Diff review confirms explicit Asia/Hong_Kong date formatting, shared font-byte promise with rejection reset, fresh PDFDocument and embedded font per receipt, subset:false unchanged.
- Existing synthetic UTC date before/after renders and 100-PDF benchmark remain in receipt-qa/. No new performance improvement is claimed and no real receipt was issued.
- New-head remote CI is a separate gate before merge.

Prior production schema applications were individually approved and verified: checkout_policy_gate version 20260929003610; payment_instruction_snapshots version 20260929004923; donation_delivery_recovery version 20260929010634. Statement hashes match the reviewed source files; ledger count is 82 with no historical relabelling. Checkout remains false, delivery jobs zero at the last read, and CRON_SECRET absent. New delivery scheduling, historical replay, real payment and notification tests remain disabled/not-run.

#134/#135/#136 are merged and READY, with post-merge five-job CI success. #137 is awaiting its final PR CI gates and merge. Supabase advisors after the latest approved DDL report INFO no-policy entries for the intentional service-only checkout/snapshot/delivery tables; public role grants remain denied.

Rollback for #138: retain the HKT date fix if the font cache needs to be reverted. Never share PDFDocument/font objects between receipts. No schema rollback is involved. Receipt-number allocation and tax-year policy are unchanged.
