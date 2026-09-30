# PR171 sequential release preparation — 2026-09-30

## Source and status

Application `7136ad049c536fe27fcc4823066d762c618b2c9b`, integration275becb058546200540e671cfb8decd7f888a79d, parent#1702cb148ab50cf8499f63ee5ab7d47c4e5a509d6a0. Historical t23-sponsorship-reminder.md retained. No new migration. Code-complete: read-only reminder draft slice; schema-ready: depends on parent candidates; deployed:no; operationally-enabled:no. ADMIN-04 remains partial for later T23 workflows and hosted staff UAT.

## Reproduced bug and fix

The drawer keyed ReminderDraftPanel only by pledge ID. After generating a draft, successfully cancelling the pledge and refetching current data, the drawer showed cancelled but retained the old copyable draft. Three-width actual browser reproduction: stale draft count1 at390/768/1366,exit1. Existing domain logic correctly rejected generating another draft; retained mutation state was the defect.

The preview key now includes precisely the current input facts consumed by the draft builder: pledge ID,status,recipient name/email,language,proof review statuses,period IDs/months/outstanding amounts and allocation amounts. Changes remount the ephemeral preview, clear its data and detach pending older mutation responses. Pure regression covers all current fact classes; real browser also verifies an in-flight response arriving after cancellation never restores stale content. Independent review closed the finding with no missing relevant fields. No new send or payment command.

## Actual verification

| Command | Source / environment | Result / exit |
| --- | --- | --- |
| `bun test --isolate src/lib/sponsorshipAdmin/reminderDraft.test.ts src/routes/api/admin/sponsorships/pledges/reminder-draft.test.ts src/components/admin/sponsorship/ReminderDraftPanel.test.tsx` | final source |10pass/46assertions,342ms /0 |
| `bun test --isolate --timeout 30000` | 7136ad049c536fe27fcc4823066d762c618b2c9b;CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322/postgres;SUPABASE_LOCAL_URL=http://127.0.0.1:52321 |3084pass/141skip/0fail,9676assertions,559files,33.49s /0 |
| `npm.cmd run typecheck` | strict TS,final source |0 |
| `npm.cmd run lint` | full configured tree,final source |0;52warnings |
| `npm.cmd run build` | synthetic VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY and SUPABASE_URL/SERVICE_ROLE_KEY;loopback54329 |0 |
| `node scripts/verify-sponsorship-reminder-review.mjs --before` | originaldrawer275becb0,actual React UI,synthetic loopback56569 responses |3width stale copyable draft after cancellation,expected red /1 |
| `node scripts/verify-sponsorship-reminder-review.mjs` | finaldrawer,390/768/1366 |15cases:cancel/recipient/proof/ledger/late response;stale0,Axe0/errors0/nooverflow /0 |
| committed Git-blob SQL checksum validation | inherited56files |unchanged /0 |

The first browser attempt used a guessed cancellation label and timed out; corrected to actual `取消助養` before the valid red reproduction. The fixed browser runs actual drawer cancellation callback against synthetic interception (one simulated POST per cancel case); other cases trigger its real query refetch. Reminder generation uses GET only. No DB rows or external providers are mutated by these browser fixtures; all fixture servers stopped.

Existing tests retain oldest prior Hong Kong calendar month selection, current/future/paid exclusion, pending-proof and refund-adjustment refusal, invalid ledger/recipient/status refusal, neutral Chinese/English wording, and no send action. Direct API tests deny unauthenticated/treasurer before private load, reject invalid ID/missing pledge/writes and enforce no-store. Drafts include no approved bank/payment instructions or debt assertion. Recipient/private text is React-escaped.

Before/after screenshots `ui/t23-reminder-{before,after}-{390,768,1366}.png`. Keyboard generation and semantic browser/Axe checks passed. Standalone image viewer helper remains unavailable; no separate image inspection claimed. Hosted staff/treasurer test sessions, private export/file journey, real provider sandbox, same-environment performance comparison and formal external reminder wording approval:not-run/pending. This slice has no send workflow or provider call; any future sending requires its own approval/current-recipient and fact revalidation. Local skips are not passes.

## Compatibility and operations

No new schema; inherited56-file manifest remains an inventory, not a batch migration command. Current productionmain/alias24196faf027998388eff3196a6979e23566e2443 READY was rechecked during this preparation. #134–#155 merged22/46. #156 actual concurrent OTP gate still blocks ordered merge and disabled-feature exception is unanswered. #169 finaldd17c5fb has all5SUCCESS in36646284540; exact migration approval requested. #1702cb148ab CI36646727661 pending at report creation; its schema approval not yet requested. #171 remoteCIawaitspush. Parent-specific migration approvals remain required; no production migration/public preview/new merge or email/payment/refund/content operation this preparation.

Staff: review current recipient, oldest eligible month, internal amount and generation timestamp. Any refreshed relevant fact clears the old preview; explicitly regenerate if still eligible. Pending proof/refund adjustment needs financial review. Read-only text can be selected/copied manually, but this interface does not send it. Payment remains disabled and existing webhook/reconciliation stays intact.

Rollback this application slice to a compatible reviewed predecessor, keeping all durable payment/audit/notification facts and parent additive schema. No database rollback is required for this slice. No full backup restore, hosted release or live operational enablement is claimed.


## Root combined review checkpoint 171 — 2026-10-01 HKT

Reviewed candidate d496a793c57360604207de6126b6386a418c9d32 integrated predecessor 6cd2ded75c0c36b287ab81adb984f67ed2ee4a87. There were no source conflicts. Documentation histories and both trackers with 34 unique issues were preserved. All 57 canonical LF SQL entries match. The stronger #160 blocker proof is inherited through #166. Earlier source, role, DB, migration rehearsal, UI and performance evidence remains under its recorded SHA and environment.

Actual local commands: `bun test --isolate src/lib/operations/migrationManifest.test.ts src/lib/operations/releaseManifest.test.ts`: 2 pass / 60 assertions / 0 fail / exit 0; `bun run typecheck`: strict TypeScript / exit 0; `git diff --check`: exit 0. Combined local full tests, lint, build, DB, UI and performance at this new head: not-run. The DB/build slot belongs to isolated #175 work during early integration. Fresh CI for the exact head must run full tests, typecheck, lint, build, RLS, brand, accessibility and performance gates before release. Skips and warnings remain visible; hosted/provider evidence remains separately not-run. Raw receipts and logs remain ignored in this task workspace.

Last observed main and production alias: 07e4c881, main CI 36758558621 all five SUCCESS, deployment READY; 26 of 46 releases through #159. No production action occurred in this preparation. The owned source is code-complete; production schema, deployment and operational enablement have not advanced. #160 named migration approval remains pending. Prior #161 approval for its unchanged schema remains operative. Later migrations need named approval, fresh catalog/signature/grants/RLS/backup checks and postflight in predecessor order. The manifest lists source files and does not authorize applying all files. Payments and new sending/media schedules remain disabled. Existing webhooks/reconciliation, committed financial success, durable jobs, audit, additive rollback and private-file boundaries are retained. Full restore, Storage bytes and hosted staff/provider UAT remain separately not-run.

## Reviewed PR170 test timing repair inherited — 2026-10-01 HKT

PR171 previous candidate `b115fcdac3b6d6563d3af94a5fd2fedde0173459` integrated `ea5eb539e55d22770ad5a95c0c23d63c95e669d6`. The only source change is the reviewed test request-start signal; real crypto, unmount and late-response no-write assertion remain. Business source and all SQL bytes are unchanged. Original PR170 CI36779128139 failure is retained as an actual failed run, followed by deterministic delayed-crypto RED and GREEN at source7d3e53f3 and independent review of ea5eb539.

At this integrated tree, `bun test --isolate` for the recovery, migration manifest and release manifest files: 5 pass / 0 fail / exit0; `bun run typecheck`: exit0; `git diff --check`: exit0. Combined full/lint/build/DB/UI/performance: not-run locally; prior evidence remains at its SHA/environment. Fresh exact-head CI is required. SQL checksums and production state did not change. No production operation or operational activation.
