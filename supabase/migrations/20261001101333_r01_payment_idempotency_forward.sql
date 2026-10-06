-- R01 Task 1: restore current intent projections without enabling checkout.
-- Historical rows stay nullable; no money, provider, audit, or receipt row is updated.
-- Existing columns/indexes/constraints must match the reviewed contracts exactly.
set local search_path = '';

do $repair$
declare
  target record;
  existing record;
  definition text;
  old_columns text;
  write_acl record;
  recipient text;
  historical_check constant text := 'CHECK ((((idempotency_key IS NULL) AND (idempotency_fingerprint IS NULL)) OR ((idempotency_key IS NOT NULL) AND (idempotency_fingerprint ~ ''^[0-9a-f]{64}$''::text))))';
  strict_check constant text := 'CHECK ((((idempotency_key IS NULL) AND (idempotency_fingerprint IS NULL)) OR ((idempotency_key IS NOT NULL) AND (idempotency_fingerprint IS NOT NULL) AND (idempotency_fingerprint ~ ''^[0-9a-f]{64}$''::text))))';
begin
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  lock table public.donation, public.payment in access exclusive mode;

  if exists (
    select 1 from pg_catalog.pg_class c
    where c.oid in ('public.donation'::pg_catalog.regclass, 'public.payment'::pg_catalog.regclass)
      and (c.relkind <> 'r' or not c.relrowsecurity or c.relowner <> 'postgres'::pg_catalog.regrole)
  ) then
    raise exception using errcode = '55000', message = 'R01 payment table owner/type/RLS precondition mismatch';
  end if;

  for target in select * from (values
    ('donation', 'idempotency_key', 'pg_catalog.uuid'::pg_catalog.regtype, 'uuid'),
    ('donation', 'idempotency_fingerprint', 'pg_catalog.text'::pg_catalog.regtype, 'text'),
    ('payment', 'idempotency_key', 'pg_catalog.uuid'::pg_catalog.regtype, 'uuid'),
    ('payment', 'checkout_url', 'pg_catalog.text'::pg_catalog.regtype, 'text'),
    ('payment', 'checkout_attempted_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, 'timestamptz')
  ) v(table_name, column_name, type_oid, type_sql)
  loop
    select a.atttypid, a.atttypmod, a.attnotnull, a.atthasdef, a.attidentity, a.attgenerated
      into existing from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.to_regclass('public.' || target.table_name)
        and a.attname = target.column_name and a.attnum > 0 and not a.attisdropped;
    if found then
      if existing.atttypid <> target.type_oid or existing.atttypmod <> -1
        or existing.attnotnull or existing.atthasdef
        or existing.attidentity <> '' or existing.attgenerated <> '' then
        raise exception using errcode = '55000', message = 'R01 existing payment intent column definition mismatch';
      end if;
    else
      execute pg_catalog.format('alter table public.%I add column %I %s', target.table_name, target.column_name, target.type_sql);
    end if;
  end loop;

  -- Unlike the historical CHECK, this expression cannot pass as SQL UNKNOWN.
  -- Abort on an existing invalid intent; never fabricate fingerprints/backfill rows.
  if exists (select 1 from public.donation
    where (idempotency_key is null and idempotency_fingerprint is not null)
      or (idempotency_key is not null and
        (idempotency_fingerprint is null or idempotency_fingerprint !~ '^[0-9a-f]{64}$'))
  ) then
    raise exception using errcode = '23514', message = 'R01 existing intent violates strict fingerprint contract; review required';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid, false), c.contype, c.convalidated, c.connoinherit
    into existing from pg_catalog.pg_constraint c
    where c.conrelid = 'public.donation'::pg_catalog.regclass
      and c.conname = 'donation_idempotency_fingerprint_check';
  if found then
    if existing.contype <> 'c' or not existing.convalidated or existing.connoinherit
      or existing.pg_get_constraintdef not in (historical_check, strict_check) then
      raise exception using errcode = '55000', message = 'R01 existing fingerprint constraint definition mismatch';
    end if;
    if existing.pg_get_constraintdef = historical_check then
      alter table public.donation drop constraint donation_idempotency_fingerprint_check;
    end if;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.donation'::pg_catalog.regclass
      and c.conname = 'donation_idempotency_fingerprint_check') then
    alter table public.donation add constraint donation_idempotency_fingerprint_check
      check ((idempotency_key is null and idempotency_fingerprint is null)
        or (idempotency_key is not null and idempotency_fingerprint is not null
          and idempotency_fingerprint ~ '^[0-9a-f]{64}$'));
  end if;

  for target in select * from (values
    ('donation', 'donation_idempotency_key_idx'),
    ('payment', 'payment_idempotency_key_idx')
  ) v(table_name, index_name)
  loop
    definition := pg_catalog.format('CREATE UNIQUE INDEX %I ON public.%I USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL)', target.index_name, target.table_name);
    if pg_catalog.to_regclass('public.' || target.index_name) is null then
      execute pg_catalog.format('create unique index %I on public.%I (idempotency_key) where idempotency_key is not null', target.index_name, target.table_name);
    else
      select i.indrelid, i.indisunique, i.indisvalid, i.indisready, i.indislive,
        pg_catalog.pg_get_indexdef(i.indexrelid) as actual_definition
        into existing from pg_catalog.pg_index i
        where i.indexrelid = pg_catalog.to_regclass('public.' || target.index_name);
      if not found or existing.indrelid <> pg_catalog.to_regclass('public.' || target.table_name)
        or not existing.indisunique or not existing.indisvalid
        or not existing.indisready or not existing.indislive
        or existing.actual_definition <> definition then
        raise exception using errcode = '55000', message = 'R01 existing intent index definition mismatch';
      end if;
    end if;
  end loop;

  -- Table INSERT/UPDATE would automatically authorize the five new columns.
  -- Convert only reviewed public-role writes into equivalent old-column grants.
  -- Unknown grantors/chains or inherited control-column authority abort atomically.
  if exists (
    select 1 from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
    where c.oid in ('public.donation'::pg_catalog.regclass, 'public.payment'::pg_catalog.regclass)
      and x.grantee in (0, 'anon'::pg_catalog.regrole, 'authenticated'::pg_catalog.regrole)
      and x.privilege_type in ('INSERT', 'UPDATE')
      and x.grantor <> 'postgres'::pg_catalog.regrole
  ) then
    raise exception using errcode = '55000', message = 'R01 unexpected public-role table write grantor; review required';
  end if;

  for target in select * from (values
    ('donation', array['idempotency_key', 'idempotency_fingerprint']),
    ('payment', array['idempotency_key', 'checkout_url', 'checkout_attempted_at'])
  ) v(table_name, control_columns)
  loop
    select pg_catalog.string_agg(pg_catalog.format('%I', a.attname), ', ' order by a.attnum)
      into old_columns from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.to_regclass('public.' || target.table_name)
        and a.attnum > 0 and not a.attisdropped and not (a.attname = any(target.control_columns));
    if old_columns is null then
      raise exception using errcode = '55000', message = 'R01 missing preserved payment columns';
    end if;
    for write_acl in
      select x.* from pg_catalog.pg_class c
      cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
      where c.oid = pg_catalog.to_regclass('public.' || target.table_name)
        and x.grantee in (0, 'anon'::pg_catalog.regrole, 'authenticated'::pg_catalog.regrole)
        and x.privilege_type in ('INSERT', 'UPDATE')
    loop
      recipient := case when write_acl.grantee = 0 then 'PUBLIC'
        else pg_catalog.format('%I', pg_catalog.pg_get_userbyid(write_acl.grantee)) end;
      execute pg_catalog.format('revoke %s on public.%I from %s restrict', write_acl.privilege_type, target.table_name, recipient);
      execute pg_catalog.format('grant %s (%s) on public.%I to %s%s', write_acl.privilege_type, old_columns,
        target.table_name, recipient, case when write_acl.is_grantable then ' with grant option' else '' end);
    end loop;
    -- Validate public-role authority after every grant, including service grants:
    -- an inherited service role must not bypass the five-column boundary.
    if target.table_name = 'donation' then
      grant select (idempotency_key, idempotency_fingerprint),
        insert (idempotency_key, idempotency_fingerprint) on public.donation to service_role;
    else
      grant select (idempotency_key, checkout_url, checkout_attempted_at),
        insert (idempotency_key), update (checkout_url, checkout_attempted_at)
        on public.payment to service_role;
    end if;
    if exists (
      select 1 from pg_catalog.pg_attribute a
      cross join (values ('anon'), ('authenticated')) r(role_name)
      cross join (values ('INSERT'), ('UPDATE')) w(privilege)
      where a.attrelid = pg_catalog.to_regclass('public.' || target.table_name)
        and a.attnum > 0 and not a.attisdropped and a.attname = any(target.control_columns)
        and pg_catalog.has_column_privilege(r.role_name, a.attrelid, a.attnum, w.privilege)
    ) then
      raise exception using errcode = '55000', message = 'R01 explicit or inherited public-role intent write authority; review required';
    end if;
  end loop;
end;
$repair$;
