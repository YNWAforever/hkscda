# Website corrections implementation record

Approved scope: adoption form validation and draft recovery; donation contacts and consent; organisation name and staff distribution; public CCCP retirement; reviewed CMS fee changes. Source: Website Edit Suggestion.docx and the approved conversation plan dated 2026-09-20.

## Implementation checklist

- [x] Tighten new adoption submissions while retaining historical record compatibility.
- [x] Change donation contact and new-request WhatsApp consent; preserve general enquiries.
- [x] Correct the shared English name and add staff distribution separately from the board.
- [x] Retire public CCCP content and editor controls with a permanent TNR redirect.
- [x] Prepare exact fee CMS values without publishing production changes.
- [x] Run focused and full checks plus local desktop/mobile verification.

## Agreed decisions

Home-environment questions alone become required except indoor-space notes. Household agreement accepts Yes or No for review. Mongrel adoption is HK$500 all inclusive; the vaccine reference price never adds to it. Former Email contact preferences, morning cat visits and free-text household answers are cleared when restoring drafts, preserving unrelated inputs. Stored historical records remain readable.

## Delivery boundaries

Implementation is isolated from existing local edits. CMS publication, production migrations, deployment and merge are not part of this implementation. Terms, photographs, statistics, Instagram/social previews and wedding submissions are deferred. See the companion CMS checklist for publication preparation.

## Verification evidence

- Original focused baseline: 105 passed, 0 failed.
- Final full suite: `bun test --isolate` — 2399 passed, 78 skipped, 1 failed across 420 files. The sole failure is the unchanged local `sponsorshipAssignment.rls.test.ts` fixture: `Unsupported public consent-intent source table`; independently reproduced on the original checkout before these changes. No local database migrations were applied.
- TypeScript: `bun run typecheck` passed.
- ESLint: `bun run lint` passed with 0 errors and 46 warnings.
- Build: production build passed against the local read-only fixture with placeholder credentials.
- Focused browser checks: 390px mobile and 1440px desktop passed donation English toggle/contact/consent, staff counts, TNR-only copy, staged CMS fee wording in both languages, 301 redirect, and adoption draft/contact/home/household/visit flow. Both viewports had no horizontal overflow or browser page errors.
- Draft journey verified that old Email/free-text/morning selections are cleared, other contact data persists, unanswered safety modifications blocks progress, explicit No and household No can proceed, and cat morning slots are absent. No application was submitted.
- Visual inspection: mobile staff and adoption screenshots plus desktop fee-table screenshot inspected; new content wraps without clipping. Screenshots and JSON results are retained locally under `artifacts/brand-redesign/website-corrections-focused/`.
- Read-only independent review approved after fixing the remaining Email UI option and the acronym-free seeded CCCP description.
- Dev-server limitation: Vite's virtual client-entry import failed locally; all functional browser verification uses the hydrating production-build preview instead.
- Broad public-brand sweep: 26 routes across five viewports completed with one navigation-context timing failure on the homepage at 1024px. Repeating that exact viewport/homepage checker, including its reflow/reduced-motion checks, passed. Original sweep evidence and the passing focused retry are retained under `artifacts/brand-redesign/website-corrections/` and `website-corrections-home-retry/`; the initial full sweep is not reported as clean.
- The exact household question is covered by an additional rendered bilingual regression test.

## Draft PR verification on 2026-09-22

The correction commit was rebased onto origin/main at b2ce65c, excluding the already-merged story branch commits. Fresh verification after the rebase: typecheck passed; build passed; lint passed with 0 errors and 50 warnings; full isolated suite reported 2424 passed, 78 skipped, and the same single local sponsorship-assignment RLS fixture failure recorded above. Generated route tree and diff whitespace checks are clean. Browser evidence above is from the pre-rebase correction implementation; the browser sweep was not repeated after this rebase. Production CMS publication, merge and deployment remain outside this draft PR action.
