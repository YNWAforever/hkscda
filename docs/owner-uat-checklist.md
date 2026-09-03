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
   application's real status, not a generic page. **(known)** this status page
   carries the same outside-`<main>` trust-cue quirk as the apply form; see PR #103. Pass/fail: ___
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
   status. **(known)** this status page carries the same outside-`<main>`
   trust-cue quirk as the pledge form; see PR #103. Pass/fail: ___
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
3. Try submitting the individual volunteer form (`/volunteer`) with required fields
   empty. Expected: clear validation messages, in the current language, no silent
   failure. Pass/fail: ___
4. Submit the individual volunteer form (Step 1's) with realistic fake details.
   Expected: confirmation + status link/token. Pass/fail: ___
5. Open the resulting status link in a fresh tab. Expected: shows the real
   volunteer registration status. **(known)** this status page carries the same
   outside-`<main>` trust-cue quirk as the volunteer form; see PR #103. Pass/fail: ___
6. Separately, visit `/volunteer/status/this-is-not-a-real-token`. Expected: the
   same clean "not found" behavior as the other two journeys. Pass/fail: ___

### Journey 4 — Donation

Route: `/donate`

**Payment sandbox is still a separately deferred item** — do not attempt to
complete a real Stripe/PayPal/COD charge as part of this checklist. This section
covers everything short of that.

1. Go to `/donate`. Expected: the donation form/page loads, with the currently
   correct, real (non-placeholder) suggested amounts and any impact copy. **(known)**
   this is one of the 4 public routes with an automated Lighthouse performance
   floor; the last baseline scan measured it at 85-86 — below the ideal 90+
   benchmark, though not the lowest of the four (that's the homepage, `/`, at
   71-72, notably further behind, for the same underlying reasons: no
   cache-control headers, unoptimized images, render-blocking resources, oversized
   JS). The page should still load and be usable, just possibly slower to feel
   "settled" on a slow connection; see PR #104. Pass/fail: ___
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
  performance (71-72 in the last baseline scan, versus 85-89 on the other three
  sampled routes); see PR #104. Pass/fail: ___
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
