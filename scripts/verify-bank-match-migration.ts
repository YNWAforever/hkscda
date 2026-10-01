import { SQL } from "bun";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
if (process.env.BANK_MATCH_CONFIRM_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Explicit synthetic fixture opt-in required");
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929", {
    max: 1,
    prepare: false,
  }),
  rollback = Error("synthetic rollback");
const source = readFileSync(
  "supabase/migrations/20260928110000_finance_bank_match_confirmation.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const report: Record<string, unknown> = {
  sha256: createHash("sha256").update(source).digest("hex"),
  environment: "127.0.0.1:52322/audit_pr135_20260929",
};
try {
  try {
    await db.begin(async (tx) => {
      assert.equal(Number((await tx`select count(*) n from payment`)[0].n), 0);
      assert.equal(Number((await tx`select count(*) n from finance_bank_match_operation`)[0].n), 0);
      await tx.unsafe(
        "drop function public.apply_finance_bank_match_item(uuid,uuid,integer);drop function public.create_finance_bank_match_preview(uuid,text,jsonb);drop function public.get_finance_bank_match_operation(uuid,uuid);drop function private.require_finance_bank_match_actor(uuid);drop table public.finance_bank_match_item;drop table public.finance_bank_match_operation",
      );
      const actor = crypto.randomUUID(),
        supporter = crypto.randomUUID();
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor},'bank-match@example.invalid',now())`;
      await tx`insert into admin_user(auth_user_id,email,role,status) values(${actor},'bank-match@example.invalid','treasurer','active')`;
      await tx`insert into supporter(id,name,email) values(${supporter},'Synthetic donor','bank-match@example.invalid')`;
      await tx`with d as(insert into donation(supporter_id,amount_cents,purpose,method) select ${supporter}::uuid,10000,'general','fps' from generate_series(1,6) returning id) insert into payment(donation_id,provider,provider_ref,amount_cents) select id,'fps','BASE-'||id,10000 from d`;
      const before = await tx`select to_jsonb(p) record from payment p order by id`,
        donations = await tx`select to_jsonb(d) record from donation d order by id`;
      const begin = performance.now();
      await tx.unsafe(source);
      report.migrationMs = +(performance.now() - begin).toFixed(2);
      assert.deepEqual(
        [...(await tx`select to_jsonb(p) record from payment p order by id`)],
        [...before],
      );
      assert.deepEqual(
        [...(await tx`select to_jsonb(d) record from donation d order by id`)],
        [...donations],
      );
      for (const signature of [
        "public.get_finance_bank_match_operation(uuid,uuid)",
        "public.create_finance_bank_match_preview(uuid,text,jsonb)",
        "public.apply_finance_bank_match_item(uuid,uuid,integer)",
      ]) {
        const c = (
          await tx`select prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid=${signature}::regprocedure`
        )[0];
        assert.equal(c.prosecdef, true);
        assert.ok(c.proconfig.includes('search_path=""'));
        assert.equal(c.result, "jsonb");
        for (const role of ["anon", "authenticated", "service_role"])
          assert.equal(
            (await tx`select has_function_privilege(${role},${signature},'EXECUTE') allowed`)[0]
              .allowed,
            role === "service_role",
          );
      }
      for (const table of [
        "public.finance_bank_match_operation",
        "public.finance_bank_match_item",
      ]) {
        assert.equal(
          (await tx`select relrowsecurity from pg_class where oid=${table}::regclass`)[0]
            .relrowsecurity,
          true,
        );
        for (const role of ["anon", "authenticated"])
          for (const permission of ["SELECT", "INSERT", "UPDATE", "DELETE"])
            assert.equal(
              (await tx`select has_table_privilege(${role},${table},${permission}) allowed`)[0]
                .allowed,
              false,
            );
        assert.equal(
          (await tx`select has_table_privilege('service_role',${table},'UPDATE') allowed`)[0]
            .allowed,
          false,
        );
      }
      await tx`with d as(insert into donation(supporter_id,amount_cents,purpose,method) select ${supporter}::uuid,10000,'general','fps' from generate_series(1,1000) returning id) insert into payment(donation_id,provider,provider_ref,amount_cents) select id,'fps','MATCH-'||id,10000 from d`;
      const rows =
        await tx`select id,provider_ref from payment where provider_ref like 'MATCH-%' order by id`;
      for (const p of rows.slice(0, 100))
        await tx`update payment set status='failed' where id=${p.id}`;
      const items = rows.map((p, i) => ({
        ordinal: i + 1,
        paymentId: p.id,
        bankReference: "SYNTH-" + (i + 1),
        paymentHint: p.provider_ref,
        amountCents: 10000,
      }));
      async function rpc(query: string, args: (string | number)[]) {
        await tx.unsafe("set local role service_role");
        try {
          return await tx.unsafe(query, args);
        } finally {
          await tx.unsafe("reset role").catch(() => {});
        }
      }
      const start = performance.now(),
        preview = (
          await rpc(
            "select public.create_finance_bank_match_preview($1::uuid,$2,$3::jsonb) result",
            [actor, "a".repeat(64), JSON.stringify(items)],
          )
        )[0].result;
      report.preview1000Ms = +(performance.now() - start).toFixed(2);
      assert.equal(
        preview.items.filter((i: { status: string }) => i.status === "pending").length,
        900,
      );
      const apply = (ordinal: number) =>
        rpc("select public.apply_finance_bank_match_item($1::uuid,$2::uuid,$3) result", [
          actor,
          preview.operationId,
          ordinal,
        ]);
      await tx.unsafe(
        "create function pg_temp.fail_bank_result() returns trigger language plpgsql as $$begin if new.action='finance_bank_match.item_result' then raise exception 'synthetic result audit failure';end if;return new;end$$;create trigger fail_bank_result before insert on audit_log for each row execute function pg_temp.fail_bank_result()",
      );
      await tx.unsafe("savepoint rejected_result");
      let errorCode;
      try {
        await apply(104);
      } catch (e) {
        errorCode = (e as { errno?: string }).errno;
      }
      await tx.unsafe("rollback to savepoint rejected_result");
      await tx.unsafe("reset role");
      assert.equal(errorCode, "P0001");
      assert.equal(
        (await tx`select status from payment where id=${rows[103].id}`)[0].status,
        "pending",
      );
      assert.equal(Number((await tx`select count(*) n from donation_delivery_job`)[0].n), 0);
      assert.equal(
        Number(
          (
            await tx`select count(*) n from audit_log where action='payment.mark_received' and actor_user_id=${actor}`
          )[0].n,
        ),
        0,
      );
      await tx.unsafe("drop trigger fail_bank_result on audit_log");
      report.resultAuditFailureRollsBackPayment = true;
      await tx`delete from payment where id=${rows[100].id}`;
      await tx`update payment set provider_ref='CHANGED' where id=${rows[101].id}`;
      await tx`update payment set status='failed' where id=${rows[102].id}`;
      const appliedAt = performance.now(),
        counts: Record<string, number> = {};
      for (let n = 1; n <= 1000; n++) {
        const result = (await apply(n))[0].result;
        counts[result.status] = (counts[result.status] ?? 0) + 1;
      }
      report.apply1000Ms = +(performance.now() - appliedAt).toFixed(2);
      assert.deepEqual(counts, { skipped: 100, conflict: 3, succeeded: 897 });
      assert.equal((await apply(104))[0].result.status, "succeeded");
      assert.equal(
        Number((await tx`select count(*) n from payment where status='succeeded'`)[0].n),
        897,
      );
      assert.equal(Number((await tx`select count(*) n from donation_delivery_job`)[0].n), 897);
      assert.equal(
        Number(
          (
            await tx`select count(*) n from audit_log where action='payment.mark_received' and actor_user_id=${actor}`
          )[0].n,
        ),
        897,
      );
      assert.equal(
        Number(
          (
            await tx`select count(*) n from audit_log where action='finance_bank_match.item_result' and actor_user_id=${actor}`
          )[0].n,
        ),
        900,
      );
      assert.deepEqual(
        [
          ...(await tx`select to_jsonb(p) record from payment p where provider_ref like 'BASE-%' order by id`),
        ],
        [...before],
      );
      report.counts = counts;
      report.creditAudits = 897;
      report.deliveryJobs = 897;
      report.resultAudits = 900;
      report.original6RowsUnchanged = true;
      report.catalog = true;
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
  assert.equal(Number((await db`select count(*) n from payment`)[0].n), 0);
  assert.equal(Number((await db`select count(*) n from finance_bank_match_operation`)[0].n), 0);
  report.rollback = true;
  report.syntheticRowsRemaining = 0;
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
