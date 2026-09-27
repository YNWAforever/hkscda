-- Run only against an isolated database after applying the fee reorder migration.
-- This file rolls back all synthetic rows, test triggers, and audit entries.
begin;
create function public.inject_fee_reorder_failure()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  step integer;
  fail_at integer;
begin
  if new.id::text in (
    current_setting('test.first_fee_id', true),
    current_setting('test.second_fee_id', true)
  ) then
    step := coalesce(nullif(current_setting('test.step', true), '')::integer, 0) + 1;
    perform set_config('test.step', step::text, true);
    fail_at := coalesce(nullif(current_setting('test.fail_at', true), '')::integer, 0);
    if step = fail_at then
      raise exception 'Injected fee update failure %', step using errcode = 'P7777';
    end if;
  end if;
  return new;
end;
$$;
create trigger inject_fee_reorder_failure
before update on public.adoption_fees
for each row execute function public.inject_fee_reorder_failure();

do $$
declare
  actor uuid;
  staff_id uuid := gen_random_uuid();
  treasurer_id uuid := gen_random_uuid();
  disabled_id uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  third_id uuid := gen_random_uuid();
  cat_id uuid := gen_random_uuid();
  dog_base integer;
  cat_base integer;
  audit_before integer;
  result jsonb;
  fail_at integer;
  fee_row public.adoption_fees%rowtype;
begin
  select auth_user_id into actor from public.admin_user
  where role in ('staff', 'admin') and status = 'active' limit 1;
  if actor is null then raise exception 'Isolated active actor fixture required'; end if;
  select coalesce(max(sort_order), 0) + 10 into dog_base
    from public.adoption_fees where animal_type = 'dog';
  select coalesce(max(sort_order), 0) + 10 into cat_base
    from public.adoption_fees where animal_type = 'cat';
  insert into public.adoption_fees
    (id, animal_type, item_name, price_hkd, sort_order, is_published)
  values
    (first_id, 'dog', 'Synthetic A', 'HK$100', dog_base, true),
    (second_id, 'dog', 'Synthetic B', 'HK$200', dog_base + 1, true),
    (third_id, 'dog', 'Synthetic C', 'HK$300', dog_base + 2, true),
    (cat_id, 'cat', 'Synthetic Cat', 'HK$400', cat_base, true);
  perform set_config('test.first_fee_id', first_id::text, true);
  perform set_config('test.second_fee_id', second_id::text, true);
  select count(*) into audit_before from public.audit_log
    where entity = 'adoption_fee' and entity_id = first_id::text;

  for fail_at in 1..3 loop
    perform set_config('test.fail_at', fail_at::text, true);
    perform set_config('test.step', '0', true);
    begin
      perform public.reorder_adoption_fees_with_audit(actor, first_id, second_id, 1, 1);
      raise exception 'Expected injected failure at step %', fail_at;
    exception when sqlstate 'P7777' then null;
    end;
    if (select sort_order <> dog_base or version <> 1 from public.adoption_fees where id = first_id)
      or (select sort_order <> dog_base + 1 or version <> 1 from public.adoption_fees where id = second_id)
      or (select count(*) from public.audit_log where entity = 'adoption_fee'
            and entity_id = first_id::text) <> audit_before then
      raise exception 'Rollback failed after update step %', fail_at;
    end if;
  end loop;
  perform set_config('test.fail_at', '0', true);
  perform set_config('test.step', '0', true);

  result := public.reorder_adoption_fees_with_audit(actor, first_id, second_id, 1, 1);
  if jsonb_array_length(result) <> 2
    or (select sort_order <> dog_base + 1 or version <> 3 from public.adoption_fees where id = first_id)
    or (select sort_order <> dog_base or version <> 2 from public.adoption_fees where id = second_id)
    or (select count(*) from public.audit_log where entity = 'adoption_fee'
        and entity_id = first_id::text and action = 'adoption_fee.reorder') <> 1
    or exists (select 1 from public.adoption_fees where animal_type = 'dog'
               and sort_order = dog_base + 3) then
    raise exception 'Atomic swap, versions, audit, or temporary position assertion failed';
  end if;
  raise notice 'atomic swap: 3 injected failures rolled back; one successful audit; no spare position';

  begin
    perform public.reorder_adoption_fees_with_audit(actor, first_id, second_id, 1, 1);
    raise exception 'Expected stale conflict';
  exception when sqlstate 'P4091' then null;
  end;
  begin
    perform public.reorder_adoption_fees_with_audit(actor, second_id, third_id, 2, 1);
    raise exception 'Expected nonadjacent conflict';
  exception when sqlstate 'P4091' then null;
  end;
  begin
    perform public.reorder_adoption_fees_with_audit(actor, first_id, cat_id, 3, 1);
    raise exception 'Expected species conflict';
  exception when sqlstate 'P4091' then null;
  end;
  begin
    perform public.reorder_adoption_fees_with_audit(gen_random_uuid(), first_id, second_id, 3, 2);
    raise exception 'Expected actor rejection';
  exception when sqlstate '42501' then null;
  end;

  result := public.update_adoption_fee_content_with_audit(
    actor, first_id, 3, 'Synthetic A edited', 'HK$101');
  if (result->>'version')::integer <> 4
    or (select sort_order <> dog_base + 1 from public.adoption_fees where id = first_id)
    or (select count(*) from public.audit_log where entity = 'adoption_fee'
        and entity_id = first_id::text and action = 'adoption_fee.update') <> 1 then
    raise exception 'Content update changed sort or did not audit';
  end if;
  begin
    perform public.update_adoption_fee_content_with_audit(
      actor, first_id, 3, 'Stale', 'HK$0');
    raise exception 'Expected content version conflict';
  exception when sqlstate 'P4091' then null;
  end;
  update public.adoption_fees set item_name = 'Legacy writer' where id = first_id
    returning * into fee_row;
  if fee_row.version <> 5 then raise exception 'Legacy version bump failed'; end if;
  insert into public.admin_user (auth_user_id, email, role, status)
  values
    (staff_id, 'fee-staff+' || staff_id || '@example.invalid', 'staff', 'active'),
    (treasurer_id, 'fee-treasurer+' || treasurer_id || '@example.invalid', 'treasurer', 'active'),
    (disabled_id, 'fee-disabled+' || disabled_id || '@example.invalid', 'staff', 'disabled');
  begin
    perform public.reorder_adoption_fees_with_audit(treasurer_id, first_id, second_id, 5, 2);
    raise exception 'Expected treasurer rejection';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.reorder_adoption_fees_with_audit(disabled_id, first_id, second_id, 5, 2);
    raise exception 'Expected disabled staff rejection';
  exception when sqlstate '42501' then null;
  end;
  result := public.reorder_adoption_fees_with_audit(staff_id, first_id, second_id, 5, 2);
  if jsonb_array_length(result) <> 2
    or (select count(*) from public.audit_log where action = 'adoption_fee.reorder'
       and entity_id = first_id::text) <> 2 then
    raise exception 'Active staff did not complete the audited swap';
  end if;
  raise notice 'stale, cross-species, nonadjacent, role matrix, content and legacy-version checks passed';
end;
$$;

select proname, pg_get_function_identity_arguments(oid) as signature,
       has_function_privilege('anon', oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', oid, 'EXECUTE') as service_execute
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('reorder_adoption_fees_with_audit', 'update_adoption_fee_content_with_audit')
order by proname;
rollback;
