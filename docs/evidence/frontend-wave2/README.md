# Frontend Wave 2 evidence

Baseline for this wave: `31c474c` (Wave 1 frontend commit) on `codex/completion-20260905`. All browser work used the local fixture at `127.0.0.1:54329`, the production preview at `127.0.0.1:4173`, placeholder Supabase keys, Cloudflare's documented test site key, and intercepted donation responses. No real form, provider, production host, or remote service was mutated.

## Red evidence

The evidence-only source contract was run directly against committed Wave 1 (`BASELINE_REF=31c474c`) without replacing worktree files: 5 passed and 10 failed. Against the current source it passed 15/15. The failures cover reset/remount behavior in all five protected form callers, the Turnstile recovery action, current-config donation method validation, and true-404 separation in all three detail loaders. Logs and the reproducible contract are retained under `repro/`. The fresh post-change axe run in `a11y-green/run-context.json` caught a new serious `aria-prohibited-attr` finding at `div[aria-label="人機驗證"]` on `/volunteer` and `/donate`; that run is retained as the red accessibility artifact.

## Green evidence

- `bun test ...` over the focused widget, form, donation, loader, frame, and root tests: 31 pass, 0 fail, 107 assertions.
- `bunx tsc --noEmit`: exited 0 after nullable detail-loader narrowing in the isolated frontend pass. The final concurrent rerun reported only unrelated in-progress CRM/donation-delivery/volunteer test fixture typing errors; it reported no frontend-owned error.
- Targeted ESLint: no errors; existing Fast Refresh warnings remain in route/component files that already export helpers.
- `bun run build` with fixture-only environment: exit 0; `frontend-wave2-build.log`.
- `node scripts/verify-public-frontend-wave2.mjs`: six scenarios, no failures.
  - Valid cat returned 200.
  - Malformed cat, unknown dog, removed cat, and malformed sponsor returned genuine HTTP 404 with branded public states and no page errors.
  - The donation browser scenario exercised recovery end to end: Turnstile script load failed once, recovered without reload, submitted token A once, disabled retry until remount, then submitted token B. Both requests used the sole published PayPal method. The other four protected callers are covered by the retained 15/15 source contract and focused component tests; they were not submitted in a browser.
- `node scripts/verify-public-donation-empty.mjs`: disabled submit, no provider labels, zero donation POSTs.
- `MODE=a11y bun run verify:a11y` after adding the Turnstile group role: all 26 public routes at 1440x900, failures empty. The shared breadcrumb is a labelled nav, the trust cue is a labelled aside, and the root 404 state is inside one main landmark.

Machine-readable evidence is in `browser/frontend-wave2.json`, `browser/donation-empty.json`, and `a11y-final/run-context.json`. Screenshots and raw axe JSON are retained beside those files. The fixture supports PayPal-only/empty payment modes, a removed animal, nonempty FAQs, and the empty saved-snapshot RPC envelope `{total:0,rows:[]}`.

The fixture and preview processes were stopped and ports 4173/54329 were released.
