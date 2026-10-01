# T23 sponsorship follow-up bulk · draft PR #170

Source `74669a48a7786f93cde5ebb4dd0118490f24a095`, stacked on #169. ADMIN-04 remains **partial**. This slice assigns an active staff/admin owner to `needs_followup` pledges only. It does not review proof, confirm money, send reminders, issue receipts or change pledge payment/status. Other T23 actions remain open.

## Command and selection

The sponsorship workspace shows bulk controls only to staff/admin (treasurer remains a reader). Staff can select eligible pledges on the current page or all matching a `needs_followup` filter, capped at 1,000. A changed filter clears the selection; a paged all-match read aborts if count or IDs change. The server persists 15-minute operation/item snapshots with actor, assignee, filter hash, ordered pledge IDs, expected versions, before/after owner and per-item state. The UI requires reviewing differences and applies up to 25 pending items per request. The operation ID is stored in tab session storage for read-only recovery, and shared BulkResults exports per-item CSV.

Each apply rechecks current active/confirmed/non-banned staff/admin actor and assignee, operation ownership/expiry, pledge status/version and current owner. It calls the already audited single-item assignment in the same transaction, then commits the item outcome and a bulk-result audit. A repeated successful item reads its saved result without a second assignment/audit. Missing/stale pledges become skipped/conflict. Forced audit failure rolls back both pledge and item outcome. No browser role can execute the RPC or SELECT the private snapshot tables.

## Executed evidence

| Command / environment | Exit | Result |
|---|---:|---|
| `SPONSORSHIP_FOLLOWUP_BULK_TEST_DATABASE_URL=postgresql://postgres:***@127.0.0.1:57322/postgres SPONSORSHIP_FOLLOWUP_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 bun test src/lib/sponsorshipAdmin/followupBulk.database.test.ts` | 0 | 3 pass, 19 assertions. Role withdrawal, Auth ban, 1,001 rejection, expiry, stale status/version, double apply, two competing previews, audit failure rollback, grants/RLS and unchanged amount/status. Fixtures all rolled back. |
| `bun test src/routes/api/admin/sponsorships/followup-bulk.test.ts` | 0 | 2 pass, 13 assertions: unauthenticated/invalid preview denied, 25-item checkpoint, synthetic interruption then resume to 30 without replay. |
| `bun test src/lib/sponsorshipAdmin/followupBulkSelection.test.ts` | 0 | 2 pass, 6 assertions: 25 and 1,000 selection, changed list and 1,001 rejection. |
| `bun test src/components/admin/sponsorship/PledgeReviewLane.test.tsx` | 0 | 5 pass, 10 assertions, including staff visible and treasurer hidden. |
| `CHECK_RELEASE_SCHEMA_DATABASE_URL=postgresql://postgres:***@127.0.0.1:57322/postgres bun scripts/check-release-schema.ts` | 0 | 124 compatible, zero issues; local ledger remains `20260927150000`. |
| `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` with bulk DB fixture enabled | 0 | 2918 pass, 109 skip, 0 fail, 9109 assertions, 526 files at exact source commit; focused DB 3/19 also passed. |
| `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`, `npm.cmd run build` | 0 each | Separate strict TypeScript, ESLint and Vercel build gates. |

The DB test first failed on missing RPC/tables; the selection test failed on its missing implementation before turning green. Final SQL blob `20260928080000_sponsorship_followup_bulk.sql` SHA-256 `d70e5fc37a71a34a7513ee27b435e0f38585bf4ed314626212bb3f3032c2ffec` was applied only to the named local DB. It was replayed exactly inside a separate `BEGIN/ROLLBACK` after temporarily removing only its own objects in that transaction. No ledger row was fabricated. The new route is no-store and caps JSON at 128 KiB.

## Release and rollback boundary

Source does not imply deployment. Browser staff/mobile/keyboard screenshots, same-environment performance for this slice, hosted direct-role checks and provider sandbox are **not-run** without candidate/test identities. All 48 ordered migrations still need fresh and sanitized data-bearing rehearsal, production catalog comparison, lock timing, backup/restore and specific release approval. Apply schema before app; on rollback disable the new API/UI while retaining additive operation/results and all pledge, payment and audit history. If a bulk operation stops, inspect its saved per-item results, then make a fresh snapshot for unresolved IDs; never blindly replay every selected pledge. Reminder drafts remain separate and no notification is sent here.

Remote source CI run `36364156675` at `74669a4` passed all five jobs (verify, RLS matrix, brand, a11y, performance). This fixture CI does not substitute for hosted staff-session UAT.
