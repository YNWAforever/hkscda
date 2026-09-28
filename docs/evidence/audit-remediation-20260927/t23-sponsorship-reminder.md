# T23 sponsorship reminder draft preview · PR #171

Source `c683532b9f8539836f032a31fa17aa8c2a8494a8`, stacked on draft #170. ADMIN-04 remains **partial**. This slice adds a staff/admin-only read-only draft preview. It sends no email, queues no outbox item, writes no pledge/payment/proof/audit row, and introduces no migration. Existing webhook, reconciliation and delivery paths remain unchanged.

## Eligibility and boundary

- The direct GET route rechecks the current staff/admin role through `requireAdmin` before loading recipient data and uses `Cache-Control: no-store`. Treasurer and unauthenticated requests are denied.
- The current pledge detail read model supplies supporter name/email, status, proof history and monthly period/allocation ledger. Only an `active` pledge with a valid email and a positive outstanding commitment for an earlier Hong Kong calendar month can produce one draft, choosing the oldest such month.
- A pending proof, any past-month reversal/refund adjustment, malformed ledger, missing recipient or other pledge status returns a reason without draft text. The current month and future months do not qualify. The period table has a month but no due-day or debt determination; the wording asks for payment-reference clarification and does not assert a debt or include unapproved payment instructions.
- The drawer shows recipient, period, internal ledger amount, generated-at timestamp and read-only zh-HK/en subject/body fields. It states that sending requires separate approval. There is no send action or provider connection. The preview is ephemeral and must be regenerated after any fact changes; a future send workflow would need its own recipient preview, current-fact revalidation, approved copy and authorization.

## Reproduction and verification

- Before implementation, the pure draft, direct API and UI tests failed because their modules/routes did not exist. After the minimal implementation, `bun test src/lib/sponsorshipAdmin/reminderDraft.test.ts src/routes/api/admin/sponsorships/pledges/reminder-draft.test.ts src/components/admin/sponsorship/ReminderDraftPanel.test.tsx` passed **9/9, 38 assertions**, exit 0.
- Tests cover oldest eligible month, Hong Kong month boundary, paid/current/future months, pending proof, refund adjustment, invalid ledger, status and recipient refusal, English/Chinese neutral wording, no send UI, direct unauthenticated/treasurer denial before private read, invalid ID/missing record/POST rejection and no-store responses.
- `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` with `SPONSORSHIP_FOLLOWUP_BULK_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres` and `SPONSORSHIP_FOLLOWUP_BULK_TEST_ALLOW_LOCAL_FIXTURES=1`: **2927 pass, 109 skip, 0 fail, 9149 assertions across 529 files**, exit 0. This is the existing isolated synthetic stack, not production.
- `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet` and `npm.cmd run build`: exit 0 after route tree generation. Build success was not used as typecheck proof.
- Hosted staff/treasurer identities, private API browser session, mobile/keyboard screenshots and same-environment before/after performance: **not-run**. Real email/provider sandbox: **not-run**; this slice has no send path.

## Release and rollback

No schema rollout is required for this specific slice beyond its stacked dependencies. App rollback removes the draft route/panel and retains all later payment, audit and notification facts. Production release still requires the 48-file ordered migration rehearsal, current catalog/grants/RLS, sanitized data-bearing clone, backup/restore proof, hosted role UAT, approved reminder wording and a separate authorized send design. No main merge, production migration, public preview, payment action or notification was performed here.

Remote source CI run `36367078505` passed verify, RLS matrix, brand, a11y and performance. Local catalog checker on the same loopback DB exited 0 with 124 compatible requirements, zero issues and unchanged local ledger `20260927150000`.
