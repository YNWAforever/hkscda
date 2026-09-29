# PR #153 sequential verification — 2026-09-30 (Hong Kong)

Integrated checkout `0284de00cc17e6fe9df4f4e7404423384b88025e` includes repaired #152 head `bf48cb20f70d78d5a15ba6936e810a103624b0ec`. Current main/production is `2b718dc8adcc123707885d1827071448ae4cdc6e` (#152). No production content was classified, published, withdrawn or replaced during these checks.

## Reproduced fixes

- The undeployed sponsor-profile migration duplicated the already-deployed payment instruction timestamp. Migration identity test: red 47 pass / 1 fail; renamed only the undeployed file to `20260927130600_sponsor_public_profile_fields.sql`. Canonical SQL is unchanged; migration/manifest tests green 48 pass / 667 assertions / exit 0. Historical reports retain their original filenames.
- The ended-events section included demo, draft and future events. New regression: 1 pass / 3 fail before repair, 4 pass / 11 assertions after repair. The archive now requires listing eligibility before checking promotion expiry.
- DB integration assertions now execute as actual `service_role` after owner-only synthetic fixture setup. Added a mandatory CI step for this test; current-head DB result pending.

## Executed checks

| Command / environment | Result |
| --- | --- |
| Focused metadata API, projection, eligibility, profiles and stories (8 files) | 53 pass / 164 assertions / exit 0 before the additional archive regression |
| `bun test src/components/site/stories/StoryContentGrid.test.tsx` | 4 pass / 11 assertions / exit 0 after archive repair |
| `bun test --isolate --timeout 30000`; no DB URL, loopback API 52321 unavailable | 2883 pass / 151 skip / 0 fail; 8854 assertions; 500 files; 30.34s; exit 0 |
| `bun run typecheck` | exit 0 |
| `bun run lint` | exit 0; 52 existing warnings |
| `bun run build`; synthetic keys / loopback 54329 | exit 0; generated route tree unchanged (exit 0) |
| `node scripts/verify-content-eligibility.mjs --baseline`; actual old StoryContentGrid at 0284de0 | exit 0; reproduced all 3 invalid archive items at 390/768/1366px |
| `node scripts/verify-content-eligibility.mjs`; same host, Chromium, synthetic loopback 56550 | exit 0; invalid archive items 3 to 0 at all widths; 200% zoom at 768px; no overflow/page errors |

Screenshots: `ui/t18-content-before-{390,768,1366}.png` and `ui/t18-content-after-{390,768,1366}.png`. Both variants suppress the expired registration CTA, show approved synthetic care/use/progress, and hide the internal marker. The fixture server was stopped. These are component/browser checks, not real staff UAT or a same-environment performance benchmark.

## Exact migrations / compatibility

| Source file | Canonical LF SHA-256 |
| --- | --- |
| `20260927122000_content_publication_eligibility.sql` | `bc021c0f63ddfa5b9bb4e81cfc83ba75bd9e828ef85483e739c282dce731ed1b` |
| `20260927130600_sponsor_public_profile_fields.sql` | `fd209e458358fd899aabbda721bec471b1c00f0fc92ce360ce2ada43366ae147` |

First migration adds classification/provenance/effective-window columns and constraints, an atomic versioned metadata/audit RPC, and a compatible published reader. Existing rows default to unreviewed, with no dates, so visibility remains unchanged. Second extends the existing public profile validator with optional sponsor-use/progress text and retains contact/URL rejection. No automatic reclassification or content seeding.

Production read-only preflight: ledger 88; 7 content rows, all 7 published; row hash `70c31b0f1d51f04481cd9cd33fdedd94`; reader definition hash `cc1c9e39efeb9c6c2ab127797a147ab9`. content_item/content_revision/animals RLS enabled; editorial_content_review exists. Required helper signatures exist; service_role content UPDATE/revision INSERT/audit INSERT privileges confirmed. The materializer still filters media to committed, ready public assets. New metadata columns are absent.

Current production-schema clone rehearsal: **not-run / Docker recovery blocked**. Mandatory fresh CI DB scenario: pending. Production migrations: not applied. Do not use green UI or build as schema evidence.

Apply one reviewed migration at a time only after clone rehearsal, exact hash/catalog review and approval scope verification; query columns, signatures, grants, RLS, retained 7-row visibility and unchanged old-field hashes afterward. Do not rename provider ledger entries. Existing restricted DPAPI backup before #135 remains available; its full restore drill and storage-object bytes are not covered.

Rollback keeps additive columns and audit history; revert application code and, only if needed under a reviewed database rollback, restore the prior reader/validator definitions. Do not drop columns or restore a stale full database over newer user data. No rollback may automatically reclassify or republish content.

## Predecessor release evidence

#151 merged as `419f4e0ea597dfa07a8ac265b0744a03fe67f563`; main CI 36600633838 succeeded with all five jobs. #152 PR CI 36600411611 passed all five jobs. Its added volunteer bulk DB step passed 3 tests / 272 assertions / exit 0 against disposable loopback 55322, including concurrency, role downgrade, 104 cross-shelter groups and audit/outbox rollback. #152 merged 2026-09-29T17:01:35Z as `2b718dc8adcc123707885d1827071448ae4cdc6e`; Vercel deployment `dpl_Gr2nXwmqGicmcqCNPmGHKgG85EGY` READY. Main CI 36601994914 is pending at this observation.

## Operational boundaries

CONTENT-01 classification/approved replacement copy and CONTENT-02 approved profile facts/photos remain external. Real test identities, full staff journeys and provider sandbox results remain not-run. Payments and new email scheduler remain disabled. No provider message, refund, public preview or real payment was performed.
