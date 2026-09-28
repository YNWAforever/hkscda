# T23 role-guided staff task overview · PR #174

Source `8f62d8a4ccd52803ebb8aea6929b8e9e7ee901ab`, stacked on draft #173. ADMIN-04 remains **partial**. Existing role-gated task overview had 3–5 count cards per staff, treasurer and admin role but no concrete first-use instruction or ordered steps. This slice adds one role-specific action sentence to each existing task definition and renders the cards as a numbered, accessible ordered list. It adds no mutation, schema, payment, notification or public route.

## Before / after

- Before: metric, oldest date and generic workspace link on unordered cards. A new treasurer could see a sponsorship proof count without an explicit reminder that proof is not confirmed payment.
- After: each role sees 3–5 numbered tasks with a concrete action and the existing direct workspace link. Treasurer guidance explicitly states that uploaded sponsorship proof does not mean funds were received and that reconciliation remains per payment. The ready zero and unavailable states are unchanged. The DOM uses a labelled section and ordered list with nested task headings; the route remains role-gated and no source error becomes zero.
- Authenticated before/after screenshots at 390/768/1366, phone and keyboard navigation with actual staff/treasurer/admin test identities are **not-run**; no private preview was exposed.

## Reproduction and verification

- Added red tests: `taskOverview.server.test.ts` failed because `guidance` was absent; `TaskOverview.test.tsx` failed because no ordered list appeared. After the minimal change, focused `bun test src/lib/operations/taskOverview.server.test.ts src/components/admin/operations/TaskOverview.test.tsx src/routes/api/admin/task-overview.test.ts`: **6 pass, 34 assertions**, exit 0.
- `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate` with only dedicated rollback-only sponsorship bulk, bank dry-run and delivery retry fixture flags pointing at `postgresql://postgres:postgres@127.0.0.1:57322/postgres`: **2949 pass, 109 skip, 0 fail, 9259 assertions across 540 files**, exit 0. `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`, `npm.cmd run build`: each exit 0 on the isolated worktree. Build was checked separately from typecheck.
- Remote source CI `36375345907` at `8f62d8a`: verify, RLS matrix, brand, accessibility and performance all passed, exit 0. No migration; the existing 50-file manifest hash and 127-item schema requirement set remain the #173 base. This copy/layout slice does not claim new DB compatibility.

## Release boundary

Draft PR only. Hosted role and responsive/keyboard UAT, full private journeys and release approval remain open. No main merge, production DDL, public preview, payment enablement, content publication or notification was performed. App rollback restores the prior cards; existing role checks, counts and commands remain authoritative.
