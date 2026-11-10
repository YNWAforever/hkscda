-- Database advisor hardening — 2026-11-10 production audit.
--
-- Closes the actionable findings from the Supabase security/performance advisors
-- without changing application behaviour. The advisory-only items (unused indexes,
-- unindexed foreign keys, multiple permissive policies, extensions in the public
-- schema, the primary-key-less archive table) are documented in
-- docs/database-advisors-2026-11-10.md instead of being rewritten here.

-- 1. Drift repair: the 2026-11-10 catch-up restore re-created the retired
--    4-argument review_sponsorship_payment_proof(uuid, text, uuid, text) overload
--    and it carries the default PUBLIC EXECUTE grant, so anon could reach it
--    through PostgREST RPC. The repository retired that overload in
--    20260911190000 and keeps only the exact 6-argument function, executable by
--    no client role (20260913071927). Drop the stale overload and restate the
--    grant on the intended one.
drop function if exists public.review_sponsorship_payment_proof(uuid, text, uuid, text);

revoke all on function public.review_sponsorship_payment_proof(
  uuid,
  text,
  uuid,
  text,
  jsonb,
  uuid
) from public, anon, authenticated, service_role;

-- 2. Trigger-only functions: give them an explicit search_path (advisor 0011)
--    and remove the client EXECUTE grant. Triggers fire regardless of EXECUTE
--    privilege, and a trigger-returning function cannot be called through RPC.
alter function public.set_updated_at() set search_path = '';

revoke execute on function public.volunteer_policy_contact_tasks()
from
  public,
  anon,
  authenticated;

-- 3. Private validation helpers are called only from CHECK constraints and
--    reference private.* and pg_catalog objects only, so an empty search_path is
--    sufficient and matches the stricter house pattern (20260719120000).
alter function private.is_adoption_instruction_plain_text(text, integer)
set search_path = '';

alter function private.has_exact_jsonb_keys(jsonb, text[])
set search_path = '';

alter function private.is_valid_adoption_instruction_content(jsonb)
set search_path = '';

-- 4. audit_log has carried the same (action, timestamp desc) index twice since
--    20260628143000. Keep the later name; queries order by columns, not index
--    names, so dropping the earlier duplicate is behaviour-neutral.
drop index if exists public.audit_action_timestamp_idx;
