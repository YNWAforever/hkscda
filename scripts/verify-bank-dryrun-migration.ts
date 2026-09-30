import { SQL } from "bun";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
if (process.env.BANK_DRY_RUN_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Explicit synthetic fixture opt-in required");
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929", {
  max: 1,
  prepare: false,
});
const source = readFileSync(
  "supabase/migrations/20260928090000_finance_bank_dryrun.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const report: Record<string, unknown> = {
  sha256: createHash("sha256").update(source).digest("hex"),
  environment: "127.0.0.1:52322/audit_pr135_20260929",
};
const rollback = Error("rollback synthetic rehearsal");
try {
  try {
    await db.begin(async (tx) => {
      assert.equal(Number((await tx`select count(*) n from payment`)[0].n), 0);
      await tx.unsafe(
        "drop function public.preview_manual_bank_matches(uuid,text[],integer[]);drop index public.payment_pending_manual_amount_idx",
      );
      const actor = crypto.randomUUID(),
        supporter = crypto.randomUUID();
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor},'finance@example.invalid',now())`;
      await tx`insert into admin_user(auth_user_id,email,role,status) values(${actor},'finance@example.invalid','treasurer','active')`;
      await tx`insert into supporter(id,name,email) values(${supporter},'Synthetic donor','bank@example.invalid')`;
      for (let i = 0; i < 6; i++) {
        const donation = crypto.randomUUID();
        await tx`insert into donation(id,supporter_id,amount_cents,purpose,method) values(${donation},${supporter},10000,'general','fps')`;
        await tx`insert into payment(donation_id,provider,provider_ref,amount_cents) values(${donation},'fps',${"TEST-" + i},10000)`;
      }
      const before = await tx`select to_jsonb(p) record from payment p order by id`,
        donationBefore = await tx`select to_jsonb(d) record from donation d order by id`;
      const started = performance.now();
      await tx.unsafe(source);
      report.migrationMs = +(performance.now() - started).toFixed(2);
      assert.deepEqual(
        [...(await tx`select to_jsonb(p) record from payment p order by id`)],
        [...before],
      );
      assert.deepEqual(
        [...(await tx`select to_jsonb(d) record from donation d order by id`)],
        [...donationBefore],
      );
      const signature = "public.preview_manual_bank_matches(uuid,text[],integer[])";
      const catalog = (
        await tx`select prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid=${signature}::regprocedure`
      )[0];
      assert.equal(catalog.prosecdef, true);
      assert.ok(catalog.proconfig.includes('search_path=""'));
      assert.equal(catalog.result, "jsonb");
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal(
          (await tx`select has_function_privilege(${role},${signature},'EXECUTE') allowed`)[0]
            .allowed,
          role === "service_role",
        );
      assert.equal(
        (
          await tx`select bool_and(relrowsecurity) rls from pg_class where oid in ('payment'::regclass,'donation'::regclass)`
        )[0].rls,
        true,
      );
      async function call() {
        await tx.unsafe("set local role service_role");
        try {
          return (
            await tx`select public.preview_manual_bank_matches(${actor}::uuid,array['test-new'],array[10000]) result`
          )[0].result;
        } finally {
          await tx.unsafe("reset role").catch(() => {});
        }
      }
      assert.equal((await call()).pendingPayments.length, 6);
      for (const condition of [
        "update admin_user set role='staff'",
        "update admin_user set status='disabled'",
        "update auth.users set email_confirmed_at=null",
        "update auth.users set banned_until=now()+interval '1 hour'",
      ]) {
        await tx.unsafe("savepoint denied");
        await tx.unsafe(condition);
        let code;
        try {
          await call();
        } catch (e) {
          code = (e as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint denied");
        await tx.unsafe("reset role");
        assert.equal(code, "42501");
      }
      await tx.unsafe("savepoint large");
      await tx`with added as (insert into donation(supporter_id,amount_cents,purpose,method) select ${supporter}::uuid,10000,'general','fps' from generate_series(1,994) returning id) insert into payment(donation_id,provider,provider_ref,amount_cents) select id,'fps','SYNTHETIC-'||id,10000 from added`;
      const begin = performance.now();
      const thousand = await call();
      report.preview1000Ms = +(performance.now() - begin).toFixed(2);
      assert.equal(thousand.kind, "ok");
      assert.equal(thousand.pendingPayments.length, 1000);
      await tx`with added as (insert into donation(supporter_id,amount_cents,purpose,method) values(${supporter},10000,'general','fps') returning id) insert into payment(donation_id,provider,amount_cents) select id,'fps',10000 from added`;
      assert.deepEqual(await call(), { kind: "too_broad" });
      await tx.unsafe("rollback to savepoint large");
      assert.deepEqual(
        [...(await tx`select to_jsonb(p) record from payment p order by id`)],
        [...before],
      );
      assert.deepEqual(
        [...(await tx`select to_jsonb(d) record from donation d order by id`)],
        [...donationBefore],
      );
      assert.equal(
        Number((await tx`select count(*) n from audit_log where actor_user_id=${actor}`)[0].n),
        0,
      );
      report.existingSyntheticRows = 6;
      report.originalFactsUnchanged = true;
      report.serviceRoleAndAuthDenial = true;
      report.boundaries = [1000, 1001];
      report.signaturesGrantsRls = true;
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
  assert.equal(Number((await db`select count(*) n from payment`)[0].n), 0);
  report.rollback = true;
  report.remainingPayments = 0;
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
