# Release slice 02 — server checkout admission (T03) and payment availability read (T04 partial)

Branch: `codex/audit-payment-policy-20260927`, stacked on draft PR #134. Main/production baseline for this work remains `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`. The first PR's CI verify, RLS, brand, accessibility and performance jobs passed. This branch is not merged or deployed.

## Diff and behavior

- New `checkout_policy` singleton is inserted **disabled** and `checkout_method_approval` has **no seed approvals**. Only an approved, visible, published config at the requested version can admit a new checkout. The service invokes the service-role-only `admit_new_checkout` RPC before identity, donation, payment, or provider side effects.
- Only audited, versioned treasurer/admin functions can change the policy or method approvals; app credentials cannot directly update those tables. The RPC serializes policy/config reads against revocation, stores an idempotent admission, rejects changed intent fingerprints, and allows an already admitted intent to resume after later disable. Webhooks, reconciliation and receipts do not call this new admission RPC.
- Donor page reads the server policy projection and sends the approved config version. It distinguishes disabled, unconfigured and temporarily unavailable states. The client build flag is no longer an independent authority. Payment config read errors and malformed rows cannot look like an ordinary empty configuration.
- `vercel.json` disables automatic Git preview deployment for `codex/audit-*` branches. PR #134's earlier automatically created preview returned a Vercel SSO redirect to an unauthenticated HEAD request; it was not used for acceptance.

## Evidence

- Reproduction: `bun test src/lib/donations/service.test.ts -t disabled_policy_has_zero_side_effects` exited 1 before the service change; resolved despite disabled repository admission.
- Focused policy/service/donor/API tests: 33 pass, exit 0. Checkout projection tests: 5 pass, exit 0. Payment availability tests: 5 pass, exit 0.
- Dedicated, unlinked Supabase stack on loopback `127.0.0.1:57322`: migration `20260927120000_checkout_policy_gate.sql` applied with `bunx supabase migration up --local`, exit 0; SQL test 1 pass, 21 expectations, exit 0. It exercised disabled, absent/disabled approval, stale version, hidden/draft/archived config, revocation-before-admission lock race, admitted replay after disable, changed fingerprint conflict, legacy seed rejection, audited staff toggles, and anon/authenticated EXECUTE denial.
- `bun run typecheck`: exit 0. `bun run lint`: exit 0, 52 existing warnings. `bun run build`: exit 0, existing route/code split and bundle warnings. Initial full `bun test --isolate`: 5 fixture regressions, exit 1; fixture repair focused tests 16 pass, exit 0; rerun full suite 2,799 pass, 83 skip, 0 fail, exit 0.

## Release boundary and rollback

The migration depends on `payment_public_config` and all T01 schema prerequisites. It does not activate payment. Rehearse it on a current isolated catalog with a data-bearing snapshot before any production migration. No production database write, provider charge, email, refund or content publication was performed.

To stop **new** checkouts after an approved activation, disable `checkout_policy.enabled` in a controlled, audited transaction. Preserve `checkout_admission`, donation and payment rows so existing webhooks, reconciliation and retries continue; do not roll back by deleting admissions or payment history. Rolling back app code while the new policy is enabled would remove its server check, so switch it off before any code rollback.

## Required staff and release checks

1. Finance/operations approve each provider mode and exact published config ID/version for each purpose; verify account/instructions, callbacks, webhook signatures and sandbox credentials. No current method approval row is seeded.
2. Run sandbox success, cancel, delayed callback, duplicate callback, reconciliation, receipt and notification failure scenarios against the approved config. These are **not-run** in this slice.
3. Complete T04 payment instruction snapshots and remove hard-coded manual/email account details; complete T05 delivery state separation.
4. Complete T01 catalog/constraints/grants/storage rehearsal and T02 readiness/alerts, then obtain the repository's explicit release approval. Do not merge main, run a production migration or enable payment from this PR.
