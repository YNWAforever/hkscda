# PR #156 / T22 — application-owned single-use recovery, 2026-09-30 HKT

## Release state and scope

- Verified code commit: `4a4eef8e2c5b146c401b442d8b9a8af494049ce2`, based on `a5229b7471c0abc138e816ffeaa6a1b6962fb907`. Gates ran on this exact source content before committing; subsequent package edits are documentation only.
- Freshly fetched `origin/main` and production alias: `24196faf027998388eff3196a6979e23566e2443`; deployment `dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk` READY. Main CI `36624781016`: verify, brand, a11y, RLS and performance all success.
- #134–#155 remain merged, **22/46**. #156 is draft; new-head CI pending at package publication. No new merge, production DDL, real email/payment, public preview or environment activation occurred in this repair.
- Recovery implementation is code-complete and the additive candidate schema is isolated-ready. It is **not production-schema-ready, deployed or operationally enabled**. CRM-01 as a whole remains partial until #157's portal and its external gates complete.

The approved T22 plan explicitly defaults to a purpose-bound, hashed, single-use, 15-minute application token when existing verification cannot provide that guarantee. This repair implements that fallback. The historical direct-provider concurrency failure remains preserved in `t22-auth-sink-sequential.json` and `scripts/verify-supporter-auth-sink.mjs`; it is not relabelled as passing or hidden. The application no longer exposes or directly redeems that provider OTP.

## Reproductions and fixes

| Defect | Failure evidence | Verified repair |
| --- | --- | --- |
| Direct Auth v2.197.0 concurrent OTP redemption | Historical diagnostic twice returned two sessions, exit 1 | Independent application code is atomically consumed before one private carrier exchange; 20 actual parallel broker calls returned one session and one exchange |
| Recovery request had no opaque correlation ID | Focused regression 5 pass / 1 fail, exit 1 | Generic accepted response includes random UUID for every valid request, including downstream failures |
| Malformed verification JSON became 503 | HTTP regression 6 pass / 1 fail, exit 1 | Bounded parser's explicit error maps to generic 400 |
| Code expired while waiting for row lock | Two-connection DB probe: expected refusal missing, exit 1 | `clock_timestamp()` checked after acquiring row lock; exact probe passes |
| Late recovery HTTP response replaced a newly logged-in identity | Actual page runner installed two sessions, exit 1 | Auth generation and mounted guards plus a persistent snapshot captured before verification HTTP |
| SDK `setSession` identity lookup committed A after another client stored B | Independent actual-SDK/Chromium reproduction: B → A | Supported storage commit fence under shared Web Locks; actual SDK and two Chromium tabs preserve B with no stale SIGNED_IN |
| Expired incoming token's terminal refresh error deleted B | Actual SDK regression 5 pass / 1 fail, exit 1; B became null | All guarded refresh attempts return local retryable refusal; zero provider refresh calls, B preserved |
| Revoked incoming `/user` lookup deleted B | Actual SDK regression 0 pass / 1 fail, exit 1 | Guarded incoming bearer receives generic verification refusal without SDK session-wide cleanup code; B preserved |
| Accessible but unwritable localStorage broke ordinary login | Independent Chromium reproduction: default SDK memory fallback worked, new factory threw quota error | Write/remove probe opts into persistent adapter only when available; actual factory ordinary login retains memory fallback |
| Revision write failure prevented logout | Runtime-quota regression 0 pass / 1 fail, exit 1 | Remove credentials under shared lock, then change or remove persisted revision; old empty-session attempts also fail; actual SDK/Chromium logout leaves null session |

Independent review found and reproduced the SDK failure paths above, then re-reviewed the corrections with no remaining blocking defect. It independently ran 9 actual-SDK regressions / 23 assertions. The SDK is lockless by default; navigator availability alone was not accepted as evidence of its locking behavior.

## Commands, exits and environments

Windows, Bun 1.3.14, Node 24.18.0. All service identities, tokens and email addresses in executable tests are synthetic. Secrets derived from local containers stay in memory and are not printed.

| Command | Environment | Actual result / exit |
| --- | --- | --- |
| `bun test --isolate --timeout 30000` | `CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres`; `SUPABASE_LOCAL_URL=http://127.0.0.1:52321` | **2991 pass, 96 skip, 0 fail, 9255 assertions, 515 files, 58.61s / 0** |
| `npm.cmd run typecheck` | Local worktree, final source and generated routes | **0**; earlier fetch-wrapper type error was corrected and rerun |
| `npm.cmd run lint` | Full configured lint | **0**, 52 existing warnings, zero errors |
| `npm.cmd run build` | Synthetic public/service keys; URL `http://127.0.0.1:54329` | **0**, generated route tree retained; no deploy |
| `bun test --isolate src/lib/supporters/recoverySession.test.ts` | Actual installed SDK, synthetic transport, coordinated storage | **9 pass / 23 assertions / 0** in independent final review; rare guarded-refresh branch about 25.5s |
| `bun scripts/verify-supporter-recovery-broker.ts` | Actual local Supabase API 52321, Postgres 52322, Auth v2.197.0, Mailpit 52324 | **0**, detailed outcomes in `t22-recovery-broker-isolated.json` |
| `node scripts/verify-supporter-recovery-migration.mjs` | Exact empty task-owned schema in `supabase_db_hkscda-audit-integration-fresh`, no production data | **0**, whole-file BEGIN/ROLLBACK, signatures/grants/RLS and unchanged Auth/supporter/ledger/catalog snapshot |
| `node scripts/verify-supporter-session-browser.mjs` | Actual Chromium application factory/SDK; same-origin localStorage/Web Locks; intercepted synthetic Auth transport | **0**, cross-tab commit, HTTP-wait actor change, default storage-key compatibility, absent locks, startup quota fallback and runtime-quota logout |
| `node scripts/verify-supporter-broker-ui.mjs` | Actual SupporterPage, loopback Vite 56553; synthetic HTTP/Auth/Turnstile boundaries | **0**, 390/768/1366px, keyboard, fresh challenges, wrong then valid code, late actor change, logout; Axe 0, overflow false, page errors 0 |
| `git diff --check` | Task branch | **0** |

The 96 skipped scenarios are **not-run**. Raw provider OTP concurrency remains a failed upstream diagnostic; the new broker tests establish the application's replacement invariant. Neither build nor UI stubs substitute for strict TypeScript, real database concurrency or actual SDK storage tests.

Real isolated broker results: six anon/authenticated RPC denials; verified normal session passes server `getUser`; known/unknown identity flows without historical supporter linking; wrong email/code, replay, five-attempt exhaustion, expiry including lock wait, suspension, failure after consume and rejected delivery all refused safely. Exactly nine generated Auth users and their sink messages were cleaned; zero challenge fixtures remain. Existing migration ledger unchanged. No fixture reset or unrelated volume/container removal.

## Exact candidate migration and compatibility

File: `supabase/migrations/20260930120000_supporter_recovery_single_use.sql`.

SHA-256: **`a136cc18848d9e927f57b1840c0a7058fdffba92701df4cf50fb18931cabc91e`**.

It adds only `private.supporter_recovery_challenge`, one expiry index and these service-role-only RPC signatures:

- `public.create_supporter_recovery_challenge(uuid,uuid,text,text,text)`
- `public.consume_supporter_recovery_challenge(uuid,text,text)`
- `public.invalidate_supporter_recovery_challenge(uuid)`

Private table RLS is enabled, with no browser policy or direct service-role table privileges. The functions use SECURITY DEFINER and an empty pinned search path; PUBLIC/anon/authenticated cannot execute. The row contains HMAC fingerprints, independently derived AES-GCM sealed carrier, purpose, Auth user FK, server-generated 15-minute expiry, five-attempt budget and consumption timestamp. No backfill, Auth-schema patch, supporter merge, notification schedule, cron, payment change or historical ledger entry.

The full committed candidate was applied only in isolated local Postgres and replayed in a rolled-back transaction with final catalog equality. Fresh **read-only** production catalog: table/RPCs absent; 95 ledger entries; 15 supporters. Thus production DDL needs its own exact-file approval before release. Existing app/code rollback does not depend on this new schema while recovery remains disabled.

The existing restricted CurrentUser DPAPI backup was rechecked without decryption: `C:\Users\laich\Documents\HKCSDA\.hkscda-private-backups\hkscda-before-pr135-20260929T003437Z.dpapi`, SHA-256 `c9a32c9303c00ae080c28187b2ad2e0d081211187de3e2360ed508443bff79b2`. Earlier decrypt round-trip was verified; **full restore and storage-byte restoration remain not-run**. This dated backup does not contain later approved additive schema; retain the migration record and assess freshness immediately before approved production DDL.

## Staff handoff, activation and rollback

1. Keep `SUPPORTER_RECOVERY_ENABLED` absent/false. An ordinary merge does not authorize real sending or activation.
2. DB owner approves this exact file/hash, checks production catalog and backup freshness, then applies only this candidate through the supported migration mechanism. Observe the real resulting ledger identity; never fill historical ledger manually. Recheck signatures, grants, RLS, table emptiness and old checkout compatibility.
3. Separately provision server-only **`SUPPORTER_RECOVERY_TOKEN_KEY`**, canonical base64 of 32 cryptographically random bytes. No VITE prefix, shared provider key or committed value. Missing/invalid key fails closed before live provider dependencies. Rotation invalidates outstanding codes; it does not revoke already issued Supabase sessions.
4. Existing Resend key/from/reply-to, Turnstile and durable rate-limit configuration must be verified in an approved sandbox/test sink. The new application email contains only its independent code; historical hosted OTP-template instructions no longer apply to this broker. No hosted Auth/template configuration was modified.
5. Recovery installation requires writable persistent storage and Web Locks; unsupported browsers fail closed with a staff-contact message. Ordinary authentication keeps its existing memory fallback. If an incoming token expires at installation, the SDK retries only local refusals for roughly 25.5s in this version, then requires a new challenge. Staff must not retry a consumed carrier.
6. Hosted provider redemption/configuration/real Turnstile and SMTP parity, real staff identities, #157 record/file access UAT and full before/after production performance remain **not-run**. Production Auth read-only `/health` matched v2.197.0; that proves version only. CI fixture performance remains a separate gate.
7. Rollback disables recovery and reverts application code while retaining the additive private table/RPCs. Preserve issued sessions, existing Auth data, historical supporter links and all webhook/reconciliation paths. A consumed code, sent email or lost session response cannot be undone by schema rollback; request a new challenge. Do not drop the additive schema or restore an old DB over later writes as a routine rollback.

Screenshots: `ui/t22-broker-after-{390,768,1366}.png`; earlier `ui/t22-recovery-before-*` remain historical baseline captures. They are synthetic UI evidence, not hosted-provider proof. No new same-environment Lighthouse before/after measurement is claimed for this authentication repair.

Primary references: [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), [setSession](https://supabase.com/docs/reference/javascript/auth-setsession), [Auth v2.197.0 release](https://github.com/supabase/auth/releases/tag/v2.197.0). Installed SDK source and actual runtime tests determined its session behavior.
