# Frontend Wave 1 evidence

Baseline and branch: `20c168459a90c5c92093659a18b139a994451470`, `codex/completion-20260905`.

Fixture: `scripts/ci/supabase-fixture.mjs` on `127.0.0.1:54329`, using only placeholder credentials and two fixed nonempty FAQ records. Preview: production build on `127.0.0.1:4173`. Browser operations were navigation and interaction only; no forms were submitted.

## Red evidence

`node scripts/verify-public-frontend-regressions.mjs` against the pre-fix production bundle failed with:

- React error 418 on direct `/help` at 390x844 and 1440x900 with two serialized FAQs.
- Both mobile footer CTAs reached the intended pathname but left the dialog mounted, destination content inert and body overflow locked.

Machine-readable evidence: `browser-red-nonempty/frontend-wave1.json`.

## Green evidence

- `bun test src/components/site/Header.test.tsx src/routes/help.test.tsx`: 13 pass, 0 fail.
- Targeted ESLint over the changed frontend, fixture and verifier files: exit 0.
- `bunx tsc --noEmit`: exit 0 before the final review-only helper move; the coordinator owns the integrated typecheck rerun.
- `bun run build` with fixture variables: exit 0; log in `build-green.log`.
- Browser regression after rebuilding: `Verified 4 frontend Wave 1 scenarios`, exit 0.
  - Help returned 200 at both widths, retained `2 條已審批答案`, and emitted no console hydration or page error.
  - Adoption and donation CTAs reached `/animals/cat` and `/donate`; dialog absent, main not inert, body overflow restored, focus on the menu trigger.

Machine-readable evidence and screenshots: `browser-green/`.

The fixture and preview processes were stopped after verification; ports 4173 and 54329 were released. No production service, data, payment method, message, deployment or repository remote was changed.
