# Volunteer isolated diagnosis implementation plan

> **For agentic workers:** Use superpowers:executing-plans to carry out this bounded repair in the existing checkout. No new task, worktree, push, merge or deployment.

**Goal:** Preserve a volunteer qualification editor's unsaved tier/date changes during a background refresh, without silently accepting a newer revision.

**Architecture:** Reuse the existing `canHydrateVolunteerDraft` guard. Keep the editor's loaded revision separately from the live query result. Advance that revision only after a successful local command or an accepted clean refresh.

**Tech Stack:** React 19, TanStack Query, TypeScript, Bun and Playwright.

**Spec:** The user's authorization in this task covers isolated volunteer-page diagnosis and necessary local fixes; production identity and incident HOLDs remain unchanged.

## Global constraints

- Use synthetic in-memory services in a Docker container with `--network=none`; instantiate no database or external Auth client.
- Preserve incident evidence, unrelated work, manifests and lockfiles.
- Do not perform original OV-RO queries, read application tokens, push, merge or deploy.

## Review focus

- A background refresh cannot discard unsaved tier/date changes or advance their revision fence.
- A successful verification advances the fence for a subsequent command; a failed write does not.
- A pending write cannot silently consume changes made after submission.
- Switching profiles loads the new profile's own fields and revision.
- List/search/detail and role checks remain covered separately; synthetic results do not establish production authorization or SQL behavior.

## Task: Qualification editor repair and journey evidence

- [x] Add a real-component browser regression and observe failure: draft Senior becomes Newcomer after a background refresh.
- [x] Guard draft hydration and use the loaded revision in commands in `src/components/admin/volunteers/VolunteerQualifications.tsx`.
- [x] Verify conflict recovery, successful save/reload, subsequent revision and profile switching with synthetic browser fixtures.
- [x] Exercise directory loading, search/filter, detail and role restrictions using bounded synthetic checks.
- [x] Run focused regression tests, relevant lint, typecheck and build; preserve logs and a final diff fingerprint. Broaden tests only for shared-code changes or unresolved failures.

## Evidence and boundaries

The focused run passed 396 tests in 47 files, with no failures. Changed files passed lint without warnings; typecheck and the production build passed. The three new browser scenarios ran with an in-memory service in Docker `--network=none`. The local directory journey also exercised the real directory HTTP parser/serializer and the shared page-access guard with synthetic identities. It does not establish real Auth, RPC/RLS, durable database storage or deployed behavior.

A fresh read-only reviewer found no Critical/Important issue. Its three test-coverage comments were addressed: successive saves without remounting, nullable joining/coverage dates, and a successful suspension preserving a dirty tier draft while refresh fails. No shared production helper, route, dependency or lockfile changed, so unaffected full suites were not repeated.

Execution continued in the explicitly selected cloud checkout with uncommitted changes. No commit, push, merge, deployment, database operation, original OV-RO query, real account or application-token read was performed. The user confirmed environment publication; fresh-task restore was neither performed nor made a new gate. Historical onboarding and incident evidence were preserved.

Logs, diagnostic harness, screenshots, final patch and file fingerprints are retained under `/workspace/.hkscda-tools/volunteer-local-20261024/`. The missing optional skill reference `references/testing-isolation.md` could not be read through the skill provider; consequently no database client or DB fixture was introduced. The tested backend identity explicitly reports `backend: memory`, `database: null`, `externalAuth: false`, and all browser requests outside its ephemeral origin are refused.
