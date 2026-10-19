import { createHash } from "node:crypto";

export type VolunteerDbRepairSources = Readonly<{
  registrationReason: string;
  singleProjection: string;
  pageProjection: string;
}>;

const sourceHashes: Record<keyof VolunteerDbRepairSources, string> = {
  registrationReason: "3441aac3a10466ec97020049aceab78b9b6cbbf3a55810a92cf965f5e7ed3fd8",
  singleProjection: "5eb13df03cf20aa503b2d746121a23121282f7a4014db403a45b42aa4f6b26f2",
  pageProjection: "e590e7e831e37ad3b2bcadc862cf6cb55fa5c004724c52a10d63817a683d3087",
};

function reviewedSource(name: keyof VolunteerDbRepairSources, source: string): string {
  const canonical = source.replaceAll("\r\n", "\n");
  if (createHash("sha256").update(canonical).digest("hex") !== sourceHashes[name])
    throw new Error("Unreviewed volunteer repair source: " + name);
  return canonical;
}

function replaceOnce(source: string, before: string, after: string): string {
  if (source.split(before).length !== 2)
    throw new Error("Unexpected volunteer repair source anchor");
  return source.replace(before, after);
}

// Match the existing branch's transport without rewriting any surrounding function text.
const chooseBranchEnding = String.raw` declare crlf_branch text; branch_count integer;
 begin
  old_branch:=replace(old_branch,E'\r\n',E'\n');
  new_branch:=replace(new_branch,E'\r\n',E'\n');
  crlf_branch:=replace(old_branch,E'\n',E'\r\n');
  branch_count:=(length(definition)-length(replace(definition,old_branch,'')))/length(old_branch)
   +(length(definition)-length(replace(definition,crlf_branch,'')))/length(crlf_branch);
  if branch_count<>1 then
   raise exception 'Expected exactly one LF or CRLF volunteer list branch';
  end if;
  if strpos(definition,old_branch)=0 then
   old_branch:=crlf_branch;
   new_branch:=replace(new_branch,E'\n',E'\r\n');
  end if;
 end;
`;

const registrationPreflight = `
do $reason_preflight$
declare current_function record;
begin
 if current_user<>'postgres' then
  raise exception 'Unexpected volunteer repair executor' using errcode='55000';
 end if;
 if to_regprocedure('public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)') is not null then
  raise exception 'Volunteer reason signature already exists; reconcile before retry' using errcode='55000';
 end if;
 select p.*,l.lanname into current_function from pg_proc p
 join pg_language l on l.oid=p.prolang
 where p.oid=to_regprocedure('public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean)');
 if not found then
  raise exception 'Missing volunteer status prerequisite' using errcode='55000';
 end if;
 if md5(current_function.prosrc) not in('b24093e71ec2d434e16cef1fc6c71b43','3f03cc9e329a95635af9881fc4464342')
  or current_function.prosecdef is not true or current_function.provolatile<>'v'
  or current_function.lanname<>'plpgsql' or current_function.pronargdefaults<>2
  or pg_get_expr(current_function.proargdefaults,0) is distinct from 'NULL::text, true'
  or current_function.prorettype<>'jsonb'::regtype
  or pg_get_userbyid(current_function.proowner)<>'postgres'
  or current_function.proconfig is distinct from array['search_path=public, pg_temp']
  or has_function_privilege('anon',current_function.oid,'execute')
  or has_function_privilege('authenticated',current_function.oid,'execute')
  or not has_function_privilege('service_role',current_function.oid,'execute')
  or (select count(*) from aclexplode(coalesce(current_function.proacl,acldefault('f',current_function.proowner))))<>2
  or exists(select 1 from aclexplode(coalesce(current_function.proacl,acldefault('f',current_function.proowner))) acl
   where acl.grantee not in(current_function.proowner,'service_role'::regrole)
    or acl.grantor<>current_function.proowner or acl.privilege_type<>'EXECUTE' or acl.is_grantable) then
  raise exception 'Unreviewed volunteer status prerequisite' using errcode='55000';
 end if;
end
$reason_preflight$;
`;

/** Prepares reviewable SQL only. The caller must provide one explicit transaction. */
export function prepareVolunteerDbRepair(
  sources: VolunteerDbRepairSources,
): VolunteerDbRepairSources {
  const registrationReason = reviewedSource("registrationReason", sources.registrationReason);
  const single = reviewedSource("singleProjection", sources.singleProjection);
  let page = reviewedSource("pageProjection", sources.pageProjection);
  const singleProjection = replaceOnce(
    single,
    "begin\n  if (",
    "begin\n" + chooseBranchEnding + "  if (",
  );
  page = replaceOnce(
    page,
    "if md5(current_function.prosrc)<>'ab48504596026f742c062cab50c2ca00'",
    "if md5(current_function.prosrc) not in('ab48504596026f742c062cab50c2ca00','8d70bdb192b27066ed63034323db9a8f')",
  );
  const pageProjection = replaceOnce(
    page,
    "begin\n if (length(definition)",
    "begin\n" + chooseBranchEnding + " if (length(definition)",
  );
  return {
    registrationReason: registrationPreflight + registrationReason,
    singleProjection,
    pageProjection,
  };
}
