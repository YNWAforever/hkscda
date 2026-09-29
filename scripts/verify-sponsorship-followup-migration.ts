import { SQL } from "bun";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
if (process.env.SPONSORSHIP_FOLLOWUP_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Explicit local fixture opt-in required");
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929", {
  max: 1,
  prepare: false,
});
const rollback = Error("synthetic migration rollback");
const source = readFileSync(
  "supabase/migrations/20260928073000_sponsorship_followup_assignment.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const report: Record<string, unknown> = {
  sha256: createHash("sha256").update(source).digest("hex"),
  environment: "127.0.0.1:52322/audit_pr135_20260929",
};
try {
  try {
    await db.begin(async (tx) => {
      assert.equal(
        Number((await tx`select count(*) n from sponsorship_pledge`)[0].n),
        0,
        "Dedicated clone must contain no pledges",
      );
      await tx.unsafe(
        `drop function public.assign_sponsorship_followup(uuid,uuid,uuid,bigint);drop function public.list_sponsorship_followup_assignees(uuid);drop trigger sponsorship_pledge_followup_version_before_update on public.sponsorship_pledge;drop function private.bump_sponsorship_followup_version();drop index public.sponsorship_pledge_followup_assignee_idx;alter table sponsorship_pledge drop column followup_assignee_user_id,drop column followup_version;`,
      );
      const supporter = crypto.randomUUID();
      await tx`insert into supporter(id,name,email) values(${supporter},'Synthetic migration supporter','migration@example.invalid')`;
      for (const status of ["active", "needs_followup"])
        await tx`insert into sponsorship_pledge(supporter_id,monthly_tier,amount_cents,language,status) values(${supporter},'100',10000,'zh-HK',${status})`;
      const before = await tx`select to_jsonb(p) record from sponsorship_pledge p order by id`;
      const start = performance.now();
      await tx.unsafe(source);
      report.elapsedMs = +(performance.now() - start).toFixed(2);
      const after =
        await tx`select to_jsonb(p)-'followup_assignee_user_id'-'followup_version' record from sponsorship_pledge p order by id`;
      assert.deepEqual([...after], [...before]);
      assert.equal(
        Number(
          (
            await tx`select count(*) n from sponsorship_pledge where followup_version=1 and followup_assignee_user_id is null`
          )[0].n,
        ),
        2,
      );
      const catalog = (
        await tx`select (select relrowsecurity from pg_class where oid='sponsorship_pledge'::regclass) rls,(select count(*)::int from pg_proc where oid in ('public.assign_sponsorship_followup(uuid,uuid,uuid,bigint)'::regprocedure,'public.list_sponsorship_followup_assignees(uuid)'::regprocedure) and prosecdef and proconfig @> array['search_path=""']) pinned`
      )[0];
      assert.equal(catalog.rls, true);
      assert.equal(catalog.pinned, 2);
      for (const signature of [
        "public.assign_sponsorship_followup(uuid,uuid,uuid,bigint)",
        "public.list_sponsorship_followup_assignees(uuid)",
      ])
        for (const role of ["anon", "authenticated", "service_role"])
          assert.equal(
            (await tx`select has_function_privilege(${role},${signature},'EXECUTE') allowed`)[0]
              .allowed,
            role === "service_role",
          );
      report.rows = 2;
      report.originalColumnsUnchanged = true;
      report.newVersion = 1;
      report.grantsAndRls = true;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(Number((await db`select count(*) n from sponsorship_pledge`)[0].n), 0);
  report.syntheticRowsRemaining = 0;
  report.rollback = true;
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
