# Volunteer isolated local database acceptance

**Goal:** Execute the user's approved local-only DB/Auth, draft-migration and volunteer job/overview acceptance from `e51f536d`, on branch `codex/isolated-test-db-20261025`.

**Authority:** The user explicitly approved a new local Postgres/Supabase stack, synthetic data, applying the draft migration and running admin rerun/statistics/overview acceptance. No production DB/Auth, push, merge or deployment. The protected preview grant is separate and unused; prior incident HOLDs remain unchanged.

**Approach:** Create a fresh local PostgreSQL project with a unique ID, new Docker volumes, container-local service ports and an internal Docker network. The Supabase CLI default ECR distribution was denied by policy, so use an independent official PostgreSQL 17 image plus standalone local Auth/PostgREST/gateway dependencies from allowed package sources; never retry or route around the denied ECR registry. Start with no application schema or seed. Validate container/network/volume identity and SQL system identifier before schema or fixture writes. Apply the explicitly scoped volunteer fixture schema and the draft only to that verified target; use actual local Auth and PostgREST for the application handlers. Browser acceptance renders the real components against those handlers. No external mail/payment providers or application credentials are loaded.

## Boundaries

- Preserve the original branch, commits, reports, lockfile and incident evidence. New local commits only.
- Do not use repository `.env`, linked project refs or old credential files. Local generated keys/passwords remain in untracked private setup files and are never printed in evidence.
- All schema/fixture writes require the new project's container ID, fresh volume labels, local host/ports, project ID and stored database system identifier to match.
- No shared/old database, baseline restore, original OV-RO or production recovery scripts. Never use `supabase link`, cloud login, remote push/reset or production Auth.
- Record exact row counts, role identities, worker/audit results and negative cases. Local execution does not prove the hosted incident root cause or resolution.

## Execution ledger

- [x] Provision minimal isolated stack and record physical/SQL identity, with an empty initial DB/Auth state.
- [x] Apply source schema and the audited retry draft; verify installed signature/search_path/ACL. Seed only bounded synthetic admin/staff/treasurer/worker and volunteer data after identity checks.
- [x] Run actual DB/RPC tests: current failed admin retry, duplicate/stale/hour/lease rejection, audit rollback and finish acknowledgement; verify role denials and safe health projection.
- [x] Run DB-backed overview/statistics retry and real rendered browser confirmation/refresh acceptance, checking persisted counts and audit rows. No mocked success for DB-dependent outcomes.
- [x] Fix any reproducible scoped defect with RED→GREEN; run relevant tests/typecheck/lint/build if product code changes. Do not repeat unaffected full suites for setup activity.
- [x] Save reproducible local setup/test instructions, evidence and local commit. Keep the target isolated; report actual PASS/FAIL/NOT_RUN and remaining hosted-only limitations.

**Review focus:** Identity checks before writes; fresh synthetic provenance; non-finite/current/running lease rejection; exact timestamp/actor fence; atomic audit rollback; one successful owner under concurrent claims; actual worker completion and safe counts; actual Auth versus synthetic mocks; no outbound providers or production bindings.

## Evidence and scope reconciliation

- Active target: `hkscda-volunteer-local-05f9a731e8`, DB system identifier `7700512950460022828`. All five service bindings checked on one Docker `--internal` network. Actual host is `db:5432` within that network; requested loopback publishing is not active. No host-port availability claim.
- Fresh empty volume/platform identity was established before schema writes. Real GoTrue/Storage generated their schemas. 191 source migrations plus the retry draft applied; unmodified volunteer R01 guard passed. Ten unrelated migrations remain NOT_APPLIED. The full finance guard failure is preserved, not bypassed or reported as passed.
- Native: 18 cases passed. The authenticated EXECUTE denial was independently tightened in final verification so no table-read denial could masquerade as an RPC denial; actual authenticated GoTrue/PostgREST call returned 403/42501.
- Actual browser: table-lock timeout/partial figures/selective recovery; confirmation cancel/blank reasons; stale 409; atomic audit failure 500 preserving reason and row; synchronous double-click protection; one successful worker run; refresh, persisted counts and roles. No mocked responses, external origins or page errors.
- Integration found a real overview contract mismatch: API `approved` / `policy_version_id` versus old UI `approved_participants` / `policy`. Updated fixtures failed before the fix; shared row type and correct fields make 19 component tests pass. Final DB-backed browser checks zero confirmed participants and bound policy correctly, at 320/390/1280 px.
- An initial local GoTrue bootstrap omitted its default Auth role. Only the six verified synthetic users were corrected through local GoTrue; the harness now seeds `authenticated` explicitly. No production/security-policy change. Final direct authenticated RPC denial is proven on a real local token.
- Final type/lint/test/build, independent review and local commit are tracked in the delivery report, with limitations and exact counts.

Final verification: product/harness typechecks PASS; product lint0errors52warnings, harness lint0warnings; full suite7,359pass727skip0fail; buildPASS. The first full-suite environment-contamination failure and recovery are preserved. Independent review found no Critical/Important defects; final verification conditions are now resolved. Final physical/SQL/browser reads after all checks reconfirmed fixture counts, direct authenticated RPC403/42501 and zero extra worker runs. Local commit/fingerprint: see delivery manifest.
