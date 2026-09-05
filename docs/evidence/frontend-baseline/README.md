# Wave 1 frontend baseline

Scope: read-only reproduction of the Help hydration mismatch and mobile drawer CTA navigation defects on branch `codex/completion-20260905`, based on audited main `20c168459a90c5c92093659a18b139a994451470`.

The frontend companion plan named by the master plan (`2026-09-05-hkscda-frontend-completion.md`) was not supplied as of this baseline. This folder contains reproduction tooling and evidence only; it does not authorize or contain production-code fixes.

## Source findings to verify in a browser

- `src/routes/help.tsx`: the route loader primes `publicFaqsQueryOptions()`, but `HelpPage` does not read `Route.useLoaderData()` and renders `useQuery(...).data ?? []`. The audited live symptom was React hydration error `#418` and a zero-count first-render mismatch.
- `src/components/site/Header.tsx`: ordinary drawer links call `setDrawerOpen(false)`. The footer CTAs for `/animals/cat` and `/donate` do not, so the mounted dialog retains the body scroll lock and background `inert` attributes after client navigation.

## Safe local workflow

Use only the repository's deterministic local fixture. It returns fixed synthetic data and does not connect to or mutate production.

1. Build and preview with all four fixture variables set on both processes:

   - `VITE_SUPABASE_URL=http://127.0.0.1:54329`
   - `VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key`
   - `SUPABASE_URL=http://127.0.0.1:54329`
   - `SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key`

2. Start `node scripts/ci/supabase-fixture.mjs` and `bun run preview` in separate background processes.
3. After both ports answer, run:

   `node docs/evidence/frontend-baseline/reproduce-wave1.mjs`

The probe performs GET navigation only. It does not submit forms. It saves JSON and screenshots under `docs/evidence/frontend-baseline/artifacts/`.

## Acceptance evidence expected after a future fix

- Help: HTTP 200, no console or page hydration error, and the serialized FAQ count is stable through hydration.
- Each footer CTA: destination pathname reached; `#mobile-drawer` absent; `document.body.style.overflow` restored; zero background elements remain `inert`; focus is usable on the destination.
