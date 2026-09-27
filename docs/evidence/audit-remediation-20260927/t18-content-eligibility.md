# T18 · CONTENT-01/02 content eligibility and maintenance

## Read-only production inventory (2026-09-27 HKT)

`GET https://hkscda.vercel.app/api/stories?page=1&pageSize=50` returned HTTP 200, `total=7` on the production alias recorded at `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`. These are **candidates for content-owner review**, identified by exact ID and current public location. The visible `【示範】` label prompted this list; no title-matching code changes publication state.

| ID | Title | Public location | Other exposure | Suggested review action |
|---|---|---|---|---|
| `70000000-0000-4000-8000-000000000007` | 【示範】豆豆新生活更新 | `/stories/demo-dodo-adopter-update` | featured candidate; map | Confirm provenance; approve demo classification or replacement real story |
| `70000000-0000-4000-8000-000000000001` | 【示範】小白康復中 | `/stories/demo-siu-bak-recovery` | featured candidate; map | Same |
| `70000000-0000-4000-8000-000000000002` | 【示範】Lucky 準備尋家 | `/stories/demo-lucky-ready-for-adoption` | featured candidate; map | Same |
| `70000000-0000-4000-8000-000000000003` | 【示範】阿橘需要助養 | `/stories/demo-orange-sponsor-needed` | map | Same |
| `70000000-0000-4000-8000-000000000004` | 【示範】夏日領養日 | `/stories/demo-summer-adoption-day` | promotional content | Verify event date and approved archival wording |
| `70000000-0000-4000-8000-000000000005` | 【示範】七月慈善市集 | `/stories/demo-charity-market-july` | promotional content | Verify expired copy, especially “本月”; approve correction |
| `70000000-0000-4000-8000-000000000006` | 【示範】六月救援報告 | `/stories/demo-rescue-report-june` | promotional content | Confirm numbers/source and approved report copy |

No production record was modified. The `content_class` default is `unreviewed`, so migration alone does not hide these seven or any older genuine article. Exact reclassification is a separate approved content operation.

## Implemented boundary

- One SQL public reader gates list, featured, map and slug detail on `status`, explicit `content_class`, and effective dates. Expired ordinary stories remain reachable by slug as an archive; expired events remain readable with `已結束` and no old event CTA. Featured cannot bypass eligibility. The stories grid puts expired events and markets in a separate archive without registration links. The server projection repeats the check for older RPC responses and strips internal source/owner fields.
- Staff/admin metadata endpoint requires active role, strict bounded input and current version. DB RPC takes the row lock, increments version, writes revision and audit in one transaction. Verified classification requires source and owner. Admin list shows the current page of unreviewed/demo records and their exact IDs/locations; editor maintains classification, provenance and dates.
- Existing missing-photo filter now shows result count and reference. Animal editor shows file→animal mapping before upload and keeps the existing draft→preview→approved publication flow. Public placeholders remain honest. Sponsor cards show care needs, use and recent progress only when values exist in the reviewed `public_profile`; writer, reader and DB allowlist validate the two new optional fields.

## Isolated migration rehearsal and boundary

Apply `20260927122000_content_publication_eligibility.sql` before new code, then `20260927130000_sponsor_public_profile_fields.sql`. CLI was unavailable locally (`supabase --version` exit 1; `npx --no-install` reported uncached package), so filenames use unique inspected timestamps. Both files were first executed with `BEGIN ... ROLLBACK` against disposable `supabase_db_hkscda-audit-remediation-20260927`, then applied there only. No migration ledger was forged and no production schema was changed.

Catalog on the isolated DB: both public signatures present; `security invoker`; `content_item` RLS on; new class/range/provenance constraints validated; `anon` and `authenticated` have no execute on either public RPC, `service_role` does. The profile validator accepts synthetic reviewed use/progress and rejects contact text. Test fixture inserts synthetic staff/content/editorial approval inside a rollback transaction; no fixture rows persist.

**Release preflight:** inspect live catalog/signatures/grants/RLS and existing data counts, rehearse against a data-bearing isolated clone, lock/backup and verify checksums in the migration manifest, then get migration and release approval. Deploy schema before code. Code rollback can restore the previous build while keeping additive columns; restoring the earlier public reader would expose any newly classified demo item, so that rollback needs a content-owner visibility decision. Do not drop metadata columns or overwrite migration history during rollback.

## Verification and open gates

- Red: public reader let demo/future/featured content through; ended event retained an obsolete CTA; sponsor fields were absent; DB rejected optional fields and JS accepted a bare `@` that DB rejected.
- Green: focused reader, eligibility, metadata HTTP, event rendering, sponsor profile/card tests; isolated SQL reader, audit, grants, RLS and profile validation test. Exact commands and final exit codes are recorded in the cumulative verification log.
- Full isolated suite: SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test exit 0, 2,821 pass, 84 skip, 0 fail (2,905 tests, 475 files). This preceded the one-card follow-up fix; its focused test was red (exit 1), then green (exit 0, 1 pass, 5 assertions). Final reruns are recorded separately.
- Typecheck, lint and build each exited 0 before the final card follow-up; lint had 52 existing warnings. Final source tree: full isolated suite exit 0, 2,822 pass, 84 skip, 0 fail (2,906 tests, 476 files); typecheck exit 0; lint exit 0 with 52 existing warnings; build exit 0.
- Desktop/mobile browser acceptance and before/after screenshots: **not-run**. Playwright Chromium headless shell launch timed out at 180 seconds; Edge launch timed out at 20 seconds. The alternative desktop browser helper failed with windows sandbox helper_unknown_error: apply deny-read ACLs. SSR markup tests passed, but they do not substitute for browser layout, keyboard or mobile verification.
- Open: real staff identities, approved content labels and replacement copy, production migration/release approval. T21 owns public animal search, species/photo filters, total and pagination. No provider payment, email, production content, or live upload was exercised.

## Review handoff

Draft PR #153 targets #152. Source and migration commit: 434ec6a38d2ddbd02e7250c18b2cf6b62413ba3c. The branch has preview deployment disabled. Production merge/migration/content approval remains outside this PR.
