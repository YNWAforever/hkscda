# HKSCDA Frontend Completion Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task by task. Checkboxes track implementation, not audit completion.

**Goal:** Repair demonstrated public frontend failures and close verification gaps while preserving the approved HKSCDA interface.

**Architecture:** Keep route data authoritative during hydration; centralize verification recovery in the shared widget; retain published payment configuration as the selection boundary. Make focused changes within existing routes/components without replacing the application shell.

**Tech stack:** React 19, TanStack Start/Router/Query, TypeScript, Bun, Tailwind, Playwright, axe, Lighthouse.

## Global constraints and evidence

- Source repository: `C:\Users\laich\Documents\HKCSDA\HKCSDA\hkscda`; audited main commit `20c168459a90c5c92093659a18b139a994451470`. Reconfirm checkout and read its AGENTS.md before execution. File paths below are repository-relative.
- This document is a plan; no source changes have been made. Preserve unrelated work. Keep zh-HK primary, approved design tokens, keyboard behavior and reduced-motion support.
- No production mutations, provider activation, real form submissions, credential changes, migration, merge or deployment are authorized by this plan. Use fixtures and intercepted requests.
- Audit workspace `artifacts/live/results.json` contains repeatable `/help` React #418 errors at 1440px and 390px. `artifacts/live/reproductions.json` confirms the mobile donation CTA leaves drawer/inert/scroll lock active and malformed animal/sponsor URLs return 200 with normal canonicals.
- `artifacts/help-hydration-probe.cjs` provides no-network cache evidence using installed React Query: server count 2, fresh browser cache count 0, loader initial data count 2.

## Task 1 — P1: Repair help-page hydration

**Files:** Modify `src/routes/help.tsx:19,163,177`; extend `src/routes/help.test.tsx`; create `scripts/verify-public-frontend-regressions.mjs` for browser regressions shared with later tasks. Review `src/router.tsx:6`, `src/lib/help/usePublicFaqs.ts`, `src/components/site/help/HelpWidget.tsx:15`.

**Cause:** The loader fills only the server QueryClient. HelpPage ignores serialized loader data and reads a new browser cache, initially rendering zero FAQs. Router has no query hydration bridge. Both sides initialize language to zh-HK, so locale is not the cause.

- [ ] Add a failing regression with nonempty FAQ fixtures, separate server/browser clients and the actual route data boundary. Existing tests render only children with supplied FAQ props.
- [ ] Read `Route.useLoaderData()` in HelpPage. Render that snapshot directly, or supply it as `useQuery` initialData and fallback to retain refresh behavior. Preserve the shared query key and five-minute freshness policy.
- [ ] Avoid hydration-warning suppression, client-only rendering and broad dependency additions.
- [ ] Browser-test direct `/help` loads at 390px and 1440px: no #418/pageerror, identical initial/hydrated counts, no zero-count flash. Also cover empty FAQs, slow client fetch, SPA arrival, language switch, and help-widget use before/after visiting the page.
- [ ] Run focused help tests and the new browser regression; make one reviewable commit.

## Task 2 — P2: Complete mobile menu navigation

**Files:** Modify `src/components/site/Header.tsx:329,332`; extend `src/components/site/Header.test.tsx` and `scripts/verify-public-frontend-regressions.mjs`.

**Cause:** Drawer footer adoption/donation links lack close handlers. Header persists across navigation, retaining the modal and `body` lock at `Header.tsx:113`.

- [ ] Add a failing browser test for each footer CTA below 1120px; the audit already reproduced the donation case live.
- [ ] Close the drawer on both actions; evaluate close-on-committed-pathname to cover Back/other navigation while preserving existing focus restoration.
- [ ] Assert target URL, absent dialog, removed main-content inert attribute, restored body overflow, and usable focus. Verify Escape, normal submenu navigation, and crossing the desktop breakpoint.
- [ ] Run header tests and browser regressions; commit independently.

## Task 3 — P1 when enabled: Recover verification and form retries

**Files:** Modify `src/components/site/TurnstileWidget.tsx:25-45,65-103`; create `src/components/site/TurnstileWidget.test.tsx`; update `src/routes/donate.tsx:412`, `src/components/site/adoption/ApplicationWizard.tsx:457`, `src/components/site/sponsorship/PledgeWizard.tsx:213` and their existing `.test.tsx` files. Review/integrate remaining callers `src/components/site/volunteer/GroupEnquiryForm.tsx` and `src/routes/volunteer.tsx`.

**Contract:** Add optional `resetKey?: number` to widget props. A key change clears parent verification through `onExpire`, resets/remounts the widget and requests a fresh token. Keep `onVerify(token)` unchanged. Provide an accessible script-load failure/retry state.

- [ ] Write failing tests for token A consumed before downstream failure, and a rejected script load followed by successful retry.
- [ ] Clear failed cached script promise and failed script element; retry without duplicate scripts/widgets.
- [ ] In callers, clear the used token after attempted submission and advance resetKey on recoverable failure. Preserve entries and drafts. Apply consistently to all five callers.
- [ ] Test expiration, language changes, unmount/remount and submit errors. A corrected retry must send token B, never reuse A. Script recovery must work without a page reload.
- [ ] Use fake verification/provider responses. Keep server verification enforced; it precedes donation validation at `src/routes/api/donations.ts:38`.
- [ ] Run focused widget/form tests and browser fake-provider journeys; commit.

Cloudflare documents single-use tokens and replay rejection: [server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Task 4 — P2 before activation: Respect available payment methods

**Files:** Modify `src/routes/donate.tsx:297,309,658,744`; extend `src/routes/donate.test.tsx`. Review `src/lib/paymentPublicConfig/public.server.ts` and `types.ts`; coordinate server availability enforcement with the backend plan.

- [ ] Reproduce checkout enabled with PayPal-only configuration: current hidden default Stripe is submitted despite no selected visible option. Also cover an empty configuration/read failure.
- [ ] Initialize and reconcile method from published options; require a currently available selection. When none exist, provide recovery and disable POST. Do not change the activation flag.
- [ ] Verify PayPal-only submits PayPal, hidden Stripe is never selected, removal of a selected method reconciles, zero methods generates no POST, and explicit user choices work in both languages.
- [ ] Run donation tests and intercepted browser journeys; commit separately from widget recovery.

## Task 5 — P2: Return genuine missing-animal statuses

**Files:** Modify `src/routes/animals/cat_.$id.tsx:12,46`, `src/routes/animals/dog_.$id.tsx`, `src/routes/sponsors_.$id.tsx:12,46`; extend `src/routes/seoSurfaces.test.ts`; create `src/routes/animals/publicDetailRoutes.test.ts`; extend browser regressions. Reference `src/lib/animals/publicAnimal.functions.ts:17` and `src/routes/stories/$slug.tsx:31`.

- [ ] Add regressions for malformed ID, unknown UUID and removed animal. Live malformed cat/sponsor requests currently return 200.
- [ ] Throw router `notFound()` for genuine absence and render branded recovery. Preserve a separate backend-unavailable state; align missing-page canonical/social behavior.
- [ ] Verify missing routes return HTTP 404, valid public details return 200, and data failures are distinguished from absence. Verify no private animal information appears.
- [ ] Run route/SEO tests and browser checks; commit.

## Task 6 — Close accessibility and measurement gaps

**Files:** Modify `scripts/verify-public-brand.mjs:216,509` for evidence capture/coverage; inspect `src/components/site/PublicPageFrame.tsx`, `PublicDetailFrame.tsx`, `PublicStateShell.tsx`, `Header.tsx`, `src/routes/__root.tsx`, `src/styles/public.css` only when recorded axe selectors identify them. Add focused rendering/browser tests for actual fixes.

- [ ] Persist axe JSON with rule IDs, impact, route and target selectors. Latest CI reports eight moderate route findings; obtain the exact violations before choosing source changes. Do not invent rule IDs or waive them based only on severity.
- [ ] Fix identified shared markup or contrast issues in their owning components; test relevant expanded menus, dialog states and 390px/1440px layouts. Require zero unexplained moderate-or-higher findings in agreed public scope, with explicit documented exceptions if necessary.
- [ ] Preserve Lighthouse JSON, route, device/throttling settings and fixture identity. Current parent-verified CI fixture scores are home 91, cats 99, adoption 96, donate 99; the existing floor is 50. These are not production RUM/Core Web Vitals.
- [ ] Collect comparable repeated baseline runs and define explicit LCP/CLS/TBT/JS-transfer regression budgets before tightening the floor. Include production read-only observations separately from fixtures.
- [ ] Measure global FAQ preload, homepage full-story projection and responsive image candidates before optimizing. Keep self-hosted subset fonts, CSS-reserved image geometry and high-priority homepage photo.

## Completion gate

- [ ] Run focused checks after each task, then repository-required `bunx tsc --noEmit`, `bun test`, `bun run lint`, `bun run build`, and public brand/a11y/performance verification against the production build with safe fixtures.
- [ ] Record exact commit, commands, fixture/environment, browser artifacts and remaining external gates. Distinguish baseline failures from regressions. Check clean scoped diff and request review; release remains separately authorized.
