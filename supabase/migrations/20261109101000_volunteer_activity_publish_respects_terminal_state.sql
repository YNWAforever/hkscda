-- OPS-01 (audit 2026-11-09): the legacy activity PATCH must not resurrect a closed session.
--
-- `update_volunteer_activity_with_audit` (20260914160736:240-247) wraps the pre-bulk update only
-- to stop a supported publish of an unbound legacy draft (BUG-29). It accepts any status the
-- caller sends, and the base update has no status machine, so the legacy volunteers table's one
-- toggle can move a `cancelled` activity straight back to `published`. Cancelling is the
-- terminal bulk command: it records a required reason, cancels the registrations and audits each
-- one (20260914160736:91-104). Reviving the activity that way re-lists a session the association
-- cancelled (if `starts_at` is still in the future), keeps the cancelled registrations cancelled
-- and skips the previewed-policy rebind that a real publication needs.
--
-- Redefined from 20260914160736 with one guard added ahead of the existing BUG-29 branch:
-- `cancelled` and `closed` are terminal for the rebind command too (`20260914160736:82` refuses
-- `status not in ('draft','published')` with `activity_closed`), so publishing out of them is
-- refused with the same code. Everything else — the advisory lock, the actor check, the
-- unbound-draft refusal, the delegation to `update_volunteer_activity_before_bulk`, the pinned
-- `search_path` and the service-role-only grants — is unchanged.
create or replace function public.update_volunteer_activity_with_audit(p_activity_id uuid,p_actor_user_id uuid,p_expected_updated_at timestamptz,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));perform public.volunteer_bulk_admin(p_actor_user_id);
 if p_input->>'status'='published' and (select status from public.volunteer_activity where id=p_activity_id) in('cancelled','closed') then return jsonb_build_object('kind','invalid','reason','activity_closed');end if;
 if p_input->>'status'='published' and exists(select 1 from public.volunteer_activity where id=p_activity_id and (policy_version_id is null or template_key is null or shelter_key is null)) then return jsonb_build_object('kind','invalid','reason','target_date_preview_required');end if;
 return public.update_volunteer_activity_before_bulk(p_activity_id,p_actor_user_id,p_expected_updated_at,p_input);
end $$;
revoke all on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) to service_role;
