import { z } from "zod";

const metadataSchema = z
  .object({
    reasonComment: z
      .string()
      .max(2048)
      .refine((s) => !s.includes("\0"))
      .nullable()
      .default(null),
    reasonSecurityLabels: z.array(z.never()).length(0).default([]),
    bulkBodyCanonicalLfSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .default("1d3774c4d4925706650f93a91cf0ae169e3a933cc14bda3d6d870715efefd56d"),
  })
  .strict();

function literal(value: string | null): string {
  return value === null
    ? "null"
    : "E'" + value.replaceAll("\\", "\\\\").replaceAll("'", "''") + "'";
}

// Whole applicable catalog rows, including an absent global row, are pinned.
// This reference profile comes from the archived synthetic schema, not production.
const approvedDefaultAcl = [
  {
    scope: "public",
    owner: "postgres",
    entries: ["anon", "authenticated", "postgres", "service_role"].map((grantee) => ({
      grantee,
      grantor: "postgres",
      privilege: "EXECUTE",
      grantable: false,
    })),
  },
];

const defaultAclQuery = `
 select coalesce(jsonb_agg(row_value order by scope collate "C"),'[]'::jsonb)
 from (
  select case when d.defaclnamespace=0 then 'global' else 'public' end scope,
   jsonb_build_object(
    'scope',case when d.defaclnamespace=0 then 'global' else 'public' end,
    'owner',pg_get_userbyid(d.defaclrole),
    'entries',(select coalesce(jsonb_agg(jsonb_build_object(
     'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
     'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
     order by (case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end) collate "C",
      pg_get_userbyid(a.grantor) collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb)
     from aclexplode(d.defaclacl) a)) row_value
  from pg_default_acl d
  where d.defaclrole=owner_oid and d.defaclobjtype='f'
   and d.defaclnamespace in(0,'public'::regnamespace)
 ) applicable_defaults`;

const exactAcl = `
 select coalesce(jsonb_agg(jsonb_build_object(
  'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
  'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
  order by (case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end) collate "C",
   pg_get_userbyid(a.grantor) collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb)
 from aclexplode(coalesce(current_function.proacl,acldefault('f',current_function.proowner))) a`;

const aclCheck = `
 actual_acl:=(${exactAcl});
 expected_acl:=jsonb_build_array(jsonb_build_object('grantee','postgres',
  'grantor','postgres','privilege','EXECUTE','grantable',false));
 if target.service_access then
  expected_acl:=expected_acl||jsonb_build_array(jsonb_build_object('grantee','service_role',
   'grantor','postgres','privilege','EXECUTE','grantable',false));
 end if;
 if current_function.proowner<>owner_oid or actual_acl is distinct from expected_acl
  or exists(select 1 from pg_roles r where not r.rolsuper
   and r.oid<>owner_oid and (not target.service_access or r.rolname<>'service_role')
   and has_function_privilege(r.oid,current_function.oid,'EXECUTE')) then
  raise exception 'Unexpected volunteer release owner or full ACL: %',target.signature using errcode='55000';
 end if;
`;

const dependencyQuery = `
 select coalesce(jsonb_agg(to_jsonb(d)-'objid'
  order by d.classid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype),'[]'::jsonb)
 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=reason_oid`;
const sharedDependencyQuery = `
 select coalesce(jsonb_agg(to_jsonb(d)-'objid'
  order by d.classid,d.objsubid,d.refclassid,d.refobjid,d.deptype),'[]'::jsonb)
 from pg_shdepend d where d.dbid=(select oid from pg_database where datname=current_database())
 and d.classid='pg_proc'::regclass and d.objid=reason_oid`;

/** Emits one atomic DO envelope only; no database/network access. */
export function prepareVolunteerReleaseGuards(
  stages: Readonly<{
    registrationReason: string;
    singleProjection: string;
    pageProjection: string;
  }>,
  metadata: unknown = {},
): string {
  const parsed = metadataSchema.safeParse(metadata);
  if (!parsed.success) throw new Error("Unsupported volunteer repair metadata");
  const reviewed = parsed.data;
  const expectedComment = literal(reviewed.reasonComment);
  const expectedDefaults = literal(JSON.stringify(approvedDefaultAcl));
  const predictedBranches = [
    [stages.singleProjection, "old", "new"],
    [stages.pageProjection, "old_branch", "new_branch"],
  ]
    .map(([stage, oldTag, newTag]) => {
      const old = stage.match(
        new RegExp("\\$" + oldTag + "\\$([\\s\\S]*?)\\$" + oldTag + "\\$"),
      )?.[1];
      const replacement = stage.match(
        new RegExp("\\$" + newTag + "\\$([\\s\\S]*?)\\$" + newTag + "\\$"),
      )?.[1];
      if (old === undefined || replacement === undefined)
        throw new Error("Missing pinned release branch");
      return `
 if strpos(predicted_bulk,${literal(old)})>0 then
  predicted_bulk:=replace(predicted_bulk,${literal(old)},${literal(replacement)});
 else
  predicted_bulk:=replace(predicted_bulk,replace(${literal(old)},E'\\n',E'\\r\\n'),
   replace(${literal(replacement)},E'\\n',E'\\r\\n'));
 end if;`;
    })
    .join("\n");
  const body = `declare
 owner_oid oid:='postgres'::regrole;
 reason_oid oid;
 reason_before jsonb;
 bulk_before jsonb;
 rows_before jsonb;
 predicted_bulk text;
 reason_dependencies jsonb;
 reason_shared_dependencies jsonb;
 actual_acl jsonb; expected_acl jsonb;
 builtin_default_acl jsonb;
 target record; current_function record;
 approved_comment text:=${expectedComment};
begin
 if current_user<>'postgres' or session_user<>'postgres'
  or current_setting('server_version_num')::int not between 170000 and 179999
  or current_setting('search_path')<>'pg_catalog' then
  raise exception 'Unexpected volunteer release executor or catalog environment' using errcode='55000';
 end if;
 if exists(select 1 from pg_event_trigger where evtenabled<>'D') then
  raise exception 'Unsupported volunteer release DDL event triggers' using errcode='55000';
 end if;
 select jsonb_agg(jsonb_build_object(
  'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
  'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
  order by (case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end) collate "C")
 into builtin_default_acl from aclexplode(acldefault('f',owner_oid)) a;
 if builtin_default_acl is distinct from
  '[{"grantee":"PUBLIC","grantor":"postgres","privilege":"EXECUTE","grantable":false},{"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE","grantable":false}]'::jsonb then
  raise exception 'Unsupported built-in FUNCTION default ACL' using errcode='55000';
 end if;
 if (${defaultAclQuery}) is distinct from ${expectedDefaults}::jsonb then
  raise exception 'Unreviewed creator default FUNCTION ACL' using errcode='55000';
 end if;
 if to_regprocedure('public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)') is not null
  or to_regprocedure('public.volunteer_activity_workspace_candidates(jsonb)') is not null
  or to_regprocedure('public.volunteer_activity_workspace_project(uuid[],jsonb)') is not null then
  raise exception 'Volunteer release already or partially applied; reconcile before retry' using errcode='55000';
 end if;
 reason_oid:=to_regprocedure('public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean)');
 select p.*,l.lanname into current_function from pg_proc p join pg_language l on l.oid=p.prolang
 where p.oid=reason_oid;
 if not found then raise exception 'Missing volunteer release reason prerequisite' using errcode='55000';end if;
 if current_function.proname<>'set_volunteer_registration_status_with_audit'
  or current_function.pronamespace<>'public'::regnamespace
  or current_function.prokind<>'f' or current_function.proretset or current_function.provariadic<>0
  or current_function.proisstrict or current_function.proparallel<>'u' or current_function.proleakproof
  or current_function.procost<>100 or current_function.prorows<>0 or current_function.prosupport<>0
  or current_function.prosqlbody is not null or current_function.proallargtypes is not null
  or current_function.proargmodes is not null or current_function.pronargs<>6
  or current_function.proargnames is distinct from array['p_registration_id','p_actor_user_id','p_expected_updated_at','p_status','p_internal_notes','p_update_internal_notes']
  or array(select unnest(current_function.proargtypes)) is distinct from
   array['uuid'::regtype::oid,'uuid'::regtype::oid,'timestamptz'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'boolean'::regtype::oid]
  or obj_description(reason_oid,'pg_proc') is distinct from approved_comment
  or exists(select 1 from pg_seclabel where classoid='pg_proc'::regclass and objoid=reason_oid)
  or exists(select 1 from pg_init_privs where classoid='pg_proc'::regclass and objoid=reason_oid) then
  raise exception 'Unsupported volunteer reason signature, attributes, comment or security labels' using errcode='55000';
 end if;
 -- Reject native incoming dependencies; never use CASCADE. String-body callers are reviewed separately.
 if exists(select 1 from pg_depend where refclassid='pg_proc'::regclass and refobjid=reason_oid)
  or (select count(*) from pg_depend where classid='pg_proc'::regclass and objid=reason_oid)<>2
  or exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=reason_oid
   and (d.objsubid<>0 or d.refobjsubid<>0 or d.deptype<>'n'
    or not(d.refclassid='pg_namespace'::regclass and d.refobjid='public'::regnamespace
     or d.refclassid='pg_language'::regclass and d.refobjid=current_function.prolang)))
  or exists(select 1 from pg_shdepend d where d.dbid=(select oid from pg_database where datname=current_database())
   and d.classid='pg_proc'::regclass and d.objid=reason_oid
   and (d.objsubid<>0 or d.refclassid<>'pg_authid'::regclass or d.deptype not in('o','a')
    or d.refobjid not in(owner_oid,'service_role'::regrole))) then
  raise exception 'Unsupported volunteer reason dependency' using errcode='55000';
 end if;
 reason_dependencies:=(${dependencyQuery});
 reason_shared_dependencies:=(${sharedDependencyQuery});
 select to_jsonb(p)-array['oid','prosrc','proacl','pronargs','pronargdefaults','proargtypes','proargnames','proargdefaults']
 into reason_before from pg_proc p where p.oid=reason_oid;
 for target in select * from(values
  ('public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean)',true,'plpgsql','v'),
  ('public.volunteer_bulk_command(uuid,jsonb)',true,'plpgsql','v'),
  ('public.volunteer_activity_workspace_rows(jsonb)',false,'sql','s')
 )v(signature,service_access,language_name,volatility)
 loop
  select p.*,l.lanname into current_function from pg_proc p join pg_language l on l.oid=p.prolang
  where p.oid=to_regprocedure(target.signature);
  if not found then raise exception 'Missing volunteer release function: %',target.signature using errcode='55000';end if;
  if current_function.lanname::text<>target.language_name or current_function.provolatile::text<>target.volatility
   or not current_function.prosecdef or current_function.prokind<>'f' or current_function.proisstrict
   or current_function.proparallel<>'u' or current_function.proleakproof or current_function.prosupport<>0
   or current_function.procost<>100 or current_function.prorows<>(case when current_function.proretset then 1000 else 0 end)
   or current_function.provariadic<>0 or current_function.prosqlbody is not null
   or current_function.proconfig is distinct from array['search_path=public, pg_temp'] then
   raise exception 'Unsupported volunteer release function attributes: %',target.signature using errcode='55000';
  end if;
  if target.signature not like 'public.set_volunteer_registration_status_with_audit(%'
   and (current_function.pronargdefaults<>0 or current_function.proargdefaults is not null
    or current_function.prorettype<>'jsonb'::regtype
    or obj_description(current_function.oid,'pg_proc') is not null
    or exists(select 1 from pg_seclabel where classoid='pg_proc'::regclass and objoid=current_function.oid)
    or exists(select 1 from pg_init_privs where classoid='pg_proc'::regclass and objoid=current_function.oid)) then
   raise exception 'Unsupported volunteer release defaults or metadata: %',target.signature using errcode='55000';
  end if;
  ${aclCheck}
 end loop;
 if (select encode(sha256(convert_to(replace(prosrc,E'\\r\\n',E'\\n'),'UTF8')),'hex')
  from pg_proc where oid='public.volunteer_bulk_command(uuid,jsonb)'::regprocedure)
  is distinct from ${literal(reviewed.bulkBodyCanonicalLfSha256)} then
  raise exception 'Unreviewed volunteer bulk body' using errcode='55000';
 end if;
 select to_jsonb(p)-array['prosrc','proacl'] into bulk_before from pg_proc p
  where oid='public.volunteer_bulk_command(uuid,jsonb)'::regprocedure;
 select to_jsonb(p)-array['prosrc','proacl'] into rows_before from pg_proc p
  where oid='public.volunteer_activity_workspace_rows(jsonb)'::regprocedure;
 select prosrc into predicted_bulk from pg_proc where oid='public.volunteer_bulk_command(uuid,jsonb)'::regprocedure;
 ${predictedBranches}

 -- Pinned stages: reason prerequisite -> M2 -> M3. No business RPC is invoked.
 ${stages.registrationReason}
 ${stages.singleProjection}
 ${stages.pageProjection}

 execute format('comment on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text) is %L',approved_comment);
 -- Release final assertions. Any unexpected grant/metadata aborts the owning transaction.
 reason_oid:='public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)'::regprocedure;
 if to_regprocedure('public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean)') is not null
  or (select to_jsonb(p)-array['oid','prosrc','proacl','pronargs','pronargdefaults','proargtypes','proargnames','proargdefaults']
   from pg_proc p where p.oid=reason_oid) is distinct from reason_before
  or (select md5(prosrc) from pg_proc where oid=reason_oid)<>'f427596200e04db5541c69586c209620'
  or (select pronargs<>7 or pronargdefaults<>3
   or pg_get_expr(proargdefaults,0) is distinct from 'NULL::text, true, NULL::text'
   or proargnames is distinct from array['p_registration_id','p_actor_user_id','p_expected_updated_at','p_status','p_internal_notes','p_update_internal_notes','p_reason']
   or array(select unnest(proargtypes)) is distinct from
    array['uuid'::regtype::oid,'uuid'::regtype::oid,'timestamptz'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'boolean'::regtype::oid,'text'::regtype::oid]
   from pg_proc where oid=reason_oid)
  or obj_description(reason_oid,'pg_proc') is distinct from approved_comment
  or exists(select 1 from pg_seclabel where classoid='pg_proc'::regclass and objoid=reason_oid)
  or exists(select 1 from pg_init_privs where classoid='pg_proc'::regclass and objoid=reason_oid)
  or exists(select 1 from pg_depend where refclassid='pg_proc'::regclass and refobjid=reason_oid)
  or (${dependencyQuery}) is distinct from reason_dependencies
  or (${sharedDependencyQuery}) is distinct from reason_shared_dependencies
  or (select prosrc from pg_proc where oid='public.volunteer_bulk_command(uuid,jsonb)'::regprocedure) is distinct from predicted_bulk
  or (select to_jsonb(p)-array['prosrc','proacl'] from pg_proc p where oid='public.volunteer_bulk_command(uuid,jsonb)'::regprocedure) is distinct from bulk_before
  or (select to_jsonb(p)-array['prosrc','proacl'] from pg_proc p where oid='public.volunteer_activity_workspace_rows(jsonb)'::regprocedure) is distinct from rows_before
  or (${defaultAclQuery}) is distinct from ${expectedDefaults}::jsonb then
  raise exception 'Volunteer release final metadata/dependency mismatch' using errcode='55000';
 end if;
 for target in select * from(values
  ('public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)',true,'f427596200e04db5541c69586c209620'),
  ('public.volunteer_bulk_command(uuid,jsonb)',true,null),
  ('public.volunteer_activity_workspace_rows(jsonb)',false,'6b4ac02668efdfb0afef389042779327'),
  ('public.volunteer_activity_workspace_candidates(jsonb)',false,'0b3cfeced37a06ec57ce9d0b59867282'),
  ('public.volunteer_activity_workspace_project(uuid[],jsonb)',false,'ece836568c83c0407b99a9a25db9f285')
 )v(signature,service_access,body_md5)
 loop
  select * into current_function from pg_proc where oid=to_regprocedure(target.signature);
  if not found then raise exception 'Missing volunteer release final function' using errcode='55000';end if;
  if (target.body_md5 is not null and md5(current_function.prosrc)<>target.body_md5)
   or current_function.proconfig is distinct from array['search_path=public, pg_temp']
   or not current_function.prosecdef
   or exists(select 1 from pg_seclabel where classoid='pg_proc'::regclass and objoid=current_function.oid)
   or (current_function.oid<>reason_oid and obj_description(current_function.oid,'pg_proc') is not null) then
   raise exception 'Unexpected volunteer release final body or metadata' using errcode='55000';
  end if;
  ${aclCheck}
 end loop;
end`;
  let delimiter = "$volunteer_release_v2$";
  for (let suffix = 2; body.includes(delimiter); suffix++)
    delimiter = "$volunteer_release_v2_" + suffix + "$";
  return "do " + delimiter + "\n" + body + "\n" + delimiter + ";\n";
}
