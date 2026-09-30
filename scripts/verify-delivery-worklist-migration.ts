import { SQL } from "bun";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
if (process.env.DELIVERY_RETRY_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Explicit local fixture opt-in required");
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929", {
  max: 2,
  prepare: false,
});
const rollback = Error("synthetic rollback");
const source = readFileSync(
  "supabase/migrations/20260928100000_finance_delivery_retry_guard.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const prior = readFileSync(
  "supabase/migrations/20260927140000_donation_delivery_recovery.sql",
  "utf8",
);
const previousRetry = prior.slice(
  prior.indexOf("create or replace function public.retry_donation_delivery_job_with_audit"),
);
const report: Record<string, unknown> = {
  sha256: createHash("sha256").update(source).digest("hex"),
  environment: "127.0.0.1:52322/audit_pr135_20260929",
};
const actor = crypto.randomUUID(),
  supporter = crypto.randomUUID(),
  donation = crypto.randomUUID(),
  payment = crypto.randomUUID(),
  job = crypto.randomUUID();
try {
  try {
    await db.begin(async (tx) => {
      assert.equal(Number((await tx`select count(*) n from donation_delivery_job`)[0].n), 0);
      assert.equal(Number((await tx`select count(*) n from payment`)[0].n), 0);
      await tx.unsafe(
        "drop function public.list_failed_donation_delivery_jobs(uuid,integer);drop index public.donation_delivery_failed_queue_idx",
      );
      await tx.unsafe(previousRetry);
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor},'delivery@example.invalid',now())`;
      await tx`insert into admin_user(auth_user_id,email,role,status) values(${actor},'delivery@example.invalid','treasurer','active')`;
      await tx`insert into supporter(id,name,email) values(${supporter},'Synthetic donor','delivery@example.invalid')`;
      await tx`with d as (insert into donation(supporter_id,amount_cents,purpose,method,status) select ${supporter}::uuid,10000,'general','fps','succeeded' from generate_series(1,6) returning id),p as(insert into payment(donation_id,provider,amount_cents,status) select id,'fps',10000,'succeeded' from d returning id,donation_id) insert into donation_delivery_job(donation_id,payment_id,status,attempts,error_code) select donation_id,id,'attention_required',2,'provider_error' from p`;
      const before = await tx`select to_jsonb(j) record from donation_delivery_job j order by id`,
        facts = await tx`select to_jsonb(p) record from payment p order by id`;
      const begin = performance.now();
      await tx.unsafe(source);
      report.migrationMs = +(performance.now() - begin).toFixed(2);
      assert.deepEqual(
        [...(await tx`select to_jsonb(j) record from donation_delivery_job j order by id`)],
        [...before],
      );
      assert.deepEqual(
        [...(await tx`select to_jsonb(p) record from payment p order by id`)],
        [...facts],
      );
      for (const signature of [
        "public.list_failed_donation_delivery_jobs(uuid,integer)",
        "public.retry_donation_delivery_job_with_audit(uuid,uuid)",
      ]) {
        const c = (
          await tx`select prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid=${signature}::regprocedure`
        )[0];
        assert.equal(c.prosecdef, true);
        assert.ok(c.proconfig.includes('search_path=""'));
        assert.equal(c.result, signature.includes("list_failed") ? "jsonb" : "boolean");
        for (const role of ["anon", "authenticated", "service_role"])
          assert.equal(
            (await tx`select has_function_privilege(${role},${signature},'EXECUTE') allowed`)[0]
              .allowed,
            role === "service_role",
          );
      }
      assert.equal(
        (
          await tx`select relrowsecurity from pg_class where oid='donation_delivery_job'::regclass`
        )[0].relrowsecurity,
        true,
      );
      await tx`with d as(insert into donation(supporter_id,amount_cents,purpose,method,status) select ${supporter}::uuid,10000,'general','fps','succeeded' from generate_series(1,994) returning id),p as(insert into payment(donation_id,provider,amount_cents,status) select id,'fps',10000,'succeeded' from d returning id,donation_id) insert into donation_delivery_job(donation_id,payment_id,status,attempts) select donation_id,id,'retryable',1 from p`;
      await tx.unsafe("set local role service_role");
      const start = performance.now();
      const one = (
        await tx`select public.list_failed_donation_delivery_jobs(${actor}::uuid,1) result`
      )[0].result;
      report.page1of1000Ms = +(performance.now() - start).toFixed(2);
      assert.equal(one.total, 1000);
      assert.equal(one.jobs.length, 25);
      const seen = new Set<string>();
      for (let page = 1; page <= 40; page++) {
        const current = (
          await tx`select public.list_failed_donation_delivery_jobs(${actor}::uuid,${page}) result`
        )[0].result;
        for (const j of current.jobs) {
          assert.ok(!seen.has(j.id));
          seen.add(j.id);
        }
      }
      assert.equal(seen.size, 1000);
      assert.equal(
        (await tx`select public.list_failed_donation_delivery_jobs(${actor}::uuid,1000) result`)[0]
          .result.jobs.length,
        0,
      );
      await tx.unsafe("reset role");
      assert.equal(
        Number((await tx`select count(*) n from audit_log where actor_user_id=${actor}`)[0].n),
        0,
      );
      report.original6JobsUnchanged = true;
      report.pages = 40;
      report.uniqueJobs = seen.size;
      report.catalog = true;
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
  assert.equal(Number((await db`select count(*) n from donation_delivery_job`)[0].n), 0);
  await db.begin(async (tx) => {
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor},'concurrent@example.invalid',now())`;
    await tx`insert into admin_user(auth_user_id,email,role,status) values(${actor},'concurrent@example.invalid','treasurer','active')`;
    await tx`insert into supporter(id,name,email) values(${supporter},'Synthetic concurrency','concurrent@example.invalid')`;
    await tx`insert into donation(id,supporter_id,amount_cents,purpose,method,status) values(${donation},${supporter},10000,'general','fps','succeeded')`;
    await tx`insert into payment(id,donation_id,provider,amount_cents,status) values(${payment},${donation},'fps',10000,'succeeded')`;
    await tx`insert into donation_delivery_job(id,donation_id,payment_id,status,attempts) values(${job},${donation},${payment},'attention_required',2)`;
  });
  const retry = () =>
    db.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      return (
        await tx`select public.retry_donation_delivery_job_with_audit(${job}::uuid,${actor}::uuid) accepted`
      )[0].accepted as boolean;
    });
  const pair = await Promise.all([retry(), retry()]);
  assert.deepEqual(pair.sort(), [false, true]);
  assert.equal(
    Number(
      (
        await db`select count(*) n from audit_log where entity_id=${job} and action='donation.delivery_retry'`
      )[0].n,
    ),
    1,
  );
  assert.deepEqual(
    (await db`select status,attempts from donation_delivery_job where id=${job}`)[0],
    { status: "pending", attempts: 2 },
  );
  report.concurrentRetry = { accepted: 1, refused: 1, audits: 1, attempts: 2 };
} finally {
  await db.begin(async (tx) => {
    await tx`delete from audit_log where actor_user_id=${actor}`;
    await tx`delete from donation_delivery_job where id=${job}`;
    await tx`delete from payment where id=${payment}`;
    await tx`delete from donation where id=${donation}`;
    await tx`delete from supporter where id=${supporter}`;
    await tx`delete from admin_user where auth_user_id=${actor}`;
    await tx`delete from auth.users where id=${actor}`;
  });
  report.syntheticJobsRemaining = Number(
    (await db`select count(*) n from donation_delivery_job`)[0].n,
  );
  assert.equal(report.syntheticJobsRemaining, 0);
  await db.close();
}
console.log(JSON.stringify(report));
