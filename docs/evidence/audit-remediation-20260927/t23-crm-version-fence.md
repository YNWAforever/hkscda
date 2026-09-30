# T23 CRM tag bulk fresh-schema version fence · #177

Source commit `8fd9310237e3ba94f91352f3ea713d1f012ac61b`, stacked after draft #176. Draft PR #177 adds `20260928113000_crm_supporter_version_fence.sql`, committed SHA-256 `53e0875e30732534e795b94dde24b1e0c9442e4e3f93dbdd4b4b334a5b339a42`. It adds a default-1 bigint `supporter.edit_version` and a BEFORE UPDATE trigger. Existing CRM tag bulk SQL already required this column; a long-lived local DB had it manually, but an independently installed 160-version DB did not. No production row or schema was changed.

## Reproduction and isolated verification

| Command / environment | Exit | Result |
|---|---:|---|
| `bun test src/lib/crm/tagBulk.database.test.ts`, explicit opt-in synthetic fixture on unlinked `127.0.0.1:60322` before migration | 1 | 0 pass / 2 fail, PostgreSQL `42703`: `v_row.edit_version` absent in `create_crm_tag_bulk_preview`. |
| `bun test src/lib/operations/releaseManifest.test.ts` before catalog amendment | 1 | Missing required `supporter.edit_version` assertion. |
| Exact SQL under `BEGIN`/`ROLLBACK` on 60322 | 0 | Column/function/trigger statements succeeded; rollback removed them. The same exact file was then applied only to this disposable DB, without writing a migration ledger row. |
| `bun test src/lib/crm/tagBulk.database.test.ts`, 60322 after isolated application | 0 | 2 pass / 16 assertions. A name-only edit after preview conflicts; duplicate apply is idempotent. Role revocation, expiry and audit-insert failure behave as existing fixture asserts. |
| New unlinked 6432x stack, seed disabled, 161 ordered migration files | 0 | Real ledger 161 through `20260928113000`; `bun scripts/check-release-schema.ts` on 64322 exit 0, 133 compatible / 0 issues; rollback-only CRM fixture 2 pass / 16 assertions. |
| `bunx supabase migration up --local` on previously verified unlinked 6332x stack | 0 | Real ledger 160→161. Before/after: FPS payments `150b962f-60f9-4b53-ba4d-8e419eaf1b30` succeeded and `283aebe7-a2f6-4cbe-a409-2b65fe0bc74a` pending; delivery job `8b2610ce-3632-4253-bfe8-7e4ca3e0a20f` attention_required. IDs and states unchanged. Checker on 63322: 133 compatible / 0 issues. |
| Full `bun test --isolate` on named API 57321 / DB 57322, synthetic bank and CRM fixtures | 0 | 2963 pass / 112 skip / 0 fail / 9347 assertions across 547 files. |
| `npm.cmd run typecheck`; `npm.cmd run lint -- --quiet`; `npm.cmd run build` | 0 each | Build success is recorded separately from strict TypeScript. |

Fresh catalog inspection on 64322: `edit_version bigint NOT NULL DEFAULT 1`; `bump_supporter_edit_version` trigger enabled; private function has `search_path=""`; anon, authenticated and service_role direct EXECUTE are all false. The function is a trigger, with no public RPC. The local database fixture runs in a transaction and rolls its synthetic rows back.

The prior read-only production catalog metadata snapshot, evaluated again against the 133-item manifest, remains **incompatible: 127 required missing items** (26 tables, 79 functions, 22 columns). This is one more column than the preceding 132-item check; no new production query was made for this evidence. The production ledger has 79 versions and diverges from the 109 source versions through the same latest version. The synthetic 160→161 upgrade does not prove the real 79-version migration path.

## Release and rollback

R01 and ADMIN-04 remain partial; this is code-complete and schema-ready in isolated environments, not deployed or operationally enabled. Before any production migration, resolve the live-ledger bridge, rehearse on a sanitized data-bearing clone, measure supporter ALTER lock and default behavior, compare trigger/grants/RLS and direct API roles, prove backup/restore and certify an older-app rollback target. Keep the additive version column and audit/payment history on app rollback. Do not use the synthetic upgrade as authorization to run a production migration.
