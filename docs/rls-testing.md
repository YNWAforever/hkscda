# RLS Behavioral Testing

`supabase/rls-tests/moneyPii.rls.test.ts` runs real queries against a real local Supabase
stack, as five different roles (anon, an authenticated user with no admin role, staff,
treasurer, admin), to prove that Row Level Security policies actually allow and block
what they're supposed to -- not just that the policy SQL text looks right.

This is separate from the fast, dependency-injected-fake test suite (`bun test`), which
never touches a real database. Plain `bun test` skips this file cleanly if no local
Supabase stack is reachable.

## Running locally

1. Docker must be installed and running (e.g. Docker Desktop) -- `bunx supabase start`
   launches Postgres, GoTrue, PostgREST, Storage, and Studio as Docker containers, and
   fails immediately if the Docker daemon isn't reachable.
2. Install the Supabase CLI (no global install needed -- `bunx supabase` fetches it
   on demand).
3. `supabase/config.toml` is already checked into this repo with ports pre-configured
   (API `55321`, DB `55322`/shadow `55320`, Studio `55323`, Inbucket `55324`,
   analytics `55327`) -- a normal checkout needs no setup here. (`bunx supabase init
   --workdir .` is only relevant when bootstrapping a brand-new project from scratch;
   skip it in this repo.)
4. Check for port conflicts: `docker ps --format "{{.Ports}}"`. If this machine runs
   other local Supabase/Postgres stacks, remap `supabase/config.toml`'s port fields
   (`[api] port`, `[db] port` + `shadow_port`, `[db.pooler] port`, `[studio] port`,
   `[local_smtp] port`, the analytics `port`) to a free 10-port block before starting.
5. `bunx supabase start` -- applies every migration to a fresh local Postgres and
   starts the full local stack (Postgres, GoTrue, PostgREST, Storage, Studio).
6. `bun run test:rls` -- runs the RLS behavioral suite against that stack.
7. `bunx supabase stop` when done.

## Troubleshooting

**`test:rls` fails immediately inside `beforeAll` with an "already registered" error
from `auth.admin.createUser`.** This means a previous run's cleanup (`afterAll`) was
skipped -- for example, a timeout under a cold-started stack -- and left the
hardcoded test-role auth users behind.

Recovery: `bunx supabase db reset` to wipe the local stack back to a clean migrated
state, then re-run `bun run test:rls`.

## Scope

Currently covers the 7 highest-risk tables (money/PII): `admin_user`, `supporter`,
`donation`, `payment`, `receipt`, `consent`, `recurring_mandate`. Extending to the
remaining RLS-enabled tables in this schema is a separate, follow-up task -- the
harness and fixture-seeding pattern in `moneyPii.rls.test.ts` are meant to be
copied for additional tables, not redesigned.
