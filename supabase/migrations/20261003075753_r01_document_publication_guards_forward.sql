-- Restore exactly three document publication helpers and three constraint triggers.
-- Known missing-all installation only; exact modern installation is a true no-op.
-- No application data, annual guards, RPC, policies, roles or grants are changed.
do $document_guards$
declare
  expected constant jsonb := $contracts$[
  {
    "name": "enforce_published_knowledge_document_assets",
    "table": "public.knowledge_posts",
    "functionRaw": {
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
    },
    "createFunction": "CREATE FUNCTION private.enforce_published_knowledge_document_assets()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$\ndeclare\n  referenced_asset_id uuid;\nbegin\n  if new.is_published then\n    for referenced_asset_id in\n      select distinct refs.asset_id\n      from unnest(array[\n        new.document_asset_id,\n        new.zh_hk_document_asset_id,\n        new.en_document_asset_id\n      ]) as refs(asset_id)\n      where refs.asset_id is not null\n      order by refs.asset_id\n    loop\n      perform 1\n      from public.document_assets\n      where id = referenced_asset_id\n        and is_published = true\n      for update;\n\n      if not found then\n        raise exception 'Publish the PDF asset before publishing its knowledge post'\n          using errcode = '23514';\n      end if;\n    end loop;\n  end if;\n  return new;\nend;\n$function$\n",
    "createTrigger": "CREATE CONSTRAINT TRIGGER enforce_published_knowledge_document_assets AFTER INSERT OR UPDATE ON public.knowledge_posts DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION private.enforce_published_knowledge_document_assets()"
  },
  {
    "name": "enforce_published_site_document_slot_asset",
    "table": "public.site_document_slots",
    "functionRaw": {
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
    },
    "createFunction": "CREATE FUNCTION private.enforce_published_site_document_slot_asset()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$\nbegin\n  if new.is_published then\n    perform 1\n    from public.document_assets\n    where id = new.document_asset_id\n      and is_published = true\n    for update;\n\n    if not found then\n      raise exception 'Publish the PDF asset before publishing its site document slot'\n        using errcode = '23514';\n    end if;\n  end if;\n  return new;\nend;\n$function$\n",
    "createTrigger": "CREATE CONSTRAINT TRIGGER enforce_published_site_document_slot_asset AFTER INSERT OR UPDATE ON public.site_document_slots DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION private.enforce_published_site_document_slot_asset()"
  },
  {
    "name": "protect_published_document_references",
    "table": "public.document_assets",
    "functionRaw": {
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
    },
    "createFunction": "CREATE FUNCTION private.protect_published_document_references()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$\nbegin\n  if old.is_published and not new.is_published\n    and (\n      exists (\n        select 1\n        from public.site_document_slots\n        where document_asset_id = new.id\n          and is_published = true\n      )\n      or exists (\n        select 1\n        from public.knowledge_posts\n        where is_published = true\n          and new.id in (\n            document_asset_id,\n            zh_hk_document_asset_id,\n            en_document_asset_id\n          )\n      )\n    )\n  then\n    raise exception 'Unpublish public document references before unpublishing their PDF asset'\n      using errcode = '23514';\n  end if;\n  return new;\nend;\n$function$\n",
    "createTrigger": "CREATE CONSTRAINT TRIGGER protect_published_document_references AFTER UPDATE ON public.document_assets DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION private.protect_published_document_references()"
  }
]$contracts$::jsonb;
  columns_expected constant jsonb := $columns$[
  {
    "table": "public.document_assets",
    "columns": [
      {
        "name": "id",
        "position": 1,
        "type": "uuid",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "gen_random_uuid()",
        "rawAcl": null
      },
      {
        "name": "kind",
        "position": 2,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "title",
        "position": 3,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "language",
        "position": 4,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "bucket_name",
        "position": 5,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "'site-documents'::text",
        "rawAcl": null
      },
      {
        "name": "object_path",
        "position": 6,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "mime_type",
        "position": 7,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "'application/pdf'::text",
        "rawAcl": null
      },
      {
        "name": "byte_size",
        "position": 8,
        "type": "bigint",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "checksum_sha256",
        "position": 9,
        "type": "text",
        "notNull": false,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "is_published",
        "position": 10,
        "type": "boolean",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "false",
        "rawAcl": null
      },
      {
        "name": "sort_order",
        "position": 11,
        "type": "integer",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "0",
        "rawAcl": null
      },
      {
        "name": "created_at",
        "position": 12,
        "type": "timestamp with time zone",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "now()",
        "rawAcl": null
      },
      {
        "name": "updated_at",
        "position": 13,
        "type": "timestamp with time zone",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "now()",
        "rawAcl": null
      }
    ]
  },
  {
    "table": "public.site_document_slots",
    "columns": [
      {
        "name": "id",
        "position": 1,
        "type": "uuid",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "gen_random_uuid()",
        "rawAcl": null
      },
      {
        "name": "slot_key",
        "position": 2,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "language",
        "position": 3,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "document_asset_id",
        "position": 4,
        "type": "uuid",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "is_published",
        "position": 5,
        "type": "boolean",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "false",
        "rawAcl": null
      },
      {
        "name": "created_at",
        "position": 6,
        "type": "timestamp with time zone",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "now()",
        "rawAcl": null
      },
      {
        "name": "updated_at",
        "position": 7,
        "type": "timestamp with time zone",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "now()",
        "rawAcl": null
      }
    ]
  },
  {
    "table": "public.knowledge_posts",
    "columns": [
      {
        "name": "id",
        "position": 1,
        "type": "uuid",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "gen_random_uuid()",
        "rawAcl": null
      },
      {
        "name": "title",
        "position": 2,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "topic",
        "position": 3,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "short_intro",
        "position": 4,
        "type": "text",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "external_url",
        "position": 5,
        "type": "text",
        "notNull": false,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "document_asset_id",
        "position": 6,
        "type": "uuid",
        "notNull": false,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "source_name",
        "position": 7,
        "type": "text",
        "notNull": false,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "is_published",
        "position": 8,
        "type": "boolean",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "false",
        "rawAcl": null
      },
      {
        "name": "sort_order",
        "position": 9,
        "type": "integer",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "0",
        "rawAcl": null
      },
      {
        "name": "created_at",
        "position": 10,
        "type": "timestamp with time zone",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "now()",
        "rawAcl": null
      },
      {
        "name": "updated_at",
        "position": 11,
        "type": "timestamp with time zone",
        "notNull": true,
        "identity": "",
        "generated": "",
        "default": "now()",
        "rawAcl": null
      },
      {
        "name": "zh_hk_document_asset_id",
        "position": 12,
        "type": "uuid",
        "notNull": false,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      },
      {
        "name": "en_document_asset_id",
        "position": 13,
        "type": "uuid",
        "notNull": false,
        "identity": "",
        "generated": "",
        "default": null,
        "rawAcl": null
      }
    ]
  }
]$columns$::jsonb;
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
  baseline_selected jsonb; baseline_candidate jsonb; baseline_match_count integer := 0;
  entry jsonb; actual jsonb; p record; t record; c record;
  function_count integer; trigger_count integer; constraint_count integer;
  stage integer; missing_all boolean; mismatch boolean;
  owner_oid oid; private_oid oid; public_oid oid; language_oid oid;
begin
  perform pg_catalog.set_config('lock_timeout','5s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  perform pg_catalog.set_config('search_path','pg_catalog',true);
  if pg_catalog.current_setting('server_version_num') not in ('170006','170011') then
    raise exception 'Unknown document guard server profile' using errcode='55000';
  end if;
  select oid into owner_oid from pg_catalog.pg_roles where rolname='postgres';
  select oid into private_oid from pg_catalog.pg_namespace where nspname='private';
  select oid into public_oid from pg_catalog.pg_namespace where nspname='public';
  select oid into language_oid from pg_catalog.pg_language where lanname='plpgsql';
  if owner_oid is null or private_oid is null or public_oid is null or language_oid is null then
    raise exception 'Missing document guard catalog context' using errcode='55000';
  end if;
  if pg_catalog.to_regclass('public.document_assets') is null or
     pg_catalog.to_regclass('public.site_document_slots') is null or
     pg_catalog.to_regclass('public.knowledge_posts') is null then
    raise exception 'Missing document guard table context' using errcode='55000';
  end if;
  lock table public.document_assets,public.site_document_slots,public.knowledge_posts in share row exclusive mode;

  -- Full selected table-column contracts, not shape guessing from fixture values.
  for entry in select value from pg_catalog.jsonb_array_elements(columns_expected) loop
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',a.attname,'position',a.attnum,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
      'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
      'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid),'rawAcl',a.attacl::text)
      order by a.attnum) into actual
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=pg_catalog.to_regclass(entry->>'table') and a.attnum>0 and not a.attisdropped;
    if actual is distinct from entry->'columns' then
      raise exception 'Unknown document guard table contract: %',entry->>'table' using errcode='55000';
    end if;
  end loop;
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

  for stage in 0..1 loop
    select count(*) into function_count from pg_catalog.pg_proc f
    where f.pronamespace=private_oid and f.proname in
      (select value->>'name' from pg_catalog.jsonb_array_elements(expected));
    select count(*) into trigger_count from pg_catalog.pg_trigger g
    join pg_catalog.pg_class r on r.oid=g.tgrelid
    where r.relnamespace=public_oid and g.tgname in
      (select value->>'name' from pg_catalog.jsonb_array_elements(expected));
    select count(*) into constraint_count from pg_catalog.pg_constraint k
    where k.connamespace=public_oid and k.conname in
      (select value->>'name' from pg_catalog.jsonb_array_elements(expected));
    missing_all := function_count=0 and trigger_count=0 and constraint_count=0;
    if not missing_all and (function_count<>3 or trigger_count<>3 or constraint_count<>3) then
      raise exception 'Partial or ambiguous document guard installation' using errcode='55000';
    end if;
    if missing_all then
      -- 17.11 evidence currently covers only the exact existing modern cohort.
      -- An absent installation on that version has not been measured.
      if pg_catalog.current_setting('server_version_num')='170011' then
        raise exception 'Unmeasured absent document guard installation on 17.11' using errcode='55000';
      end if;
      if stage<>0 or current_user<>'postgres' or exists (
        select 1 from pg_catalog.pg_default_acl
        where defaclrole=owner_oid and defaclobjtype='f' and defaclnamespace in (0,private_oid)
      ) then
        raise exception 'Unknown document guard creation owner/default ACL profile' using errcode='55000';
      end if;
      for entry in select value from pg_catalog.jsonb_array_elements(expected) loop
        execute entry->>'createFunction';
      end loop;
      for entry in select value from pg_catalog.jsonb_array_elements(expected) loop
        execute entry->>'createTrigger';
      end loop;
      continue;
    end if;

    for entry in select value from pg_catalog.jsonb_array_elements(expected) loop
      select count(*) into function_count from pg_catalog.pg_proc f
      where f.pronamespace=private_oid and f.proname=entry->>'name';
      if function_count<>1 then
        raise exception 'Ambiguous document guard function: %',entry->>'name' using errcode='55000';
      end if;
      select * into strict p from pg_catalog.pg_proc f
      where f.pronamespace=private_oid and f.proname=entry->>'name';
      if p.proowner<>owner_oid or p.prolang<>language_oid or
         (pg_catalog.to_jsonb(p)-array['oid','pronamespace','proowner','prolang']) is distinct from entry->'functionRaw' then
        raise exception 'Unknown document guard function: %',entry->>'name' using errcode='55000';
      end if;
      select g.* into t from pg_catalog.pg_trigger g
      where g.tgname=entry->>'name' and g.tgrelid=pg_catalog.to_regclass(entry->>'table');
      if not found or t.tgfoid<>p.oid or
         (pg_catalog.to_jsonb(t)-array['oid','tgrelid','tgfoid','tgconstraint']) is distinct from entry->'triggerRaw' then
        raise exception 'Unknown document guard trigger: %',entry->>'name' using errcode='55000';
      end if;
      select * into c from pg_catalog.pg_constraint k where k.oid=t.tgconstraint;
      if not found or c.conrelid<>t.tgrelid or c.connamespace<>public_oid or
         (pg_catalog.to_jsonb(c)-array['oid','conrelid','connamespace']) is distinct from entry->'constraintRaw' then
        raise exception 'Unknown document guard constraint: %',entry->>'name' using errcode='55000';
      end if;
    end loop;

    -- Compare the entire finite owned dependency closure; no whole-catalog exemption.
    with f as (
      select * from pg_catalog.pg_proc where pronamespace=private_oid and proname in
        (select value->>'name' from pg_catalog.jsonb_array_elements(expected))
    ), g as (
      select x.* from pg_catalog.pg_trigger x join f on f.oid=x.tgfoid
      where x.tgname=f.proname and x.tgrelid=pg_catalog.to_regclass(
        (select value->>'table' from pg_catalog.jsonb_array_elements(expected) where value->>'name'=f.proname))
    ), owned as (
      select 'pg_catalog.pg_proc'::regclass::oid classid,oid objid from f
      union all select 'pg_catalog.pg_trigger'::regclass::oid,oid from g
      union all select 'pg_catalog.pg_constraint'::regclass::oid,tgconstraint from g
    ), required(classid,objid,objsubid,refclassid,refobjid,refobjsubid,deptype) as (
      select 'pg_catalog.pg_proc'::regclass::oid,oid,0,'pg_catalog.pg_namespace'::regclass::oid,private_oid,0,'n'::"char" from f
      union all select 'pg_catalog.pg_proc'::regclass::oid,oid,0,'pg_catalog.pg_language'::regclass::oid,language_oid,0,'n'::"char" from f
      union all select 'pg_catalog.pg_trigger'::regclass::oid,oid,0,'pg_catalog.pg_proc'::regclass::oid,tgfoid,0,'n'::"char" from g
      union all select 'pg_catalog.pg_trigger'::regclass::oid,oid,0,'pg_catalog.pg_class'::regclass::oid,tgrelid,0,'a'::"char" from g
      union all select 'pg_catalog.pg_constraint'::regclass::oid,tgconstraint,0,'pg_catalog.pg_trigger'::regclass::oid,oid,0,'i'::"char" from g
      union all select 'pg_catalog.pg_constraint'::regclass::oid,tgconstraint,0,'pg_catalog.pg_class'::regclass::oid,tgrelid,0,'a'::"char" from g
    ), observed as (
      select d.* from pg_catalog.pg_depend d where exists
        (select 1 from owned o where (d.classid=o.classid and d.objid=o.objid) or
          (d.refclassid=o.classid and d.refobjid=o.objid))
    ), shared_required(dbid,classid,objid,objsubid,refclassid,refobjid,deptype) as (
      select (select oid from pg_catalog.pg_database where datname=current_database()),
        'pg_catalog.pg_proc'::regclass::oid,oid,0,'pg_catalog.pg_authid'::regclass::oid,owner_oid,'o'::"char" from f
    ), shared_observed as (
      select d.* from pg_catalog.pg_shdepend d where d.dbid=(select oid from pg_catalog.pg_database where datname=current_database())
        and exists (select 1 from owned o where d.classid=o.classid and d.objid=o.objid)
    ) select
      (select count(*) from observed)<>18 or
      exists (select * from observed except select * from required) or
      exists (select * from required except select * from observed) or
      (select count(*) from shared_observed)<>3 or
      exists (select * from shared_observed except select * from shared_required) or
      exists (select * from shared_required except select * from shared_observed)
    into mismatch;
    if mismatch then
      raise exception 'Unknown document guard native dependency closure' using errcode='55000';
    end if;
    exit; -- Existing modern installation: validation only, no DDL/no OID changes.
  end loop;
end;
$document_guards$;
