# Volunteer Admin Operations Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved complete volunteer operations centre across every volunteer admin route.
**Architecture:** Shared volunteer shell within AdminLayout; restricted paginated directory API and profile read model; existing atomic mutation services remain authoritative. UI components own presentation and query state, not policy rules.
**Tech Stack:** TanStack Start, React, strict TypeScript, Supabase, Bun, existing semantic CSS tokens.

## Global Constraints

- Preserve all canonical IDs, database history, existing work and current brand.
- Staff/admin operations; admin-only policy management; enforce on every API.
- No production mutations, live email, payments or production migrations in tests.
- No explicit any, no client service keys, no generated routeTree manual edits.
- Keep root and existing inner-page URLs usable; all settings remain actionable.
- Merge/deploy requires separate release approval.

### Task 1: Shared navigation and operations presentation

Files: VolunteerAdminShell.tsx, volunteerWorkspace.ts, volunteer-workspace.css, src/routes/admin/volunteers\*.tsx, new activities.tsx.

- [x] Test role-filtered navigation and nested route activation using bun:test (staff lacks settings, admin sees all, treasurer sees none).
- [x] Implement navigation model and shell with breadcrumbs, responsive navigation, accessible controls, consistent state styling. Move activity management to /activities, retain nested routes.
- [x] Apply shell once to every inner route including assessments. Keep existing forms, mutations and role checks.
- [x] Run focused tests and typecheck. Review against full route inventory.

### Task 2: Directory and personal read models

Files: src/lib/volunteers/directory/{types.ts,schemas.ts,http.server.ts,repository.server.ts,\*.test.ts}, API people route, additive SQL migration if required.

- [x] Test unauthorized calls never query, invalid filters fail 400, explicit profile lookup returns 404, page size <=50, literal search and stable paging.
- [x] Add protected service-role SQL read function joining only linked profile/auth users; explicit columns and role verification. Search name/email, status/tier; return total, rows, credentials and factual history for a selected profile.
- [x] Wire dependency-injected HTTP boundary: validate query, requireAdmin staff/admin, repository call, no-store responses, safe errors.
- [x] Isolated DB tests: zero-booking identity, same names, unlinked legacy identity, special-character search, pagination, unauthorized RPC, history accuracy.
- [x] Record migration/rollback procedure; never apply production.

### Task 3: Directory and profile UX

Files: VolunteerDirectory.tsx, VolunteerPersonDetail.tsx, people.tsx, people/$id.tsx, qualifications integration.

- [x] Render search/filter/pagination using URL state and retained navigation state. Use types from Task 2.
- [x] Show pending zero-booking volunteers and email verification separately from staff status.
- [x] Detail tabs show identity, credentials, registrations, attendance and verification history; preserve canonical references and show history coverage.
- [x] Link qualifications with selected profile; clear stale form/mutation state when profile changes.
- [x] Test empty/error states and links; verify 390px and desktop via isolated browser fixtures.

### Task 4: Overview and all inner workflows

Files: VolunteerOverview.tsx, VolunteerQualifications.tsx, existing operational/settings components.

- [x] Add server-backed dashboard totals using exact count queries and Hong Kong day bounds. Use existing authoritative calendar API for shortages, surface truncated/unavailable results.
- [x] Add section navigation to complex forms; improve labels and failure/retry feedback, readable references, grouped actions and clear selected identity.
- [x] Verify every existing action survives redesign; no speculative policy defaults or hardcoded statistics.

### Task 5: Integration and release candidate

Files: scripts/verify-volunteer-admin-centre.mjs, docs/evidence/volunteer-admin-centre.md.

- [x] Run bun test, bun run typecheck, bun run lint, bun run build and brand verification.
- [x] Browser inspect all routes with synthetic isolated staff/admin sessions; verify anonymous/volunteer/treasurer negatives, mobile overflow and axe.
- [x] Review task diffs, resolve important findings, then whole-branch review. Commit explicit files only.
- [x] Prepare PR and truthful evidence; retain production-repair-20260914.md unstaged.

Execution evidence: docs/evidence/volunteer-admin-centre/README.md. Public brand check ran but is blocked by two existing local synthetic media fixtures; production release remains unapproved.
