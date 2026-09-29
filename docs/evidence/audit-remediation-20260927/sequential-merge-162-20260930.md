# PR #162 animal draft bulk review — sequential verification, 2026-09-30 HKT

## Scope / state

Integrated baseline b87277233f8e26affda77bb65746a72bb0d72cc5; code repair 1fec4ea679e780b089520af2e130b90414d0d90c. Admin-only send of unpublished, unclassified saved animal drafts to existing editorial review as needs_review. No automatic publication, photo change, adoption match or notification. ADMIN-04 remains partial across domains. Code reviewed / isolated schema ready / production schema absent / deployed no / operationally enabled no.

## Failure-first repairs and independent review

- Malformed JSON red: 2 pass / 1 fail, 13 assertions, exit 1 (503 instead of 400). Explicit InvalidRequestJsonError mapping preserves 400/413/no-store and zero mutation.
- Actor eligibility red: original SQL installed only in the verified empty schema clone; actual second connection can disable the actor mid-apply. Correct supported-transition regression: 4 pass / 1 fail / 25 assertions, exit 1. Guard now locks both Auth/admin rows FOR SHARE through commit. Admin disable and Auth ban probes block with 55P03. The existing draft lock serializes supported publication and classification commands.
- An initial overbroad probe directly updated animals as database owner and produced a second failure (3 pass / 2 fail). Independent review showed this bypasses supported writers: authenticated UPDATE is revoked and sanctioned publication first locks animal_draft. The probe was replaced with a concurrent draft update. No extra animal lock was added; owner bypass is not reported as an app defect.
- Browser baseline: transient GET discarded saved ID, lacked retry and allowed actions during pending mount GET at 390/768/1366; exit 1. Preserve ID, add read recovery and active-guarded busy completion; evidence editor disabled during requests. Final browser all three dimensions true, exit 0.
- Independent reviewer closed all four known findings at 1fec4ea6; no additional actionable issue. Reviewed duplicate apply, draft/classification serialization, same-transaction audit, unchanged publication/photo/match state and HTTP bounds. Production/provider readiness was outside that review.

## Actual commands / results

| Command | Environment | Result / exit |
| --- | --- | --- |
| `bun test --isolate --timeout 30000` | 1fec4ea6; CHECKOUT_POLICY_TEST_DATABASE_URL loopback 57322/postgres, SUPABASE_LOCAL_URL 52321 | 3006 pass / 121 skip / 0 fail; 9383 assertions; 540 files; 33.01s / 0 |
| `npm.cmd run typecheck` | Worktree | First exit 2: implicit-any map callback in the new test; explicit result type added; repeat exit 0 |
| `npm.cmd run lint` | Full configured lint | 0; 52 existing warnings |
| `npm.cmd run build` | Synthetic keys, loopback 54329 | 0; generated route tree unchanged |
| `bun test src/lib/contentReview/animalBulk.database.test.ts` | ANIMAL_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES=1; exact 52322/audit_pr135_20260929 schema-only clone | 6 pass / 39 assertions / 0 fail; 1061ms / 0 |
| `bun test src/routes/api/admin/animals/review-bulk.test.ts src/lib/contentReview/animalBulk.database.test.ts` | Same clone, before added 1000-item test | 8 pass / 46 assertions / 966ms / 0 |
| `node scripts/verify-animal-review-bulk-review.mjs` | Actual component; synthetic intercepted API; loopback 56561 | 390/768/1366px, keyboard and 200% zoom; zero Axe/page errors and no overflow; 0 |
| Full SQL in BEGIN/ROLLBACK | Same isolated clone with 1000 synthetic old rows | 253ms including process startup / 0 |

DB fixtures call RPCs as service_role, reject actual anon/authenticated execution, verify 1001 cap, revoked actor/expiry, current publication/classification, stale draft, missing draft and audit-failure rollback. Two simultaneous apply calls produce one editorial audit. Of 1000 rows, 100 published and 100 already classified are excluded at preview; later edits produce 796 successes, 202 skips and two conflicts. A repeated full apply adds no audit. Canonical hash of all old animal fields is unchanged by apply. Exact synthetic cleanup/transaction rollback leaves zero users, animals, operations and items.

UI before/after: ui/t23-animal-review-bulk-{before,after}-{390,768,1366}.png. Tests cover failed mount read, delayed recovery versus new preview, interrupted response after ten committed synthetic writes then exactly 25 writes after retry, result CSV, 1000-item/40-page bounded table and reset confirmation. Each browser and hidden fixture server stopped. Browser API is synthetic; independent DB fixtures establish transaction behavior. Local public brand/performance, hosted identities/private-file UAT, provider sandbox and email delivery not-run for this slice. Skips are not passes.

## Exact migration / catalog / rehearsal

20260927184500_animal_review_bulk.sql canonical LF SHA-256 **a2b689369ccb803e65d94e75db1f669dec6b9cf43f0132853c22b612b58db40f**. Only the undeployed candidate changed; earlier cfbabd9a hash is historical. No deployed SQL or migration ledger was rewritten.

Two new RLS tables, two indexes, three public service-only definer RPCs and one private guard. All four signatures/pinned empty search_path/grants checked. Table service SELECT true, direct INSERT/UPDATE false; anon/authenticated SELECT/EXECUTE false. Existing editorial_review_command remains the atomic classification/audit command. No backfill.

Full exact SQL rehearsed with lock_timeout 5s / statement_timeout 30s in BEGIN/ROLLBACK after verifying the candidate tables empty, dropping only local candidate objects within the transaction, and seeding 1000 synthetic pre-schema animals. All original columns/rows stayed unchanged. Rollback restored the prior clone schema/data; postflight aggregate counts zero. Timing is not a production lock estimate. No fabricated local ledger.

Production read-only inventory: ledger 95, animals 292, animal drafts zero; new operation table and apply RPC absent; existing editorial RPC present; authenticated animal UPDATE false; checkout disabled. Production does not need draft seeding as part of this migration. Exact approval and fresh catalog/signature/grants/RLS/checksum/backup preflight remain required.

## Release / rollback / staff handoff

#134–#155 merged (22/46); current main/alias 24196faf027998388eff3196a6979e23566e2443. #156 actual local Auth concurrent OTP failure still blocks sequential merge. #161 exact a29d657c CI 36629148497 now five green; its exact migration approval request is pending. This candidate's current-head CI will run after push. No payment, new delivery/media schedule, content classification/publication, real notification or refund was enabled/performed.

Recheck the restricted CurrentUser-DPAPI backup before any approved production DDL; existing backup has no Storage bytes and full restore was not run. No blind db push or historical ledger edits. App rollback disables new UI/API and retains operation/results/editorial audit history; do not delete additive schema or restore old data over new events. Staff select this page or up to 1000 current drafts, enter evidence/source, read exclusions and before/after, confirm and apply bounded batches. Recover/read after uncertain response; re-preview stale/expired/conflicted items. A needs_review record does not approve or publish an animal. Hosted staff acceptance remains pending.

## Queue switch follow-up

PR164 independent review found the same unmount race in this animal panel: hold previewA, switch kind away/back, completeB thenreleaseA leaves visibleB but storesA. Real ContentReviewQueue regression red for both CMS/animal, exit1. Backport e9352e567de4ee87998dcc1915a1685d16fe821f adds mounted guard before persistence; animal-only run on this PR's own queue exit0, recoveryMatchesLatest/visibleLatest true, no page errors. Reviewer closed the scoped finding. SQL/hash unchanged and the existing exact migration approval question remains applicable.

Full repeat on e9352e56:3006pass121skip/9383assert/540files/33.55s/exit0; typecheck/lint0 (52warnings). A concurrently started build failed exit1 with ENOENT in the shared junction node_modules/.nitro SSR assets; this is not counted as passing. Serial npm.cmd run build repeat with synthetic loopback configuration passed exit 0; no concurrent build was running. Prior ae80846b five-greenCI36630739000 is historical; fresh CI is required for the repaired head. No production changes.

## Selection generation follow-up

PR166 review exposed an earlier animal select-all race: hold page2, switch animal to content and back, then release. The old request restored25 visible checked rows after selection had been cleared. Initial fixture runs timed out on an incorrect button label; after correcting the locator, the actual old queue reproduced25 versus expected0 (exit1). Backport61e8952ffb6973ce36a085e080292c81ac6a848d increments selection generation on every kind change and rejects older results; actual queue repeat retained0, no page errors, exit0. Independent review closed; SQL unchanged.

Final local checks on61e8952f: bun test --isolate --timeout30000 with checkout57322/Auth52321:3006pass121skip0fail/9383assertions/540files/45.61s/exit0. npm.cmd run typecheck, lint and serial synthetic build each exit0; lint52warnings. Fresh remote CI required for this head; previous five-green run36634226352 is historical. No production changes.
