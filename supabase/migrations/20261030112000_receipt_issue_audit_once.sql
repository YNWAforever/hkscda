-- BUG-49: issue_receipt_with_audit (last defined in 20261002170945_r01_finance_callback_forward)
-- skipped the receipt.issue audit row only when the SAME actor had already logged it. A second
-- treasurer issuing the same receipt, or a treasurer issuing a receipt the delivery job had
-- already issued, logged a second receipt.issue under someone who did not issue it.
--
-- issue_receipt reports already_existed = true whenever it returned an existing receipt instead
-- of allocating one, so the audit row is now written exactly when this call created the receipt,
-- in the same transaction. A retry after a PDF upload failure still writes nothing. Signature,
-- security definer, the empty search_path and the grants are unchanged.

create or replace function public.issue_receipt_with_audit(
  p_donation_id uuid,
  p_supporter_id uuid,
  p_amount_cents integer,
  p_tax_year integer,
  p_issued_at timestamptz,
  p_actor uuid
)
returns table (
  receipt_no text,
  receipt_id uuid,
  pdf_url text,
  tax_year integer,
  issued_at timestamptz,
  already_existed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt record;
begin
  perform 1 from auth.users u
  where u.id = p_actor
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())
  for share;
  if not found then
    raise exception 'receipt_issue_admin_required' using errcode = '42501';
  end if;

  perform 1 from public.admin_user a
  where a.auth_user_id = p_actor
    and a.status = 'active'
    and a.role in ('treasurer', 'admin')
  for share;
  if not found then
    raise exception 'receipt_issue_admin_required' using errcode = '42501';
  end if;

  select * into v_receipt
  from public.issue_receipt(
    p_donation_id, p_supporter_id, p_amount_cents, p_tax_year, p_issued_at
  );
  if not found then
    raise exception 'receipt_issue_returned_no_row' using errcode = '22023';
  end if;

  -- Only the call that created the receipt records the issue fact. A retry after a PDF upload
  -- failure, another treasurer, or a receipt the delivery job issued returns the existing row.
  if not v_receipt.already_existed then
    insert into public.audit_log(actor_user_id, action, entity, entity_id, detail)
    values (
      p_actor, 'receipt.issue', 'donation', p_donation_id::text,
      pg_catalog.jsonb_build_object(
        'receiptNo', v_receipt.receipt_no,
        'supporterId', p_supporter_id
      )
    );
  end if;

  return query select
    v_receipt.receipt_no::text,
    v_receipt.receipt_id::uuid,
    v_receipt.pdf_url::text,
    v_receipt.tax_year::integer,
    v_receipt.issued_at::timestamptz,
    v_receipt.already_existed::boolean;
end;
$$;

revoke all on function public.issue_receipt_with_audit(uuid, uuid, integer, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.issue_receipt_with_audit(uuid, uuid, integer, integer, timestamptz, uuid)
  to service_role;
