# Owner UAT Checklist for the Public Layout Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `docs/owner-uat-checklist.md`, a structured, accurate UAT checklist the site owner can execute and sign off on before cutover.

**Architecture:** A single markdown document. The 4 core conversion journeys (8 routes) get detailed, multi-step walkthroughs; the remaining 19 routes get a lighter, grouped-by-work-package pass. Known a11y/performance findings from already-merged PRs are cited inline where relevant, not hidden.

**Tech Stack:** Markdown only — no code.

---

## Verified current state (do not re-derive)

- **Correction to the approved spec's route count**: the spec's text says "the remaining 23 content/informational routes," but the actual arithmetic is **27 total routes − 8 routes across the 4 core journeys = 19**, not 23. The spec's underlying route SET and journey scope are correct — only the printed count was wrong. This plan uses the correct count (19); no spec update is needed since the spec's substantive scope doesn't depend on the number itself, only this plan's own content needs to get it right.
- **Full 27-route inventory** (from `docs/public-route-parity.md`, re-read at plan-writing time): `/` (WP-2); `/animals/cat`, `/animals/dog`, `/animals/cat/$id`, `/animals/dog/$id` (WP-3); `/adoption/instructions`, `/adoption/apply`, `/adoption/status/$token` (WP-4); `/sponsors`, `/sponsors/$id`, `/sponsors/pledge`, `/sponsors/status/$token`, `/donate`, `/volunteer`, `/volunteer/group`, `/volunteer/status/$token` (WP-5); `/stories`, `/stories/$slug`, `/knowledge`, `/help`, `/report/adoption`, `/report/audit`, `/about`, `/about/cccp`, `/about/tnr`, `/about/team`, `/about/privacy` (WP-6).
- **The 4 core journeys' 8 routes**: adoption (`/adoption/apply` → `/adoption/status/$token`), sponsorship (`/sponsors/pledge` → `/sponsors/status/$token`), volunteer (`/volunteer`, `/volunteer/group` → `/volunteer/status/$token`), donation (`/donate`, no separate status page).
- **The remaining 19 routes** (27 − 8): `/`, `/animals/cat`, `/animals/dog`, `/animals/cat/$id`, `/animals/dog/$id`, `/adoption/instructions`, `/sponsors`, `/sponsors/$id`, `/stories`, `/stories/$slug`, `/knowledge`, `/help`, `/report/adoption`, `/report/audit`, `/about`, `/about/cccp`, `/about/tnr`, `/about/team`, `/about/privacy`.
- **Known a11y finding** (re-read directly from `docs/superpowers/specs/2026-09-03-public-a11y-verification-design.md` on the merged-pending `feat/public-a11y-verification` branch, PR [YNWAforever/hkscda#103](https://github.com/YNWAforever/hkscda/pull/103), at plan-writing time): `region` (moderate) on `/adoption/apply`, `/sponsors/pledge`, `/volunteer`, and the three status/token routes — deliberate per `PublicFormFrame.tsx`'s own design comment. `landmark-one-main` (moderate) on synthetic recovery states, also reachable by real users hitting an invalid dynamic route (e.g. `/stories/<bad-id>`).
- **Known performance finding** (re-read directly from `docs/superpowers/specs/2026-09-03-public-performance-verification-design.md` on the merged-pending `feat/public-performance-verification` branch, PR [YNWAforever/hkscda#104](https://github.com/YNWAforever/hkscda/pull/104)): `/` scored 71-72, `/animals/cat` 85, `/adoption/apply` 89, `/donate` 85-86 on Lighthouse performance (desktop). Root causes: no cache-control headers, unoptimized homepage hero imagery, render-blocking resources, oversized JS bundles (Stripe/pdf-lib) shipped regardless of page need. None fixed yet — explicit follow-up work, not a UAT blocker.

---

## File Structure

**Create:**
- `docs/owner-uat-checklist.md`

---

### Task 1: Write the owner UAT checklist

**Files:**
- Create: `docs/owner-uat-checklist.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Owner UAT Checklist — Public Layout Integration

Walk through this checklist before cutover. Each item has a concrete action, what
to expect, and a blank line for your own pass/fail note. Items marked **(known)**
reference an issue already found and deliberately deferred earlier in this
integration — if you notice it, it's not a surprise, and you don't need to file it
again; the reference tells you where it's already tracked.

Test on both **desktop** and **mobile** (a phone, or your browser's device
toolbar) unless a step says otherwise. Where a page has a language toggle, check
it in both **zh-HK** and **en**.

---

## Part 1: Core journeys (detailed)

### Journey 1 — Adoption application

Routes: `/adoption/apply` -> `/adoption/status/<token>`

1. Go to `/adoption/apply`. Expected: the form loads, headed by one clear `<h1>`,
   with the site header/footer around it. **(known)** the trust-cue text near the
   form sits outside the page's main content landmark by design — a screen-reader
   quirk, not a visual one; see PR #103. Pass/fail: ___
2. Try submitting the form with required fields empty. Expected: clear validation
   messages, in the language you're currently viewing in, no silent failure. Pass/fail: ___
3. Fill in the form with realistic (but fake/test) applicant details and submit.
   Expected: a confirmation state appears, and you're given (or redirected to) a
   status link/token for tracking this application later. Pass/fail: ___
4. Open the status link/token you just got, in a fresh/incognito browser tab (to
   confirm it doesn't require being logged in). Expected: it shows your just-submitted
   application's real status, not a generic page. Pass/fail: ___
5. Visit `/adoption/status/this-is-not-a-real-token`. Expected: a clear "not found"
   message in the current language, no raw error, no stack trace, no leaked internal
   detail. Pass/fail: ___
6. Check `/adoption/instructions` (the page most applicants read right before this
   one) — does its guidance still match what the actual form on `/adoption/apply`
   asks for? Pass/fail: ___

### Journey 2 — Sponsorship pledge

Routes: `/sponsors/pledge` -> `/sponsors/status/<token>`

1. Go to `/sponsors` first, and click into a specific animal's sponsorship page
   (`/sponsors/<id>`), then use its own "sponsor this animal" entry point into the
   pledge flow, rather than typing `/sponsors/pledge` directly — this confirms the
   real user path, not just the isolated form. Expected: the pledge form correctly
   carries over which animal you were looking at. Pass/fail: ___
2. Try submitting the pledge form with required fields empty. Expected: clear
   validation messages, current language. Pass/fail: ___
3. Fill in realistic (fake/test) pledge details and submit. Expected: a confirmation
   state and a status link/token, same pattern as adoption. **(known)** the trust-cue
   text on this page has the same outside-`<main>` quirk as the adoption form; see
   PR #103. Pass/fail: ___
4. Open the resulting status link in a fresh tab. Expected: shows the real pledge
   status. Pass/fail: ___
5. Visit `/sponsors/status/this-is-not-a-real-token`. Expected: same clean
   "not found" behavior as the adoption journey's equivalent. Pass/fail: ___

### Journey 3 — Volunteer signup

Routes: `/volunteer`, `/volunteer/group` -> `/volunteer/status/<token>`

1. Go to `/volunteer`. Expected: individual volunteer signup form loads correctly,
   one clear `<h1>`. **(known)** same outside-`<main>` trust-cue quirk as the other
   two forms; PR #103. Pass/fail: ___
2. Separately, go to `/volunteer/group` (for group/organized volunteering
   enquiries — a distinct form from the individual one above). Confirm it's clearly
   a different, appropriate form, not a duplicate of `/volunteer`. Pass/fail: ___
3. Submit the individual volunteer form (Step 1's) with realistic fake details.
   Expected: confirmation + status link/token. Pass/fail: ___
4. Open the resulting status link in a fresh tab, and separately check
   `/volunteer/status/this-is-not-a-real-token` for the same clean "not found"
   behavior as the other two journeys. Pass/fail: ___

### Journey 4 — Donation

Route: `/donate`

**Payment sandbox is still a separately deferred item** — do not attempt to
complete a real Stripe/PayPal/COD charge as part of this checklist. This section
covers everything short of that.

1. Go to `/donate`. Expected: the donation form/page loads, with the currently
   correct, real (non-placeholder) suggested amounts and any impact copy. **(known)**
   this route currently scores lowest on Lighthouse performance of the routes
   measured (71-72 vs. 85-91 elsewhere) — the page should still load and be usable,
   just possibly slower to feel "settled" on a slow connection; see PR #104. Pass/fail: ___
2. Fill in the non-payment parts of the form (amount, donor details, any
   recurring/one-time toggle) with realistic fake details. Expected: validation
   behaves correctly, and the flow gets you up to (but not through) an actual
   payment-provider handoff without errors. Pass/fail: ___
3. Check that whichever payment methods are currently exposed on this page (and
   only those methods) match what's actually approved for production use right now
   — if you're not sure what should be live yet, that's a genuine open question to
   raise before cutover, not something to guess at during this pass. Pass/fail: ___

---

## Part 2: Remaining routes (lighter pass)

For each route below: does it render without error, is every piece of visible
content accurate and non-placeholder (no lorem ipsum, no obviously-fake numbers,
no leftover `hkscdagpt` demo content), does the page look correct on mobile, and
does clicking through from the main navigation actually land here?

### Home and animal listings (WP-2 / WP-3)

- `/` — the homepage. **(known)** currently the lowest-scoring route on Lighthouse
  performance; see PR #104. Pass/fail: ___
- `/animals/cat` — cat listing. Pass/fail: ___
- `/animals/dog` — dog listing. Pass/fail: ___
- `/animals/cat/<id>` — click into a real cat from the listing above, don't guess
  an ID. Pass/fail: ___
- `/animals/dog/<id>` — same, from the dog listing. Pass/fail: ___

### Adoption instructions (WP-4 remainder)

- `/adoption/instructions` — already spot-checked against the actual apply form in
  Journey 1, Step 6 above; here just confirm it renders correctly and reads well on
  its own. Pass/fail: ___

### Sponsors listing (WP-5 remainder)

- `/sponsors` — the sponsorship listing page. Pass/fail: ___
- `/sponsors/<id>` — already visited via Journey 2, Step 1; confirm it also reads
  correctly as a standalone page (not just as an entry point into the pledge flow). Pass/fail: ___

### Content and about pages (WP-6)

- `/stories` — story listing. Pass/fail: ___
- `/stories/<slug>` — click into a real story from the listing. Pass/fail: ___
- `/knowledge` — knowledge base listing. Pass/fail: ___
- `/help` — FAQ/help page; try the FAQ search box specifically. Pass/fail: ___
- `/report/adoption` — public adoption stats report. Pass/fail: ___
- `/report/audit` — public audit/transparency report. Pass/fail: ___
- `/about` — main about page. Pass/fail: ___
- `/about/cccp` — CCCP program page. Pass/fail: ___
- `/about/tnr` — TNR program page. Pass/fail: ___
- `/about/team` — team page. Pass/fail: ___
- `/about/privacy` — privacy policy. Pass/fail: ___

---

## Sign-off

Once every item above has a pass/fail note (or an explicit, written reason a
particular item was skipped), this checklist is complete. Any "fail" should be
triaged before cutover — file it the same way any other bug would be filed, and
decide together whether it's a release blocker or acceptable to fix after cutover.

Checklist completed by: ___________________  Date: ___________________
```

- [ ] **Step 2: Self-review the checklist against the real route inventory**

Re-open `docs/public-route-parity.md` and confirm every one of the 27 routes listed there appears exactly once somewhere in the checklist above (either in a Part 1 journey or in Part 2's lighter pass) — no route invented, none missing, none duplicated. Count: 8 routes across the 4 Part 1 journeys + 19 routes in Part 2 = 27. If the count doesn't match, find the discrepancy before proceeding — this is the single most important correctness property of this document.

- [ ] **Step 3: Self-review the "(known)" references against the actual current PRs**

For each `(known)` reference in the checklist, open the actual PR it cites (PR #103 for a11y, PR #104 for performance) and confirm the referenced finding is still accurately described there — re-read the real, current state of those PRs rather than trusting this plan's own "Verified current state" section from memory, in case either PR changed after this plan was written (e.g., a review comment led to a fix that changes which routes are actually affected).

- [ ] **Step 4: Commit**

```bash
git add docs/owner-uat-checklist.md
git commit -m "docs: add owner UAT checklist for the public layout integration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
