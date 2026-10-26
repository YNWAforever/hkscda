# Run, test and deploy

## Toolchain

Run commands from the repository root with Node 24 and Bun pinned by
`.bun-version` (currently 1.3.14). Linux/macOS examples use a POSIX shell.
The full suite also invokes Python (`python`) and Google Chrome (Playwright's
`chrome` channel) in subprocess tests; the public browser verifier uses Playwright
Chromium. Installing Chromium alone does not satisfy those full-suite tests.
Docker and Supabase CLI are
needed only for real database acceptance.

```sh
node --version
bun --version
bun install --frozen-lockfile
bunx playwright install chrome
```

Keep `bun.lock` unchanged unless intentionally changing dependencies. `bunfig.toml`
holds new package releases back for a day; do not bypass that guard to fix an
installation. Vite builds transpile TypeScript without checking types.

## Run the public UI without external services

Use a clean shell without application secrets or an existing `.env*` file. The
following configuration uses only the checked-in, read-only PostgREST-shaped
fixture and placeholder keys. It supports public rendering, not form persistence,
admin login, storage uploads, payments or email.

In terminal 1:

```sh
node scripts/ci/supabase-fixture.mjs
```

In terminal 2, keep this shell for development, build and preview:

```sh
export VITE_SUPABASE_URL=http://127.0.0.1:54329
export VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key
export SUPABASE_URL=http://127.0.0.1:54329
export SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key
export APP_URL=http://127.0.0.1:5173
export VITE_PUBLIC_SITE_ORIGIN=http://127.0.0.1:5173
export VITE_PUBLIC_DONATION_CHECKOUT_ENABLED=false
export VITE_PUBLIC_IMAGE_TRANSFORMS=false
export SUPPORTER_RECOVERY_ENABLED=false
curl --fail --silent 'http://127.0.0.1:54329/rest/v1/animals?select=id&limit=1'
bun --no-env-file run dev --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`. Stop the dev server and fixture with Ctrl-C.
`--no-env-file` controls Bun's dotenv loading; Vite also reads `.env*`, so keep
this fixture checkout free of real dotenv files. For writable development, use
`.env.example` only with a verified disposable Supabase target and synthetic
accounts. Never use a hosted service-role key for the fixture.

### Build and local preview

With the same fixture environment exported and terminal 1 still running:

```sh
bun run typecheck
bun run build
git diff --exit-code -- src/routeTree.gen.ts
PORT=4173 bun run preview
```

Open `http://127.0.0.1:4173`. Preview runs
`scripts/nitro-preview-fast.mjs`, which serves `.vercel/output/static` and starts
the SSR process on the next port (4174 here). Both ports must be free. It is a
local verification server; `.vercel/output` is the deployment artifact, not a
standalone static site. Preview defaults to Bun; set `NITRO_PREVIEW_RUNTIME=node`
to exercise its Node launcher.

## Test tiers

### Fast suite and focused core flows

In a clean shell without exported service credentials, DB URLs or fixture opt-ins:

```sh
SUPABASE_LOCAL_URL=http://127.0.0.1:1 bun --no-env-file run test
bun run typecheck
bun run lint
```

The package test script supplies `--isolate` to prevent module mocks leaking across
files. The loopback override prevents RLS auto-discovery from reaching a shared
local stack. Explicit database/forward-migration suites remain opt-in and should
report skips here. Do not report those skips as passing database acceptance.

For the input, recovery and callback contracts in the architecture notes:

```sh
SUPABASE_LOCAL_URL=http://127.0.0.1:1 bun --no-env-file test --isolate \
  src/lib/http/boundedBody.server.test.ts \
  src/lib/publicAdoption/submission.server.test.ts \
  src/routes/api/adoption/applications.test.ts \
  src/routes/api/webhooks/-paypal.test.ts \
  src/lib/donations/reconcile.server.test.ts \
  src/lib/volunteers/http.test.ts \
  src/lib/volunteers/rules.test.ts
```

These use real domain/HTTP code with injected external dependencies. New body
tests exercise actual `Request` streams, byte limits, cancellation and payload
preservation. Adoption tests pin retry behavior when intake repair fails; PayPal
tests pin refund retry and durable-review failure. No live provider call is needed.

### Public browser verification

Keep the fixture and built preview running as above, then in another terminal:

```sh
bun run verify:brand:install
FIXTURE_ID=supabase-ci-v1 BASE_URL=http://127.0.0.1:4173 \
  OUTPUT_DIR=artifacts/brand-ci-local bun run verify:brand
```

The verifier visits the route/viewport matrix and writes screenshots and
`run-context.json`; inspect failures and its exit status. Optional equivalent
sweeps are `verify:a11y` and `verify:performance`, with separate output directories.
On Linux CI, install browser OS dependencies with
`bunx playwright install --with-deps chromium`. This read-only fixture is not a
database emulator or end-to-end business acceptance environment.

### Real database acceptance

There are several existing harnesses; they are not interchangeable:

| Command / guide                                                    | Target and prerequisites                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test:rls`, `bun run test:db`                              | Legacy local Supabase stack from `supabase/config.toml`, API 55321 / DB 55322. See [RLS testing](rls-testing.md). `test:db` explicitly enables fixture writes.                                                                                    |
| `bun run test:acceptance:db` (`:all`, `:rls`)                      | Dedicated policy stack only: API 56321 / DB 56322, plus ignored `.local-policy-test/local-credentials.json`. `scripts/test-isolated-acceptance.ts` checks that API URL; it does not create the stack or fully configure every newer opt-in suite. |
| [Clone/fidelity harness](../supabase/rls-tests/helpers/README.md)  | Explicitly gated disposable DB clones and reviewed schema prerequisites for forward-migration/concurrency tests. Read each runner's target checks and opt-ins.                                                                                    |
| [Local volunteer acceptance](../scripts/local-volunteer/README.md) | Synthetic Auth, Storage, PostgreSQL and app containers with target proofs and attempt guards. Its retained paths are historical, not guaranteed to exist on a new machine.                                                                        |

Before any fixture write, prove the exact target is disposable and owned by this
run, including DB identity, synthetic data, side effects and cleanup scope. A
loopback URL, a port number or a variable named `TEST` alone is insufficient.
Never point these at production, a shared development stack or an unverified
retained fixture. Reset and restore commands destroy local data; inspect the
relevant runbook and target first. This guide deliberately does not suggest
blanket opt-ins or `db reset` as a generic recovery command.

### What CI actually enforces

`.github/workflows/ci.yml` is authoritative:

- `verify`: frozen install → typecheck → isolated tests → lint → build → generated
  route-tree parity. Build uses placeholder Supabase configuration.
- `brand-verify`: required successful job after `verify`; runs against the local
  fixture and built preview.
- `rls-matrix`, `a11y-verify`, `performance-verify`: currently
  `continue-on-error: true`. A green PR alone does not prove those checks passed;
  inspect their results and skipped opt-in coverage before a release.

Branch-protection settings live in GitHub and must be checked for the candidate;
the workflow file alone cannot establish which contexts block merging.

## Configuration and deployment

`.env.example` lists configuration names. `VITE_*` values are baked into browser
assets at build time; changing them requires a rebuild. Server environment changes
on Vercel also require a redeploy. Keep `APP_URL` and `VITE_PUBLIC_SITE_ORIGIN`
consistent for the target's URLs, canonicals and status links.

| Area               | Review before deployment                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database           | Correct `SUPABASE_URL` / server key and public URL/key pair; migration, grants and private/public bucket parity.                                                                                                                                                                                                                                             |
| Abuse protection   | Matching Turnstile public/secret pair and Upstash URL/token pair. Inconsistent production pairs boot-fail. Missing Turnstile secrets reject production challenges; callers with `requireAvailability` reject production submissions if Upstash is absent/unavailable. Other limiter callers can fail open; local/preview fixtures permit missing protection. |
| Payments and email | Keep checkout default-off until the activation gates in [donations](donations-runbook.md) pass. Provider sandbox/production credentials, callback signatures and recipient configuration require explicit review.                                                                                                                                            |
| Jobs               | `CRON_SECRET` plus eligible volunteer/sponsorship actor IDs and required email configuration. See [background jobs](background-jobs-runbook.md). Readiness auth is not permission to execute a job.                                                                                                                                                          |
| Recovery           | Verified backup/restore coverage and a rollback compatible with the candidate's schema and durable ledgers. See [backup/restore](backup-restore-runbook.md) and [release sequencing](development-release-proposal.md).                                                                                                                                       |

The deploy target is Vercel project `hkscda`, scope `ynwaforevers-projects`.
`vite.config.ts` builds Nitro's `vercel` preset into `.vercel/output`;
`vercel.json` declares the build/install commands and cron routes. Pushes to
`main` trigger production automatically. A PR and passing local tests are not
release approval.

1. Record the exact candidate SHA and inspect required remote CI results, including
   optional failures/skips. Complete the applicable owner and isolated acceptance
   checks; reconcile historical evidence with the current target.
2. Verify the target project/config, migration compatibility, backup and rollback
   plan. Obtain the release approval required by `AGENTS.md` for that candidate
   and target before merge, preview publication, migrations or production changes.
3. For an approved preview, run `vercel deploy --scope ynwaforevers-projects` from
   the verified checkout with the Vercel CLI. Preserve private review access.
   For an approved production release, merge through GitHub to `main` and observe
   the linked deployment. Do not independently push a second production deploy.
4. Confirm deployed commit, build/runtime status and target URLs. Exercise the
   approved public/admin smoke journeys; inspect job readiness, durable delivery
   results and relevant logs without exposing tokens or personal payloads.
5. If acceptance fails, use the approved compatible rollback or forward-repair
   plan. Rolling back app code does not roll back schema, storage, email or money;
   never drop idempotency/audit records or replay payments to reconstruct state.

For a documentation/test-only PR, the existing `codex/audit-*` deployment exclusion
in `vercel.json` allows review without creating an automatic Vercel preview.
