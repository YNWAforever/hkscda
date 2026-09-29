import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { SQL } from "bun";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseSponsorshipAdminRepository } from "../src/lib/sponsorshipAdmin/repository.server";
if (process.env.SPONSORSHIP_TEST_ALLOW_LOCAL_FIXTURES !== "1") throw Error("Explicit synthetic fixture opt-in required");
// Fixed named, unlinked Docker stack; never read hosted credentials or accept an arbitrary URL.
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:57322/postgres");
const env = JSON.parse(execFileSync("docker", ["inspect", "supabase_auth_hkscda-audit-integration-573"], {encoding:"utf8"}))[0].Config.Env as string[];
const secret = env.find(v=>v.startsWith("GOTRUE_JWT_SECRET="))?.slice("GOTRUE_JWT_SECRET=".length);
assert.ok(secret);
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const payload = encode({alg:"HS256",typ:"JWT"})+"."+encode({role:"service_role",iss:"supabase",exp:Math.floor(Date.now()/1000)+300});
const token = payload+"."+createHmac("sha256",secret).update(payload).digest("base64url");
const client = createClient("http://127.0.0.1:57321",token,{auth:{persistSession:false}});
const repo = createSupabaseSponsorshipAdminRepository(client);
const supporter = randomUUID(), marker="synthetic-proof-"+randomUUID();
const ids = Array.from({length:100},()=>randomUUID()).sort().reverse();
let seeded=false;
try {
  const counts=await db`select (select count(*) from sponsorship_pledge)::int pledges,(select count(*) from sponsorship_payment_proof)::int proofs`;
  assert.deepEqual({...counts[0]},{pledges:0,proofs:0});
  await db.begin(async tx=>{
    await tx`insert into supporter(id,name,email,source) values(${supporter},${marker},${marker+"@example.invalid"},'manual')`;
    for(let i=0;i<ids.length;i++){
      await tx`insert into sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language,status,created_at) values(${ids[i]},${supporter},'300',30000,'zh-HK',${i%2===0?'active':'provisional'},'2026-09-01T00:00:00Z')`;
      // Every third pledge has only a historical approved proof. Others have an old approved and two later pending proofs.
      for(const [n,status] of (i%3===0?['approved']:['approved','pending','pending']).entries()){
        await tx`insert into sponsorship_payment_proof(pledge_id,payment_method,amount_cents,payment_date,review_status,created_at,storage_path) values(${ids[i]},'bank_transfer',30000,${'2026-09-0'+(n+1)},${status},${'2026-09-0'+(n+1)+'T00:00:00Z'},${marker+'/'+i+'-'+n+'.pdf'})`;
      }
    }
  });seeded=true;
  const before=await db`select md5(string_agg(to_jsonb(p)::text,'|' order by id)) digest from sponsorship_payment_proof p`;
  const expected=ids.filter((_,i)=>i%3!==0), found:string[]=[], timings:number[]=[];
  for(let page=1;page<=7;page++){
    const start=performance.now();const result=await repo.listPledges({page,pageSize:10,proof:'pending'});timings.push(performance.now()-start);
    assert.equal(result.total,66);assert.deepEqual(result.pledges.map(v=>v.id),expected.slice((page-1)*10,page*10));
    assert.ok(result.pledges.every(v=>!('sponsorship_payment_proof' in v)&&!('storagePath' in v)&&!('storage_path' in v)));
    found.push(...result.pledges.map(v=>v.id));
  }
  assert.equal(new Set(found).size,66);
  await assert.rejects(repo.listPledges({page:8,pageSize:10,proof:"pending"}), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "PGRST103");
  const active=await repo.listPledges({page:1,pageSize:50,proof:'pending',status:'active',q:marker});
  assert.equal(active.total,33);assert.ok(active.pledges.every(v=>v.status==='active'));
  const all=await repo.listPledges({page:1,pageSize:50});assert.equal(all.total,100);
  const none=await repo.listPledges({page:1,pageSize:25,proof:'pending',q:'nonmatching-'+marker});assert.equal(none.total,0);
  const detail=await repo.getPledgeDetail(expected[0]);assert.ok(detail);
  assert.equal(detail.currentProof?.reviewStatus,"pending");
  assert.equal(detail.currentProof?.paymentDate,"2026-09-02");
  assert.equal(detail.proofHistory.length,3);
  const proof=detail.currentProof!;
  assert.ok(await repo.getProofSigningInfo(detail.id,proof.id,proof.revision));
  assert.equal(await repo.getProofSigningInfo(detail.id,proof.id,proof.revision+1),null);
  assert.equal(await repo.getProofSigningInfo(ids[0],proof.id,proof.revision),null);
  const after=await db`select md5(string_agg(to_jsonb(p)::text,'|' order by id)) digest from sponsorship_payment_proof p`;assert.equal(before[0].digest,after[0].digest);
  console.log(JSON.stringify({pledges:100,proofs:232,pendingPledges:66,pages:7,activeSearchMatches:33,duplicates:0,privatePathLeaks:0,unchanged:true,pageMs:timings.map(v=>Math.round(v*100)/100)}));
} finally {
  if(seeded) await db.begin(async tx=>{
    // Fixture-only cleanup: no application behavior runs while the history guard is disabled.
    const owned=await tx`select count(*)::int n from sponsorship_pledge where supporter_id=${supporter}`;assert.equal(owned[0].n,100);
    await tx`delete from sponsorship_delivery_outbox where pledge_id in (select id from sponsorship_pledge where supporter_id=${supporter})`;
    await tx`delete from message where supporter_id=${supporter}`;
    await tx`alter table sponsorship_payment_proof disable trigger sponsorship_preserve_proof`;
    await tx`delete from sponsorship_payment_proof where pledge_id in (select id from sponsorship_pledge where supporter_id=${supporter})`;
    await tx`alter table sponsorship_payment_proof enable trigger sponsorship_preserve_proof`;
    await tx`delete from sponsorship_pledge where supporter_id=${supporter}`;
    await tx`delete from supporter where id=${supporter} and name=${marker}`;
  });
  const clean=await db`select (select count(*) from sponsorship_pledge)::int pledges,(select count(*) from sponsorship_payment_proof)::int proofs,(select count(*) from sponsorship_delivery_outbox)::int outbox,(select count(*) from message where supporter_id=${supporter})::int messages,(select tgenabled::text from pg_trigger where tgname='sponsorship_preserve_proof') guard`;
  assert.deepEqual({...clean[0]},{pledges:0,proofs:0,outbox:0,messages:0,guard:'O'});console.log('Synthetic cleanup verified; history guard enabled');await db.close();
}
