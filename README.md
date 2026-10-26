# HKSCDA

Public adoption, donation, sponsorship and volunteer journeys for 香港拯救貓狗協會,
with a role-gated staff back office. Built with TanStack Start, React, Bun and
Supabase; deployed as Nitro output on Vercel.

## Start here

- [Architecture and risk map](ARCHITECTURE.md): boundaries, core flows, failure
  recovery and the next three engineering investments.
- [Run, test and deploy](docs/development.md): reproducible local fixture, test
  tiers and release procedure.
- [Contributor rules](AGENTS.md): security invariants, naming and review gates.
- [Route conventions](src/routes/README.md) and
  [brand guidelines](docs/brand-guidelines.md).

Use Node 24 and the Bun version in `.bun-version`:

```sh
bun --version
node --version
bun install --frozen-lockfile
SUPABASE_LOCAL_URL=http://127.0.0.1:1 bun --no-env-file run test
bun run typecheck
bun run lint
```

The full suite also needs Python available as `python` and Google Chrome
(`bunx playwright install chrome`). See the [toolchain prerequisites](docs/development.md#toolchain).

The test command above keeps dotenv files out of the run and disables the
auto-detected RLS stack. Run it in a shell without exported application secrets or
database fixture opt-ins. Database tests that require explicit opt-in remain
skipped; skips do not establish database acceptance.

For a working local UI without credentials, use the
[read-only fixture setup](docs/development.md#run-the-public-ui-without-external-services).
Copying `.env.example` alone leaves the required Supabase values empty.

Operational runbooks:
[donations](docs/donations-runbook.md),
[background jobs](docs/background-jobs-runbook.md),
[backup/restore](docs/backup-restore-runbook.md),
[RLS testing](docs/rls-testing.md), and
[owner acceptance](docs/owner-uat-checklist.md).
Each release must establish its own environment and acceptance evidence; historical
reports under `docs/evidence/` are not current deployment status.
