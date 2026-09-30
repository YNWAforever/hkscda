# PR170 sequential release preparation — 2026-09-30

## Scope, source and state

Final integrated application `a50a09f581f7862ebf9ba2fdde53d58cdf65a307`, reviewed fixes `2c454fe27b52cb409ca61364c65be8c34169a106`; predecessor #169 `dd17c5fbf878f51754e7f844f659bc853269a907`. Historical `t23-sponsorship-bulk.md` preserved. This slice assigns sponsorship follow-up ownership with snapshot→preview→per-item permission/version check→apply→result. No payment/proof approval, refund, notification or identity merge. Code-complete: this slice; schema-ready: isolated only; production approval/application pending; deployed:no; operationally-enabled:no. ADMIN-04 remains partial for later T23 workflows and hosted UAT.

## Six reproduced fixes

- A transient recovery GET deleted the session's operation ID. Retain the ID, expose a read-only retry and show a safe error.
- Mount recovery ran while a new preview was enabled; a late old response could replace the newer preview. Recovery now holds busy state and disables the assignee/preview controls.
- Preview completion after unmount wrote stale recovery storage. Mounted guard prevents late persistence.
- Select-all checked only filter string equality. Filter needs_followup→all→needs_followup restored25 obsolete selections in actual browser (reviewer callback reproduction100). Monotonic generation rejects any intermediate scope change.
- Mobile checkbox click bubbled into card navigation, opening the detail drawer. Stop propagation as in desktop selection.
- Malformed JSON returned503; InvalidRequestJsonError now400/no-store before any mutation.

Unit red2pass/4fail/17assertions,exit1; green6pass/20assertions,exit0. Browser red390px drawer1 and both390/1366 selected25 after filter round trip; fixed drawer0 and selected0 at both widths. Browser first used incorrect translated option text and timed out; corrected to actual `需要跟進` label before the valid red reproduction. Independent reviewer closed all six findings, no remaining scoped P1/P2. Exact SQL unchanged.

## Executed gates

| Command | Environment / source | Actual result / exit |
| --- | --- | --- |
| four focused DB/selection/lane/API files | integrated baseline; explicitly enabled local clone |12pass/48assertions,537ms /0 |
| recovery+API focused regression | repaired source2c454fe2 |6pass/20assertions,243ms /0 |
| `bun test --isolate src/lib/sponsorshipAdmin/followupBulk.database.test.ts` | final service_role and two-connection concurrency tests;52322/audit_pr135_20260929 |4pass/22assertions,275ms /0 |
| `bun scripts/verify-sponsorship-bulk-migration.ts` | named empty local production-schema clone; synthetic data only |exact full SQL,2 existing synthetic rows unchanged,12.19ms;1000 preview51.41ms;900 pending apply948.87ms;897success/101skip/2conflict;897 assignment audits;retry no duplicate;rollback,0 rows /0 |
| `bun test --isolate --timeout 30000` | finalappa50a09f581f7862ebf9ba2fdde53d58cdf65a307;CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322/postgres;SUPABASE_LOCAL_URL=http://127.0.0.1:52321 |3074pass/141skip/0fail,9628assertions,556files,19.97s /0 |
| `npm.cmd run typecheck` | final integrated app |0 |
| `npm.cmd run lint` | reviewed source2c454fe2 before final manifest-only merge |0;52warnings; no full local rerun after catalog-only integration |
| `npm.cmd run build` | finalapp;synthetic VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY,SUPABASE_URL/SERVICE_ROLE_KEY,loopback54329 |0 |
| `node scripts/verify-sponsorship-bulk-selection.mjs` | actual PledgeReviewLane,synthetic reads,390/1366 |mobile click stays in list;filter roundtrip leaves0 stale selections /0 |
| `node scripts/verify-sponsorship-bulk-review.mjs` | actual bulk panel,loopback56568,synthetic interception,390/768/1366 |recovery retained/retry available;25writes after partial failure;1000preview40pages/25visible rows;keyboard,CSVdownload,Axe0/errors0/nooverflow /0 |
| same script `--before` with SPONSORSHIP_BULK_BEFORE=1 server | originalpanel03dd2c26,identical fixture |3width baseline reproduces savedID loss/no retry; baseline assertions /0 |

Full suite before catalog-only merge was3074pass/141skip/9627assertions/32.79s; final suite adds the picker requirement assertion. Skips are not passes. Test URL guard allows only PostgreSQL127.0.0.1:57322/postgres or52322/audit_pr135_20260929 with no query/hash and explicit SPONSORSHIP_FOLLOWUP_BULK_TEST_ALLOW_LOCAL_FIXTURES=1.

SQL roles tested with actual SET LOCAL ROLE service_role, including disabled actor, banned assignee, expired preview,1001 rejection, stale versions/status, competing snapshots, atomic audit failure and browser grants/RLS denial. Two concurrent requests for one item return the durable succeeded result twice but create only one assignment, one result audit, one preview audit, version2. Exact fixture IDs are cleaned in finally; transaction-only drills roll back.1000-row drill has100 initially ineligible,1 deleted,2 changed after preview;897 successful items retain original amount. No real row imported and no ledger fabricated.

UI before/after `ui/t23-sponsorship-bulk-{before,after}-{390,768,1366}.png`;mobile `ui/t23-bulk-checkbox-{before,after}-390.png`. Test provider responses intentionally interrupted after10 of25writes, then recovered15pending and completed25 total. New1000preview resets confirmation, paginates40pages, and renders25rows at once.768px also checked200%zoom. Browser exports a synthetic CSV; private production export/session journey remains not-run. All temporary servers stopped. Standalone image viewer helper unavailable; browser/Axe verified the generated UI artifacts. Timings above are one current local rehearsal, not a before/after performance improvement. Hosted staff/browser/full private-file UAT, provider transaction/sandbox and deployment: not-run for this slice.

## Exact migration and compatibility

`20260928080000_sponsorship_followup_bulk.sql` LF SHA256 `d70e5fc37a71a34a7513ee27b435e0f38585bf4ed314626212bb3f3032c2ffec` unchanged. Adds2 private-by-grants/RLS snapshot tables,2indexes,3 public service_role RPCs and one inaccessible private Auth/role helper. Preview valid15minutes; each API apply processes at most25 pending snapshot items. Caller/assignee Auth rows and roles locked; operation ownership, expiry, pledged status/version and previous owner rechecked per item. Assignment plus result audit share a transaction. Read/recovery never resubmits writes; resolved items return saved outcome.

Fresh production read-only catalog:both tables and all3RPCs absent;2 pledges;ledger95. Predecessor169 owner/version/assignment/picker schema is required and not yet applied. No production DDL/backup/ledger action performed. Before execution require exact per-file approval and preceding schema, verify checksum/current catalog/signatures/grants/RLS and backup suitability, apply only this candidate, then check tables remain inaccessible to browser roles and exact functions exist.56-file source inventory is not an instruction to blindly apply every file or change historic ledger.

Existing restricted CurrentUserDPAPI backup: `hkscda-before-pr135-20260929T003437Z.dpapi`,1772038bytes,SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. Prior decryption roundtrip checked; fresh restore not-run,Storage bytes absent; providerbackupsnull/PITRfalse previously observed. Recheck immediately before approvedDDL. Rollback: stop affected bulk writes and revert to compatibility-tested app while retaining additive tables/operations/versions/audit. Never drop durable partial results or undo financial/history facts. No certified app rollback target is invented.

## Operator and release handoff

On temporary recovery failure use `重新讀取結果`; it is a GET and preserves the operation ID. Inspect per-item outcomes before resuming the same operation; only pending items apply. On expired preview, retain/export results and explicitly make a fresh snapshot for unresolved eligible IDs. Do not replay all successful items. Changing list filters clears selection; current staff role/Auth is checked again when applying. Follow-up ownership is independent from proof/finance approval.

Latest fetchedmain and productionalias24196faf027998388eff3196a6979e23566e2443,READY dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk;mainCI36624781016fivegreen from prior verification. #134–#155 merged22/46. No new merge this preparation. #156 actual concurrent OTP test still fails; no answer to disabled-feature release exception. #169 prior60a3b0f7fivegreen36644968703;latest catalogamendmentdd17c5fbCI36646284540pending. PR170 remoteCIawaitspush. #157 exact migration approved;#159–#162/#164–#166 exact approvals pending;#169/#170 exact approvals not yet requested at report creation. Payment/new schedules remain disabled; existing webhook/reconciliation preserved. No public preview, real payment/email/refund or content publication.
