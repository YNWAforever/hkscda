import { afterAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";
const raw = process.env.R01_CRM_ALLOW_LOCAL_FIXTURES === "1" ? process.env.R01_CRM_TEST_DATABASE_URL : undefined;
if (raw) assertCloneUrl(raw);
const db = raw ? new SQL(raw, { max: 2 }) : null;
const at = "2026-10-02T01:00:00Z";
const rollback = new Error("Task6 fixture rollback");
async function fixture(run: (tx: SQL, actor: string, supporter: string) => Promise<void>) {
  if (!db) throw new Error("Owned clone required");
  try { await db.begin(async (tx) => {
    const actor = randomUUID(), supporter = randomUUID();
    await tx`set local role postgres`;
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor+"@example.invalid"},now())`;
    await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor+"@example.invalid"},'treasurer','active')`;
    await tx`insert into public.supporter(id,name,email,language,tags,source) values(${supporter}::uuid,'Synthetic retained supporter',${supporter+"@example.invalid"},'en','{}','test')`;
    await run(tx,actor,supporter);
    throw rollback;
  }); } catch(e) { if(e !== rollback) throw e; }
}
async function state(tx: SQL) {
  const [row] = await tx`select jsonb_build_object('supporter',(select jsonb_agg(to_jsonb(t) order by id) from public.supporter t),'roles',(select jsonb_agg(to_jsonb(t) order by supporter_id,role) from public.supporter_role t),'consents',(select jsonb_agg(to_jsonb(t) order by id) from public.consent t),'audit',(select jsonb_agg(to_jsonb(t) order by id) from public.audit_log t)) value`;
  return row.value;
}
async function service<T>(tx: SQL, run:(s:SQL)=>Promise<T>, role="service_role"):Promise<T>{
  const sp="crm_sp_"+randomUUID().replaceAll("-","");
  await tx.unsafe(`savepoint ${sp}`);
  try { await tx.unsafe(`set local role ${role}`); const value=await run(tx); await tx`set local role postgres`; await tx.unsafe(`release savepoint ${sp}`);return value; }
  catch(e){await tx.unsafe(`rollback to savepoint ${sp}`);await tx.unsafe(`release savepoint ${sp}`);throw e;}
}
async function errno(run:()=>Promise<unknown>){try{await run();return "success";}catch(e){return (e as {errno?:string}).errno??"unexpected";}}
async function edit(tx:SQL,actor:string,supporter:string){const [v]=await tx`select edit_version from public.supporter where id=${supporter}::uuid`;return service(tx,s=>s`select public.mutate_crm_supporter_if_version_with_audit(${supporter}::uuid,${v.edit_version}::bigint,${{name:"Forbidden replacement"}}::jsonb,null,${actor}::uuid,${at}::timestamptz,'{}'::jsonb)`);}
describe.skipIf(!db)("R01 CRM forward commands on owned synthetic clone",()=>{
  afterAll(async()=>{await db?.close();});
  test("missing-target create commits supporter roles and actor audit",()=>fixture(async(tx,actor)=>{
    const email=randomUUID()+"@example.invalid";
    const [r]=await service(tx,s=>s`select public.mutate_crm_supporter_with_audit('create',null,${{name:"Synthetic create",email,phone:null,language:"en",tags:[],source:"test"}}::jsonb,${["donor"]}::jsonb,${actor}::uuid,${at}::timestamptz,'{}'::jsonb) value`);
    expect(r.value.email).toBe(email);
    const [audit]=await tx`select actor_user_id from public.audit_log where entity_id=${r.value.id}`;
    expect(audit.actor_user_id).toBe(actor);
  }));
  test("missing-target roles replace within one transaction",()=>fixture(async(tx,_actor,supporter)=>{
    await service(tx,s=>s`select public.replace_supporter_roles_atomic(${supporter}::uuid,${["donor"]}::jsonb)`);
    const roles=await tx`select role from public.supporter_role where supporter_id=${supporter}::uuid`;
    expect(roles.map((r:{role:string})=>r.role)).toEqual(["donor"]);
  }));
  test("missing-target consent append deduplicates immutable rows and audits",()=>fixture(async(tx,actor,supporter)=>{
    const rows=[{supporter_id:supporter,channel:"email",status:"opt_in",source:"admin",timestamp:at}];
    await service(tx,s=>s`select public.append_crm_consents_with_audit(${rows}::jsonb,${actor}::uuid,${supporter}::uuid,${at}::timestamptz,'{}'::jsonb)`);
    const [count]=await tx`select count(*)::int total from public.consent where supporter_id=${supporter}::uuid`;
    expect(count.total).toBe(1);
  }));
  test("versioned actor rejects managed Auth ban without mutation",()=>fixture(async(tx,actor,supporter)=>{
    await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${actor}::uuid`;
    const before=await state(tx);
    expect(await errno(()=>edit(tx,actor,supporter))).toBe("42501");
    expect(await state(tx)).toEqual(before);
  }));
});
