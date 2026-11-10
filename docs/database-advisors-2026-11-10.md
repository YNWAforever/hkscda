# Database advisor triage — 2026-11-10

Supabase's database advisors were run against production (`iihqjzilgawhfdhdevam`) on
2026-11-10 as the follow-through on the admin audit. This note records what was fixed,
what is intentionally accepted, and how to re-check it.

## Result

| Kind        | Total | INFO | WARN | Fixed here | Accepted / documented                                                                                                              |
| ----------- | ----- | ---- | ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Security    | 121   | 110  | 11   | 6 findings | `extension_in_public` ×2, `rls_enabled_no_policy` ×110                                                                             |
| Performance | 244   | 231  | 13   | 1 finding  | `unindexed_foreign_keys` ×145, `unused_index` ×85, `multiple_permissive_policies` ×10, `auth_rls_initplan` ×2, `no_primary_key` ×1 |

## Fixed in `20261110160000_advisor_hardening.sql`

| Advisor finding                                                        | Object                                                                                                                                                                                        | Fix                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anon_security_definer_function_executable` / `authenticated_…` (WARN) | `public.review_sponsorship_payment_proof(uuid, text, uuid, text)`                                                                                                                             | The catch-up restore re-created this overload, which the repo retired in `20260911190000`; only the exact 6-argument function is intended, and it is revoked from every client role. The stale overload is dropped and the grants on the intended function restated. No production object depended on it. |
| `function_search_path_mutable` (WARN)                                  | `public.set_updated_at()`, `private.is_adoption_instruction_plain_text(text, integer)`, `private.has_exact_jsonb_keys(jsonb, text[])`, `private.is_valid_adoption_instruction_content(jsonb)` | Explicit `search_path = ''` (bodies use only `pg_catalog` builtins and schema-qualified references).                                                                                                                                                                                                      |
| `anon_security_definer_function_executable` (WARN)                     | `public.volunteer_policy_contact_tasks()`                                                                                                                                                     | Trigger-only function: `EXECUTE` revoked from `public`, `anon` and `authenticated` (trigger firing does not check EXECUTE).                                                                                                                                                                               |
| `duplicate_index` (WARN)                                               | `public.audit_log`                                                                                                                                                                            | `audit_action_timestamp_idx` and `audit_log_action_timestamp_idx` were the same `(action, timestamp desc)` index; the earlier duplicate is dropped.                                                                                                                                                       |

Auth-side hardening: the minimum password length is aligned with the admin app's
`ADMIN_PASSWORD_MIN_LENGTH = 8` (`password_min_length = 8`, applied 2026-11-10).
Leaked-password protection (`password_hibp_enabled`) could **not** be enabled: the
Management API answers `402 HaveIBeenPwned.org is available on Pro Plans and up`, and this
project is on the Free plan. It is recorded below as a plan-gated residual.

## Accepted (with reason)

- **`rls_enabled_no_policy` ×110 (INFO).** These are service-role-only tables (admin,
  publishing, queue and archive tables). RLS is enabled with no policies on purpose: it
  denies every client role, and only the service role (which bypasses RLS) reads them.
  The linter reports them as informational; adding policies would create access that is
  not wanted.
- **`extension_in_public` ×2 (`citext`, `pg_trgm`, WARN).** Moving an extension between
  schemas rewrites dependent types/operators and index expressions across many tables
  for no behavioural gain. Both extensions are trusted and only callable by SQL that the
  app controls; tracked as a future infrastructure task rather than changed in a data
  migration.
- **`unindexed_foreign_keys` ×145 (INFO).** Mostly low-volume configuration/archive
  tables and FKs whose delete path is `on delete restrict`/never exercised. Adding 145
  indexes would slow writes and bloat storage. Revisit with real query statistics
  (e.g. `pg_stat_user_indexes`/`pg_stat_all_tables`) if a specific delete or join
  becomes slow.
- **`unused_index` ×85 (INFO).** `idx_scan = 0` since the last statistics reset; that is
  not enough evidence to drop indexes that back infrequent admin/reporting queries.
  Needs a full statistics window before pruning.
- **`multiple_permissive_policies` ×10 (WARN).** Several admin tables have separate
  per-command policies that are intentionally permissive for different role sets; the
  advisor's OR-of-policies note is a micro-optimisation, not a correctness issue.
- **`auth_rls_initplan` ×2 (WARN, `payment_public_config`).** The `auth.uid()` subquery
  in the insert/update policies is evaluated per row; the table is admin-only and small,
  so this is not worth rewriting the policy security expressions in this batch.
- **`auth_leaked_password_protection` ×1 (WARN).** Supabase gates HaveIBeenPwned password
  checking behind the Pro plan; the API returns HTTP 402 on this project. Enable it in the
  dashboard once the plan includes it. Admin passwords are only created through the
  invite/reset flow with the app's own 8-character minimum, and sessions are short-lived
  and revoked server-side, which bounds the exposure in the meantime.
- **`no_primary_key` ×1 (`public.recipient_notification_draft_duplicate_archive`).**
  Append-only archive table written through a single audited path; a surrogate PK has no
  consumer. Left as-is.

## Re-check

```sh
# Management API with a Supabase CLI access token
curl -s -H "Authorization: Bearer $SST" \
  https://api.supabase.com/v1/projects/iihqjzilgawhfdhdevam/advisors/security
curl -s -H "Authorization: Bearer $SST" \
  https://api.supabase.com/v1/projects/iihqjzilgawhfdhdevam/advisors/performance
```

Expected after this batch: security WARN has the two `extension_in_public` entries plus
the plan-gated `auth_leaked_password_protection` (113 total: 110 INFO + 3 WARN);
performance WARN keeps the accepted items above and no `duplicate_index`
(242 total: 230 INFO + 12 WARN).
