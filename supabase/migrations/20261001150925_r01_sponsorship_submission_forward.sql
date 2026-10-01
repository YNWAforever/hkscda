-- R01 Task 3: restore only missing sponsorship submission/proof intent contracts.
-- Reviewed existing modern objects are validated, never replaced. Pending proof
-- insertion may queue local SQL outbox rows; this migration sends no messages.
set local search_path = '';
do $migration$
declare v_table oid; v_existing boolean; v_function oid; v_actual jsonb; v_acl text[];
begin
  if current_user <> 'postgres' then raise exception 'R01 sponsorship requires postgres owner context' using errcode='55000'; end if;
  if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.public_status_token'::pg_catalog.regclass and a.attname='submission_fingerprint' and a.atttypid='text'::pg_catalog.regtype and not a.attnotnull and not a.attisdropped and not exists(select 1 from pg_catalog.pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) then
    raise exception 'R01 sponsorship requires accepted Task2 fingerprint prerequisite' using errcode='55000';
  end if;

  v_table := pg_catalog.to_regclass('public.sponsorship_proof_upload_intent'); v_existing := v_table is not null;
  if v_table is null then
    create table public.sponsorship_proof_upload_intent (
  pledge_id uuid primary key,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  cleanup_claimed_at timestamptz,
  constraint sponsorship_proof_upload_intent_path
    check (storage_path like pledge_id::text || '/proof/%'),
  constraint sponsorship_proof_upload_intent_expiry
    check (expires_at > created_at)
);
    alter table public.sponsorship_proof_upload_intent enable row level security;
    revoke all on public.sponsorship_proof_upload_intent from public, anon, authenticated, service_role;
    grant select, insert, update, delete on public.sponsorship_proof_upload_intent to service_role;
    CREATE INDEX sponsorship_proof_upload_intent_cleanup_idx ON public.sponsorship_proof_upload_intent USING btree (expires_at) WHERE (submitted_at IS NULL);
    v_table := 'public.sponsorship_proof_upload_intent'::pg_catalog.regclass;
  end if;
  select pg_catalog.jsonb_build_object(
    'columns',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',a.attname,'position',a.attnum,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'collation',(select n.nspname||'.'||co.collname from pg_catalog.pg_collation co join pg_catalog.pg_namespace n on n.oid=co.collnamespace where co.oid=a.attcollation),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'acl',case when a.attacl is null then '[]'::jsonb else null end,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=v_table and a.attnum>0 and not a.attisdropped),
    'constraints',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',con.conname,'type',con.contype,'validated',con.convalidated,'definition',pg_catalog.pg_get_constraintdef(con.oid,true)) order by con.conname) from pg_catalog.pg_constraint con where con.conrelid=v_table),
    'indexes',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('definition',pg_catalog.pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique) order by pg_catalog.pg_get_indexdef(i.indexrelid)) from pg_catalog.pg_index i where i.indrelid=v_table)
  ) into v_actual;
  if v_actual is distinct from $expected${"columns":[{"acl":[],"name":"pledge_id","type":"uuid","default":null,"notNull":true,"identity":"","position":1,"collation":null,"generated":""},{"acl":[],"name":"storage_path","type":"text","default":null,"notNull":true,"identity":"","position":2,"collation":"pg_catalog.default","generated":""},{"acl":[],"name":"created_at","type":"timestamp with time zone","default":"now()","notNull":true,"identity":"","position":3,"collation":null,"generated":""},{"acl":[],"name":"expires_at","type":"timestamp with time zone","default":null,"notNull":true,"identity":"","position":4,"collation":null,"generated":""},{"acl":[],"name":"submitted_at","type":"timestamp with time zone","default":null,"notNull":false,"identity":"","position":5,"collation":null,"generated":""},{"acl":[],"name":"cleanup_claimed_at","type":"timestamp with time zone","default":null,"notNull":false,"identity":"","position":6,"collation":null,"generated":""}],"constraints":[{"name":"sponsorship_proof_upload_intent_expiry","type":"c","validated":true,"definition":"CHECK (expires_at > created_at)"},{"name":"sponsorship_proof_upload_intent_path","type":"c","validated":true,"definition":"CHECK (storage_path ~~ (pledge_id::text || '/proof/%'::text))"},{"name":"sponsorship_proof_upload_intent_pkey","type":"p","validated":true,"definition":"PRIMARY KEY (pledge_id)"},{"name":"sponsorship_proof_upload_intent_storage_path_key","type":"u","validated":true,"definition":"UNIQUE (storage_path)"}],"indexes":[{"ready":true,"valid":true,"unique":false,"definition":"CREATE INDEX sponsorship_proof_upload_intent_cleanup_idx ON public.sponsorship_proof_upload_intent USING btree (expires_at) WHERE (submitted_at IS NULL)"},{"ready":true,"valid":true,"unique":true,"definition":"CREATE UNIQUE INDEX sponsorship_proof_upload_intent_pkey ON public.sponsorship_proof_upload_intent USING btree (pledge_id)"},{"ready":true,"valid":true,"unique":true,"definition":"CREATE UNIQUE INDEX sponsorship_proof_upload_intent_storage_path_key ON public.sponsorship_proof_upload_intent USING btree (storage_path)"}]}$expected$::jsonb
    or not exists(select 1 from pg_catalog.pg_class where oid=v_table and relkind='r' and relrowsecurity and not relforcerowsecurity and relowner='postgres'::pg_catalog.regrole and reloptions is null and relreplident='d')
    or exists(select 1 from pg_catalog.pg_policy where polrelid=v_table)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid=v_table and not tgisinternal)
    or exists(select 1 from pg_catalog.pg_constraint where conrelid=v_table and (condeferrable or condeferred)) then
    raise exception 'R01 sponsorship intent definition differs: sponsorship_proof_upload_intent' using errcode='55000';
  end if;
  select pg_catalog.array_agg(a.privilege_type order by a.privilege_type) filter(where a.grantee='service_role'::pg_catalog.regrole) into v_acl
    from pg_catalog.pg_class t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where t.oid=v_table;
  -- Existing modern tables inherited eight nongrantable service privileges.
  -- Missing tables receive explicit CRUD only; preserve that reviewed profile.
  if not (v_acl is not distinct from array['DELETE','INSERT','SELECT','UPDATE']::text[]
      or (v_existing and v_acl is not distinct from array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]))
    or (select pg_catalog.array_agg(a.privilege_type order by a.privilege_type) from pg_catalog.pg_class t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where t.oid=v_table and a.grantee=t.relowner) is distinct from array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]
    or exists(select 1 from pg_catalog.pg_class t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where t.oid=v_table and (a.grantor<>t.relowner or a.is_grantable or a.grantee not in(t.relowner,'service_role'::pg_catalog.regrole)))
    or not (pg_catalog.has_table_privilege('service_role',v_table,'SELECT') and pg_catalog.has_table_privilege('service_role',v_table,'INSERT') and pg_catalog.has_table_privilege('service_role',v_table,'UPDATE') and pg_catalog.has_table_privilege('service_role',v_table,'DELETE'))
    or pg_catalog.has_table_privilege('anon',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_table_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_any_column_privilege('anon',v_table,'SELECT,INSERT,UPDATE,REFERENCES')
    or pg_catalog.has_any_column_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,REFERENCES') then
    raise exception 'R01 sponsorship intent effective privileges differ' using errcode='55000';
  end if;

  v_table := pg_catalog.to_regclass('public.sponsorship_staff_proof_upload_intent'); v_existing := v_table is not null;
  if v_table is null then
    create table public.sponsorship_staff_proof_upload_intent (
  storage_path text primary key,
  pledge_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  attached_at timestamptz,
  cleanup_claimed_at timestamptz,
  constraint sponsorship_staff_proof_upload_path
    check (storage_path like pledge_id::text || '/staff-%'),
  constraint sponsorship_staff_proof_upload_expiry
    check (expires_at > created_at)
);
    alter table public.sponsorship_staff_proof_upload_intent enable row level security;
    revoke all on public.sponsorship_staff_proof_upload_intent from public, anon, authenticated, service_role;
    grant select, insert, update, delete on public.sponsorship_staff_proof_upload_intent to service_role;
    CREATE INDEX sponsorship_staff_proof_upload_cleanup_idx ON public.sponsorship_staff_proof_upload_intent USING btree (expires_at) WHERE (attached_at IS NULL);
    v_table := 'public.sponsorship_staff_proof_upload_intent'::pg_catalog.regclass;
  end if;
  select pg_catalog.jsonb_build_object(
    'columns',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',a.attname,'position',a.attnum,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'collation',(select n.nspname||'.'||co.collname from pg_catalog.pg_collation co join pg_catalog.pg_namespace n on n.oid=co.collnamespace where co.oid=a.attcollation),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'acl',case when a.attacl is null then '[]'::jsonb else null end,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=v_table and a.attnum>0 and not a.attisdropped),
    'constraints',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',con.conname,'type',con.contype,'validated',con.convalidated,'definition',pg_catalog.pg_get_constraintdef(con.oid,true)) order by con.conname) from pg_catalog.pg_constraint con where con.conrelid=v_table),
    'indexes',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('definition',pg_catalog.pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique) order by pg_catalog.pg_get_indexdef(i.indexrelid)) from pg_catalog.pg_index i where i.indrelid=v_table)
  ) into v_actual;
  if v_actual is distinct from $expected${"columns":[{"acl":[],"name":"storage_path","type":"text","default":null,"notNull":true,"identity":"","position":1,"collation":"pg_catalog.default","generated":""},{"acl":[],"name":"pledge_id","type":"uuid","default":null,"notNull":true,"identity":"","position":2,"collation":null,"generated":""},{"acl":[],"name":"created_at","type":"timestamp with time zone","default":"clock_timestamp()","notNull":true,"identity":"","position":3,"collation":null,"generated":""},{"acl":[],"name":"expires_at","type":"timestamp with time zone","default":null,"notNull":true,"identity":"","position":4,"collation":null,"generated":""},{"acl":[],"name":"attached_at","type":"timestamp with time zone","default":null,"notNull":false,"identity":"","position":5,"collation":null,"generated":""},{"acl":[],"name":"cleanup_claimed_at","type":"timestamp with time zone","default":null,"notNull":false,"identity":"","position":6,"collation":null,"generated":""}],"constraints":[{"name":"sponsorship_staff_proof_upload_expiry","type":"c","validated":true,"definition":"CHECK (expires_at > created_at)"},{"name":"sponsorship_staff_proof_upload_intent_pkey","type":"p","validated":true,"definition":"PRIMARY KEY (storage_path)"},{"name":"sponsorship_staff_proof_upload_path","type":"c","validated":true,"definition":"CHECK (storage_path ~~ (pledge_id::text || '/staff-%'::text))"}],"indexes":[{"ready":true,"valid":true,"unique":false,"definition":"CREATE INDEX sponsorship_staff_proof_upload_cleanup_idx ON public.sponsorship_staff_proof_upload_intent USING btree (expires_at) WHERE (attached_at IS NULL)"},{"ready":true,"valid":true,"unique":true,"definition":"CREATE UNIQUE INDEX sponsorship_staff_proof_upload_intent_pkey ON public.sponsorship_staff_proof_upload_intent USING btree (storage_path)"}]}$expected$::jsonb
    or not exists(select 1 from pg_catalog.pg_class where oid=v_table and relkind='r' and relrowsecurity and not relforcerowsecurity and relowner='postgres'::pg_catalog.regrole and reloptions is null and relreplident='d')
    or exists(select 1 from pg_catalog.pg_policy where polrelid=v_table)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid=v_table and not tgisinternal)
    or exists(select 1 from pg_catalog.pg_constraint where conrelid=v_table and (condeferrable or condeferred)) then
    raise exception 'R01 sponsorship intent definition differs: sponsorship_staff_proof_upload_intent' using errcode='55000';
  end if;
  select pg_catalog.array_agg(a.privilege_type order by a.privilege_type) filter(where a.grantee='service_role'::pg_catalog.regrole) into v_acl
    from pg_catalog.pg_class t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where t.oid=v_table;
  -- Existing modern tables inherited eight nongrantable service privileges.
  -- Missing tables receive explicit CRUD only; preserve that reviewed profile.
  if not (v_acl is not distinct from array['DELETE','INSERT','SELECT','UPDATE']::text[]
      or (v_existing and v_acl is not distinct from array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]))
    or (select pg_catalog.array_agg(a.privilege_type order by a.privilege_type) from pg_catalog.pg_class t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where t.oid=v_table and a.grantee=t.relowner) is distinct from array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]
    or exists(select 1 from pg_catalog.pg_class t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where t.oid=v_table and (a.grantor<>t.relowner or a.is_grantable or a.grantee not in(t.relowner,'service_role'::pg_catalog.regrole)))
    or not (pg_catalog.has_table_privilege('service_role',v_table,'SELECT') and pg_catalog.has_table_privilege('service_role',v_table,'INSERT') and pg_catalog.has_table_privilege('service_role',v_table,'UPDATE') and pg_catalog.has_table_privilege('service_role',v_table,'DELETE'))
    or pg_catalog.has_table_privilege('anon',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_table_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or pg_catalog.has_any_column_privilege('anon',v_table,'SELECT,INSERT,UPDATE,REFERENCES')
    or pg_catalog.has_any_column_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,REFERENCES') then
    raise exception 'R01 sponsorship intent effective privileges differ' using errcode='55000';
  end if;

  v_function := pg_catalog.to_regprocedure('public.claim_expired_sponsorship_proof_uploads(timestamp with time zone, integer)');
  if v_function is null then
    execute $definition$create function public.claim_expired_sponsorship_proof_uploads(
  p_cutoff timestamptz,
  p_limit integer default 50
)
returns table (pledge_id uuid, storage_path text, claimed_at timestamptz)
language sql
set search_path = ''
as $$
  with candidates as (
    select intent.pledge_id
    from public.sponsorship_proof_upload_intent as intent
    where intent.submitted_at is null
      and intent.expires_at < p_cutoff
      and (
        intent.cleanup_claimed_at is null
        or intent.cleanup_claimed_at < pg_catalog.clock_timestamp() - interval '1 hour'
      )
    order by intent.expires_at
    limit least(greatest(p_limit, 1), 50)
    for update skip locked
  )
  update public.sponsorship_proof_upload_intent as intent
  set cleanup_claimed_at = pg_catalog.clock_timestamp()
  from candidates
  where intent.pledge_id = candidates.pledge_id
  returning intent.pledge_id, intent.storage_path, intent.cleanup_claimed_at;
$$;$definition$;
    revoke all on function public.claim_expired_sponsorship_proof_uploads(timestamp with time zone, integer) from public, anon, authenticated, service_role;
    grant execute on function public.claim_expired_sponsorship_proof_uploads(timestamp with time zone, integer) to service_role;
    v_function := 'public.claim_expired_sponsorship_proof_uploads(timestamp with time zone, integer)'::pg_catalog.regprocedure;
  end if;
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='claim_expired_sponsorship_proof_uploads')<>1 or not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.proowner='postgres'::pg_catalog.regrole and not p.prosecdef and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and l.lanname='sql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_cutoff timestamp with time zone, p_limit integer' and pg_catalog.pg_get_function_result(p.oid)='TABLE(pledge_id uuid, storage_path text, claimed_at timestamp with time zone)' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))='0d2faaf84e189af7d4ed6a65d21ba87f')
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE') then
    raise exception 'R01 sponsorship function contract differs: claim_expired_sponsorship_proof_uploads' using errcode='55000';
  end if;

  v_function := pg_catalog.to_regprocedure('public.claim_expired_staff_sponsorship_proof_uploads(timestamp with time zone, integer)');
  if v_function is null then
    execute $definition$create function public.claim_expired_staff_sponsorship_proof_uploads(
  p_cutoff timestamptz,
  p_limit integer default 50
)
returns table (pledge_id uuid, storage_path text, claimed_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select intent.storage_path
    from public.sponsorship_staff_proof_upload_intent as intent
    where intent.attached_at is null
      and intent.expires_at < p_cutoff
      and (
        intent.cleanup_claimed_at is null
        or intent.cleanup_claimed_at < pg_catalog.clock_timestamp() - interval '1 hour'
      )
    order by intent.expires_at, intent.storage_path
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    for update skip locked
  )
  update public.sponsorship_staff_proof_upload_intent as intent
  set cleanup_claimed_at = pg_catalog.clock_timestamp()
  from candidates
  where intent.storage_path = candidates.storage_path
  returning intent.pledge_id, intent.storage_path, intent.cleanup_claimed_at;
$$;$definition$;
    revoke all on function public.claim_expired_staff_sponsorship_proof_uploads(timestamp with time zone, integer) from public, anon, authenticated, service_role;
    grant execute on function public.claim_expired_staff_sponsorship_proof_uploads(timestamp with time zone, integer) to service_role;
    v_function := 'public.claim_expired_staff_sponsorship_proof_uploads(timestamp with time zone, integer)'::pg_catalog.regprocedure;
  end if;
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='claim_expired_staff_sponsorship_proof_uploads')<>1 or not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.proowner='postgres'::pg_catalog.regrole and not p.prosecdef and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and l.lanname='sql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_cutoff timestamp with time zone, p_limit integer' and pg_catalog.pg_get_function_result(p.oid)='TABLE(pledge_id uuid, storage_path text, claimed_at timestamp with time zone)' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))='96d1b4ab885f2e2f5c9ebcffbb6fe286')
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE') then
    raise exception 'R01 sponsorship function contract differs: claim_expired_staff_sponsorship_proof_uploads' using errcode='55000';
  end if;

  v_function := pg_catalog.to_regprocedure('public.create_public_sponsorship_pledge(uuid, jsonb, jsonb, jsonb, jsonb)');
  if v_function is null then
    execute $definition$create function public.create_public_sponsorship_pledge(
  p_pledge_id uuid,
  p_pledge jsonb,
  p_preferences jsonb,
  p_proof jsonb,
  p_token jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.sponsorship_pledge (
    id, supporter_id, monthly_tier, amount_cents, currency, language, notes,
    contact_submission, status, consent_email_requested, consent_whatsapp_requested
  ) values (
    p_pledge_id,
    (p_pledge->>'supporter_id')::uuid,
    p_pledge->>'monthly_tier',
    (p_pledge->>'amount_cents')::integer,
    p_pledge->>'currency',
    p_pledge->>'language',
    p_pledge->>'notes',
    p_pledge->'contact_submission',
    p_pledge->>'status',
    (p_pledge->>'consent_email_requested')::boolean,
    (p_pledge->>'consent_whatsapp_requested')::boolean
  );

  insert into public.sponsorship_preference (
    pledge_id, sponsor_animal_id, rank, animal_name_snapshot, animal_type_snapshot
  )
  select
    p_pledge_id, preference.sponsor_animal_id, preference.rank,
    preference.animal_name_snapshot, preference.animal_type_snapshot
  from pg_catalog.jsonb_to_recordset(p_preferences) as preference (
    sponsor_animal_id uuid,
    rank integer,
    animal_name_snapshot text,
    animal_type_snapshot text
  );

  if p_proof is not null then
    insert into public.sponsorship_payment_proof (
      pledge_id, storage_path, file_name, file_type, file_size, payment_method,
      reference, amount_cents, payment_date, review_status
    ) values (
      p_pledge_id,
      p_proof->>'storage_path',
      p_proof->>'file_name',
      p_proof->>'file_type',
      (p_proof->>'file_size')::integer,
      p_proof->>'payment_method',
      p_proof->>'reference',
      (p_proof->>'amount_cents')::integer,
      (p_proof->>'payment_date')::date,
      'pending'
    );
  end if;

  insert into public.public_status_token (
    token_hash, entity_type, entity_id, expires_at, submission_fingerprint
  ) values (
    p_token->>'token_hash',
    'sponsorship_pledge',
    p_pledge_id,
    (p_token->>'expires_at')::timestamptz,
    p_token->>'submission_fingerprint'
  );
end;
$$;$definition$;
    revoke all on function public.create_public_sponsorship_pledge(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
    grant execute on function public.create_public_sponsorship_pledge(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
    v_function := 'public.create_public_sponsorship_pledge(uuid, jsonb, jsonb, jsonb, jsonb)'::pg_catalog.regprocedure;
  end if;
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='create_public_sponsorship_pledge')<>1 or not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.proowner='postgres'::pg_catalog.regrole and not p.prosecdef and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_pledge_id uuid, p_pledge jsonb, p_preferences jsonb, p_proof jsonb, p_token jsonb' and pg_catalog.pg_get_function_result(p.oid)='void' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))='b46a92019ebb54ae0e2d6535a0c7b12c')
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE') then
    raise exception 'R01 sponsorship function contract differs: create_public_sponsorship_pledge' using errcode='55000';
  end if;

  v_function := pg_catalog.to_regprocedure('public.mark_sponsorship_proof_upload_submitted()');
  if v_function is null then
    execute $definition$create function public.mark_sponsorship_proof_upload_submitted()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_claimed_at timestamptz;
begin
  select intent.cleanup_claimed_at into v_claimed_at
  from public.sponsorship_proof_upload_intent as intent
  where intent.pledge_id = new.pledge_id
    and intent.storage_path = new.storage_path
  for update;

  if found then
    if v_claimed_at is not null then
      raise exception 'sponsorship proof upload is being cleaned up'
        using errcode = '55000';
    end if;
    update public.sponsorship_proof_upload_intent
    set submitted_at = pg_catalog.clock_timestamp()
    where pledge_id = new.pledge_id;
  end if;
  return new;
end;
$$;$definition$;
    revoke all on function public.mark_sponsorship_proof_upload_submitted() from public, anon, authenticated, service_role;
    grant execute on function public.mark_sponsorship_proof_upload_submitted() to service_role;
    v_function := 'public.mark_sponsorship_proof_upload_submitted()'::pg_catalog.regprocedure;
  end if;
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='mark_sponsorship_proof_upload_submitted')<>1 or not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.proowner='postgres'::pg_catalog.regrole and not p.prosecdef and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='' and pg_catalog.pg_get_function_result(p.oid)='trigger' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))='d9219aa538847e44fda957dfc893b7f8')
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE') then
    raise exception 'R01 sponsorship function contract differs: mark_sponsorship_proof_upload_submitted' using errcode='55000';
  end if;

  v_function := pg_catalog.to_regprocedure('public.mark_staff_sponsorship_proof_attached()');
  if v_function is null then
    execute $definition$create function public.mark_staff_sponsorship_proof_attached()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_claimed_at timestamptz;
begin
  if new.storage_path is null
    or new.storage_path not like new.pledge_id::text || '/staff-%' then
    return new;
  end if;

  select intent.cleanup_claimed_at into v_claimed_at
  from public.sponsorship_staff_proof_upload_intent as intent
  where intent.storage_path = new.storage_path
    and intent.pledge_id = new.pledge_id
  for update;

  if found then
    if v_claimed_at is not null then
      raise exception 'staff proof upload is being cleaned up' using errcode = '55000';
    end if;
    update public.sponsorship_staff_proof_upload_intent
    set attached_at = pg_catalog.clock_timestamp()
    where storage_path = new.storage_path;
  end if;
  return new;
end;
$$;$definition$;
    revoke all on function public.mark_staff_sponsorship_proof_attached() from public, anon, authenticated, service_role;
    grant execute on function public.mark_staff_sponsorship_proof_attached() to service_role;
    v_function := 'public.mark_staff_sponsorship_proof_attached()'::pg_catalog.regprocedure;
  end if;
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='mark_staff_sponsorship_proof_attached')<>1 or not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.proowner='postgres'::pg_catalog.regrole and not p.prosecdef and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='' and pg_catalog.pg_get_function_result(p.oid)='trigger' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))='498c48ee988072311e8e43ab7566e9e4')
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE') then
    raise exception 'R01 sponsorship function contract differs: mark_staff_sponsorship_proof_attached' using errcode='55000';
  end if;

  v_function := pg_catalog.to_regprocedure('public.reserve_staff_sponsorship_proof_upload(uuid, text)');
  if v_function is null then
    execute $definition$create function public.reserve_staff_sponsorship_proof_upload(
  p_pledge_id uuid,
  p_storage_path text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_path text;
begin
  if p_pledge_id is null or p_storage_path is null then
    raise exception 'invalid_staff_proof_upload_intent' using errcode = '22023';
  end if;

  insert into public.sponsorship_staff_proof_upload_intent (
    storage_path, pledge_id, expires_at
  ) values (
    p_storage_path, p_pledge_id, pg_catalog.clock_timestamp() + interval '1 day'
  )
  on conflict (storage_path) do update
  set expires_at = greatest(
    public.sponsorship_staff_proof_upload_intent.expires_at,
    excluded.expires_at
  )
  where public.sponsorship_staff_proof_upload_intent.pledge_id = excluded.pledge_id
    and public.sponsorship_staff_proof_upload_intent.cleanup_claimed_at is null
  returning storage_path into v_path;

  if v_path is null then
    raise exception 'staff_proof_upload_cleanup_in_progress' using errcode = '55000';
  end if;
end;
$$;$definition$;
    revoke all on function public.reserve_staff_sponsorship_proof_upload(uuid, text) from public, anon, authenticated, service_role;
    grant execute on function public.reserve_staff_sponsorship_proof_upload(uuid, text) to service_role;
    v_function := 'public.reserve_staff_sponsorship_proof_upload(uuid, text)'::pg_catalog.regprocedure;
  end if;
  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace and proname='reserve_staff_sponsorship_proof_upload')<>1 or not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.proowner='postgres'::pg_catalog.regrole and not p.prosecdef and p.proconfig=array['search_path=""']::text[] and p.provolatile='v' and p.proparallel='u' and l.lanname='plpgsql' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_pledge_id uuid, p_storage_path text' and pg_catalog.pg_get_function_result(p.oid)='void' and pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))='77ab8967dcf293696c872370ef5f135d')
    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2
    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::pg_catalog.regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE') then
    raise exception 'R01 sponsorship function contract differs: reserve_staff_sponsorship_proof_upload' using errcode='55000';
  end if;

  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.sponsorship_payment_proof'::pg_catalog.regclass and tgname='sponsorship_proof_upload_submitted') then
    CREATE TRIGGER sponsorship_proof_upload_submitted AFTER INSERT ON public.sponsorship_payment_proof FOR EACH ROW EXECUTE FUNCTION public.mark_sponsorship_proof_upload_submitted();
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.sponsorship_payment_proof'::pg_catalog.regclass and tgname='sponsorship_proof_upload_submitted' and not tgisinternal and tgenabled='O' and pg_catalog.pg_get_triggerdef(oid,true)='CREATE TRIGGER sponsorship_proof_upload_submitted AFTER INSERT ON public.sponsorship_payment_proof FOR EACH ROW EXECUTE FUNCTION public.mark_sponsorship_proof_upload_submitted()') then
    raise exception 'R01 sponsorship proof trigger differs: sponsorship_proof_upload_submitted' using errcode='55000';
  end if;

  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.sponsorship_payment_proof'::pg_catalog.regclass and tgname='sponsorship_staff_proof_attached') then
    CREATE TRIGGER sponsorship_staff_proof_attached AFTER INSERT ON public.sponsorship_payment_proof FOR EACH ROW EXECUTE FUNCTION public.mark_staff_sponsorship_proof_attached();
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.sponsorship_payment_proof'::pg_catalog.regclass and tgname='sponsorship_staff_proof_attached' and not tgisinternal and tgenabled='O' and pg_catalog.pg_get_triggerdef(oid,true)='CREATE TRIGGER sponsorship_staff_proof_attached AFTER INSERT ON public.sponsorship_payment_proof FOR EACH ROW EXECUTE FUNCTION public.mark_staff_sponsorship_proof_attached()') then
    raise exception 'R01 sponsorship proof trigger differs: sponsorship_staff_proof_attached' using errcode='55000';
  end if;
end;
$migration$;
