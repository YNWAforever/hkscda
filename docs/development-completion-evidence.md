# Development completion evidence

Updated 2026-09-06. **Local engineering candidate verified; production release remains NO-GO pending external gates.** Plans describe requested work; only executed results below count as evidence.

Code candidate: `1b9265fd6d570c72af3eb8c670e96d58c1007cd2`, branch `codex/completion-20260905`. An evidence-only commit may follow; it does not change application code. Release and rollback proposal: `development-release-proposal.md`.

## Baseline and isolation

- Repository `YNWAforever/hkscda`; audited and repeatedly fetched main `20c168459a90c5c92093659a18b139a994451470`. Final fetch still matched. Original checkout remained clean.
- Original source root `C:/Users/laich/Documents/HKCSDA/HKCSDA/hkscda`; isolated checkout `.worktrees/completion-20260905`.
- Read AGENTS.md, current-state and HTML audits, master plan and CRM/CMS/frontend companions. Master dependency order governed implementation. Graph indexed as `hkscda-completion-20260905`; current source was checked when graph content predated edits.
- Bun1.3.14, frozen baseline install608packages. Optional web-vitals dependency pinned5.1.0. No production environment file or provider credentials copied.
- Baseline typecheck, lint and build exited0; lint had0errors/38warnings; generated route parity passed.
- Baseline isolated suite under concurrent load:1775pass/40skip/3timeouts. Idle baseline:1777pass/40skip/1adult-copy timeout; focused adult-copy diagnostic2pass. Baseline was not represented as wholly green. Raw baseline logs are retained and hashed in the raw-artifact manifest.
- Wave1 red probes reproduced canonical-identity overwrite/reactivation, false email-sent state, create-time publication/public internal upload, Help React418 at390/1440, and both mobile CTA scroll/inert lock defects before fixes.
- Three obsolete baseline probe sources remain as `.test.ts.archive` under evidence; equivalent current regressions live with source. Plans/audits are retained separately under docs/superpowers.

## Package ledger

| Package | Completed code | Acceptance and review |
|---|---|---|
| Identity and consent | Canonical normalized insert-or-resolve; preserves existing/deleted identity and opt-outs; separate submitted contact snapshots and pending opt-in evidence | Original collision red2/2; focused checkpoint61pass; actual identity/submission SQL4pass17assertions. No new consent-verification product workflow invented. `evidence/crm-wave1/README.md` |
| Accepted email and recovery | Shared acceptance adapter requires provider ID; rejected/network/missing-ID responses never become sent; stable keys and fenced durable claims | Notification checkpoint12pass34assertions; later lease-boundary and delivery regressions passed. Real provider activation/delivery remains external. CRM commit `1d0e6ff` |
| CMS containment | Draft-only creation and rejection of internal assets through public-only uploads | Red2fail, focused115pass and independent review; interim commit `c53c9cb`, superseded by complete private lifecycle |
| Help and mobile navigation | Serialized first Help render; drawer closes on CTA/path/history/breakpoint changes; SSR menu waits for hydration | Original React418/CTA failures reproduced then4browser scenarios passed; final delayed-JS menu3widths and expanded lifecycle5scenarios passed. Commits `31c474c`, `3729a38` |
| Atomic manual gifts | One transaction for request/finance/consent/role/audit/job; stable replay and authorized delivery retry; existing receipt allocator/refund/reconciliation safeguards retained | Controller red5fail→5pass; outcome red2fail→2pass. Real SQL/concurrency/read/capacity suite17pass90assertions. Actual CRM browser7named checks,0errors, one donation/payment after both retries. `evidence/crm-package2/` |
| CMS revisions and private media | Immutable authoring/public snapshots; optimistic versions; selected publication pointer; private server-owned upload sessions; verification/finalization and staged public copies | Actual lifecycle15pass43assertions and Storage3pass12assertions; browser11scenarios/0errors including upload failure/retry, public isolation,409 recovery, expired preview and restore. Commit `413d964`; `evidence/cms-wave1/` |
| Protected forms/configuration/404 | Five CAPTCHA callers clear consumed/stale tokens; retryable script; published-method membership; genuine missing404 distinct from outage | Four additional rendered protected-form recovery cases;7widget lifecycle cases; strengthened failure browser6scenarios. Final focused16pass74assertions. Commits `b14ddf2`, `3729a38` |
| Complete CRM reads and volunteer capacity | Complete predicates/aggregates/export envelope with explicit5000overflow; deterministic consent ties; shared activity locking and versioned atomic staff approval/audit | Actual1001/5000/5001 fixtures, races, cancellation/reduction and audit rollback passed.5000-row envelopes2,177,832/1,977,831bytes. Historical detail lists are not represented as wholly paginated. `evidence/crm-package4/`, `crm-package5/` |
| CMS recovery and bounded reads | Dirty/conflict preservation, failed-refetch-safe reload, keyed operations, revision comparison/restore; bounded summaries and20-item history pages | Actual1201parents ×100updates ×100media:1pass13assertions; complete profile filter counts, bounded pages and body omission. Browser recovery cases passed. `evidence/cms-wave1/reads-package4-local.md` |
| Local reconciliation | Fresh locked inventory;24h grace; preserves current, revision, session and publication references; explicit local-only apply with100candidate cap | Unit6pass; actual Storage1pass17assertions:1orphan deleted/7protected objects retained; cleanup0. Offline inventory remains count-only; production apply is unsupported. Commit `77cd14f` |
| Admin hydration | Login submit disabled before handlers attach;28protected routes defer browser-session guards/rendering to client; server API role checks unchanged | Login SSR red→3pass7assertions; AST contract red28missing→2pass6assertions; actual CRM direct loads/reloads/role denial7checks0errors and CMS11checks0errors. Commit `f0fea42` |
| Measurement/recovery tooling | Retained axe/repeated Lighthouse, admin benchmark, responsive hero derivatives, adoption CLS repair, default-off consent-gated RUM, synthetic restore rehearsal | Public24lab runs,465admin observations and actual separate-target restore described below. Commits `78efa3f`, `efc301b`, `bd5818b`, `1b9265f` |

## Actual isolated database and browser acceptance

Docker became available during verification. Unique source stack `hkscda-completion-20260905` used DB55322/API55321; restore stack used DB55622/API55621. All52repository migrations, including the7candidate migrations, applied. Unrelated Docker stacks were preserved. Generated key files were kept in ignored local runtime directories; reviewable evidence was checked for token retention and no keys were committed.

- CRM financial/read/capacity:17pass90assertions in13.82s; identity/submission SQL4pass17assertions; Auth/PostgREST RLS38pass66assertions.
- CMS lifecycle/read/Storage:19pass68assertions.1201-parent whole-fixture runtime10.14s is not query latency. Actual private URL denial, signed preview, publication preparation and grant checks passed.
- Local reconciliation:1integration pass17assertions,1deleted/7retained, exact cleanup0.
- Harness corrections were supported by red runs: Bun SQL JSONb requires direct objects rather than JSON.stringify strings; rejected SQL promises needed explicit awaited assertions on this Windows runtime; UUID cleanup and publication guards remained enabled. No production SQL was altered to make fixtures pass.
- Actual authenticated CRM browser7named checks and CMS11scenarios passed with zero browser errors. Local document CSP appended only API55321 to connect-src/img-src, and Chromium local-network permission was scoped to app55430. Real Auth/API/Storage calls were used; CMS failure cases deliberately injected the recorded503 responses before real retries. These local transport accommodations are not production-header acceptance.
- The original CRM header adapter followed redirects, amplifying a hydration mismatch; its red is qualified accordingly. CMS independently preserved redirects and reproduced the actual protected-page login redirect. Final harnesses preserve redirects; no error gate was suppressed.
- Review corrected lifecycle timestamp/restore/slug/snapshot/privacy issues, dirty-editor recovery, keyed operation races, uncertain upload retry, manual-gift post-commit handling, claim boundaries and structured volunteer409 handling. Package checkpoints identify detailed findings and tests.

## Measured performance and accessibility

Synthetic public fixture, Chromium148.0.7778.96/Lighthouse13.4.1. Final broad brand passed26routes ×5viewports; axe passed26routes with0violations; expanded lifecycle5/5; menu hydration3/3widths; failure modes6/6.24Lighthouse observations all passed, minimum score94. See `evidence/final-public/verification-summary.md` and retained raw reports.

| Route | Final mobile median LCP ms | Final desktop median LCP ms | Mobile/desktop CLS |
|---|---:|---:|---|
| Home |2621.192|799.908|0.000780/0.000280|
| Cats |1850.052|582.625|0.000282/0.000142|
| Adoption |1610.249|611.594|0.017628/0.010157|
| Donate |1894.449|769.298|0.011790/0.000373|

Approved hero photo derivatives480/768/1024wide are46015/92461/143663bytes, from the1500×2000source. Earlier comparable3cold home runs reduced mobile/desktop LCP27.2%/23.9%; baseline3513/1040ms. Adoption baseline CLS0.121523/0.078478 fell substantially; actual source-built empty-storage and restored-draft cases preserved the applicant draft and low CLS. Closed global Help widget FAQ requests fell1→0; opening/search still fetched/rendered the answer.

Opening final Lighthouse runs overlapped the tail of a unit suite; not claimed uncontended. Runner GitHEAD metadata differs from the already-running build identity and is not claimed as built-source SHA. Public source was unchanged through these modes; final rebuilt menu/navigation/Help smoke also passed. TBT is not INP; no field p75/production claim. RUM remains default-off/unwired pending approved consent integration.

Authenticated local admin benchmark used1k/10k/50kparents with3donations/supporter and3updates/content,5scenarios ×31observations ×3sizes=465actual requests.14/15proposed latency targets met; one1kCMSlist p95=761.0ms versus750ms.10k198.2ms and50k657.0ms did not justify a speculative index. Every50-item list stayed below150KiB localgzip. SQL-call deltas and EXPLAIN ANALYZE/BUFFERS are retained in `evidence/admin-local/performance.json`; calls include Auth/background work, not an exact per-request trace. Vite/local-stack measurements are not hosted production latency.

## Recovery rehearsal

Existing data backup command exited0; a separate public/private/Auth/Storage metadata supplement and image-byte artifact were restored into the new disposable target. Platform-owned Auth tables required that target's local supabase_admin role after an initial permission failure. No production role change occurred.

Selected restore verification passed in5720.94ms: supporter/donation relationship, password sign-in, exact recovered object bytes and private public-URL denial. All52migration versions matched; post-cleanup counts matched74tables; cleanup errors0. See `evidence/restore-local/{README.md,result.json,counts.json}`. Synthetic local timing is not an owner-approved RTO/RPO or proof of production backup completeness.

## Final integrated verification

| Check | Result | Artifact |
|---|---|---|
| Full isolated suite, task builds/browsers/benchmarks stopped |1981pass46skip0fail;5969assertions;317files;29.54s|`evidence/release-candidate-tests-idle.txt`|
| Typecheck |Exit0|`evidence/release-candidate-typecheck.txt`|
| Lint |Exit0;0errors40warnings|`evidence/release-candidate-lint.txt`|
| Final production-mode synthetic build |Exit0|`evidence/release-candidate-build.txt`|
| Generated route parity |Exit0|Recorded Git diff check|
| Final rebuilt public smoke |Menu3widths and5expanded lifecycle scenarios pass|`evidence/final-public/release-menu-hydration.json`, `release-smoke.txt`|

The46skips are40explicitly opted-in database/Storage cases plus6suite hooks; those cases executed in the separate suites above. RLS38cases also ran in the full suite. Earlier concurrent full runs with filesystem-scan timeouts remain retained; the final default-timeout idle run passed without relaxing assertions or timeout configuration.

The build profile used loopback fixture54330, CI placeholder credentials, public Turnstile test key and checkout enabled only for synthetic acceptance. It is **not a deployable production configuration**; source defaults/production payment/provider gates were not activated. Application source at the build and candidate is identical; final changes after the code candidate are evidence only.

## External release gates

- Correct production project access and read-only migration/grant/bucket parity; historical public/internal-object inventory and any approved remediation list.
- Required remote CI contexts verify/brand-verify for the exact candidate; no branch push was performed, avoiding unapproved preview deployment.
- Approved provider sandbox/end-to-end settlement, receipts and accepted delivery; actual intended payment methods and activation remain unverified.
- Full provider-dependent public submission-to-staff-finalization journeys and operational owner UAT. `development-owner-uat-status.md` leaves every owner sign-off NOT RUN.
- Production backup/schema/Storage/Auth recovery coverage and owner-approved RPO/RTO, field metrics, deployment window/operator and cutover approval.

No main merge/push, deployment, production migration/data/object mutation, real-person message, payment activation or cutover occurred. The concrete proposal is ready for review; production approval is not requested while these gates remain unresolved. Bulky raw evidence is retained locally and hashed in `evidence/raw-artifact-manifest.json`; reviewable summaries and source tests are committed.

## Legacy data import assessment — 2026-09-06

Inspected supplied MariaDB schema: 49 tables, zero data statements. Compared current Supabase public column metadata read-only. Mapping, exclusions, validation gates and rollback proposal: [assessment](evidence/legacy-import-20260906/assessment.md). No records imported or production writes performed. Actual record export and linked assets are required before a dry-run can establish acceptance.

## Legacy record export staging — 2026-09-06

PASS local staging: 150,918 business records; 74 excluded; repeat import added zero rows. Selected reference checks flag 9,797 rows for review. Thirteen synthetic parser/privacy/atomicity tests pass after review fixes. [Measured results and remaining gates](evidence/legacy-import-20260906/data-staging-results.md). No application-table or production import performed; source completeness and asset files remain unresolved.

## Confirmed legacy export / lookup rehearsal — 2026-09-06

User confirmed export completeness. PASS: 44 inactive reference records in offline PostgreSQL; atomic failure rollback, repeat idempotency, conflict rejection and anonymous denial measured. 18 synthetic tests pass. [Details and remaining target gates](evidence/legacy-import-20260906/confirmed-source-and-lookup-rehearsal.md). Animal status meanings, assets, canonical identity and live animal-policy drift remain unresolved. No production changes.

## Animal photo staging — 2026-09-06

PASS private local preparation: 1,142 animal-photo links, 1,108 distinct unchanged objects; repeat created zero objects. 97 unmatched and 17 held (7 decode/read errors, 10 unsupported MPO multi-image files). Six attachment-overlap photos remain private. 27 synthetic tests pass; two filesystem review findings fixed and rechecked. [Photo evidence](evidence/legacy-import-20260906/animal-photo-results.md). Unknown legacy statuses retained; no production uploads or publication.


## Canonical legacy animal replacement candidate — 2026-09-07

Implemented independent adoption/sponsorship eligibility and soft retirement, preserving canonical cat/dog identity and placeholder-linked history. Candidate: 248 distinct animals, 100 adoption cats, 108 adoption dogs, 115 sponsors, 75 shared identities; 4,896 animals remain private history. This supersedes the earlier animal-status blocker only for export-based selection using explicit eligibility flags; unknown status letters remain uninterpreted.

Reviewed fixes have failing-before/passing-after evidence for reader filtering, species correction, sponsorship snapshot constraint, empty replacement input, and concurrent rollback history loss. Full application suite: 1,954 pass / 86 skip / 0 fail / 5,954 assertions. Python: 34 pass. Typecheck and build: exit 0. Lint: exit 0, zero errors and 40 warnings. Final replacement and rollback rehearsal passed against the complete candidate migration. No production migration, deployment, data change or photo publication occurred.

[Concrete release and guarded rollback proposal](evidence/legacy-import-20260906/animal-replacement-release-proposal.md). Acceptance is LOCAL ONLY: actual production-shaped trigger/auth parity, owner membership/photo review, hosted UAT, backup/live fingerprint and explicit production authorization remain gates. Separate read/write eligibility checks require submissions and edits to be paused and drained during cutover. Existing production payment/provider gates are unchanged.


## PR #109 / CI run #149 correction — 2026-09-07

Run 34046979490 failed brand, accessibility and performance verification on the same homepage assertion: two h1 elements (all five brand viewports and both performance viewports). The eligibility filter exposed stale CI animal rows without membership fields, producing an empty featured section. That section used the page-level default heading of PublicStateShell.

Reproduced locally before editing: fixture query returned 0 instead of 6 cats; empty home render produced 2 instead of 1 h1. Fixed fixture membership/retirement fields and explicitly selected headingLevel=2 for the embedded empty section. Both regressions now pass; full CI-style isolated suite: 1,956 pass, 86 skip, 0 fail, 5,956 assertions. Browser checks are rerun remotely for the updated commit; no assertion or threshold was weakened. Production data and migration state are unchanged.


## Post-merge empty adoption list diagnosis — 2026-09-07

Read-only production diagnosis after PR #109 merged as df7b426: all three membership columns are absent; 44 placeholder rows remain and fingerprint 89e23d5750602bc63c73484fa2896554 is unchanged. Reproducing the public eligibility predicate returned PostgreSQL 42703, column adoption_eligible does not exist. Homepage loadHome catches the listing rejection and renders the empty featured section. This is code/schema rollout mismatch, not proof of an empty source export.

Prerequisites checked: private schema and has_admin_role(text[]) exist; original sponsor-only snapshot constraint exists; replacement manifest tables do not exist. Exact candidate membership migration passed again in a fresh offline fixture. No production repair executed. Applying the migration requires explicit production authorization and would restore reads of current placeholder records; the separately gated 248-record import has not run.


## Approved production membership repair — 2026-09-07

User confirmed the schema migration only. Supabase apply_migration succeeded as production version 20260906173545, name animal_catalog_membership, corresponding to repository file 20260906162436_animal_catalog_membership.sql. Record this version mapping before subsequent migration parity work; do not blindly reapply the same migration.

Before: public predicate failed PostgreSQL 42703 (missing adoption_eligible). After: anonymous-role queries return 26 adoption cats, 13 adoption dogs and 2 sponsors. Total 44 records, zero retired, zero replacement batches. Anonymous private-schema access is denied. Live HTTP checks return 200 for home/cats/dogs/sponsors; homepage empty message absent and four animal links present. Listing first-page links: cats16/dogs13/sponsors2. Verified server-rendered HTTP and SQL, not browser hydration or owner UAT. No legacy animal import or asset upload occurred. Aggregate artifact: evidence/legacy-import-20260906/membership-production-repair.json.


## Authorized production legacy animal replacement — 2026-09-07

User explicitly authorized importing the 248 legacy animals and replacing existing records. COMPLETED: batch 9847d544-cafb-5670-bfd3-5194df959cd3 applied. The 44 placeholders were retired, not deleted. Production stores 292 animals; anonymous public reads show exactly 248 distinct animals: 100 adoption cats, 108 adoption dogs, 115 sponsors, with 75 shared identities. All 30 captured linked records across eight tables are unchanged. All 292 audit entries and 292 private rollback manifest rows exist; current rows match their recorded after-images.

Before execution, captured a private 54,853-byte scoped backup (SHA-256 f03956ec41b5c2c9e64ccd2a8922c8ab4ed05609845dc115c872b11ce4da52a5). Restored actual animal/audit columns, constraints, triggers, auth.uid function and every animal FK action into offline PostgreSQL. Imported 248, replayed with zero additions, verified forced-failure atomicity, and rolled back to byte-equivalent JSON animal records and all original linked snapshots. Related tables retained full snapshot payloads plus actual animal FK columns; this is scoped recovery evidence, not full Supabase/Auth recovery.

Production execution used an exact full-row snapshot guard, existing-batch refusal, EXCLUSIVE animal lock and write locks on eight related tables, plus timeouts and pre-commit count/audit assertions. No application-wide maintenance mode is claimed. Stored the 208,319-byte applied manifest privately (SHA-256 f0bdc8d650d71688605e93377e2cc1d6c075dd689a42cae7601c0b6dd2a4c8c1), together with the guarded rollback SQL. Rollback is not executed in production and requires a separate decision; edits/new links intentionally block it.

Live HTTP verification: home/cats/dogs/sponsors all 200; page counts 100/108/115; homepage has four animal links and no empty message. One shared canonical animal resolves under adoption and sponsorship (both 200); a retired placeholder URL returns 404. Anonymous reads expose zero retired placeholders. Details: evidence/legacy-import-20260906/production-animal-replacement-result.json and production-shaped-animal-rehearsal.json. No photo upload, payment/provider action, browser hydration claim or owner UAT claim. Remaining 4,896 legacy animals stay private history.


## Authorized public animal photos — 2026-09-07

User explicitly confirmed photo upload. Published 14 strictly matched, visually reviewed animal profile photos in content-media/legacy-animals, then atomically linked the 14 canonical animals and wrote 14 legacy_animal_photo_publish audit entries. Covers 14 sponsors, one also adoptable. Public object byte hashes verified for all 14; representative sponsorship detail returns HTTP 200 and renders its matched URL. Three source images contained GPS metadata: removed EXIF/XMP/IPTC/comments without re-encoding pixels; Pillow verified identical decoded pixels and no remaining EXIF/XMP/Photoshop metadata for every image. Original private source bytes are unchanged. Unmatched/historical/attachment-overlap/held photos remain private. Evidence: production-photo-publication.json. The prior animal rollback correctly refuses photo-modified rows; restore/review the separate photo before-images before attempting any broader rollback.

## Approved legacy profile redesign — 2026-09-07

Baseline: refreshed origin/main `df7b4261eab4e646f91a83e76a3a912ea3cfafb1`, isolated branch `codex/legacy-animal-profiles-20260907`. User approved the compact profile design after separately completed photo publication. The redesign approval authorizes implementation/local verification; no new production profile migration/data write or deployment has been performed.

Public contract: eight allowlisted nullable profile facts. Both listing/detail readers remove internal notes and unknown keys, preserve existing membership/retirement predicates and derive age from valid birthdays using the Hong Kong date. Pre-migration rows remain readable. Cards/details preserve canonical IDs and shortlist intent; filters apply across the complete eligible catalogue before pagination.

| Package | Reproduced before | Measured after | Acceptance |
| --- | --- | --- | --- |
| Public projection | Missing publicProfile module prevented five regression tests from running | Five tests/13 assertions cover private-key exclusion, notes removal, invalid dates/contact text, false neutering, future birthday and HK day boundary | PASS local |
| Frontend facts and filters | Initial run6pass/3fail: missing no-photo/unknown labels, raw notes displayed, profile filter40results instead of20; unknown-age extension reproduced two more failures | 17 focused tests/87 assertions; unknown ages no longer match adult | PASS local source; final browser results below |
| Legacy profile preparation | Initial unittest discovery failed missing public_profiles; provenance extension failed missing verify_staging_bytes | Six focused tests and43 total Python tests pass; repeated candidate/review/aggregate outputs byte-identical | PASS private preparation |
| Public fixture | Existing membership fixture test failed new personality assertion | Same test passes with known/unknown profile facts, no-photo samples and detail object response; counts/age bands unchanged | PASS local |
| Schema and atomic patch | PostgreSQL missing-column error reproduced; nine invalid profile payloads rejected after migration | 248 profiles applied with248 audit entries; replay0; forced exception preserves all rows/audit; apply and rollback reject drift; rollback restores exact292-row baseline and preserves14 photo links | PASS offline reconstructed target |

Candidate SHA-256 `80d5e153e56975f0abfec44ec7db46e67bf130d3fc126fd7d9e0a5d64c90891f`. All248 have code/suitability/recordDate;247 birthdays; neutering173yes/59no/16unknown. Reviewed narrative fields:124personality,105health,1story. Held:68personality,72health,92story. Aggregate provenance and review coverage: evidence/legacy-import-20260906/profile-projection.json. Holds remain private; field presence is not publication approval.

Independent review found no material issues in the projection/schema/frontend or session-local transactional patch. The patch only changes profile/update timestamp, guards exact row state and performs audit writes atomically. Offline evidence: public-profile-schema-rehearsal.json and public-profile-patch-rehearsal.json in that evidence directory. This reconstruction uses captured production animal/audit schema, constraints and triggers, plus known photo links; it is not fresh production DB parity or full-platform recovery.

Initial integrated verification: full bun test --isolate1968pass/86skip/0fail,6012assertions across321files; Python43pass; typecheck exit0; lint exit0 with0errors/40existingwarnings. Raw logs remain locally in tmp/profile-*. Browser-driven final adjustments and final verification are recorded below before candidate completion.

Release order, fresh-backup requirement, profile-specific rollback and external gates: [profile release proposal](evidence/legacy-import-20260906/profile-release-proposal.md). Production counts100cats/108dogs/115sponsors and14photos are prior measured production results; this implementation turn performed no production mutation and makes no refreshed live parity claim.

Final source verification after visual review: 1,969 pass / 86 skip / 0 fail, 6,020 assertions across322files in20.84s. Typecheck exit0; lint exit0,0errors/40warnings. An earlier concurrent-build run hit the unchanged5s timeout in two existing source-scan tests (adultCatCopy and serviceSloganCopy); the idle full run passed without source-test changes or relaxed timeouts. The new listing error regression reproduced2h1 before fixing to1. Cat/dog navigation now uses44px tabs and a compact single-column intro.

All248 actual reviewed candidate profiles also passed the application parser unchanged for public fields, with notes excluded and canonical IDs/photo URLs preserved. Age groups on2026-09-07:46young,140adult,61senior,1unknown. Evidence: evidence/legacy-import-20260906/profile-runtime-validation.json. Browser harness early failures came from a stale grid selector and assertions before route hydration/render settled; the corrected harness waits for observable UI state. Those search timing issues were harness failures, not product defects; the retained final failure artifact records the later genuine header overflow regression.

Fresh read-only Supabase check before release-candidate completion confirms292stored animals,44retired placeholders,100adoptioncats,108adoptiondogs,115sponsors and14public photo links. public_profile column remains absent. This supersedes only the earlier no-refreshed-counts statement, not the full production parity gate. No schema/data mutation was performed. Evidence: evidence/legacy-import-20260906/profile-production-preflight.json.

Final browser acceptance PASS on the rebuilt source: cats/dogs at390/768/1440px, oneh1,1/2/3columns, labelled missingphotos; name/code search, clear, browserback, unknown-neutering and experience filters, empty recovery; both shortlist intents persist into detail and can be removed; broken-image fallback keeps its dimensions; keyboard search submission; zero pageerrors. Strengthened body-width assertion exposed a preexisting clipped header menu: body409px atviewport390 before, body390/menu right374 after. At320px body320/menu44x44/right304 and menu opens. Evidence: profile-browser/acceptance.json, header-overflow-before.json and header-320.json.

Actual248-profile local preview PASS:100cats/108dogs,15cards per page, nooverflow at390/1440, disjoint first/second pages and a late-record code search returning one result on page1. Captured actual legacy names/code/details, including a reviewed story, using the allowlisted private preview file and read-only public photo URLs. Restored the standard synthetic fixture before site-wide verification. Evidence and screenshots: evidence/legacy-import-20260906/profile-real-preview/result.json and adjacent PNGs. These are local preview results, not deployment or owner UAT.

Final review reconfirmed the production boundary and rollback proposal: no new profile publication is claimed, no placeholder-credential build may be promoted, and profile rollback remains separate from the earlier animal/photo operations. The exact29source-file manifest is saved as profile-source-manifest.json; hashes were rechecked after final tests and browser build with no changes. Final staged suite:1,969pass/86skip/0fail,6,020assertions in37.13s. The mobile-only CSS correction followed the earlier21s suite; this final run includes it.

Generated PNG screenshots are retained locally under the repository evidence-ignore policy; committed aggregate results and profile-browser-artifacts.json record their paths, sizes and hashes. Original legacy photos and private source/review/rollback manifests remain ignored and are not staged.

Final site-wide acceptance PASS on the final fixture build: brand26routes x5viewports; accessibility26routes x1viewport; performance4routes x2viewports x3cold runs =24samples, scores90–100 with unchanged thresholds. All three final run-context files report zero failures. Metrics/sample hashes and all source/test results are summarized in profile-verification-summary.json; large Lighthouse reports/screenshots remain local. This is local fixture performance, not production field performance.

Local release-candidate acceptance is complete. Production profile publication, exact-revision remote CI, deployment and owner UAT remain external gates under the separate release proposal. The earlier14photo publication is complete and the fresh aggregate production preflight is recorded separately. No main merge/push, new production migration/profile write, payment activation or real-person message occurred during this redesign implementation.
