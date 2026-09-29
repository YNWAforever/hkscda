-- Additive fee versions preserve ordering conflicts across mixed old/new checkouts.
alter table public.adoption_fees
  add column if not exists version integer not null default 1
  constraint adoption_fees_version_positive check (version > 0);

create or replace function public.bump_adoption_fee_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.version = old.version then
    new.version := old.version + 1;
  elsif new.version <> old.version + 1 then
    raise exception 'Invalid fee version increment' using errcode = 'P4091';
  end if;
  return new;
end;
$$;
revoke all on function public.bump_adoption_fee_version()
  from public, anon, authenticated;
drop trigger if exists bump_adoption_fee_version on public.adoption_fees;
create trigger bump_adoption_fee_version
before update on public.adoption_fees
for each row execute function public.bump_adoption_fee_version();

create or replace function public.update_adoption_fee_content_with_audit(
  p_actor_user_id uuid,
  p_id uuid,
  p_expected_version integer,
  p_item_name text,
  p_price_hkd text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  fee public.adoption_fees%rowtype;
begin
  select * into actor from public.admin_user
  where auth_user_id = p_actor_user_id and status = 'active'
    and role in ('staff', 'admin');
  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;
  if p_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Fee id and positive version required' using errcode = '22023';
  end if;
  update public.adoption_fees set
    item_name = p_item_name,
    price_hkd = p_price_hkd
  where id = p_id and version = p_expected_version
  returning * into fee;
  if not found then
    if exists (select 1 from public.adoption_fees where id = p_id) then
      raise exception 'Fee version conflict' using errcode = 'P4091';
    end if;
    raise exception 'Adoption fee not found' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (p_actor_user_id, 'adoption_fee.update', 'adoption_fee', fee.id::text,
          jsonb_build_object('version', fee.version, 'item_name', fee.item_name,
                             'price_hkd', fee.price_hkd));
  return to_jsonb(fee);
end;
$$;
revoke all on function public.update_adoption_fee_content_with_audit(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.update_adoption_fee_content_with_audit(uuid, uuid, integer, text, text)
  to service_role;

create or replace function public.reorder_adoption_fees_with_audit(
  p_actor_user_id uuid,
  p_first_id uuid,
  p_second_id uuid,
  p_first_version integer,
  p_second_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  species text;
  first_fee public.adoption_fees%rowtype;
  second_fee public.adoption_fees%rowtype;
  first_order integer;
  second_order integer;
  temporary_order integer;
begin
  select * into actor from public.admin_user
  where auth_user_id = p_actor_user_id and status = 'active'
    and role in ('staff', 'admin');
  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;
  if p_first_id is null or p_second_id is null or p_first_id = p_second_id
     or p_first_version is null or p_second_version is null
     or p_first_version < 1 or p_second_version < 1 then
    raise exception 'Two distinct fee IDs and versions required' using errcode = '22023';
  end if;
  select animal_type into species from public.adoption_fees where id = p_first_id;
  if not found then
    raise exception 'Adoption fee not found' using errcode = 'P0002';
  end if;
  -- Serialize swaps within one species, then lock both rows in UUID order.
  perform pg_advisory_xact_lock(hashtext('adoption_fee_order'), hashtext(species));
  if p_first_id < p_second_id then
    select * into first_fee from public.adoption_fees where id = p_first_id for update;
    select * into second_fee from public.adoption_fees where id = p_second_id for update;
  else
    select * into second_fee from public.adoption_fees where id = p_second_id for update;
    select * into first_fee from public.adoption_fees where id = p_first_id for update;
  end if;
  if first_fee.id is null or second_fee.id is null then
    raise exception 'Adoption fee not found' using errcode = 'P0002';
  end if;
  if first_fee.animal_type <> species or second_fee.animal_type <> species
     or first_fee.version <> p_first_version
     or second_fee.version <> p_second_version then
    raise exception 'Fee version or species conflict' using errcode = 'P4091';
  end if;
  first_order := first_fee.sort_order;
  second_order := second_fee.sort_order;
  if first_order = second_order or exists (
    select 1 from public.adoption_fees
    where animal_type = species
      and sort_order > least(first_order, second_order)
      and sort_order < greatest(first_order, second_order)
  ) then
    raise exception 'Fees are not adjacent in one species' using errcode = 'P4091';
  end if;
  select max(sort_order) into temporary_order
  from public.adoption_fees where animal_type = species;
  if temporary_order = 2147483647 then
    raise exception 'No spare fee sort position' using errcode = 'P4091';
  end if;
  temporary_order := coalesce(temporary_order, -1) + 1;
  -- The spare position exists only inside this transaction. No external
  -- temporary sort value or intermediate audit row is exposed.
  update public.adoption_fees set sort_order = temporary_order
  where id = p_first_id returning * into first_fee;
  update public.adoption_fees set sort_order = first_order
  where id = p_second_id returning * into second_fee;
  update public.adoption_fees set sort_order = second_order
  where id = p_first_id returning * into first_fee;
  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (p_actor_user_id, 'adoption_fee.reorder', 'adoption_fee', p_first_id::text,
          jsonb_build_object('first_id', p_first_id, 'second_id', p_second_id,
            'first_order_before', first_order, 'second_order_before', second_order,
            'first_version_after', first_fee.version, 'second_version_after', second_fee.version));
  return jsonb_build_array(to_jsonb(first_fee), to_jsonb(second_fee));
end;
$$;
revoke all on function public.reorder_adoption_fees_with_audit(uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reorder_adoption_fees_with_audit(uuid, uuid, uuid, integer, integer)
  to service_role;
