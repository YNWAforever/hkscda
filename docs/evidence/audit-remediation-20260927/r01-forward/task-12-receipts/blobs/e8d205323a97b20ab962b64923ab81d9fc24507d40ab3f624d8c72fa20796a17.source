/** Ruling61 changes only this existing group command's actor transaction fence. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
export const signatures = ["uuid,uuid,timestamptz,jsonb"];
export async function targetDefinitions(root: string) {
  const source = (await readFile(resolve(root, "supabase/migrations/20260926060314_atomic_group_enquiry_audit.sql"), "utf8")).replaceAll("\r\n", "\n");
  const match = source.match(/create or replace function public\.update_group_enquiry_with_audit\([\s\S]*?\$\$;/i);
  if (!match) throw Error("Exact Task12 legacy definition absent");
  const old = match[0];
  const check = `  if not exists (
    select 1 from public.admin_user
    where auth_user_id = p_actor_user_id
      and status = 'active'
      and role in ('staff', 'admin')
  ) then
    raise exception 'group_enquiry_forbidden' using errcode = '42501';
  end if;`;
  const fence = `  perform 1 from auth.users u
  where u.id = p_actor_user_id
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())
  for share;
  if not found then
    raise exception 'group_enquiry_forbidden' using errcode = '42501';
  end if;

  perform 1 from public.admin_user a
  where a.auth_user_id = p_actor_user_id
    and a.status = 'active'
    and a.role in ('staff', 'admin')
  for share;
  if not found then
    raise exception 'group_enquiry_forbidden' using errcode = '42501';
  end if;`;
  if (old.split(check).length !== 2) throw Error("Exact Task12 actor block differs");
  const clamp = "\nrevoke all on function public.update_group_enquiry_with_audit(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;\ngrant execute on function public.update_group_enquiry_with_audit(uuid,uuid,timestamptz,jsonb) to service_role;\n";
  return [{ name: "update_group_enquiry_with_audit", signature: signatures[0], old: old + clamp, next: old.replace(check, fence) + clamp }];
}
