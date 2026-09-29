# Release slice 03 — approved payment instructions and durable snapshots (T04)

Branch: `codex/audit-payment-instructions-20260927`, stacked on draft PR #135. Base SHA `953b703`; production remains `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`. No live payment method was approved or enabled.

## Behavior

- New donor admission captures config ID/version, purpose, method, public labels/details and capture time in `checkout_admission` in the same transaction as the policy check. A database approval trigger and both server projections reject missing manual account details. Manual FPS/PayMe requires nonempty approved `payableTo` and `identifier`. The API and donor result render this snapshot; when current approval/version is withdrawn, the response preserves the reference but asks staff to verify arrangements instead of showing stale details.
- New sponsorship pledge confirmation uses a service-only command to store the approved instruction snapshots by pledge/method. A later send returns only snapshots whose current approval, visible published config, version and details still match. Old evidence is retained when instructions are withdrawn. The email renderer uses the same instruction resolver as donations; without verified instructions it sends a contact/reference message.
- Production code no longer contains the old FPS ID, bank account or PayPal/Give.asia short links as payment instructions. Proof metadata choices in the sponsorship wizard are a separate T08 issue.

## Verification

- Reproduced before fix: `bun test src/lib/sponsorship/emailTemplates.server.test.ts -t 'pending email without approved instructions'` exited 1 and exposed old accounts; `bun test src/lib/donations/service.test.ts -t 'manual instructions come'` exited 1 and ignored the admitted snapshot. Both pass after the fix.
- `bunx supabase migration up --local` on the unlinked `127.0.0.1:57322` stack applied the 36th migration, exit 0. Sequential isolated DB suites: checkout admission 1 pass/21 expectations; instruction snapshots 1 pass/16 expectations, both exit 0. They use synthetic supporter, pledge, config and treasurer fixtures and restore the mutable config/policy after each run.
- In-memory email test sink: approved snapshot and instruction lookup failure cases both pass; no email was sent externally. `bun test src/lib/sponsorship/emailTemplates.server.test.ts`: 11 pass, exit 0.
- `bun run typecheck`: exit 0. `bun run lint`: exit 0 with 52 existing warnings. `bun run build`: exit 0 with existing route/chunk warnings. `bun test --isolate`: 2,808 pass, 85 skip, 0 fail, exit 0. The two mutating DB tests are skipped in the all-suite run and executed sequentially above.
- UI before/after browser screenshots for this manual-result state: **not-run**. Remote brand/a11y/performance gates are pending this PR. Provider sandbox success/cancel/delay, real account content, delivery failures and production permissions remain **not-run**.

## Rollback and staff handoff

This PR depends on draft PRs #134 and #135, and none are deployable against the current production catalog. Review the 36-file manifest, full constraints/grants/storage policies, data-bearing rehearsal and backup before production DDL. New checkout remains disabled by default. Before a separately approved activation, finance must publish the exact public details, approve each method and purpose/version, and verify account ownership, webhook/callback mode, reconciliation, receipt and notification paths in sandbox. Use synthetic transactions and the email test sink. Do not send a real email, charge, refund, migrate production, publish content, merge main or expose a public preview from this PR.

A rollback to T03 code while checkout is enabled could reintroduce hard-coded instructions. Disable **new** checkout first; keep existing admissions, pledge snapshots, payment events and webhook/reconciliation active. Restoration of old DB data would risk erasing payment history and is not a routine rollback.
