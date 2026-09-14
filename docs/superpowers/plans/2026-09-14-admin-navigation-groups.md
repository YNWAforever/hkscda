# Grouped Admin Navigation Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Execute the approved specification task by task.

**Goal:** Six role-aware admin domains with animal tabs and preserved navigation state.
**Architecture:** Keep existing destinations and access checks. The shared navigation model selects one domain and exposes allowed contextual destinations; animal list state is validated in route search.
**Tech Stack:** TanStack Start/Router, React, TypeScript, Supabase, Bun.

## Global Constraints
- Preserve canonical data, real photography, existing URLs, auth/RLS and merged volunteer operations centre.
- No migrations, production record changes, provider actions or deployment.
- Six groups: 動物管理、領養管理、義工與實習、捐款與助養、網站內容、系統設定.
- Hide inaccessible destinations and empty groups; use the first permitted destination when the default is unavailable.
- zh-HK and English; semantic colour tokens; mobile 390px and desktop 1440px.

## Task 1: Navigation model and shell
Files: src/components/admin/adminNav.ts, adminNav.test.ts, AdminLayout.tsx, adminI18n.tsx; optional focused navigation component.
- [x] Extend groups with volunteers, move internships/volunteer links into it and status/payment-method settings to system.
- [x] Test longest matching path, section fallback, all existing destinations, and role-filtered default resolution.
- [x] Export getAdminNavigation(role, pathname, activeSection) with groups (id, label, icon, to, items) and one activeGroupId; use existing canRoleAccessAdminNavItem, never alter authorization.
- [x] Render one primary link per allowed group; active group's secondary navigation reaches every original link. Volunteer uses its existing internal workspace plus a compact operations/internship selector, without repeating internal links.
- [x] Animal root owns its own tabs; animal detail pages retain contextual cat/dog/sponsor links.
- [x] Add bilingual group copy, mobile close/focus, accessible names and responsive scrolling; preserve language/collapse/logout/draft blockers.
- [x] Run bun test src/components/admin/adminNav.test.ts src/lib/admin/access.test.ts; bun run typecheck. Review and stage only owned files.

## Task 2: Animal workspace and URL state
Files: src/routes/admin/index.tsx, src/components/admin/AnimalsTable.tsx, new src/lib/animals/adminListState.ts and .test.ts, optionally local animal copy component.
- [x] Validate section, q, archived, status, page with safe defaults; e.g. invalid negative page => 1, invalid status => all.
- [x] Add fixed cat/dog/sponsor links under a common heading and add-animal action. Preserve sponsor pledge review toggle and all current authorization.
- [x] Control table search/archive/status/page from route state, resetting page on filters; preserve per-tab state in component memory and restore browser history from URL. Do not use persistent personal-data storage.
- [x] Apply filtering/pagination to existing canonical records; keep adminAnimalFilter and errors/retry. Distinguish empty catalogue from no filtered results with clear filters.
- [x] Keep table edit/archive/workflow behavior. Include actual filters in derived query keys as appropriate without changing database scope.
- [x] Test URL sanitization, independent tab state, filters and pagination. Run focused tests/typecheck; format changed files.

## Task 3: Verification and review
Files: scripts/verify-admin-navigation.mjs; docs/evidence/admin-navigation-groups/.
- [x] Use existing dedicated local API 56321 and dev 56336 with synthetic sessions; block nonlocal requests and avoid record mutations.
- [x] Verify all six groups, staff/admin/treasurer destinations, old URLs, animal tabs/search/history, keyboard and mobile drawer/focus, existing volunteer draft cancel.
- [x] Capture representative screenshots and axe results at 1440/390.
- [x] Run bun run test:acceptance:all, bun run typecheck, bun run lint, bun run build and applicable brand verification; distinguish baseline/environment failures.
- [x] Review complete diff, resolve material issues, commit explicit paths and prepare independent PR with truthful evidence. Release approval remains separate.
