/** Ruling48: only two existing SECDEF wrapper actor checks change. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { names } from "./task-11-profile";
export const signatures = ["uuid,uuid", "uuid,uuid", "uuid,uuid,uuid", "uuid,text", "uuid,uuid,integer,integer,timestamptz,uuid"];
const files = ["20260925143941_guarded_provider_denial.sql", "20260925144915_guarded_provider_refund.sql", "20260926082239_atomic_receipt_void_audit.sql", "20260926082239_atomic_receipt_void_audit.sql", "20260926083940_atomic_manual_receipt_issue_audit.sql"];
export async function targetDefinitions(root: string) {
  return Promise.all(names.map(async (name, i) => {
    const raw = await readFile(resolve(root, "supabase/migrations", files[i]), "utf8");
    const source = raw.replaceAll("\r\n", "\n");
    const match = source.match(new RegExp("create(?: or replace)? function public\\." + name + "\\([\\s\\S]*?\\$\\$;", "i"));
    if (!match) throw Error("Exact Task11 legacy definition absent " + name);
    const old = match[0].replace(/^create(?: or replace)? function/i, "create or replace function");
    let next = old;
    if (i === 2 || i === 4) {
      const message = i === 2 ? "receipt_void_admin_required" : "receipt_issue_admin_required";
      const check = `  if not exists (\n    select 1 from public.admin_user\n    where auth_user_id = p_actor\n      and status = 'active'\n      and role in ('treasurer', 'admin')\n  ) then\n    raise exception '${message}' using errcode = '42501';\n  end if;`;
      const fence = `  perform 1 from auth.users u\n  where u.id = p_actor\n    and u.email_confirmed_at is not null\n    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())\n  for share;\n  if not found then\n    raise exception '${message}' using errcode = '42501';\n  end if;\n\n  perform 1 from public.admin_user a\n  where a.auth_user_id = p_actor\n    and a.status = 'active'\n    and a.role in ('treasurer', 'admin')\n  for share;\n  if not found then\n    raise exception '${message}' using errcode = '42501';\n  end if;`;
      if (old.split(check).length !== 2) throw Error("Exact Task11 known actor block differs " + name);
      next = old.replace(check, fence);
    }
    const clamp = `\nrevoke all on function public.${name}(${signatures[i]}) from public,anon,authenticated,service_role;\ngrant execute on function public.${name}(${signatures[i]}) to service_role;\n`;
    return { name, signature: signatures[i], old: old + clamp, next: next + clamp };
  }));
}
