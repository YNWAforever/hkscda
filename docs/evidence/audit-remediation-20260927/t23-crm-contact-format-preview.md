# T23 CRM contact format preview — PR #176

Source: `1511ee99bdaad0b814e82ce8a259a68632f9b7bf`, stacked on #175 evidence head `b5e1600096a90c66ba689e8f4f5b0faf880ef288`. Environment: isolated Windows worktree, local Supabase API `127.0.0.1:57321` and DB `127.0.0.1:57322`; synthetic contact rows in tests. No production supporter rows, DDL, email, payment or content were changed.

## Implemented and reproduced

- A missing-service/route red test exited 1. The resulting read-only route requires current treasurer/admin authorization before reading contact fields; POST body is bounded to 64 KiB, 1–1,000 unique UUIDs and a selection hash. It reads selected rows in 100-ID batches and returns `no-store` ordered results. Missing/deleted rows contain no contact details. Errors return generic 401/403/400/413/503 responses.
- Pure suggestions only: whitespace normalization for name/phone, trim and lowercase email with `manual_review/identity_review`. No digits/punctuation rewriting, automatic identity merge, consent change, apply endpoint or audit mutation. A later write workflow needs its own persisted versioned snapshot and guarded same-transaction audit.
- The staff UI uses the existing 25/1,000 supporter selection; filter or selection changes invalidate displayed and in-flight previews. It pages 25 before/after results, includes a status count and keyboard-accessible buttons. It does not persist PII in session storage.

## Verification

| Command / check | Environment | Result |
|---|---|---|
| `bun test src/lib/crm/contactFormatPreview.test.ts src/routes/api/admin/supporters/format-preview.test.ts src/components/admin/crm/SupporterList.test.tsx` | isolated worktree, synthetic rows | exit 0; 9 pass, 40 assertions |
| `bun test --isolate` with explicit `SUPABASE_LOCAL_URL` 57321 and synthetic bank fixture DB 57322 | isolated local API/DB | exit 0; 2961 pass, 114 skip, 0 fail, 9330 assertions across 547 files |
| `npm.cmd run typecheck` | after route-tree generation | exit 0 |
| `npm.cmd run lint -- --quiet` | after targeted formatting | exit 0 |
| `npm.cmd run build` | local Vercel fixture build | exit 0; generated `src/routeTree.gen.ts` |
| CI source head `36384803921` | GitHub Actions | passed all five jobs at source SHA 1511ee9 |

Initial pre-build typecheck exited 1 because the new route path was absent from the generated tree; build produced the tree and typecheck then exited 0. Initial lint exited 1 for Prettier formatting on touched files; targeted formatting and rerun exited 0. These initial failures are retained rather than counted as passing gates.

## UI and release limits

Before: the CRM list offered tag bulk and export but no contact-format review. After: the new panel shows a transient, paged before/after review with explicit manual identity cases. Authenticated staff screenshots at 390/768/1366, actual-role direct API and private-file UAT, keyboard browser journey and same-environment before/after performance are **not-run** without a private candidate and test identities. No performance improvement is claimed.

R01 remains production incompatible: read-only catalog comparison reports 126 required gaps in the 132-item manifest and a divergent 79-version live ledger. This PR has no schema change but cannot be deployed while the stacked release is NO-GO. ADMIN-04 remains partial for CRM assignment, other domain actions, approved sending and hosted UAT.
