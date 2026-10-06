-- Separate strengthening after exact named-guard restoration.
-- The application transaction must set statement_timeout BEFORE this DO.
-- Asset locks precede fence writes on publication and inverse paths.
-- A concurrent fence version forces old RR snapshots to serialize without
-- altering the asset body, updated_at, annual guards, RPC or audit.
DO $publication_fence$
declare
  expected constant jsonb := $fence_contracts$[
  {
    "name": "enforce_published_knowledge_document_assets",
    "table": "public.knowledge_posts",
    "beforeRaw": {
      "proacl": null,
      "probin": null,
      "prosrc": "\ndeclare\n  referenced_asset_id uuid;\nbegin\n  if new.is_published then\n    for referenced_asset_id in\n      select distinct refs.asset_id\n      from unnest(array[\n        new.document_asset_id,\n        new.zh_hk_document_asset_id,\n        new.en_document_asset_id\n      ]) as refs(asset_id)\n      where refs.asset_id is not null\n      order by refs.asset_id\n    loop\n      perform 1\n      from public.document_assets\n      where id = referenced_asset_id\n        and is_published = true\n      for update;\n\n      if not found then\n        raise exception 'Publish the PDF asset before publishing its knowledge post'\n          using errcode = '23514';\n      end if;\n    end loop;\n  end if;\n  return new;\nend;\n",
      "procost": 100,
      "prokind": "f",
      "proname": "enforce_published_knowledge_document_assets",
      "prorows": 0,
      "pronargs": 0,
      "proconfig": [
        "search_path=\"\""
      ],
      "proretset": false,
      "prosecdef": true,
      "prorettype": "2279",
      "prosqlbody": null,
      "prosupport": "-",
      "proargmodes": null,
      "proargnames": null,
      "proargtypes": [],
      "proisstrict": false,
      "proparallel": "u",
      "protrftypes": null,
      "provariadic": "0",
      "provolatile": "v",
      "proleakproof": false,
      "proallargtypes": null,
      "proargdefaults": null,
      "pronargdefaults": 0
    },
    "afterRaw": {
      "proacl": null,
      "probin": null,
      "prosrc": "\ndeclare\n  referenced_asset_id uuid;\nbegin\n  if new.is_published then\n    for referenced_asset_id in\n      select distinct refs.asset_id\n      from unnest(array[\n        new.document_asset_id,\n        new.zh_hk_document_asset_id,\n        new.en_document_asset_id\n      ]) as refs(asset_id)\n      where refs.asset_id is not null\n      order by refs.asset_id\n    loop\n      perform 1\n      from public.document_assets\n      where id = referenced_asset_id\n        and is_published = true\n      for update;\n\n      if not found then\n        raise exception 'Publish the PDF asset before publishing its knowledge post'\n          using errcode = '23514';\n      end if;\n      perform private.touch_document_publication_fence(referenced_asset_id);\n    end loop;\n  end if;\n  return new;\nend;\n",
      "procost": 100,
      "prokind": "f",
      "proname": "enforce_published_knowledge_document_assets",
      "prorows": 0,
      "pronargs": 0,
      "proconfig": [
        "search_path=\"\""
      ],
      "proretset": false,
      "prosecdef": true,
      "prorettype": "2279",
      "prosqlbody": null,
      "prosupport": "-",
      "proargmodes": null,
      "proargnames": null,
      "proargtypes": [],
      "proisstrict": false,
      "proparallel": "u",
      "protrftypes": null,
      "provariadic": "0",
      "provolatile": "v",
      "proleakproof": false,
      "proallargtypes": null,
      "proargdefaults": null,
      "pronargdefaults": 0
    },
    "createFunction": "CREATE OR REPLACE FUNCTION private.enforce_published_knowledge_document_assets()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$\ndeclare\n  referenced_asset_id uuid;\nbegin\n  if new.is_published then\n    for referenced_asset_id in\n      select distinct refs.asset_id\n      from unnest(array[\n        new.document_asset_id,\n        new.zh_hk_document_asset_id,\n        new.en_document_asset_id\n      ]) as refs(asset_id)\n      where refs.asset_id is not null\n      order by refs.asset_id\n    loop\n      perform 1\n      from public.document_assets\n      where id = referenced_asset_id\n        and is_published = true\n      for update;\n\n      if not found then\n        raise exception 'Publish the PDF asset before publishing its knowledge post'\n          using errcode = '23514';\n      end if;\n      perform private.touch_document_publication_fence(referenced_asset_id);\n    end loop;\n  end if;\n  return new;\nend;\n$function$\n",
    "triggerRaw": {
      "tgargs": "\\x",
      "tgattr": [],
      "tgname": "enforce_published_knowledge_document_assets",
      "tgqual": null,
      "tgtype": 21,
      "tgnargs": 0,
      "tgenabled": "O",
      "tgnewtable": null,
      "tgoldtable": null,
      "tgparentid": "0",
      "tgdeferrable": true,
      "tgisinternal": false,
      "tgconstrindid": "0",
      "tgconstrrelid": "0",
      "tginitdeferred": false
    },
    "constraintRaw": {
      "conbin": null,
      "conkey": null,
      "confkey": null,
      "conname": "enforce_published_knowledge_document_assets",
      "contype": "t",
      "conindid": "0",
      "contypid": "0",
      "conexclop": null,
      "conffeqop": null,
      "confrelid": "0",
      "conpfeqop": null,
      "conppeqop": null,
      "conislocal": true,
      "condeferred": false,
      "confdeltype": " ",
      "confupdtype": " ",
      "coninhcount": 0,
      "conparentid": "0",
      "connoinherit": true,
      "convalidated": true,
      "condeferrable": true,
      "confmatchtype": " ",
      "confdelsetcols": null
    }
  },
  {
    "name": "enforce_published_site_document_slot_asset",
    "table": "public.site_document_slots",
    "beforeRaw": {
      "proacl": null,
      "probin": null,
      "prosrc": "\nbegin\n  if new.is_published then\n    perform 1\n    from public.document_assets\n    where id = new.document_asset_id\n      and is_published = true\n    for update;\n\n    if not found then\n      raise exception 'Publish the PDF asset before publishing its site document slot'\n        using errcode = '23514';\n    end if;\n  end if;\n  return new;\nend;\n",
      "procost": 100,
      "prokind": "f",
      "proname": "enforce_published_site_document_slot_asset",
      "prorows": 0,
      "pronargs": 0,
      "proconfig": [
        "search_path=\"\""
      ],
      "proretset": false,
      "prosecdef": true,
      "prorettype": "2279",
      "prosqlbody": null,
      "prosupport": "-",
      "proargmodes": null,
      "proargnames": null,
      "proargtypes": [],
      "proisstrict": false,
      "proparallel": "u",
      "protrftypes": null,
      "provariadic": "0",
      "provolatile": "v",
      "proleakproof": false,
      "proallargtypes": null,
      "proargdefaults": null,
      "pronargdefaults": 0
    },
    "afterRaw": {
      "proacl": null,
      "probin": null,
      "prosrc": "\nbegin\n  if new.is_published then\n    perform 1\n    from public.document_assets\n    where id = new.document_asset_id\n      and is_published = true\n    for update;\n\n    if not found then\n      raise exception 'Publish the PDF asset before publishing its site document slot'\n        using errcode = '23514';\n    end if;\n    perform private.touch_document_publication_fence(new.document_asset_id);\n  end if;\n  return new;\nend;\n",
      "procost": 100,
      "prokind": "f",
      "proname": "enforce_published_site_document_slot_asset",
      "prorows": 0,
      "pronargs": 0,
      "proconfig": [
        "search_path=\"\""
      ],
      "proretset": false,
      "prosecdef": true,
      "prorettype": "2279",
      "prosqlbody": null,
      "prosupport": "-",
      "proargmodes": null,
      "proargnames": null,
      "proargtypes": [],
      "proisstrict": false,
      "proparallel": "u",
      "protrftypes": null,
      "provariadic": "0",
      "provolatile": "v",
      "proleakproof": false,
      "proallargtypes": null,
      "proargdefaults": null,
      "pronargdefaults": 0
    },
    "createFunction": "CREATE OR REPLACE FUNCTION private.enforce_published_site_document_slot_asset()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$\nbegin\n  if new.is_published then\n    perform 1\n    from public.document_assets\n    where id = new.document_asset_id\n      and is_published = true\n    for update;\n\n    if not found then\n      raise exception 'Publish the PDF asset before publishing its site document slot'\n        using errcode = '23514';\n    end if;\n    perform private.touch_document_publication_fence(new.document_asset_id);\n  end if;\n  return new;\nend;\n$function$\n",
    "triggerRaw": {
      "tgargs": "\\x",
      "tgattr": [],
      "tgname": "enforce_published_site_document_slot_asset",
      "tgqual": null,
      "tgtype": 21,
      "tgnargs": 0,
      "tgenabled": "O",
      "tgnewtable": null,
      "tgoldtable": null,
      "tgparentid": "0",
      "tgdeferrable": true,
      "tgisinternal": false,
      "tgconstrindid": "0",
      "tgconstrrelid": "0",
      "tginitdeferred": false
    },
    "constraintRaw": {
      "conbin": null,
      "conkey": null,
      "confkey": null,
      "conname": "enforce_published_site_document_slot_asset",
      "contype": "t",
      "conindid": "0",
      "contypid": "0",
      "conexclop": null,
      "conffeqop": null,
      "confrelid": "0",
      "conpfeqop": null,
      "conppeqop": null,
      "conislocal": true,
      "condeferred": false,
      "confdeltype": " ",
      "confupdtype": " ",
      "coninhcount": 0,
      "conparentid": "0",
      "connoinherit": true,
      "convalidated": true,
      "condeferrable": true,
      "confmatchtype": " ",
      "confdelsetcols": null
    }
  },
  {
    "name": "protect_published_document_references",
    "table": "public.document_assets",
    "beforeRaw": {
      "proacl": null,
      "probin": null,
      "prosrc": "\nbegin\n  if old.is_published and not new.is_published\n    and (\n      exists (\n        select 1\n        from public.site_document_slots\n        where document_asset_id = new.id\n          and is_published = true\n      )\n      or exists (\n        select 1\n        from public.knowledge_posts\n        where is_published = true\n          and new.id in (\n            document_asset_id,\n            zh_hk_document_asset_id,\n            en_document_asset_id\n          )\n      )\n    )\n  then\n    raise exception 'Unpublish public document references before unpublishing their PDF asset'\n      using errcode = '23514';\n  end if;\n  return new;\nend;\n",
      "procost": 100,
      "prokind": "f",
      "proname": "protect_published_document_references",
      "prorows": 0,
      "pronargs": 0,
      "proconfig": [
        "search_path=\"\""
      ],
      "proretset": false,
      "prosecdef": true,
      "prorettype": "2279",
      "prosqlbody": null,
      "prosupport": "-",
      "proargmodes": null,
      "proargnames": null,
      "proargtypes": [],
      "proisstrict": false,
      "proparallel": "u",
      "protrftypes": null,
      "provariadic": "0",
      "provolatile": "v",
      "proleakproof": false,
      "proallargtypes": null,
      "proargdefaults": null,
      "pronargdefaults": 0
    },
    "afterRaw": {
      "proacl": null,
      "probin": null,
      "prosrc": "\nbegin\n  if old.is_published and not new.is_published then\n    perform private.touch_document_publication_fence(new.id);\n  end if;\n  if old.is_published and not new.is_published\n    and (\n      exists (\n        select 1\n        from public.site_document_slots\n        where document_asset_id = new.id\n          and is_published = true\n      )\n      or exists (\n        select 1\n        from public.knowledge_posts\n        where is_published = true\n          and new.id in (\n            document_asset_id,\n            zh_hk_document_asset_id,\n            en_document_asset_id\n          )\n      )\n    )\n  then\n    raise exception 'Unpublish public document references before unpublishing their PDF asset'\n      using errcode = '23514';\n  end if;\n  return new;\nend;\n",
      "procost": 100,
      "prokind": "f",
      "proname": "protect_published_document_references",
      "prorows": 0,
      "pronargs": 0,
      "proconfig": [
        "search_path=\"\""
      ],
      "proretset": false,
      "prosecdef": true,
      "prorettype": "2279",
      "prosqlbody": null,
      "prosupport": "-",
      "proargmodes": null,
      "proargnames": null,
      "proargtypes": [],
      "proisstrict": false,
      "proparallel": "u",
      "protrftypes": null,
      "provariadic": "0",
      "provolatile": "v",
      "proleakproof": false,
      "proallargtypes": null,
      "proargdefaults": null,
      "pronargdefaults": 0
    },
    "createFunction": "CREATE OR REPLACE FUNCTION private.protect_published_document_references()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$\nbegin\n  if old.is_published and not new.is_published then\n    perform private.touch_document_publication_fence(new.id);\n  end if;\n  if old.is_published and not new.is_published\n    and (\n      exists (\n        select 1\n        from public.site_document_slots\n        where document_asset_id = new.id\n          and is_published = true\n      )\n      or exists (\n        select 1\n        from public.knowledge_posts\n        where is_published = true\n          and new.id in (\n            document_asset_id,\n            zh_hk_document_asset_id,\n            en_document_asset_id\n          )\n      )\n    )\n  then\n    raise exception 'Unpublish public document references before unpublishing their PDF asset'\n      using errcode = '23514';\n  end if;\n  return new;\nend;\n$function$\n",
    "triggerRaw": {
      "tgargs": "\\x",
      "tgattr": [],
      "tgname": "protect_published_document_references",
      "tgqual": null,
      "tgtype": 17,
      "tgnargs": 0,
      "tgenabled": "O",
      "tgnewtable": null,
      "tgoldtable": null,
      "tgparentid": "0",
      "tgdeferrable": true,
      "tgisinternal": false,
      "tgconstrindid": "0",
      "tgconstrrelid": "0",
      "tginitdeferred": false
    },
    "constraintRaw": {
      "conbin": null,
      "conkey": null,
      "confkey": null,
      "conname": "protect_published_document_references",
      "contype": "t",
      "conindid": "0",
      "contypid": "0",
      "conexclop": null,
      "conffeqop": null,
      "confrelid": "0",
      "conpfeqop": null,
      "conppeqop": null,
      "conislocal": true,
      "condeferred": false,
      "confdeltype": " ",
      "confupdtype": " ",
      "coninhcount": 0,
      "conparentid": "0",
      "connoinherit": true,
      "convalidated": true,
      "condeferrable": true,
      "confmatchtype": " ",
      "confdelsetcols": null
    }
  }
]$fence_contracts$::jsonb;
  fence_body constant text := $fence_body$
begin
  insert into private.document_publication_fences as f (asset_id, version)
  values (p_asset_id, false)
  on conflict (asset_id) do update set version = not f.version;
end;
$fence_body$;
  owner_oid oid; ns_oid oid; language_oid oid; entry jsonb; actual jsonb;
  p record; t record; c record; fence_oid oid; helper_oid oid; stage integer;
  before_count integer := 0; after_count integer := 0; changed boolean := false;
begin
  if current_user<>'postgres' or pg_catalog.current_setting('server_version_num') not in ('170006','170011') then
    raise exception 'Unknown publication fence actor/server profile' using errcode='55000';
  end if;
  select oid into strict owner_oid from pg_catalog.pg_roles where rolname='postgres';
  select oid into strict ns_oid from pg_catalog.pg_namespace where nspname='private';
  select oid into strict language_oid from pg_catalog.pg_language where lanname='plpgsql';
  lock table public.document_assets,public.site_document_slots,public.knowledge_posts in share row exclusive mode;

  -- Require the whole original or strengthened three-body cohort, never a mix.
  for entry in select value from pg_catalog.jsonb_array_elements(expected) loop
    if (select count(*) from pg_catalog.pg_proc where pronamespace=ns_oid and proname=entry->>'name')<>1 then
      raise exception 'Ambiguous publication guard before fence' using errcode='55000';
    end if;
    select * into strict p from pg_catalog.pg_proc where pronamespace=ns_oid and proname=entry->>'name';
    actual:=pg_catalog.to_jsonb(p)-array['oid','pronamespace','proowner','prolang'];
    if p.proowner<>owner_oid or p.prolang<>language_oid then
      raise exception 'Unknown publication guard owner/language' using errcode='55000';
    end if;
    if actual=entry->'beforeRaw' then before_count:=before_count+1;
    elsif actual=entry->'afterRaw' then after_count:=after_count+1;
    else raise exception 'Unknown publication guard body/ACL/defaults' using errcode='55000';
    end if;
    select * into t from pg_catalog.pg_trigger where tgname=entry->>'name' and tgrelid=pg_catalog.to_regclass(entry->>'table');
    if not found or t.tgfoid<>p.oid or
       (pg_catalog.to_jsonb(t)-array['oid','tgrelid','tgfoid','tgconstraint']) is distinct from entry->'triggerRaw' then
      raise exception 'Unknown publication guard trigger' using errcode='55000';
    end if;
    select * into c from pg_catalog.pg_constraint where oid=t.tgconstraint;
    if not found or c.conrelid<>t.tgrelid or
       c.connamespace<>(select relnamespace from pg_catalog.pg_class where oid=t.tgrelid) or
       (pg_catalog.to_jsonb(c)-array['oid','conrelid','connamespace']) is distinct from entry->'constraintRaw' then
      raise exception 'Unknown publication guard constraint' using errcode='55000';
    end if;
  end loop;
  if not (before_count=3 or after_count=3) then
    raise exception 'Mixed publication fence guard cohort' using errcode='55000';
  end if;
  fence_oid:=pg_catalog.to_regclass('private.document_publication_fences');
  helper_oid:=pg_catalog.to_regprocedure('private.touch_document_publication_fence(uuid)');
  if (select count(*) from pg_catalog.pg_proc where pronamespace=ns_oid and proname='touch_document_publication_fence')<>(case when helper_oid is null then 0 else 1 end) then
    raise exception 'Foreign publication fence helper overload' using errcode='55000';
  end if;
  if (fence_oid is null)<>(helper_oid is null) or (after_count=3 and fence_oid is null) or
     (before_count=3 and fence_oid is not null) then
    raise exception 'Partial or foreign publication fence installation' using errcode='55000';
  end if;
  if fence_oid is null then
    create table private.document_publication_fences (
      asset_id uuid not null,
      version boolean not null default false,
      constraint document_publication_fences_pkey primary key(asset_id),
      constraint document_publication_fences_asset_fkey foreign key(asset_id)
        references public.document_assets(id) on delete cascade
    );
    alter table private.document_publication_fences owner to postgres;
    alter table private.document_publication_fences enable row level security;
    revoke all on private.document_publication_fences from public,anon,authenticated,service_role;
    execute 'create function private.touch_document_publication_fence(p_asset_id uuid) returns void language plpgsql security definer set search_path to '''' as '||pg_catalog.quote_literal(fence_body);
    alter function private.touch_document_publication_fence(uuid) owner to postgres;
    revoke all on function private.touch_document_publication_fence(uuid) from public,anon,authenticated,service_role;
    fence_oid:=pg_catalog.to_regclass('private.document_publication_fences');
    helper_oid:=pg_catalog.to_regprocedure('private.touch_document_publication_fence(uuid)');
    changed:=true;
  end if;
  -- Only the definer wrappers can write this transaction-local coordination row.
  select * into strict c from pg_catalog.pg_class where oid=fence_oid;
  if c.relowner<>owner_oid or c.relnamespace<>ns_oid or c.relkind<>'r' or not c.relrowsecurity or c.relforcerowsecurity or
     exists(select 1 from pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) where grantee<>owner_oid) or
     exists(select 1 from pg_catalog.pg_policy where polrelid=fence_oid) or
     exists(select 1 from pg_catalog.pg_trigger where tgrelid=fence_oid and not tgisinternal) then
    raise exception 'Unknown publication fence table access' using errcode='55000';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
    'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'rawAcl',a.attacl::text,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid))
    order by a.attnum) into actual
  from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid=fence_oid and a.attnum>0 and not a.attisdropped;
  if actual is distinct from '[{"name":"asset_id","type":"uuid","notNull":true,"identity":"","generated":"","rawAcl":null,"default":null},{"name":"version","type":"boolean","notNull":true,"identity":"","generated":"","rawAcl":null,"default":"false"}]'::jsonb or
     (select count(*) from pg_catalog.pg_constraint where conrelid=fence_oid)<>2 or
     not exists(select 1 from pg_catalog.pg_constraint where conrelid=fence_oid and conname='document_publication_fences_pkey'
       and contype='p' and conkey=array[1]::smallint[] and not condeferrable and not condeferred and convalidated) or
     not exists(select 1 from pg_catalog.pg_constraint where conrelid=fence_oid and conname='document_publication_fences_asset_fkey'
       and contype='f' and conkey=array[1]::smallint[] and confrelid='public.document_assets'::regclass
       and confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid='public.document_assets'::regclass and attname='id')]::smallint[]
       and confdeltype='c' and confupdtype='a' and confmatchtype='s' and not condeferrable and not condeferred and convalidated) then
    raise exception 'Unknown publication fence columns/FK cleanup' using errcode='55000';
  end if;
  select * into strict p from pg_catalog.pg_proc where oid=helper_oid;
  if p.proowner<>owner_oid or p.pronamespace<>ns_oid or p.prolang<>language_oid or p.prosrc<>fence_body or
     not p.prosecdef or p.proconfig is distinct from array['search_path=""'] or p.prorettype<>'pg_catalog.void'::regtype or
     p.proargtypes<>'2950'::oidvector or p.proargnames is distinct from array['p_asset_id'] or p.pronargdefaults<>0 or
     p.proretset or p.proisstrict or p.proleakproof or p.prokind<>'f' or p.provolatile<>'v' or p.proparallel<>'u' or
     exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) where grantee<>owner_oid) then
    raise exception 'Unknown private publication fence function' using errcode='55000';
  end if;
  if changed then
    for entry in select value from pg_catalog.jsonb_array_elements(expected) loop
      execute entry->>'createFunction';
    end loop;
  end if;
  -- Preserve existing guard OIDs, triggers/constraints, metadata and exact new bodies.
  for entry in select value from pg_catalog.jsonb_array_elements(expected) loop
    select * into strict p from pg_catalog.pg_proc where pronamespace=ns_oid and proname=entry->>'name';
    if (pg_catalog.to_jsonb(p)-array['oid','pronamespace','proowner','prolang']) is distinct from entry->'afterRaw' then
      raise exception 'Publication fence guard postcondition failed' using errcode='55000';
    end if;
  end loop;
end;
$publication_fence$;

-- Supplemental coordination backed by both R254 actual annual RR REDs.
-- Execute only together with the preceding exact three-guard fence in ONE atomic
-- transaction, setting deadlines BEFORE submission. Original annual/RPC bodies and
-- their deferred checks remain unchanged; these hooks only coordinate row versions.
DO $annual_fence$
declare
  baseline_functions constant jsonb := $baseline$[
  {
    "schema": "private",
    "name": "enforce_annual_report_asset",
    "arguments": "",
    "definitionMd5": "a2a1ae57e09fa1318a0f73f34f845199",
    "metadata": {
      "allargs": "",
      "defaults": 0,
      "default_expression": null,
      "result": "trigger",
      "owner": "postgres",
      "acl": null,
      "full_acl": [
        {
          "grantee": "PUBLIC",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        },
        {
          "grantee": "postgres",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        }
      ],
      "config": [
        "search_path=\"\""
      ],
      "definer": true,
      "language": "plpgsql",
      "kind": "f",
      "cost": 100,
      "rows": 0,
      "strict": false,
      "leakproof": false,
      "parallel": "u",
      "volatility": "v",
      "support": "-",
      "variadic": "-",
      "modes": null,
      "body": "5abab89f90631153ba7737ef69d046d3"
    }
  },
  {
    "schema": "private",
    "name": "protect_published_annual_report_asset",
    "arguments": "",
    "definitionMd5": "a6091b65cb3f8450df02687546cc0855",
    "metadata": {
      "allargs": "",
      "defaults": 0,
      "default_expression": null,
      "result": "trigger",
      "owner": "postgres",
      "acl": null,
      "full_acl": [
        {
          "grantee": "PUBLIC",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        },
        {
          "grantee": "postgres",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        }
      ],
      "config": [
        "search_path=\"\""
      ],
      "definer": true,
      "language": "plpgsql",
      "kind": "f",
      "cost": 100,
      "rows": 0,
      "strict": false,
      "leakproof": false,
      "parallel": "u",
      "volatility": "v",
      "support": "-",
      "variadic": "-",
      "modes": null,
      "body": "0c330175c7659dc022eee56dbefc0978"
    }
  },
  {
    "schema": "public",
    "name": "mutate_annual_report_with_audit",
    "arguments": "p_actor_user_id uuid, p_operation text, p_id uuid, p_values jsonb",
    "definitionMd5": "8da75b9640ccf141d86332bfa06e3fd1",
    "metadata": {
      "allargs": "p_actor_user_id uuid, p_operation text, p_id uuid, p_values jsonb DEFAULT '{}'::jsonb",
      "defaults": 1,
      "default_expression": "'{}'::jsonb",
      "result": "uuid",
      "owner": "postgres",
      "acl": "{postgres=X/postgres,service_role=X/postgres}",
      "full_acl": [
        {
          "grantee": "postgres",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        },
        {
          "grantee": "service_role",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        }
      ],
      "config": [
        "search_path=\"\""
      ],
      "definer": false,
      "language": "plpgsql",
      "kind": "f",
      "cost": 100,
      "rows": 0,
      "strict": false,
      "leakproof": false,
      "parallel": "u",
      "volatility": "v",
      "support": "-",
      "variadic": "-",
      "modes": null,
      "body": "86e7132631e1e42fa512ed1ca938304c"
    }
  },
  {
    "schema": "public",
    "name": "mutate_document_asset_with_audit",
    "arguments": "p_actor_user_id uuid, p_operation text, p_id uuid, p_values jsonb",
    "definitionMd5": "af3a1f065e6fe7e63bde1f0e44711fad",
    "metadata": {
      "allargs": "p_actor_user_id uuid, p_operation text, p_id uuid, p_values jsonb DEFAULT '{}'::jsonb",
      "defaults": 1,
      "default_expression": "'{}'::jsonb",
      "result": "uuid",
      "owner": "postgres",
      "acl": "{postgres=X/postgres,service_role=X/postgres}",
      "full_acl": [
        {
          "grantee": "postgres",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        },
        {
          "grantee": "service_role",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        }
      ],
      "config": [
        "search_path=\"\""
      ],
      "definer": false,
      "language": "plpgsql",
      "kind": "f",
      "cost": 100,
      "rows": 0,
      "strict": false,
      "leakproof": false,
      "parallel": "u",
      "volatility": "v",
      "support": "-",
      "variadic": "-",
      "modes": null,
      "body": "1cbac745d9f393ddfd8aa487b9d89a3f"
    }
  }
]$baseline$::jsonb;
  baseline_modern_functions constant jsonb := $modernbaseline$[
  {
    "schema": "private",
    "name": "enforce_annual_report_asset",
    "arguments": "",
    "definitionMd5": "2e27f9b691398f0c1d8c0d02ba1c42ef",
    "metadata": {
      "allargs": "",
      "defaults": 0,
      "default_expression": null,
      "result": "trigger",
      "owner": "postgres",
      "acl": null,
      "full_acl": [
        {
          "grantee": "PUBLIC",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        },
        {
          "grantee": "postgres",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        }
      ],
      "config": [
        "search_path=\"\""
      ],
      "definer": true,
      "language": "plpgsql",
      "kind": "f",
      "cost": 100,
      "rows": 0,
      "strict": false,
      "leakproof": false,
      "parallel": "u",
      "volatility": "v",
      "support": "-",
      "variadic": "-",
      "modes": null,
      "body": "db3de97534d2516bc613bd1dff5ce78c"
    }
  },
  {
    "schema": "private",
    "name": "protect_published_annual_report_asset",
    "arguments": "",
    "definitionMd5": "f7181fe670a3548e00d9bb0e9ba7f9a5",
    "metadata": {
      "allargs": "",
      "defaults": 0,
      "default_expression": null,
      "result": "trigger",
      "owner": "postgres",
      "acl": null,
      "full_acl": [
        {
          "grantee": "PUBLIC",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        },
        {
          "grantee": "postgres",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        }
      ],
      "config": [
        "search_path=\"\""
      ],
      "definer": true,
      "language": "plpgsql",
      "kind": "f",
      "cost": 100,
      "rows": 0,
      "strict": false,
      "leakproof": false,
      "parallel": "u",
      "volatility": "v",
      "support": "-",
      "variadic": "-",
      "modes": null,
      "body": "f8bd98608922f5fd6ee397b249c45d94"
    }
  },
  {
    "schema": "public",
    "name": "mutate_annual_report_with_audit",
    "arguments": "p_actor_user_id uuid, p_operation text, p_id uuid, p_values jsonb",
    "definitionMd5": "e96e5345ef6e8e461c63c8c490933e8e",
    "metadata": {
      "allargs": "p_actor_user_id uuid, p_operation text, p_id uuid, p_values jsonb DEFAULT '{}'::jsonb",
      "defaults": 1,
      "default_expression": "'{}'::jsonb",
      "result": "uuid",
      "owner": "postgres",
      "acl": "{postgres=X/postgres,service_role=X/postgres}",
      "full_acl": [
        {
          "grantee": "postgres",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        },
        {
          "grantee": "service_role",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        }
      ],
      "config": [
        "search_path=\"\""
      ],
      "definer": false,
      "language": "plpgsql",
      "kind": "f",
      "cost": 100,
      "rows": 0,
      "strict": false,
      "leakproof": false,
      "parallel": "u",
      "volatility": "v",
      "support": "-",
      "variadic": "-",
      "modes": null,
      "body": "49f5b63923eb9256603b87cb9eb51362"
    }
  },
  {
    "schema": "public",
    "name": "mutate_document_asset_with_audit",
    "arguments": "p_actor_user_id uuid, p_operation text, p_id uuid, p_values jsonb",
    "definitionMd5": "78cc2a1238cc3e41496899516aa13133",
    "metadata": {
      "allargs": "p_actor_user_id uuid, p_operation text, p_id uuid, p_values jsonb DEFAULT '{}'::jsonb",
      "defaults": 1,
      "default_expression": "'{}'::jsonb",
      "result": "uuid",
      "owner": "postgres",
      "acl": "{postgres=X/postgres,service_role=X/postgres}",
      "full_acl": [
        {
          "grantee": "postgres",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        },
        {
          "grantee": "service_role",
          "grantor": "postgres",
          "grantable": false,
          "privilege": "EXECUTE"
        }
      ],
      "config": [
        "search_path=\"\""
      ],
      "definer": false,
      "language": "plpgsql",
      "kind": "f",
      "cost": 100,
      "rows": 0,
      "strict": false,
      "leakproof": false,
      "parallel": "u",
      "volatility": "v",
      "support": "-",
      "variadic": "-",
      "modes": null,
      "body": "d42b98066c038f1f2c76a6c109f1e810"
    }
  }
]$modernbaseline$::jsonb;

  baseline_selected jsonb; baseline_candidate jsonb; baseline_match_count integer:=0;
  entry jsonb; actual jsonb; function_count integer;
  ns oid; owner_oid oid; lang oid; asset_oid oid; annual_oid oid;
  p record;t record;helper_count integer;trigger_count integer;
  publication_body constant text := $pub$
begin
  if new.is_published then
    perform 1 from public.document_assets where id=new.document_asset_id for update;
    if not found then
      raise exception 'Annual report PDF not found' using errcode='23514';
    end if;
    perform private.touch_document_publication_fence(new.document_asset_id);
  end if;
  return new;
end;
$pub$;
  inverse_body constant text := $inverse$
begin
  if old.kind='annual_report' and (new.kind is distinct from old.kind or not new.is_published) then
    perform private.touch_document_publication_fence(new.id);
  end if;
  return new;
end;
$inverse$;
begin
  if current_user<>'postgres' or current_setting('server_version_num') not in ('170006','170011') then
    raise exception 'Unknown annual fence actor/server profile' using errcode='55000';
  end if;
  select oid into strict ns from pg_catalog.pg_namespace where nspname='private';
  select oid into strict owner_oid from pg_catalog.pg_roles where rolname='postgres';
  select oid into strict lang from pg_catalog.pg_language where lanname='plpgsql';
  asset_oid:='public.document_assets'::regclass;annual_oid:='public.annual_reports'::regclass;
  if pg_catalog.to_regclass('private.document_publication_fences') is null or
    pg_catalog.to_regprocedure('private.touch_document_publication_fence(uuid)') is null then
    raise exception 'Exact preceding three-guard fence required' using errcode='55000';
  end if;
  lock table public.document_assets,public.annual_reports in share row exclusive mode;
  -- One complete measured raw cohort; mixed line-ending/body pairs are unsupported.
  for baseline_candidate in select value from pg_catalog.jsonb_array_elements(
    pg_catalog.jsonb_build_array(baseline_functions,baseline_modern_functions)) loop
    if not exists (
      select 1 from pg_catalog.jsonb_array_elements(baseline_candidate) e
      where (select count(*) from pg_catalog.pg_proc f
        join pg_catalog.pg_namespace n on n.oid=f.pronamespace
        where n.nspname=e->>'schema' and f.proname=e->>'name'
          and pg_catalog.pg_get_function_identity_arguments(f.oid)=e->>'arguments'
          and pg_catalog.md5(pg_catalog.pg_get_functiondef(f.oid))=e->>'definitionMd5'
          and pg_catalog.md5(f.prosrc)=e->'metadata'->>'body')<>1
    ) then
      baseline_selected := baseline_candidate;
      baseline_match_count := baseline_match_count+1;
    end if;
  end loop;
  if baseline_match_count<>1 then
    raise exception 'Unknown annual/RPC complete raw cohort' using errcode='55000';
  end if;
  -- Existing annual/RPC bodies, signatures, owner, grants and execution attributes.
  for entry in select value from pg_catalog.jsonb_array_elements(baseline_selected) loop
    select count(*) into function_count from pg_catalog.pg_proc f
    join pg_catalog.pg_namespace n on n.oid=f.pronamespace
    where n.nspname=entry->>'schema' and f.proname=entry->>'name'
      and pg_catalog.pg_get_function_identity_arguments(f.oid)=entry->>'arguments'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(f.oid))=entry->>'definitionMd5';
    if function_count<>1 then
      raise exception 'Unknown annual/RPC function contract: %',entry->>'name' using errcode='55000';
    end if;
    select pg_catalog.jsonb_build_object(
      'allargs',pg_catalog.pg_get_function_arguments(f.oid),
      'defaults',f.pronargdefaults,'default_expression',pg_catalog.pg_get_expr(f.proargdefaults,0),
      'result',pg_catalog.pg_get_function_result(f.oid),'owner',pg_catalog.pg_get_userbyid(f.proowner),
      'acl',f.proacl::text,'full_acl',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'grantor',pg_catalog.pg_get_userbyid(a.grantor),
        'grantee',case when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,
        'privilege',a.privilege_type,'grantable',a.is_grantable)
        order by pg_catalog.pg_get_userbyid(a.grantor),
          case when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,a.privilege_type)
        from pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a),
      'config',f.proconfig,'definer',f.prosecdef,'language',l.lanname,'kind',f.prokind,
      'cost',f.procost,'rows',f.prorows,'strict',f.proisstrict,'leakproof',f.proleakproof,
      'parallel',f.proparallel,'volatility',f.provolatile,'support',f.prosupport::text,
      'variadic',f.provariadic::regtype::text,'modes',f.proargmodes,
      'body',pg_catalog.md5(f.prosrc)) into actual
    from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid=f.pronamespace
    join pg_catalog.pg_language l on l.oid=f.prolang
    where n.nspname=entry->>'schema' and f.proname=entry->>'name'
      and pg_catalog.pg_get_function_identity_arguments(f.oid)=entry->>'arguments';
    if actual is distinct from entry->'metadata' then
      raise exception 'Unknown annual/RPC owner/ACL/default/signature contract: %',entry->>'name' using errcode='55000';
    end if;
  end loop;


  select count(*) into helper_count from pg_catalog.pg_proc where pronamespace=ns
    and proname in ('coordinate_annual_report_publication','coordinate_annual_asset_change');
  select count(*) into trigger_count from pg_catalog.pg_trigger
    where tgname in ('zz_coordinate_annual_report_publication','aa_coordinate_annual_asset_change');
  if not ((helper_count=0 and trigger_count=0) or (helper_count=2 and trigger_count=2)) then
    raise exception 'Partial or ambiguous annual fence hooks' using errcode='55000';
  end if;
  if helper_count=0 then
    execute 'create function private.coordinate_annual_report_publication() returns trigger language plpgsql security definer set search_path to '''' as '||pg_catalog.quote_literal(publication_body);
    execute 'create function private.coordinate_annual_asset_change() returns trigger language plpgsql security definer set search_path to '''' as '||pg_catalog.quote_literal(inverse_body);
    alter function private.coordinate_annual_report_publication() owner to postgres;
    alter function private.coordinate_annual_asset_change() owner to postgres;
    revoke all on function private.coordinate_annual_report_publication() from public,anon,authenticated,service_role;
    revoke all on function private.coordinate_annual_asset_change() from public,anon,authenticated,service_role;
    create trigger zz_coordinate_annual_report_publication after insert or update on public.annual_reports
      for each row execute function private.coordinate_annual_report_publication();
    create trigger aa_coordinate_annual_asset_change before update of kind,is_published on public.document_assets
      for each row execute function private.coordinate_annual_asset_change();
  end if;
  for entry in select value from pg_catalog.jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('helper','coordinate_annual_report_publication','trigger','zz_coordinate_annual_report_publication',
      'body',publication_body,'relation',annual_oid::text,'type',21,'attributes',''),
    jsonb_build_object('helper','coordinate_annual_asset_change','trigger','aa_coordinate_annual_asset_change',
      'body',inverse_body,'relation',asset_oid::text,'type',19,'attributes',
       (select string_agg(attnum::text,' ' order by case attname when 'kind' then 0 else 1 end)
        from pg_catalog.pg_attribute where attrelid=asset_oid and attname in ('kind','is_published') and not attisdropped)))) loop
    if (select count(*) from pg_catalog.pg_proc where pronamespace=ns and proname=entry->>'helper')<>1 then
      raise exception 'Foreign annual fence helper overload' using errcode='55000';
    end if;
    select * into strict p from pg_catalog.pg_proc where pronamespace=ns and proname=entry->>'helper';
    if p.proowner<>owner_oid or p.prolang<>lang or p.prosrc<>entry->>'body' or p.prorettype<>'pg_catalog.trigger'::regtype or
      p.pronargs<>0 or p.pronargdefaults<>0 or p.proargtypes<>''::oidvector or p.proargnames is not null or
      p.proallargtypes is not null or p.proargmodes is not null or p.proargdefaults is not null or
      p.provariadic<>0 or p.prosupport<>0 or p.protrftypes is not null or p.probin is not null or p.prosqlbody is not null or
      p.prokind<>'f' or p.procost<>100 or p.prorows<>0 or p.proretset or p.proisstrict or p.proleakproof or
      not p.prosecdef or p.provolatile<>'v' or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=""'] or
      exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner)))
        where grantee<>owner_oid or privilege_type<>'EXECUTE' or is_grantable) then
      raise exception 'Unknown annual fence function/permission contract' using errcode='55000';
    end if;
    select * into strict t from pg_catalog.pg_trigger where tgname=entry->>'trigger';
    if t.tgrelid<>(entry->>'relation')::oid or t.tgfoid<>p.oid or t.tgtype<>(entry->>'type')::smallint or
      t.tgattr::text is distinct from entry->>'attributes' or t.tgisinternal or t.tgenabled<>'O' or
      t.tgparentid<>0 or t.tgconstraint<>0 or t.tgconstrrelid<>0 or t.tgconstrindid<>0 or
      t.tgdeferrable or t.tginitdeferred or t.tgnargs<>0 or t.tgargs<>'\x'::bytea or
      t.tgqual is not null or t.tgoldtable is not null or t.tgnewtable is not null then
      raise exception 'Unknown annual fence trigger contract' using errcode='55000';
    end if;
  end loop;
  -- No CREATE OR REPLACE on any original annual/RPC function.
  for entry in select value from pg_catalog.jsonb_array_elements(baseline_selected) loop
    if (select count(*) from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid=f.pronamespace
      where n.nspname=entry->>'schema' and f.proname=entry->>'name'
        and pg_catalog.pg_get_function_identity_arguments(f.oid)=entry->>'arguments'
        and pg_catalog.md5(pg_catalog.pg_get_functiondef(f.oid))=entry->>'definitionMd5'
        and pg_catalog.md5(f.prosrc)=entry->'metadata'->>'body')<>1 then
      raise exception 'Original annual/RPC body changed' using errcode='55000';
    end if;
  end loop;
end;
$annual_fence$;
