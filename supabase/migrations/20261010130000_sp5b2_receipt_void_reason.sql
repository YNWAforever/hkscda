-- SP-5b-2 M1: voiding a receipt records the reason staff gave.
-- Backward compatible (plan D1): p_reason defaults to null and the audit row then keeps the
-- 'manual' reason the previous definition always stored, so the deployed app keeps working.
-- The body is the r01 definition verbatim apart from the added argument and the reason expression.
drop function if exists public.void_receipt_with_audit(uuid, uuid, uuid);

create function public.void_receipt_with_audit(
  p_receipt_id uuid,
  p_actor uuid,
  p_supporter_id uuid default null,
  p_reason text default null
)
returns table (receipt_id uuid, pdf_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipt%rowtype;
  v_voided_at timestamptz;
begin
  perform 1 from auth.users u
  where u.id = p_actor
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())
  for share;
  if not found then
    raise exception 'receipt_void_admin_required' using errcode = '42501';
  end if;

  perform 1 from public.admin_user a
  where a.auth_user_id = p_actor
    and a.status = 'active'
    and a.role in ('treasurer', 'admin')
  for share;
  if not found then
    raise exception 'receipt_void_admin_required' using errcode = '42501';
  end if;

  select * into v_receipt
  from public.receipt
  where id = p_receipt_id
  for update;
  if not found or v_receipt.status <> 'issued' then
    raise exception 'receipt_not_issued' using errcode = '22023';
  end if;
  if p_supporter_id is not null and p_supporter_id <> v_receipt.supporter_id then
    raise exception 'receipt_supporter_mismatch' using errcode = '22023';
  end if;

  v_voided_at := pg_catalog.clock_timestamp();
  update public.receipt
  set status = 'void', voided_at = v_voided_at, voided_by = p_actor
  where id = v_receipt.id;

  insert into public.audit_log(actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor, 'receipt.void', 'receipt', v_receipt.id::text,
    pg_catalog.jsonb_build_object(
      'voidedAt', v_voided_at,
      'supporterId', v_receipt.supporter_id,
      'reason', coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'manual')
    )
  );

  return query select v_receipt.id, v_receipt.pdf_url;
end;
$$;

revoke all on function public.void_receipt_with_audit(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.void_receipt_with_audit(uuid,uuid,uuid,text) to service_role;
