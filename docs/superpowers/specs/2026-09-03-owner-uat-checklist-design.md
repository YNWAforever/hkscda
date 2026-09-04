# Owner UAT Checklist for the Public Layout Integration (Phase 4)

**Date:** 2026-09-03
**Status:** Approved in conversation; awaiting written-spec review
**Master plan reference:** `docs/superpowers/plans/2026-08-27-public-layout-integration-v4.md`, Phase 4 ("owner UAT")

## Summary

Adds a structured, executable User Acceptance Testing checklist for the site owner to walk through and sign off on before cutover. This is the last startable item under Phase 4 in the master plan (RLS matrix, bilingual, a11y, performance, and backup drill are all done and in PR — [YNWAforever/hkscda#102](https://github.com/YNWAforever/hkscda/pull/102), PR #98, [YNWAforever/hkscda#103](https://github.com/YNWAforever/hkscda/pull/103), [YNWAforever/hkscda#104](https://github.com/YNWAforever/hkscda/pull/104), [YNWAforever/hkscda#105](https://github.com/YNWAforever/hkscda/pull/105); payment sandbox remains explicitly deferred pending credentials). Unlike every other Phase 4 item, this one's actual execution is inherently a human task, not something to automate — this work's deliverable is the checklist itself, not a completed sign-off.

## Current state

- `docs/public-route-parity.md` is the authoritative, code-derived inventory of all 27 public routes, each tagged with its originating work package (WP-2 through WP-6), whether it reads data via a loader or is static, whether it has distinct UI states, and its canonical-URL behavior. This checklist is built directly from that inventory rather than re-deriving route scope from scratch.
- Four routes pairs are the site's core conversion journeys, each ending in an async status/token page for tracking a submission's outcome after the fact: adoption application (`/adoption/apply` → `/adoption/status/$token`), sponsorship pledge (`/sponsors/pledge` → `/sponsors/status/$token`), volunteer signup (`/volunteer`, `/volunteer/group` → `/volunteer/status/$token`), and donation (`/donate`, no separate status page since Stripe/PayPal/COD handle their own confirmation flow). The master plan's WP-7 explicitly names "four journeys E2E" as part of its own done-criteria, and these four match that framing.
- This session already produced real, verified findings that belong in this checklist rather than being re-discovered by the owner during UAT: the a11y pass ([YNWAforever/hkscda#103](https://github.com/YNWAforever/hkscda/pull/103)) found and left unfixed two `moderate`-impact issues (a landmark gap on 6 form/status routes — one deliberately, per `PublicFormFrame.tsx`'s own design comment — and on 2 synthetic recovery routes); the performance pass ([YNWAforever/hkscda#104](https://github.com/YNWAforever/hkscda/pull/104)) found real, unfixed performance issues (no cache-control headers, unoptimized homepage images, render-blocking resources, oversized JS bundles) with `/` scoring lowest (71-91 depending on environment) of the 4 routes measured. Neither is a UAT blocker by itself, but the owner should be looking with these already-known facts in hand, not rediscovering them fresh.
- Payment sandbox is explicitly out of scope for this UAT pass, per its own prior deferral — the donation journey's checklist items are scoped to what can be verified today (form validation, non-payment-provider-specific UI/copy/navigation), with the actual payment-provider integration flagged as blocked on that separate, still-pending item.

## Approved decisions

- **Format: a single markdown checklist document**, `docs/owner-uat-checklist.md`, with one section per journey/route group, each item phrased as a concrete action + an explicit expected result + a blank pass/fail line for the owner to fill in. Not a spreadsheet, not a project-management-tool import — a plain document the owner can read and annotate directly, matching this repo's existing `docs/`-based documentation convention.
- **Scope: the 4 core conversion journeys get the most detailed treatment** (multi-step walkthroughs covering desktop + mobile, both `zh-HK` and `en` where the route supports it, and explicit checks against the known a11y/performance findings above where relevant to that specific route). **The remaining 23 content/informational routes get a lighter, single-pass-per-route treatment** (does it render, is the content accurate/non-placeholder, does navigation work, does it look right on mobile) grouped by the work package that built them (WP-2 home, WP-3 animal listings, WP-6 content/about/reports), rather than 23 individually detailed sections — proportionate depth to risk, not uniform depth.
- **Explicitly excludes actual payment-provider transactions** — the donation journey's checklist covers everything short of completing a real Stripe/PayPal/COD charge, with a clear note that full payment-flow UAT is blocked on the separately-deferred payment sandbox item.
- **Known a11y/performance findings are pre-loaded into the checklist as context, not hidden** — each relevant item references the specific finding (e.g., "known: this route's form content sits outside the `<main>` landmark by design — see PR #103") so the owner isn't left wondering whether something they notice is a new bug or an already-triaged, accepted issue.
- **This work's own deliverable is the checklist, not a completed sign-off** — there is no "Testing" section proving the checklist was executed successfully, because execution is out of scope by design. The equivalent verification for this piece of work is a self-review of the checklist's own completeness and accuracy against the real route inventory and real prior findings, not a walkthrough.

## File Structure

**Create:**
- `docs/owner-uat-checklist.md` — the checklist itself.

## Testing

Since this document's own content IS the deliverable (there's no code to run), "testing" means verifying the checklist itself is accurate and complete, not executing it:
- Every route named in the checklist actually exists in `docs/public-route-parity.md`'s inventory — no invented or missing routes.
- Every "known finding" reference in the checklist accurately reflects what's actually in the referenced PR (re-read the a11y/performance PRs' actual final state, don't rely on this session's own summary of them from memory).
- The four core journeys' multi-step walkthroughs are internally consistent (e.g., a step that says "submit the form" is followed by a step checking the actual resulting status-page behavior, not a dangling reference to a step that was never written).

## Out of scope

- Actually executing the checklist and recording pass/fail results — that's the owner's own task, outside this session.
- The payment sandbox item itself (still separately deferred) — the donation journey's checklist notes this boundary but doesn't attempt to close it.
- Building any new tooling, tracking system, or automation around UAT execution (e.g., a UI for checking off items) — this is a plain document, nothing more, matching the approved format decision.
