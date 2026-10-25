# Isolated volunteer acceptance inside this environment

This is an opt-in local test harness, not deployment configuration. It uses a fresh
Docker volume, an `--internal` network, real PostgreSQL 17, GoTrue, PostgREST and
Storage API. Application handlers and `/admin/volunteers` are the actual Vite app.
Only generated `example.invalid` accounts and synthetic volunteer records are used.
No cloud project, existing application dotenv file, provider key or original Auth
session is loaded. Never run these scripts against a shared or production target.

## Retained target from this task

- Branch: `codex/isolated-test-db-20261025`, based on
  `e51f536d2094b9acd2a33860f121a0bc6f34a42c`.
- Private state/evidence:
  `/workspace/.hkscda-tools/volunteer-local-db-20261025/target-v3`.
- Project identity: `hkscda-volunteer-local-05f9a731e8` (a local fixture label,
  not a hosted Supabase project ref).
- PostgreSQL database `postgres`, system identifier `7700512950460022828`.
- DB host `db:5432` on internal network `hkscda-isolated-05f9a731e8`;
  container `hkscda-volunteer-local-05f9a731e8-db`.
- App container `hkscda-volunteer-local-05f9a731e8-app`: the browser, Vite
  `http://127.0.0.1:59330` and local gateway `http://127.0.0.1:59321` run inside it.
  This Docker configuration records requested loopback publishing but does not
  expose those ports from its internal network. Use `docker exec`; do not assume
  that the host can browse these addresses.
- `target-proof.json` records all five containers, image IDs, their exact internal
  network, actual DB bindings, volume creation and SQL identity. It omits secrets.
- `private.json` and `*.env` contain newly generated **local** credentials, mode
  0600, outside Git. Do not print, attach or commit them.

Read-only verification of the retained target:

```sh
python3 scripts/local-volunteer/proof.py /workspace/.hkscda-tools/volunteer-local-db-20261025/target-v3
python3 scripts/local-volunteer/exec.py /workspace/.hkscda-tools/volunteer-local-db-20261025/target-v3 verify
```

`verify` uses real synthetic login sessions and performs a denied direct RPC call;
no job execution or fixture reset. It saves fresh screenshots and final counts.

Do not rerun `seed`, `native` or `browser-worker` on this completed fixture. The
phase/audit/attempt guards intentionally reject resets and duplicate execution.
An interrupted worker attempt requires inspection of `worker-attempt.json`, its
job row and audit before any next action. There is no automatic mutation retry.

## New target reproduction, when separately desired

The retained target was constructed and tested in this environment. The final
factory script has received static checks; **a second fresh-target restore of the
final factory has not been executed**. There is no automatic startup or reset.

Prerequisites: the local Docker Unix socket, Python 3, the repository's existing
lockfile-installed dependencies at `/workspace/.hkscda-tools/node_modules`, and
`hkscda-tests:node24-chrome` (Node 24, Bun 1.3.14, Chrome 156). The existing image
recipe is `/workspace/.hkscda-tools/Dockerfile.tests`; follow the managed runtime
skill for proxy/CA build configuration rather than changing network policy.
`run-app.py` copies the host's Noto CJK font into the target's private font directory
for Chromium screenshots; it does not change the app's styles.

The four database service images used here are:

| Service    | Image                          | Recorded digest                                                           |
| ---------- | ------------------------------ | ------------------------------------------------------------------------- |
| PostgreSQL | `postgres:17-bookworm`         | `sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27` |
| Auth       | `supabase/gotrue:v2.179.0`     | `sha256:658cf69f57d48e10cbe508a79874e6067348b82a4d216a0bb446c067d7a246f9` |
| REST       | `postgrest/postgrest:v13.0.7`  | `sha256:0a46780309a604cdc8b56c776c6e5e15788ce58174d709e40459ab5a2d44d228` |
| Storage    | `supabase/storage-api:v1.28.1` | `sha256:3e7695847c673e3355ecb86e5cce6969ffb403980ec2e1ac6ce480d41be40a48` |

Provisioning resolves the locally installed tags and records the resulting digest
and image ID before starting them. Reproduction must first compare those IDs with
the table above; tags may move. Do not fetch a denied registry through another
route. The Supabase CLI's `public.ecr.aws` pull was denied; this harness uses the
independent official PostgreSQL distribution from the permitted Docker Hub source.

Choose a new directory outside Git; existing directories/volumes are never reused.
The commands below are a sequence, not a request to execute another test run:

```sh
python3 scripts/local-volunteer/init.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET
python3 scripts/local-volunteer/provision.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET
# Wait for local Auth and Storage schema initialization; inspect only these new containers.
python3 scripts/local-volunteer/apply-schema.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET --volunteer-only
python3 scripts/local-volunteer/run-app.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET
python3 scripts/local-volunteer/exec.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET seed
python3 scripts/local-volunteer/run-app.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET --vite
# Wait for the actual Vite ready message before browser checks.
python3 scripts/local-volunteer/exec.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET native
python3 scripts/local-volunteer/exec.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET browser-stats
python3 scripts/local-volunteer/exec.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET browser-worker
python3 scripts/local-volunteer/exec.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET verify
python3 scripts/local-volunteer/proof.py /workspace/.hkscda-tools/NEW-LOCAL-TARGET
```

The native and browser worker tests must use the current hour seeded by `seed`.
If the hour changes, they fail closed; inspect state instead of silently replacing
or backdating jobs. `--vite` should be invoked only once per app container.

## Schema scope and acceptance budget

This is a **volunteer fixture baseline**, not a full application schema replica.
191 source migrations and the unchanged audited retry draft were applied. The
volunteer R01 admission guard passed unchanged. A full replay stopped at the
unrelated finance prerequisite guard because the `extensionMembers` array order
differed (all 136 member objects were equal as sets). That guard was not disabled,
modified or marked as passed. Ten unrelated later migrations are NOT_APPLIED;
see `schema-scope.json` and the delivery report. Auth/Storage use their real local
service migrations; standard platform roles/default grants are supplied explicitly
because the official PostgreSQL image does not include Supabase platform bootstrap.

The draft remains in `supabase/drafts`, outside auto migrations. It has been applied
only to this local target. Do not infer cloud schema readiness from this acceptance.

Budget: six Auth accounts (admin, fixed admin worker, staff, treasurer, two
volunteers), four active admin records, two pending profiles, one published policy
version, two runtime buckets, zero registrations, zero notification outbox rows.
Native concurrency admits one claim and finishes it as synthetic failure without
running the worker. Browser audit-failure injection rolls back another claim. One
successful normal worker run generates two activities. Two retry audit records
persist (native + browser), with the requester actor; generated domain audit uses
the fixed worker actor. No external provider call is made.

Native negatives use rollback transactions; browser failures use a test-owned
`local_acceptance` trigger removed in `finally`. Final verification checks that no
such trigger/function remains. Generic `checks.py` runs the suite with
`SUPABASE_LOCAL_URL=http://127.0.0.1:1`, so database-specific suites stay skipped;
the separate acceptance scripts provide the live local DB evidence.

## Preserved boundaries

No production DB/Auth, original OV-RO, push, merge, deployment or provider sends.
The earlier preview allowance remains unused. CONNECTOR-ID-01 UNKNOWN, P0-ID and
formal repair HOLDs are unchanged. This work demonstrates this local synthetic
journey; hosted root cause, production schema/config and hosted acceptance remain
unverified. Retired local setup attempts and their volumes are retained as evidence.
