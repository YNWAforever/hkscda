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
