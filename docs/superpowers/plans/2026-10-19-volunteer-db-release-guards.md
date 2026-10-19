# Volunteer DB Release Guards Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this bounded native implementation. User has authorized local code and offline tests; real PostgreSQL requires the separate exact approval below.

**Goal:** Close R1/R2 in a new review candidate without changing the original migrations or approved evidence.

**Architecture:** Keep the three source-pinned stage fragments for existing compatibility tests. Add a single release DO envelope with local variables, admission checks, exact full ACL/default-ACL comparisons, supported catalog profile, reason comment restoration, dependency comparison, and final assertions. Only the new `releaseSql` is a publishable candidate; the output still requires one explicit caller transaction. No persistent guard helpers, temp tables, business writes, or broad REVOKE.

**Tech Stack:** strict TypeScript, Zod, Bun, PostgreSQL 17 catalog / PL/pgSQL.

**Spec:** User's R1/R2 instructions; prior `.local-policy-test/volunteer-db-release-review-20261019/01-OBJECTS-AND-FINDINGS.zh-HK.md` and approval/rollback documents.

## Global Constraints

- Base HEAD `0a6c9a5220c582bfe4fe70fce98e62417a32d623`; preserve original eight SQL files, old candidate and evidence hashes.
- No cloud DB, existing token, production actor/Auth/Secret/schedule, notifications, paid Preview, cleanup, push, PR mutation, merge or deploy.
- No full unrelated suite. Real DB tests need explicit current-target approval; offline GREEN is not SQL GREEN. No commit until affected real DB verification passes.
- Default privilege profile is an explicit reference set from the archived synthetic schema: no global FUNCTION default ACL row; public-schema entries owner/anon/authenticated/service_role, EXECUTE, owner grantor, no grant option. Additional roles or any different applicable row fail closed. Production state remains unknown.
- Final ACL exact sets: reason7/bulk = owner+service_role; rows/candidates/project = owner only. Resolve all ACL entries generically, including PUBLIC and arbitrary custom roles.
- Supported reason profile: existing six named arguments/defaults/body, normal plpgsql jsonb definer volatile attributes, standard cost/parallel/strict/support, expected owner, exact ACL; reviewed nullable comment restored and read back; empty security-label set only. Nonempty labels are unsupported and rejected, never silently dropped.
- Preserve reason→M2→M3, exact LF+CRLF anchors and replay rejection. Pin bulk canonical body SHA, with explicit reviewed override for later non-list branches; overrides are frozen in candidate bytes and require new approval.

## Review Focus

- An inherited or custom default grant must not escape a check over the whole applicable ACL.
- A grant inserted after admission must fail final assertions and roll back all stages.
- DROP/CREATE must not lose an accepted comment or silently reset unsupported attributes/dependencies.
- No role switching, CASCADE, persistent guard objects or unauthorized environment fallback.
- Read-only script lexical checks do not establish PostgreSQL grammar/catalog/result correctness.

### Task 0: Freeze baseline / DB approval gate

- [x] Verify 18 review hashes, 68 original evidence files, candidate hash, branch/worktree.
- [x] Record exact container/image/DB/schema, scoped roles/DDL/call limits and stop rules.
- [x] DB probes/tests started only after explicit current approval for the exact local target and caps.

### Task 1: Targeted regression before implementation

Files: extend `src/lib/volunteers/repair/prepare.test.ts`; add `releaseGuards.database.test.ts`.

- [x] RED offline: reject labels, NUL/oversized comment, malformed reviewed body hash, unknown approval fields.
- [x] Add opt-in real PostgreSQL cases for extra default/custom grants, final ACL tamper, comment preservation, metadata/dependency drift, rollback and read-only script syntax. Full result verification remains pending real execution.
- [x] Real PG RED: retained old candidate, 6 pass / 7 fail; GREEN: v3 13 pass / 0 fail. Same case assertions; no skipped tests counted.

### Task 2: Minimal guard implementation and candidate

Files: new `releaseGuards.server.ts`; extend `prepare.server.ts` with `releaseSql` and validated metadata argument; new ignored candidate emitter and v2 review artifacts.

- [x] Add before catalog/ACL/default ACL/dependency checks and final owner/ACL checks in one DO envelope; real PG17.11 cases passed.
- [x] Capture full before profiles; comment restoration/readback and unchanged-profile assertions passed in the approved rollback-only DB.
- [x] Validate source input before emitting any SQL; retain legacy fragments solely for stage regressions.
- [x] Emit new immutable filename + hash + before/after object/ACL manifest. Never overwrite v1.
- [x] Adapt copies of PREFLIGHT/POSTFLIGHT/DEPENDENCIES to v2 expectations, leaving v1 untouched.

### Task 3: Scoped checks and delivery

- [x] Offline targeted RED→GREEN (9 pass), typecheck, lint, build with no .env/provider credentials; final source-bound receipts exit 0.
- [x] Approved owned DB identity/zero-data admission, PG RED→GREEN, three complete read-only scripts and independent catalog/result checks completed.
- [x] Final source-matched unit/typecheck/lint/build passed; no unrelated full suite or historical skipped tests rerun.
- [x] Commit gate satisfied by relevant verification and independent review. Actual local commit SHA belongs to its delivery receipt; no external release actions.

## Rulings / progress

2026-10-19: User explicitly authorized local implementation and scoped tests; no new design confirmation is needed. User's prohibition on unrelated full suites, cleanup, and unapproved DB operations overrides generic skill defaults. Prior Docker/DB authorization is not reused for this round's writes. A successful Docker metadata escalation does not authorize SQL.

2026-10-19: Found delimiter collision while reviewing supported comment preservation; reproduced an emitter-boundary RED before choosing collision-free dollar tags, then 9/9 offline GREEN. This is part of R2 safe metadata handling; it is not PostgreSQL runtime proof.

2026-10-19 historical checkpoint: SQL validation initially stopped at the approval boundary; no receipt or DB flag existed at that checkpoint. It is preserved in the immutable v2 evidence. The user subsequently explicitly approved the named local target and caps.

2026-10-19 execution: RED 10 fixtures/142 conservative submission reservations/2 role creations; GREEN 12 fixtures (including 2 diagnostics)/176 reservations/2 roles. All rollback, business writes 0, before/after catalog equal. Both ledgers closed, so no further DB calls are permitted without new approval.

Ruling: Correct the test/read-only catalog name from nonexistent volunteer_notification_outbox to actual volunteer_operation_outbox, confirmed by the initial owned-DB read. Keep original scripts/logs immutable; both phases use the same corrected queries. Cost if wrong: fixture admission/result checks fail rather than touching another DB.

Ruling: V2 normal diagnostic failed PG42601. Parenthesize the existing CASE expression in the IF condition; change no predicate/permission set. V3 probe and all 13 cases passed. Preserve v2 and the syntax failure; v3 requires its own future production approval. Cost if wrong: SQL admission or exact metadata assertion fails and rolls back.

Final review: independent reviewer found no Critical/Important issue; one stale-plan-status note was reconciled as part of this already-required delivery task. No SQL/test/external action was taken by the reviewer. Formal catalog, backup, HTTP/Preview/real staff UAT and nonempty-label preservation remain NOT_RUN; production remains HOLD.
