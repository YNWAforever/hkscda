# HKSCDA Development Completion Plan for Codex 6 Astra

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task by task. Checkboxes remain unchecked until evidence exists.

**Goal:** Finish the existing HKSCDA frontend, CMS and CRM by closing verified integrity, privacy, recovery and usability gaps, proving realistic performance, and completing staged acceptance.

**Architecture:** Preserve TanStack Start, existing domain services/repositories, Supabase, current role gates and approved public design. Concentrate multi-record correctness inside atomic database operations; separate committed business records from retryable delivery; make public rendering derive from reviewed, bounded projections.

**Tech stack:** TypeScript, React 19, TanStack Start/Router/Query, Bun 1.3.14, Supabase Postgres/Storage, Vercel, Resend, Stripe/PayPal/COD adapters, Playwright, axe, Lighthouse.

## Status and scope

This is an **unexecuted implementation plan**, written on 2026-09-05 against main `20c168459a90c5c92093659a18b139a994451470`. The audit and reproductions are complete; proposed production fixes are not implemented.

Repository: [YNWAforever/hkscda](https://github.com/YNWAforever/hkscda). Existing local source: `C:/Users/laich/Documents/HKCSDA/HKCSDA/hkscda`. Execute code work in an isolated current checkout, never the ChatGPT project's read-only `sources/` mirror.

Read these companion documents before assigning implementation:
- [Current-state audit](../audits/2026-09-05-hkscda-current-status.md) — findings A01–A15 and evidence limits.
- [CRM plan](2026-09-05-hkscda-crm-completion.md) — five packages and failure reproductions.
- [CMS plan](2026-09-05-hkscda-cms-completion.md) — four packages and publication/storage contracts.
- [Frontend plan](2026-09-05-hkscda-frontend-completion.md) — six tasks and browser checks.

This master document governs order and cross-domain acceptance where a companion uses a shorter instruction. New file/type/function names in those plans are proposed implementation contracts; verify existing names before importing them.

## Global constraints

- Read active-checkout AGENTS.md, current domain docs and applicable ADRs. Prefer the code graph for discovery and confirm source against the audited/current commit.
- Preserve current APIs, URLs, Traditional Chinese baseline, approved identity, roles, public status-token privacy and unrelated local changes.
- Use current main as baseline. Do not replay the August layout plan or rebuild already completed guide-release/payment-configuration versioning.
- Keep service-role secrets server-only; no real supporter records, payment details or capability tokens in logs/tests/screenshots.
- Stage explicit files and review focused diffs. Do not create a new user-owned Codex task unless requested.
- A review-ready branch/draft PR is the engineering deliverable. Main merges trigger deployment and require explicit release approval under repository AGENTS.md.
- No production migration, data cleanup, media copying/deletion, real payments, provider activation, messaging real people or domain cutover follows automatically from this plan.
- Local tests may use isolated database/storage fixtures. Staging provider tests require the correct explicitly authorized test resources. Missing access is an external gate, not a pass.
- All full-suite commands below use `bun test --isolate`, matching current CI. Replace shorter bare `bun test` full-suite instructions in companion plans accordingly.
- “Sent” means accepted by the provider, not delivered to a recipient. Keep delivery/bounce semantics separate.
- Payment persistence/webhook reconciliation must remain independent of notification availability: either retain a retryable webhook until side effects complete, or commit a durable delivery job before acknowledging completion. Never mark all work complete with neither accepted mail nor a durable recovery record.

## Baseline and execution record

Create `docs/development-completion-evidence.md` in the implementation checkout and record commit, date, fixture version, commands, pass/fail/skip counts, browser results, migration identifiers, unresolved gates and review links.

- [ ] Fetch and record current main; compare changes since the audit. Reproduce findings on the new head and retire any already fixed item.
- [ ] Create an isolated branch/checkout; leave the original local checkout unchanged.
- [ ] Verify `bun --version` is 1.3.14, then install using `bun install --frozen-lockfile`.
- [ ] Run typecheck, isolated tests and lint. Baseline audit: 1,778 pass / 40 database-dependent skips / 0 fail; typecheck passed. Remote CI also passed build, route-tree parity, brand/a11y/performance and RLS.
- [ ] Build with the documented safe local fixture configuration; capture baseline screenshots and explicit defects.
- [ ] Confirm local Supabase readiness before database tests; require named transaction/RLS/concurrency tests to execute without skips.

No cross-domain percentage-complete estimate is required. Track completed acceptance criteria.

## Delivery sequence and ownership

| Wave | Work | Depends on | Reviewable result |
|---|---|---|---|
| 1A | CRM identity preservation (CRM package 3) | baseline | Unverified public intake cannot overwrite canonical profiles/consent or reactivate deleted profiles |
| 1B | Email acceptance handling (CRM package 1) | baseline | Resolved provider rejection never becomes sent |
| 1C | CMS immediate containment | baseline | Reject create-time publish bypass; reject new internal attachments to public-only upload paths |
| 1D | Help hydration + mobile navigation (frontend tasks 1–2) | baseline | Live-reproduced problems have browser regressions and focused fixes |
| 2A | Atomic manual gifts + recoverable delivery (CRM package 2) | 1A/1B contract coordination | One financial operation and stable IDs under retries/concurrency |
| 2B | Atomic CMS revisions/audits + private media (CMS packages 1–2) | 1C | Transactional lifecycle and safe asset publication |
| 2C | Form retries, payment options, true 404 (frontend tasks 3–5) | 1D | Recoverable public journeys and correct HTTP behavior |
| 3A | Complete CRM queries/exports + capacity approval (CRM packages 4–5) | 1A, stable mutation contracts | Complete data beyond row caps and race-safe capacity |
| 3B | Editor conflicts/revisions + bounded CMS reads (CMS packages 3–4) | 2B | Predictable saves/publication and bounded query volume |
| 3C | Accessibility and performance verification | 2C, stable read contracts | Retained evidence, explicit budgets and measured improvements |
| 4 | Staging E2E, operational and owner acceptance | all engineering packages | Evidence-backed release candidate |
| 5 | Authorized release and cutover | explicit sign-offs | Verified deployment/database alignment and rollback |

Astra should use at most three implementation agents plus a coordinating reviewer. Assign frontend, CMS and CRM ownership; **do not let parallel agents edit shared files or issue overlapping migrations**. Within CRM, packages share repositories and should be sequential unless split by non-overlapping files. Root coordinates shared notification types, route generation, migration ordering and final verification.

### Wave 1C: small CMS containment before the larger lifecycle work

Files: `src/lib/content/service.ts`, `schemas.ts`, `http.server.ts`, associated tests; `src/components/admin/content/ContentEditor.tsx`; the existing upload-target/media mutation handlers discovered from the graph.

- [ ] Reproduce a staff create request with published status and missing story prerequisites using a fake repository.
- [ ] Require creation as a draft and keep publication behind the existing validated transition.
- [ ] Reject new private/internal asset uploads through a path that would store them publicly; give staff a clear temporary limitation. Enforce server-side, not solely by hiding a control.
- [ ] Do not delete, privatize or rewrite existing objects during containment. Prepare a count-only inventory for later authorized remediation.
- [ ] Prove legitimate public media workflows and existing published pages remain usable. This is an interim patch, not completion of private asset handling.

## Concrete subsystem completion criteria

### CRM correctness

Execute the CRM companion with these non-negotiable results:
- A public request with an existing email preserves canonical name/phone/language/source, deletion state and established consent. Store unverified submitted values separately, return no account-existence signal, and use the existing adoption-intake pattern as a reference.
- Provider responses with `error`, thrown network failures, and missing acceptance IDs never produce false sent state. Preserve provider idempotency across retries and persistence failures.
- Identical manual-gift requests under concurrency or receipt failure return the original IDs and produce one gift/payment/audit/delivery job. Reusing the key with a changed payload returns conflict.
- Row-cap tests at **1,001**, **5,000** and **5,001** prove complete filters, aggregates and exports or explicit overflow; never silently truncate. If using a single JSON-envelope export RPC, verify payload size/memory at the 5,000-row ceiling; otherwise use stable paging with a consistent snapshot.
- Competing staff/public approvals share the activity lock and cannot exceed capacity. Add no implicit overbooking capability.
- Effective consent and marketing policy must remain conservative. Preserve existing opt-outs; pending opt-ins from unverified intake must not replace authoritative permission. Any new consent-verification product workflow is separately scoped.

### CMS correctness

Execute the CMS companion with these results:
- Content, related authoring changes and audit commit atomically. Failure leaves previous state intact.
- Draft edits cannot change published output; publishing selects a saved reviewed revision and checks expected version. Concurrent saves return 409 without losing local text.
- All paths to published state apply the same validation.
- New internal/draft assets cannot be fetched anonymously by known URL; authorized short-lived preview works. Replays of upload finalization return the same logical asset.
- Public asset copy and database publication are a staged state machine, because Storage and Postgres do not share one transaction. The old public revision remains valid during failure.
- Historical public copies and caches require an explicit remediation inventory and approval; private copies alone do not undo prior publication.
- Parent lists retain their existing pagination. Relations, profile filters and histories become bounded; test beyond 1,000 matching profiles and long update histories.

### Frontend correctness

Execute the frontend companion with these results:
- Help first render uses serialized loader data; no hydration mismatch, zero-count flash or suppressed warning.
- Mobile adoption/donation CTAs close the drawer, remove inert/scroll locks and leave usable focus.
- Every protected form can recover from a consumed CAPTCHA token or transient script failure without losing user entries.
- Checkout selection belongs to currently published available methods. Empty/failed configuration prevents a POST. **Keep the live activation gate disabled until approved.**
- Missing public detail records return 404. Data-source outages remain distinct from absence.
- Repair the actual moderate landmark findings and verify expanded menus/dialogs as well as initial pages.
- Inventory demo-labeled public content and internal implementation copy (for example references to keeping a seven-step flow unchanged). Prepare factual replacement copy for owner review. Do not invent rescue outcomes or alter production records unilaterally.

## Performance work with measurable acceptance

Create `scripts/verify-admin-performance.mjs`, `scripts/fixtures/admin-performance.ts` and a versioned result schema under `artifacts/performance/`. Reuse existing tools rather than adding a new framework.

- [ ] Retain successful Lighthouse and axe JSON artifacts in `.github/workflows/ci.yml`; record SHA, fixture, browser/device, throttling and route.
- [ ] Test public routes in at least three comparable cold runs at mobile and desktop settings. Current scores 91/99/96/99 are desktop fixture values, not production benchmarks.
- [ ] Add public-detail/status/form-error paths to functional checks; four high-scoring landing pages do not prove journey recovery.
- [ ] For authorized staging, seed **1k/10k/50k synthetic supporters**, long donation histories and representative CMS revisions. Benchmark supporter/content lists, profile detail, save/publish, approval and exports.
- [ ] Collect at least 30 warmed requests per admin scenario plus separate cold observations; record p50/p95, payload size, query count and SQL EXPLAIN with actual execution against staging. Observe before choosing indexes or regions.
- [ ] Proposed engineering targets: warm list/detail p95 ≤750 ms; mutation commit p95 ≤1 s excluding queued delivery; first 50-item admin list payload ≤150 KiB compressed; no total-history transfer for summaries. Record a justified revision if representative baseline/environment makes a target inappropriate.
- [ ] Public acceptance target: field p75 LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1, segmented by mobile/desktop. Before enough field traffic exists, report lab proxies honestly; never relabel TBT as INP.
- [ ] Optimize measured candidates: homepage story projection, global FAQ preload, responsive image delivery, safe public read caching and database/compute proximity. Current deployment is iad1; verify database location and measured round trips before moving it.
- [ ] Cache only explicitly public projections with a defined freshness/invalidation contract. Admin, draft/preview, capability-token, donor and consent responses must not enter shared caches.
- [ ] Add privacy-safe RUM using route templates, consent policy and token-path redaction already present; never send status tokens, query strings or form data.
- [ ] Promote stable a11y/RLS checks to required gates after evidence, and confirm actual branch protection with an authorized read. Performance thresholds should be calibrated, then enforced without masking regressions.

## Staging E2E and release evidence

Use synthetic records and approved provider sandbox configuration:
- [ ] Adoption: shortlist → form/draft/photos → submitted status → staff case review → finalization; role restrictions and token privacy verified.
- [ ] Sponsorship: animal → pledge → status → staff review/payment linkage; duplicate and failure recovery.
- [ ] Volunteer: individual/group → status → staff approval/waitlist/cancellation; concurrent capacity test.
- [ ] Donation: each intended active method → pending/success/failure → duplicate/out-of-order webhook → reconciliation → one receipt → recoverable accepted email.
- [ ] CMS: draft/media → save → conflict → review/publish → public verification → restore; internal assets remain private.
- [ ] CRM: identity collision, role-denied access, manual gift retry, complete export and auditable consent change.
- [ ] Validate production migration/grant/storage parity read-only after correct access is supplied. The audit connector could not access the HKSCDA Supabase project.
- [ ] Confirm backup contents cover database plus required Storage/auth dependencies; perform an authorized disposable-target restore, verify relationships/counts/media, record recovery duration and owner-agreed RPO/RTO.
- [ ] Re-run owner UAT checklist with explicit pass/fail/skips. Owner signs factual content, payment methods, operational workflow and cutover readiness.
- [ ] Prepare release proposal with exact commit/deployment, migration/backfill order, object remediation inventory, provider gates, acceptance evidence and rollback. Approval is the final step before production mutation.
- [ ] After authorized release, verify deployed commit, public and authenticated smoke tests, migration parity, delivery recovery and monitoring. Record actual outcomes; no blanket “all complete” with open gates.

## Verification commands

Run commands individually; preserve logs and exit codes:
~~~text
bun run typecheck
bun test --isolate
bun run lint
bun run build
git diff --exit-code -- src/routeTree.gen.ts
bun run test:rls
bun run verify:brand
bun run verify:a11y
bun run verify:performance
~~~

Browser verification requires the documented local fixture and preview server; the commands alone do not supply them. Generate routeTree.gen.ts through the build, never by hand. Run focused tests per package and the full gate after integration; broaden testing only for changes, failures or unresolved concerns.

## Kickoff prompt for Codex 6 Astra

~~~text
Work in YNWAforever/hkscda. Read AGENTS.md, the 2026-09-05 current-state audit,
this master completion plan and the CRM/CMS/frontend companion plans. The audited
main was 20c168459a90c5c92093659a18b139a994451470; fetch and revalidate findings
against current main before modifying code.

Create an isolated checkout. Preserve unrelated work. First record the baseline
and reproduce the Wave 1 defects. Then implement focused, reviewed packages in
the master plan's dependency order. Use separate frontend, CMS and CRM agents
where files do not overlap; coordinate migrations and shared types centrally.

Prioritize canonical supporter identity, internal media privacy, accepted-email
handling and atomic financial/audit writes. Repair Help hydration and mobile menu
navigation in parallel. Reuse existing release, receipt and reconciliation
safeguards. Every package needs failing-before/passing-after evidence and a clear
acceptance result. Save evidence in docs/development-completion-evidence.md.

Continue through all work possible in isolated local/staging resources. Do not
claim production DB parity, provider activation, owner UAT or cutover without
evidence. Do not merge main, deploy, migrate production, modify production data or
assets, activate payments or message real people without explicit authorization.
Prepare the concrete release candidate and rollback proposal before requesting
that final approval. Report completed code, measured verification and external
gates separately.
~~~
