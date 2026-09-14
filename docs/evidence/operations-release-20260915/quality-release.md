# Phase D quality release evidence

Environment: isolated local Supabase API 56321 / database 56322; browser app 56336. All inserted records are explicit synthetic fixtures. No production data review, cleanup, deployment, push, or commit was performed.

## Delivered behavior and evidence

| Finding | Change | Verification |
|---|---|---|
| Animal preview could diverge from unsaved edits | Saved-revision visual preview; text/gallery/file dirty invalidation; unload/navigation guard; save-race protection; row-locked stale publish check | Browser saved A/edit B guard, cancelled navigation, saved B reviewed and published; database stale preview rejected |
| Lists stopped at early limits or sent full records | Animal 20-row server summary; supporters 25; rules/topics/documents 50; internships 25 with separate detail; audit 50 | Real DB 1001 animals, 26 supporters, 51 rules, 501 internships, 51 audit rows; browser animal page51 and internship detail |
| CMS draft creation and damaged label | Type-specific draft creation and 領養資訊 label | Browser creates event draft and opens editor; component tests |
| No explicit source classification | Per-revision approved/demo/needs_review and evidence; audited server RPC; current revision conflict; published demo candidate review queue | Unreviewed/demo denied; approved allowed; duplicate retry produces no duplicate audit; unverified/banned staff denied for write/read/publication |
| Unknown animal data rendered invented placeholders | Omit absent code, neutering, suitability, personality and unknown age group | AnimalCard and AnimalDetail tests |
| Sponsorship review depended on row clicks | Native keyboard-focusable review buttons, focus return after closing | Component regression tests; actual browser Enter/Space opens, Escape closes and restores trigger focus |
| Large list image work | At most 20 animal list images, lazy loading and fixed display dimensions | Bounded result test; dedicated thumbnail transformation was not introduced |

## Reproduction

Run `bun scripts/test-isolated-acceptance.ts --all` for the shared acceptance gate. It now supplies QUALITY_TEST_API_URL and QUALITY_TEST_SERVICE_KEY from guarded local credentials, so the quality database test does not silently skip.

Focused local run: `bun .local-policy-test/run-quality-tests.ts src/lib/contentReview/quality.database.test.ts src/lib/content/exactSampleArchive.database.test.ts`.
Latest result: 2 passed, 0 failed, 38 assertions (including six verified/banned denial checks). Account-review retry retains the expected four audit records.

Browser: set QUALITY_BROWSER=1, then `node scripts/verify-quality-release.mjs`. Report and screenshots: `docs/evidence/operations-release-20260915/quality-browser/`. Recorded checks include saved-revision dirty protection, unsaved navigation confirmation, same-administrator review/publish, CMS draft creation, late animal page, internship summary/detail, and 390px mobile review queue; no browser page errors.

Image transfer: set QUALITY_BROWSER=1, then `node scripts/measure-quality-image-transfer.mjs`. Actual local publication API published one main image and two approved gallery images. Each explicitly generated synthetic PNG is 68 bytes; all three public objects were fetched and verified. Observed public image bytes: 204. Existing promotion path performs three downloads and three uploads: 408 payload bytes, excluding protocol overhead. Publish API elapsed time: 151 ms. Request counts are derived from the unchanged route loops and verified object count, not a production network trace. Tiny fixtures do not justify concurrency tuning; sequential promotion is retained. This is not a representative production image-speed benchmark.

Same-dataset query comparison is in `.local-policy-test/quality-performance.json`: old full animal query returns 1000 rows / 5,833,001 serialized bytes; new page returns 20 summaries / 11,835 serialized bytes with exact total1001. Both queries were run on the identical synthetic dataset after the implementation, reconstructing the old query; there is no claimed historical wall-clock baseline. Public catalogue batching remains unchanged; dedicated resized thumbnails are not supplied by this slice.

Focused component/domain tests passed for content management, adoption rules, care topics, knowledge, editor, pledge review, animal card/detail, access management/HTTP, internship HTTP and editorial service. Focused lint had zero errors and six existing react-refresh export warnings. Parent owns final integrated typecheck/lint/build/full-suite evidence.

Forward migrations: 20260914161341_admin_content_quality_review.sql, 20260914162305_animal_nonpublic_review_transition.sql, 20260914164558_editorial_verified_actor.sql. Parent applied all to local56322; parent owns clean replay verification and any later migration authority.

## Staff instructions

1. Open the existing six-group administration navigation and find the animal or content editor. Enter only verified source material; saving creates a draft, not publication.
2. Save the current revision. For animals, build the saved-version preview and inspect copy/photos. Any subsequent edit disables preview publication until another save and preview. Leaving an unsaved animal editor prompts before discarding changes.
3. In the source-review panel explicitly choose approved, demo, or needs review and record the source/evidence. Review applies only to that saved revision. The same verified active administrator may review and publish; there is no second-person rule. Source review does not replace separate policy approval.
4. Publish only the inspected revision. A concurrent save causes a conflict; reload and review the latest saved revision. Demo/unreviewed content is blocked from becoming public. Explicitly authorized nonpublic transitions remain available.
5. Use content review queue pages to open candidates. `demo-content-review.md` records repository fixture candidates and proposed actions. These are not production findings or an approved cleanup job. Verify exact record and source before separately authorizing any quarantine; do not infer classification from a title.
6. Use list search/filter and next-page controls. Internship summaries omit detailed answers; select an applicant to load their history and attachments. Missing data should be investigated rather than invented for public copy.

## Remaining evidence limits

No production benchmark, production cleanup, external provider verification, or deploy was attempted. Dedicated image thumbnails, image-rich transfer benchmarks, and production sponsorship financial actions are not claimed. The shared release report must retain these limits rather than infer completion from passing component tests.

## Follow-up browser regressions completed

`QUALITY_BROWSER=1 node scripts/verify-quality-keyboard-reference.mjs` passed all four checks with zero page errors: synthetic pledge Enter/Space/Escape and focus return without financial mutations; 51-reference PDF picker selects record51 and retains it on page1; delayed draft reads keep animal form unavailable until hydration then allow a successful user edit/save; image publication followed by reopen, text-only save, signed preview and second publication succeeds. Report: quality-browser/keyboard-reference-report.json. Safe query/image measurement JSON is copied beside this report.

Review fixes: initial animal hydration now gates editing and ignores cancelled effect responses, preventing revision0 conflicts and late overwrite. Referenced private draft photos are retained after publication because the saved draft still points at them; deletion requires reference-aware cleanup, not publication success.
