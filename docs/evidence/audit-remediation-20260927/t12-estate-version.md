# T12 / R05 — versioned dog-friendly estate commands

Status: code complete; schema ready after an isolated rollback-only rehearsal; deployed no; operationally enabled no. Source branch: codex/audit-estate-version-20260927, based on T10 commit 916a8406508aa97ea841714bbadc0416c8e7895f. Draft PR #145: https://github.com/YNWAforever/hkscda/pull/145. Source commit: 60ed2d612d7b426d3d4641f6cbabf66f978d1486.

## Reproduction and change

The old editor held a new row UUID for its entire mount, so sequential creates reused the same identity. The same upsert sent content and isPublished together, allowing a stale draft to undo a colleague's publication. There was no expected-version check. The focused regression started at 0/3 pass, exit 1: createEstate and updateEstate did not exist.

Create, update and publication now have strict separate request schemas and repository commands. Content edits contain no publication field. The SQL RPC checks an active staff/admin actor, matches expectedVersion for edits/publication, writes the row and audit_log in one transaction, and reports P4090 as HTTP 409. Create defaults to unpublished, retains the same client UUID on a failed request, and a matching retry returns the unchanged row without duplicate audit. The editor only resets after a successful server response; it adopts canonical rows and keeps dirty input on a background refetch or conflict. A staff member can explicitly load the latest row before re-entering changes.

The additive migration gives existing rows version 1 and adds a trigger that increments the version for old checkout writes. The old audited RPC remains usable in the mixed-checkout window. The new app must not be deployed before its column and RPC exist. The existing role gate on the API route remains staff/admin; the new SQL RPC grants EXECUTE only to service_role and checks the actor again.

## Verification, 2026-09-27

Environment: isolated worktree; exact unlinked local Supabase container supabase_db_hkscda-audit-remediation-20260927 on 127.0.0.1:5732x; synthetic loopback browser fixture at 127.0.0.1:56542 with fake public key and intercepted admin API. Before screenshot used the pre-T12 T10 checkout at 127.0.0.1:56543. No production database, email, payment, provider or public preview was used.

| Command or gate | Exit | Result |
| --- | ---: | --- |
| bun test src/lib/adoptionInformation/estate-commands.test.ts before fix | 1 | 0 pass, 3 fail: missing createEstate/updateEstate. |
| bun test src/lib/adoptionInformation src/routes/api/admin/adoption-information.test.ts src/components/admin/content/AdoptionInformationManagement.test.tsx | 0 | 76 pass, 0 fail; validates request separation, safe 409 mapping, role gate and response. |
| python scripts/rehearse-estate-version-local.py | 0 | Preexisting synthetic row backfilled; two creates and idempotent retry; legacy update increments version; publish/edit/unpublish; stale conflict; unknown actor denial; audit failure rolls row back; RLS/grants checked; full transaction rolled back. |
| Post-drill local catalog query | 0 | Synthetic seed count 0; version-column count 0. |
| node scripts/verify-estate-version.mjs | 0 | 390x844 create failure/retry same ID, second distinct ID, publication preserved by edit, unpublish, dirty refetch preserved, stale HTTP 409 and latest-version action. |
| SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --timeout=30000 --max-concurrency=8 | 0 | 2794 pass, 83 skip, 0 fail across 469 files. |
| bun run typecheck | 0 | Strict TypeScript passed. |
| bun run lint | 0 | 52 warnings, 0 errors; existing fast-refresh and hook warnings. |
| bun run build | 0 | Client, SSR and Nitro build passed; no deploy. |

Synthetic mobile UI: [before editor](ui/t12-estate-before.png) and [after conflict state](ui/t12-estate-conflict-after.png). Same viewport and browser, but different checkout and synthetic row states; these images show the controls and explicit conflict recovery, not a performance comparison. Same-environment public performance measurements remain in ui-performance.md; T12 performance delta was not measured.

## Release and operator boundary

Migration file and SHA-256 are in migration-manifest.csv, with preflight and rollback detail in migration-runbook.md. This local transaction rehearsal is narrower than a production-size backfill. Before release, the DB owner must review the target catalog, grants, RLS, existing rows, lock timing, backup and migration order; then staff should test the real role matrix on an approved isolated environment. Do not apply the migration or publish the checkout without separate authorization.

For a conflict, the operator should compare their local text with the latest row and explicitly choose Load latest version before re-entering changes. Publishing is unavailable while content edits are unsaved. On a failed create, retry the same form; a successful create clears it and assigns a new identity. A later app rollback can leave the additive schema in place, allowing the older audited checkout to keep writing while version increments. Dropping the column after new writes is not a routine rollback.
