# Task8 native CI execution contract — 2026-10-07

Base: `4a947e533539d6debf90c5c30024502a74386030`.

The dedicated `Run Task8 volunteer atomic transaction tests` step runs the existing
19 business tests immediately after fresh local Supabase startup and before the
other database suites. It requires literal `R01_VOLUNTEER_REQUIRE_DATABASE=1`,
`R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES=1` and
`R01_VOLUNTEER_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres`.
Native admission additionally requires literal `CI=true` and `GITHUB_ACTIONS=true`.
The exact URL comparison refuses remote hosts, other roles/ports/databases,
encoded credentials, normalization, query strings and fragments. Configured or
required suites fail on incomplete/malformed opt-in; ordinary unconfigured units skip.

Before native fixture writes, the unchanged `assertSafeFixtureTables` scanner
examines the actual seven-table Task8 scope, including `auth.users`. All seven
tables must then be empty. Populated/unknown state is refused; no reset or cleanup
of preexisting rows is performed. Fresh empty native state is a cold CI assumption
that still needs verification. The existing 52322 owned-clone URL guard and owned
fixture path are preserved. No shared scanner/decoder, SQL migration or business
assertion was changed.

TDD: the initial helper reproduced the preexisting clone-only admission/optional
environment selection. `bun --no-env-file test ./src/lib/volunteers/atomicForwardFixtureGuard.test.ts`
failed with 1 pass and 5 fail (exit 1): native URL rejected by `assertCloneUrl`,
missing opt-in not refused, required missing pair returned `undefined`, missing CI
step. The minimal admission/execution patch passed the six regression cases.
Additional negatives and an actual child-runner missing-pair refusal cover the
integrated suite. Detailed command/output bindings are in the controller report.

The final pure regression run passed 7 tests/56 assertions with zero skips; strict
typecheck and focused lint passed with exit 0. Original sandbox Bun EPERM/cwd
failures and formatting lint findings were preserved; the unchanged authorized
execution retry resolved the sandbox failures, and the two new helpers were formatted.

Native cold CI, all 19 database results, full suite and container probes are not
established by those source results. Docker/disk recovery and the
reviewed Task11 prerequisite repair are controller gates. Acceptance requires the
individual Task8 step to succeed with **19 pass, 0 fail, 0 skip** after prerequisites
are integrated; an aggregate job result or ordinary unit skip is insufficient.

All R01 source SQL remains production-unapproved/unapplied `DO_NOT_APPLY`.
Payment/delivery/media activation remains disabled. This change performs no
production operation, provider action, real email, payment or refund.
