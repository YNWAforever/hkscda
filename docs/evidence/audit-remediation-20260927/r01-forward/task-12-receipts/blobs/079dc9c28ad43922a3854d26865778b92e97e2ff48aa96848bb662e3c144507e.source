-- Issue a manual receipt and record the operator action in one transaction.
-- The underlying issue_receipt function locks the donation and allocates idempotently.
create function public.issue_receipt_with_audit(
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
  if not exists (
    select 1 from public.admin_user
    where auth_user_id = p_actor
      and status = 'active'
      and role in ('treasurer', 'admin')
  ) then
    raise exception 'receipt_issue_admin_required' using errcode = '42501';
  end if;

  select * into v_receipt
  from public.issue_receipt(
    p_donation_id, p_supporter_id, p_amount_cents, p_tax_year, p_issued_at
  );
  if not found then
    raise exception 'receipt_issue_returned_no_row' using errcode = '22023';
  end if;

  -- A retry after PDF upload failure must not create a second issue fact.
  if not exists (
    select 1 from public.audit_log a
    where a.action = 'receipt.issue'
      and a.entity = 'donation'
      and a.entity_id = p_donation_id::text
      and a.actor_user_id = p_actor
      and a.detail ->> 'receiptNo' = v_receipt.receipt_no
  ) then
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
  from public, anon, authenticated;
grant execute on function public.issue_receipt_with_audit(uuid, uuid, integer, integer, timestamptz, uuid)
  to service_role;
