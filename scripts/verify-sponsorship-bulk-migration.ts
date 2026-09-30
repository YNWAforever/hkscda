import { SQL } from "bun";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
if (process.env.SPONSORSHIP_FOLLOWUP_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Explicit local fixture opt-in required");
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929", {
    max: 1,
    prepare: false,
  }),
  rollback = Error("synthetic bulk rollback");
const source = readFileSync(
  "supabase/migrations/20260928080000_sponsorship_followup_bulk.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const report: Record<string, unknown> = {
  sha256: createHash("sha256").update(source).digest("hex"),
  environment: "127.0.0.1:52322/audit_pr135_20260929",
};
try {
  try {
    await db.begin(async (tx) => {
      assert.equal(Number((await tx`select count(*) n from sponsorship_pledge`)[0].n), 0);
      assert.equal(
        Number((await tx`select count(*) n from sponsorship_followup_bulk_operation`)[0].n),
        0,
      );
      await tx.unsafe(
        `drop function public.apply_sponsorship_followup_bulk_item(uuid,uuid,uuid);drop function public.create_sponsorship_followup_bulk_preview(uuid,uuid[],uuid,text);drop function public.get_sponsorship_followup_bulk_operation(uuid,uuid);drop function private.require_sponsorship_followup_bulk_user(uuid);drop table sponsorship_followup_bulk_item;drop table sponsorship_followup_bulk_operation;`,
      );
      const actor = crypto.randomUUID(),
        assignee = crypto.randomUUID(),
        supporter = crypto.randomUUID();
      for (const id of [actor, assignee]) {
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${id},${id + "@example.invalid"},now())`;
        await tx`insert into admin_user(auth_user_id,email,role,status) values(${id},${id + "@example.invalid"},'staff','active')`;
      }
      await tx`insert into supporter(id,name,email) values(${supporter},'Synthetic bulk supporter','bulk@example.invalid')`;
      for (let i = 0; i < 2; i++)
        await tx`insert into sponsorship_pledge(supporter_id,monthly_tier,amount_cents,language,status) values(${supporter},'100',10000,'zh-HK','active')`;
      const before = await tx`select to_jsonb(p) row from sponsorship_pledge p order by id`,
        start = performance.now();
      await tx.unsafe(source);
      report.migrationMs = +(performance.now() - start).toFixed(2);
      assert.deepEqual(
        [...(await tx`select to_jsonb(p) row from sponsorship_pledge p order by id`)],
        [...before],
      );
      report.oldRowsUnchanged = 2;
      for (const table of [
        "sponsorship_followup_bulk_operation",
        "sponsorship_followup_bulk_item",
      ]) {
        assert.equal(
          (
            await tx`select relrowsecurity rls from pg_class where oid=${"public." + table}::regclass`
          )[0].rls,
          true,
        );
        for (const role of ["anon", "authenticated"])
          assert.equal(
            (await tx`select has_table_privilege(${role},${"public." + table},'SELECT') allowed`)[0]
              .allowed,
            false,
          );
      }
      for (const fn of [
        "public.create_sponsorship_followup_bulk_preview(uuid,uuid[],uuid,text)",
        "public.get_sponsorship_followup_bulk_operation(uuid,uuid)",
        "public.apply_sponsorship_followup_bulk_item(uuid,uuid,uuid)",
      ])
        for (const role of ["anon", "authenticated", "service_role"])
          assert.equal(
            (await tx`select has_function_privilege(${role},${fn},'EXECUTE') allowed`)[0].allowed,
            role === "service_role",
          );
      const rows =
        await tx`insert into sponsorship_pledge(supporter_id,monthly_tier,amount_cents,language,status) select ${supporter}::uuid,'100',10000,'zh-HK',case when n>900 then 'active' else 'needs_followup' end from generate_series(1,1000) n returning id,status`;
      const ids = rows.map((r: { id: string }) => r.id),
        pending = rows
          .filter((r: { status: string }) => r.status === "needs_followup")
          .map((r: { id: string }) => r.id);
      await tx`set local role service_role`;
      const t = performance.now(),
        op = (
          await tx`select create_sponsorship_followup_bulk_preview(${actor}::uuid,${"{" + ids.join(",") + "}"}::uuid[],${assignee}::uuid,${"a".repeat(64)}) result`
        )[0].result;
      report.preview1000Ms = +(performance.now() - t).toFixed(2);
      assert.equal(op.items.length, 1000);
      await tx`reset role`;
      await tx`update sponsorship_pledge set updated_at=clock_timestamp() where id=${pending[0]}`;
      await tx`update sponsorship_pledge set status='active' where id=${pending[1]}`;
      await tx`delete from sponsorship_pledge where id=${pending[2]}`;
      await tx`set local role service_role`;
      const applyStart = performance.now();
      for (const id of pending)
        await tx`select apply_sponsorship_followup_bulk_item(${actor}::uuid,${op.operationId}::uuid,${id}::uuid)`;
      report.apply900Ms = +(performance.now() - applyStart).toFixed(2);
      const result = (
        await tx`select get_sponsorship_followup_bulk_operation(${actor}::uuid,${op.operationId}::uuid) result`
      )[0].result;
      const counts: Record<string, number> = {};
      for (const row of result.items) counts[row.status] = (counts[row.status] ?? 0) + 1;
      assert.deepEqual(counts, { conflict: 2, skipped: 101, succeeded: 897 });
      assert.equal(result.state, "done");
      await tx`select apply_sponsorship_followup_bulk_item(${actor}::uuid,${op.operationId}::uuid,${pending[3]}::uuid)`;
      await tx`reset role`;
      assert.equal(
        Number(
          (
            await tx`select count(*) n from audit_log where actor_user_id=${actor} and action='sponsorship_pledge.assign_followup'`
          )[0].n,
        ),
        897,
      );
      assert.equal(
        Number(
          (
            await tx`select count(*) n from sponsorship_pledge where supporter_id=${supporter} and amount_cents<>10000`
          )[0].n,
        ),
        0,
      );
      report.counts = counts;
      report.assignmentAudit = 897;
      report.exactRetryNoDuplicate = true;
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
  report.rowsRemaining = Number((await db`select count(*) n from sponsorship_pledge`)[0].n);
  assert.equal(report.rowsRemaining, 0);
  report.rollback = true;
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
