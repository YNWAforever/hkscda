# PR169 sequential release preparation — 2026-09-30

## Scope and status

Application commit `b918ff918c98a2188335465237a6add66abfd0c7`, integrated parent #168 `672d784580465b4ed71486e8bc1dd3e7d34f664b`; integration `2f68f4ffd5bc94ec40d8678292a9f4c24d9ace44`. Historical `t23-sponsorship-followup.md` retained. This adds one-at-a-time staff follow-up ownership for needs_followup sponsorship pledges. It does not change payment/proof status, send notifications, or approve refunds/adoptions. Code-complete: this slice. Schema-ready: isolated rehearsal passed; production approval/application pending. Deployed: no. Operationally enabled: no. ADMIN-04 remains partial until later T23 workflows and hosted UAT are accepted.

## Reproduced defects and repairs

1. Picker read admin_user alone, including banned/unconfirmed Auth identities. New service-role-only `list_sponsorship_followup_assignees(uuid)` checks the current requesting actor and eligible staff/admin identities against Auth confirmation and ban state. Write command retains its actor/assignee shared locks, pledge version fence, exact retry and same-transaction audit.
2. Known missing-pledge SQL P0002 was mapped to generic503. Only P0002 with exact `Pledge unavailable` maps404; unrelated audit P0002 remains503. Withdrawn picker actor maps403.
3. Committed assignment with lost POST response was shown as failed. Actual GET owner/version reconciles the frozen attempt; known successful POST remains saved even if refresh fails. Unknown outcomes retain the original owner/version across renders; recovered conflicts clear selection and require a deliberate new choice. No automatic submission against a newer version.
4. Review caught a second-click race: unknown POST A/version1, background refresh B/version3, retry posted A/version3. Added failing actual callback test (4pass/1fail, exit1), then retained the attempt across renders. Final reviewer found no remaining scoped findings.

Initial API/DB red:9pass/4fail/40assertions, exit1. First picker fixture used a JS Date that Bun SQL rendered as a locale string (22007); changed fixture to ISO, not application behavior. Initial typecheck caught test-only implicit-any; fixed explicit row type. Browser fixture initially returned404 for the unrelated finance read, letting a generic alert wait race assignment completion; completed that synthetic read and waited for the actual assignment result. These failed/intermediate attempts are not passing evidence.

## Commands and actual evidence

All local commands use Windows/Bun1.3.14/Node24.18.0 on this isolated worktree. No production credentials/providers/data in tests.

| Command | Environment / source | Result / exit |
| --- | --- | --- |
| `bun test --isolate src/components/admin/sponsorship/followupRecovery.test.tsx src/lib/sponsorshipAdmin/followupAssignment.server.test.ts src/lib/sponsorshipAdmin/followupAssignment.database.test.ts` | current source; explicit follow-up DB fixture env below |18pass/0fail/57assertions,704ms /0 |
| `bun test --isolate src/lib/sponsorshipAdmin/followupAssignment.database.test.ts` | final service_role execution amendment; loopback52322/audit_pr135_20260929 |4pass/0fail/24assertions,220ms /0 |
| `bun scripts/verify-sponsorship-followup-migration.ts` | fixed named local schema clone, explicit local fixture opt-in |exact full SQL,2 synthetic old rows,8.59ms; original columns unchanged; version1/ownerNULL; signatures/grants/RLS passed; transaction rolled back;0 remaining rows /0 |
| `bun test --isolate --timeout 30000` | `b918ff918c98a2188335465237a6add66abfd0c7`; CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322/postgres; SUPABASE_LOCAL_URL=http://127.0.0.1:52321 |3065pass/137skip/0fail,9587assertions,552files,32.75s /0 |
| `npm.cmd run typecheck` | strict TS,current source |0 |
| `npm.cmd run lint` | full configured tree,current source |0;52warnings |
| `npm.cmd run build` | synthetic VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY and SUPABASE_URL/SERVICE_ROLE_KEY,loopback54329 |0 |
| `node scripts/verify-sponsorship-followup-review.mjs --before` | actual drawer from2f68f4ff,synthetic intercepted API,loopback56567 |3widths reproduce failure after committed assignment; baseline expectation passes /0 |
| `node scripts/verify-sponsorship-followup-review.mjs` | repaired actual drawer,390/768/1366 |12cases: lost response,confirmed POST+failed refresh,conflict,unknown+background version change; keyboard,Axe0/errors0/overflowfalse /0 |

DB test requires SPONSORSHIP_FOLLOWUP_TEST_ALLOW_LOCAL_FIXTURES=1 and SPONSORSHIP_FOLLOWUP_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929 (also explicitly allows the existing57322/postgres isolated stack). Mutation calls now actually SET LOCAL ROLE service_role; anonymous/authenticated RPC grants denied; browser UPDATE changes0 rows; active staff success, disabled actor/assignee, banned assignee and unconfirmed actor rejected. Picker excludes banned/unconfirmed/disabled/finance-only identities and rejects withdrawn actor. Audit failure rolls back mutation, version and audit; two concurrent owners produce one winner, one40001, one audit; exact retry is replayed without extra audit. Fixture transactions roll back or exact-ID cleanup runs. No production row is imported.

UI `ui/t23-followup-before-{390,768,1366}.png` and `ui/t23-followup-after-{390,768,1366}.png` use identical synthetic reads. After response loss the fixed view shows saved; unknown retries send expectedVersion1 both times even after background owner/version3. The baseline test deliberately asserts the old failure. All fixture servers stopped. Image viewer helper unavailable; browser/Axe checked UI and produced screenshots, no claimed separate visual inspection. Same-environment performance improvement measurement, hosted staff identities/private-file export journey and real provider transactions: not-run;8.59ms is a single local DDL rehearsal, not a before/after speed claim.

## Exact migration and production compatibility

`20260928073000_sponsorship_followup_assignment.sql`, LF SHA256 `c1eb28ad0953d0ae3f9d85c574c363ee2fe342ea68ddc5bd9f6b9b09baf04ef2`.

Fresh read-only production aggregate:2 pledges,0 needs_followup,0 candidate columns,assignment/picker RPC absent,ledger95. Candidate adds nullable Auth FK owner and bigint version default1, an update-version trigger, partial owner index, two pinned-search-path service-role-only RPCs. Existing2 pledges receive version1 and null owner; original pledge/status/amount/proof fields remain. No staff assignment or historical financial backfill. Source-file inventory now55; it is not a command to apply all files or fabricate ledger entries.

Before authorized execution: reconfirm current catalog/signatures/grants/RLS and exact Git-blob checksum; verify restricted backup decryptability and approval; apply only this file through production migration tool after predecessor schemas. Refresh schema cache; verify grants, columns/version, index, enabled trigger and existing aggregate unchanged. No blind db push or ledger repair. Full migration rehearsed only on named empty clone within rollback transaction.

Existing approved backup `hkscda-before-pr135-20260929T003437Z.dpapi`,SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2,1772038bytes,CurrentUser DPAPI/current-user ACL. Prior decryption roundtrip verified; not newly restored here. Full DB restore rehearsal and Storage bytes are not included; provider backups=null/PITR=false previously observed. Recheck backup suitability immediately before DDL; no new production backup/migration executed by this preparation.

Rollback boundary: stop follow-up assignment writes and roll back compatible application code while retaining additive columns, versions, index, trigger and audit. Do not drop the owner/version or rewrite financial/history facts. Verify legacy status/proof updates remain compatible with version bump. No certified prior application target is invented. Payments and new schedules remain disabled; existing webhook/reconciliation preserved.

## Ordered release

#134–#155 merged22/46;main/production24196faf027998388eff3196a6979e23566e2443 READY. #168 current672d7845 has fiveSUCCESS gates in36642612271. #169 exact-head remoteCI awaits push. #156 real Auth concurrent OTP test remains blocking despite ordinary CI green; disabled-feature exception still unanswered. #157 exact migration approved; #159–#162/#164–#166 exact approvals pending; #169 approval not yet requested at report creation. Do not merge ahead of the sequence or enable recovery/payments/email.

Staff: choose an eligible current staff/admin owner; saved means committed, refresh unavailable means reload details, unknown means retry the same frozen request, conflict means inspect the current owner then explicitly select a new assignment. A banned/deactivated actor or assignee is denied at the database write boundary even if an older picker was cached. Assignment is separate from proof/finance approval.

## Final schema gate amendment

Head60a3b0f7 passed all five CI gates in36644968703. Final catalog inventory review then found the newly added picker RPC missing from the application release checker. Reproduced releaseManifest.test.ts0pass/1fail and added its exact p_actor UUID/TABLE result/service_role signature; focused test now1pass54assertions. SQL checksum and runtime assignment behavior unchanged. Latest amendment CI must pass before merge; the earlier green run is not represented as the new head.
