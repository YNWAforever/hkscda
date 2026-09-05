# HKSCDA current-state audit — 5 September 2026

## Assessment

**The application is substantially implemented and actively deployed, but completion and readiness for unrestricted operational use have not been established.** Continue with focused correctness and reliability work. A rewrite or wholesale redesign is not justified by this audit.

The most consequential gaps concern authoritative supporter identity, internal media privacy, financial record duplication, false email success, and CMS publication/audit integrity. Public performance scores alone do not establish a safe or complete CMS/CRM.

This task produced an audit, local evidence and an implementation handoff. Application source, GitHub branches, production data, payment settings and deployments were not changed.

## Verified baseline

| Item | Evidence as of this audit |
|---|---|
| Repository | [YNWAforever/hkscda](https://github.com/YNWAforever/hkscda) |
| Authoritative source | Clean local main and live GitHub main both `20c168459a90c5c92093659a18b139a994451470` |
| Latest change | PR #106 owner UAT checklist, merged 2026-09-05 02:12 HKT |
| Open PRs | None returned by current repository search |
| Deployment | Vercel production deployment `dpl_6mYiKfrrSAMJL6FhnMjhsHzMFZQD`, READY, exact same commit |
| Served alias | [hkscda.vercel.app](https://hkscda.vercel.app) |
| Compute region | Vercel deployment metadata lists `iad1`; browser location/database region relationship needs measurement before changing regions |
| CI | [Run 33904638667](https://github.com/YNWAforever/hkscda/actions/runs/33904638667): verify, brand, a11y, performance and RLS jobs all succeeded |
| Local verification | Bun 1.3.14: 1,778 pass / 40 skip / 0 fail, 279 test files; typecheck passed |
| Local RLS caveat | 40 database-dependent tests skipped without local Supabase. The separate CI RLS job passed; neither result proves deployed policy parity |
| Source integrity | Git status remained clean after read-only audit and checks |

The graph was used for routing discoveries; findings were checked against current source. Older August memory was used only to locate the nested checkout and avoid stale assumptions.

## What is already built

- **Frontend:** TanStack Start SSR, React 19, URL-backed animal filtering/pagination, public adoption/sponsorship/volunteer/donation journeys, status-token pages, public content/report/about pages, canonical URLs and token-page noindex protections. The route inventory records 27 public routes; it is an inventory, not proof all flows pass.
- **CMS:** General content/story editing, media uploads, FAQ, governance/team/about content, documents, adoption instructions/guides and payment-method public configuration. Central server authorization and RLS are present. Adoption-guide releases already implement versions, review and publication; payment configuration also has version guards.
- **CRM:** Supporters, roles and consent, adopters/cases, manual gifts, payment reconciliation, receipts/messages, volunteer registration/review and sponsorship administration. Adoption lists have server pagination and finalization RPCs; public volunteer registration has capacity locking.
- **Operations:** Typecheck/test/lint/build/parity CI, fixture-backed brand/accessibility/performance checks, database behavioral tests, backup/restore scripts and runbook, and an owner UAT checklist.

These foundations should be preserved. “Complete implementation” in a plan or merged tooling PR does not equal completed owner acceptance, payment activation, or production restore proof.

## Performance and live frontend observations

### Current measured evidence

The latest exact-commit CI **desktop fixture** Lighthouse scores were:

| Route | Score |
|---|---:|
| / | 91 |
| /animals/cat | 99 |
| /adoption/apply | 96 |
| /donate | 99 |

Source: [performance job log](https://github.com/YNWAforever/hkscda/actions/runs/33904638667/job/101126978409). These are four desktop lab measurements against a local data fixture. The verifier's overall viewport sweep does not make these mobile Lighthouse scores. Its performance score floor is only 50; a green result is a coarse regression alarm.

A fresh Chromium read-only sweep of five deployed routes at **1440×900 and 390×844** found:
- All ten page loads returned HTTP 200.
- No horizontal document overflow or failed images in those sampled pages.
- Public sampled pages each had one h1; the admin login used no h1.
- Help emitted React hydration error #418 at both widths.
- Home first-contentful-paint was approximately **2.55 seconds desktop / 2.32 seconds at mobile width** in this unthrottled sample. This is FCP, not LCP; a desktop browser with a narrow viewport is not mobile hardware emulation.
- Other public sample FCPs ranged about 0.88–2.07 seconds. These single-run values have no percentile or production-SLA meaning.
- Separate public HTTP probes returned `Cache-Control: public, must-revalidate, max-age=0`; those HTML responses do not demonstrate a positive shared-cache lifetime. They do not establish the caching policy of every static asset.

**CMS/backend and CRM performance remain unbenchmarked at realistic volumes.** No authenticated browser session, production database query timings, query plans, p95 API latencies, or real-user Core Web Vitals were available. The source review found concrete scaling risks and a plan to measure them, not fabricated speed scores.

### Confirmed live defects and release observations

- Mobile menu CTA navigation leaves the destination covered and inert. See [screenshot](../../../artifacts/live/mobile-drawer-bug.png) and [reproduction JSON](../../../artifacts/live/reproductions.json).
- `/animals/cat/not-a-valid-id` and `/sponsors/not-a-valid-id` both return 200 and canonical metadata, despite showing an unavailable-animal message.
- The homepage publicly displays **“【示範】豆豆新生活更新”**. This is confirmed demo-labeled content, not proof every animal record is synthetic. Identify all demo records and get owner approval before unpublishing/replacing production content.
- The donation page explicitly says online donations have not completed activation approval. It currently exposes no enabled checkout method.
- Eight moderate accessibility route findings remain in the current CI log (region landmarks on form/status routes and missing-main landmarks on two synthetic recovery pages). No serious/critical issue was reported by that run. [Accessibility job](https://github.com/YNWAforever/hkscda/actions/runs/33904638667/job/101126978477).
- Vercel project aliases currently list only vercel.app names. The independent legacy-domain probe to hkscda.com returned 403 from this environment; that is not sufficient to diagnose a public outage or confirm completed domain cutover.

Raw public browser observations: [results.json](../../../artifacts/live/results.json). Do not use its page text as approved organization copy.

## Prioritized findings

### A01 · P1 · CRM identity

**Problem:** Public volunteer/donation intake can overwrite an existing supporter's name, phone, language and source by email; volunteer upsert also clears deleted_at. CAPTCHA does not verify ownership of that email.

**Improvement:** Preserve authoritative profiles and consent; keep unverified submitted details on the submission and send conflicts for review.

**Evidence level:** Source confirmed; no attempt against a real supporter.

**Source:** [src/lib/volunteers/repository.server.ts:336](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/volunteers/repository.server.ts#L336) · [src/lib/donations/supabase.server.ts:14](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/donations/supabase.server.ts#L14)

### A02 · P1 · Private CMS media

**Problem:** The editor permits images on internal story updates, while its content-media bucket is public. Filtering internal media out of public JSON does not protect a known image URL. Draft/archived media also lack that storage privacy boundary.

**Improvement:** Private staging/internal media with authorized short-lived previews; publish only approved assets.

**Evidence level:** Source confirmed; no observed disclosure or live bucket inspection.

**Source:** [src/components/admin/content/ContentEditor.tsx:1174](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/components/admin/content/ContentEditor.tsx#L1174) · [supabase/migrations/20260831160000_content_media_storage_bucket.sql:14](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/supabase/migrations/20260831160000_content_media_storage_bucket.sql#L14) · [src/lib/content/repository.server.ts:512](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/repository.server.ts#L512)

### A03 · P1 · Manual gifts

**Problem:** Each submission creates a fresh donation ID and separately commits donation, payment and audit. Receipt failure can return an error after the gift exists, making retry create another gift.

**Improvement:** Stable request key, one transaction for gift/payment/audit, durable receipt/email work, replay returns original IDs.

**Evidence level:** Isolated fake receipt-failure reproduction stored two distinct gifts on two identical attempts.

**Source:** [src/lib/crm/service.ts:145](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/crm/service.ts#L145) · [src/lib/crm/repository.server.ts:660](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/crm/repository.server.ts#L660)

### A04 · P1 · Email reliability

**Problem:** Donation and volunteer senders ignore Resend's resolved error response and mark the message sent. Later retry logic can skip the false success.

**Improvement:** Check provider acceptance; persist failure/retry state and provider ID; use stable provider idempotency keys.

**Evidence level:** Injected rate-limit response returned and persisted sent; no provider call.

**Source:** [src/lib/donations/notifications.server.ts:131](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/donations/notifications.server.ts#L131) · [src/lib/volunteers/notifications.server.ts:90](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/volunteers/notifications.server.ts#L90)

### A05 · P1 · CMS audit integrity

**Problem:** Content create/update/publish can commit before the audit insertion or hydration query fails. The API may report failure after a live change without its audit entry.

**Improvement:** Atomic content/relation/audit transactions; compact mutation return values; reads after commit must not misrepresent mutation failure.

**Evidence level:** Current source confirms separate calls; production failure not induced.

**Source:** [src/lib/content/service.ts:243](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/service.ts#L243) · [src/lib/content/service.ts:351](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/service.ts#L351) · [src/lib/content/repository.server.ts:674](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/repository.server.ts#L674)

### A06 · P1 · CMS publishing

**Problem:** Top-level Publish operates on persisted data while edited fields remain local. Saves have no expected-version condition, and editing published content changes its live record.

**Improvement:** Draft revisions, explicit saved state, publish the reviewed version, conflict response preserving edits, rollback.

**Evidence level:** Source confirmed; authenticated multi-editor UAT still required.

**Source:** [src/components/admin/content/ContentEditor.tsx:132](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/components/admin/content/ContentEditor.tsx#L132) · [src/components/admin/content/ContentEditor.tsx:501](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/components/admin/content/ContentEditor.tsx#L501) · [src/lib/content/repository.server.ts:678](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/repository.server.ts#L678)

### A07 · P2 · CMS validation/uploads

**Problem:** Create accepts published status without equivalent publication validation. Upload precedes metadata registration, so failure leaves orphaned objects and retries can duplicate assets.

**Improvement:** Draft-only creation; unified publish validation; idempotent upload finalization and reference-aware cleanup.

**Evidence level:** Source confirmed.

**Source:** [src/lib/content/schemas.ts:82](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/schemas.ts#L82) · [src/lib/content/service.ts:218](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/service.ts#L218) · [src/components/admin/content/ContentEditor.tsx:1382](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/components/admin/content/ContentEditor.tsx#L1382)

### A08 · P2 · CRM completeness

**Problem:** Unpaged relation filters and donation summaries can hit API row caps. Exports request up to 5,000 rows despite the checked-in 1,000-row API limit, risking plausible-looking incomplete financial CSVs.

**Improvement:** Database joins/aggregates; stable export paging; explicit completeness and overflow checks.

**Evidence level:** Source/config confirmed. Actual production max_rows and affected volumes unverified.

**Source:** [supabase/config.toml:18](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/supabase/config.toml#L18) · [src/lib/crm/repository.server.ts:292](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/crm/repository.server.ts#L292) · [src/lib/crm/repository.server.ts:681](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/crm/repository.server.ts#L681)

### A09 · P2 · Volunteer capacity

**Problem:** Public registration locks and checks capacity; staff approval directly changes status without the same capacity lock or expected-status guard.

**Improvement:** Audited approval transaction with capacity lock; explicit reason if an authorized overbooking policy is needed.

**Evidence level:** Source confirmed; concurrent database test needed.

**Source:** [src/lib/volunteers/repository.server.ts:451](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/volunteers/repository.server.ts#L451) · [src/lib/volunteers/service.ts:290](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/volunteers/service.ts#L290)

### A10 · P1 · Form recovery

**Problem:** Adoption, sponsorship and donation retain a consumed Turnstile token after downstream errors. A failed script promise is also permanently reused within the session.

**Improvement:** Reset consumed tokens; accessible retryable script loading; preserve entered data.

**Evidence level:** Conditional on Turnstile enabled; source confirmed, no live submissions.

**Source:** [src/components/site/TurnstileWidget.tsx:29](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/components/site/TurnstileWidget.tsx#L29) · [src/routes/donate.tsx:412](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/routes/donate.tsx#L412) · [src/components/site/adoption/ApplicationWizard.tsx:457](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/components/site/adoption/ApplicationWizard.tsx#L457) · [src/components/site/sponsorship/PledgeWizard.tsx:213](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/components/site/sponsorship/PledgeWizard.tsx#L213)

### A11 · P2 · Mobile navigation

**Problem:** Clicking the mobile drawer's donation CTA reaches /donate but leaves the drawer visible, page inert, and body overflow hidden.

**Improvement:** Close on CTA activation and committed route change; restore scrolling/focus.

**Evidence level:** Live reproduced at 390x844; screenshot and JSON saved.

**Source:** [src/components/site/Header.tsx:329](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/components/site/Header.tsx#L329)

### A12 · P2 · Help hydration

**Problem:** Help preloads FAQ data into its server QueryClient but first client render starts with an empty query cache. The page does not use serialized loader data, so counts/text disagree.

**Improvement:** Seed the page query from loader data or use loader data directly; retain safe refresh behavior.

**Evidence level:** React #418 reproduced live at 1440x900 and 390x844; root cause traced in source.

**Source:** [src/routes/help.tsx:19](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/routes/help.tsx#L19) · [src/routes/help.tsx:163](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/routes/help.tsx#L163) · [src/router.tsx:6](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/router.tsx#L6)

### A13 · P2 · Donation options

**Problem:** Selection initializes to Stripe independently of published methods. PayPal-only or empty method sets can leave an invisible/invalid selection eligible to submit after activation.

**Improvement:** Selection must belong to available methods; zero methods/read failure disables submission; retain server checks.

**Evidence level:** Conditional activation defect. Live checkout currently disabled.

**Source:** [src/routes/donate.tsx:297](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/routes/donate.tsx#L297) · [src/routes/donate.tsx:658](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/routes/donate.tsx#L658) · [src/routes/donate.tsx:744](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/routes/donate.tsx#L744)

### A14 · P2 · Missing-page HTTP status

**Problem:** Malformed animal/sponsor URLs render a missing panel but return HTTP 200 with canonical metadata.

**Improvement:** Use true 404 for absence; separately preserve recovery behavior for data outages.

**Evidence level:** Both malformed routes reproduced live: HTTP 200.

**Source:** [src/routes/animals/cat_.$id.tsx:12](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/routes/animals/cat_.$id.tsx#L12) · [src/routes/sponsors_.$id.tsx:12](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/routes/sponsors_.$id.tsx#L12)

### A15 · P2 · CMS query scaling

**Problem:** Content parent lists are already paginated and batched, but relation histories and profile prefilters are unbounded; detail hydration has six sequential independent reads.

**Improvement:** Small cover/latest-update projections, database filter joins, history pagination and parallel independent reads.

**Evidence level:** Source-level scaling risk; authenticated latency not measured.

**Source:** [src/lib/content/contentListRead.server.ts:194](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/contentListRead.server.ts#L194) · [src/lib/content/contentListRead.server.ts:376](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/contentListRead.server.ts#L376) · [src/lib/content/repository.server.ts:443](https://github.com/YNWAforever/hkscda/blob/20c168459a90c5c92093659a18b139a994451470/src/lib/content/repository.server.ts#L443)


## Measurement and release gaps

1. **Database parity/access:** The connected Supabase account does not expose the HKSCDA project referenced by AGENTS.md. Production schema, migration status, RLS/grants, bucket privacy, row cap, index plans and backup settings remain unverified. Do not substitute another connected project.
2. **Protected CMS/CRM:** An admin session was not supplied or created. Authenticated workflows, multi-editor conflicts, role-specific UX, realistic query timings and staging E2E need a dedicated test environment and role fixtures.
3. **CI enforcement:** a11y, performance and RLS jobs remain `continue-on-error: true` in the workflow. All actually succeeded on this commit. Branch-protection read returned 403, so required checks cannot be independently verified.
4. **Performance retention:** success paths skip upload of performance/a11y artifacts. Retain machine-readable baseline results on success so regressions can be compared.
5. **Payments:** provider implementations and retry guards exist, but full sandbox journeys, settlement/reconciliation/receipt proof and activation approval remain outstanding in current docs. Do not activate providers while fixing UI.
6. **Recovery:** the runbook records a local-stack restore drill. Production-derived backup restoration, auth/storage coverage, recovery time/objectives and owner sign-off still need evidence.
7. **UAT:** the repository has a checklist with blank pass/fail/sign-off fields. No signed completion was found. Do not mark human acceptance complete merely because the checklist merged.
8. **Language:** Traditional Chinese is the current public baseline with selective English support. Sitewide bilingual completion is a product decision, not an implicit defect or automatic expansion of this plan.

## Recommended order

1. Protect identity, internal media and financial/audit records; make delivery failures recoverable.
2. Fix CMS revision/publishing safety and CRM completeness/capacity.
3. Repair reproduced mobile/Help/404 issues and protected-form recovery.
4. Benchmark frontend and authenticated operations, then optimize measured bottlenecks.
5. Execute staging journeys, reconcile deployment/database evidence, obtain owner/payment/operational approval, and only then approve cutover.

See the [Astra master plan](../plans/2026-09-05-hkscda-astra-completion.md) for ordered work packages, parallel ownership, required evidence and the paste-ready kickoff prompt.

## External technical references

- [Supabase bucket access model](https://supabase.com/docs/guides/storage/buckets/fundamentals): public object downloads bypass retrieval access checks; private previews need access control.
- [Cloudflare Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): single-use token semantics inform retry design.
- [Resend Node.js integration](https://resend.com/docs/send-with-nodejs): inspect the returned provider error.
- [Core Web Vitals](https://web.dev/articles/vitals): field targets at the 75th percentile are LCP ≤2.5s, INP ≤200ms and CLS ≤0.1. These are proposed acceptance targets here, not measured results.
