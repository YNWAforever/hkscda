import { SQL } from "bun";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
if (process.env.CRM_ASSIGNMENT_MIGRATION_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Explicit synthetic opt-in required");
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929", {
  max: 1,
  prepare: false,
});
const source = readFileSync(
  "supabase/migrations/20260928120000_crm_assignment_bulk.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const report: Record<string, unknown> = {
  environment: "isolated schema clone52322",
  sha256: createHash("sha256").update(source).digest("hex"),
};
const rollback = Error("rollback CRM assignment full rehearsal");
try {
  try {
    await db.begin(async (tx) => {
      assert.equal(Number((await tx`select count(*) n from public.supporter`)[0].n), 0);
      await tx.unsafe(
        "drop function public.create_crm_assignment_bulk_preview(uuid,uuid[],uuid,text);drop function public.get_crm_assignment_bulk_operation(uuid,uuid);drop function public.apply_crm_assignment_bulk_item(uuid,uuid,uuid);drop function public.list_crm_assignment_assignees(uuid);drop function private.require_crm_assignment_user(uuid);drop table public.crm_assignment_bulk_item;drop table public.crm_assignment_bulk_operation;alter table public.supporter drop column crm_assignee_user_id;grant insert,update on public.supporter to authenticated",
      );
      const oldIds = Array.from({ length: 15 }, () => crypto.randomUUID());
      for (const id of oldIds)
        await tx`insert into public.supporter(id,name,email) values(${id},'Prior synthetic',${id + "@example.invalid"})`;
      const before = await tx`select to_jsonb(s) record from public.supporter s order by id`;
      const started = performance.now();
      await tx.unsafe(source);
      report.migrationMs = +(performance.now() - started).toFixed(2);
      assert.deepEqual(
        [
          ...(await tx`select to_jsonb(s)-'crm_assignee_user_id' record from public.supporter s order by id`),
        ],
        [...before],
      );
      assert.equal(
        Number(
          (await tx`select count(*) n from public.supporter where crm_assignee_user_id is null`)[0]
            .n,
        ),
        15,
      );
      report.priorRowsUnchanged = 15;
      for (const table of ["crm_assignment_bulk_operation", "crm_assignment_bulk_item"]) {
        assert.equal(
          (
            await tx`select relrowsecurity from pg_class where oid=${"public." + table}::regclass`
          )[0].relrowsecurity,
          true,
        );
        for (const role of ["anon", "authenticated", "service_role"]) {
          assert.equal(
            (await tx`select has_table_privilege(${role},${"public." + table},'SELECT') allowed`)[0]
              .allowed,
            role === "service_role",
          );
          assert.equal(
            (await tx`select has_table_privilege(${role},${"public." + table},'UPDATE') allowed`)[0]
              .allowed,
            false,
          );
        }
      }
      for (const signature of [
        "public.create_crm_assignment_bulk_preview(uuid,uuid[],uuid,text)",
        "public.get_crm_assignment_bulk_operation(uuid,uuid)",
        "public.apply_crm_assignment_bulk_item(uuid,uuid,uuid)",
        "public.list_crm_assignment_assignees(uuid)",
      ]) {
        const [catalog] =
          await tx`select prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid=${signature}::regprocedure`;
        assert.equal(catalog.prosecdef, true);
        assert.equal(catalog.result, "jsonb");
        assert.ok(catalog.proconfig.includes('search_path=""'));
        for (const role of ["anon", "authenticated", "service_role"])
          assert.equal(
            (await tx`select has_function_privilege(${role},${signature},'EXECUTE') allowed`)[0]
              .allowed,
            role === "service_role",
          );
      }
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal(
          (
            await tx`select has_function_privilege(${role},'private.require_crm_assignment_user(uuid)','EXECUTE') allowed`
          )[0].allowed,
          false,
        );
      const actor = crypto.randomUUID(),
        assignee = crypto.randomUUID();
      for (const id of [actor, assignee]) {
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${id},${id + "@example.invalid"},now())`;
        await tx`insert into admin_user(auth_user_id,email,role,status) values(${id},${id + "@example.invalid"},'treasurer','active')`;
      }
      const seeded =
        await tx`insert into public.supporter(id,name,email,crm_assignee_user_id) select id,'Synthetic1000',id::text||'@example.invalid',case when n<=100 then ${assignee}::uuid else null end from(select gen_random_uuid()id,n from generate_series(1,1000)n)f returning id`;
      const ids = seeded.map((row: { id: string }) => row.id);
      await tx`set local role service_role`;
      const pStarted = performance.now();
      const [preview] = await tx.unsafe(
        "select public.create_crm_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4)result",
        [actor, "{" + ids.join(",") + "}", assignee, "a".repeat(64)],
      );
      report.preview1000Ms = +(performance.now() - pStarted).toFixed(2);
      assert.equal(preview.result.items.length, 1000);
      const pending = preview.result.items.filter(
        (row: { status: string }) => row.status === "pending",
      );
      assert.equal(pending.length, 900);
      const operation = preview.result.operationId;
      await tx`reset role`;
      await tx`update supporter set name='Concurrent profile edit' where id=${pending[0].entityId}::uuid`;
      await tx`update supporter set deleted_at=now() where id=${pending[1].entityId}::uuid`;
      await tx.unsafe(
        "create function pg_temp.fail_assignment_audit()returns trigger language plpgsql as $$begin if new.action='supporter.assign_crm_followup' then raise exception 'synthetic audit failure' using errcode='P0002';end if;return new;end$$;create trigger fail_assignment_audit before insert on public.audit_log for each row execute function pg_temp.fail_assignment_audit()",
      );
      await tx`savepoint audit_failure`;
      await tx`set local role service_role`;
      let auditCode = "";
      try {
        await tx.unsafe(
          "select public.apply_crm_assignment_bulk_item($1::uuid,$2::uuid,$3::uuid)",
          [actor, operation, pending[2].entityId],
        );
      } catch (error) {
        auditCode = (error as { errno: string }).errno;
      }
      await tx`rollback to savepoint audit_failure`;
      assert.equal(auditCode, "P0002");
      assert.equal(
        (
          await tx`select crm_assignee_user_id from supporter where id=${pending[2].entityId}::uuid`
        )[0].crm_assignee_user_id,
        null,
      );
      assert.equal(
        (
          await tx`select status from crm_assignment_bulk_item where operation_id=${operation}::uuid and supporter_id=${pending[2].entityId}::uuid`
        )[0].status,
        "pending",
      );
      await tx`drop trigger fail_assignment_audit on public.audit_log`;
      await tx`set local role service_role`;
      const aStarted = performance.now();
      const applied = await tx.unsafe(
        "select public.apply_crm_assignment_bulk_item($1::uuid,$2::uuid,supporter_id)result from public.crm_assignment_bulk_item where operation_id=$2::uuid and status='pending' order by ordinal",
        [actor, operation],
      );
      report.apply900Ms = +(performance.now() - aStarted).toFixed(2);
      const statuses = applied.map((row: { result: { status: string } }) => row.result.status);
      assert.equal(statuses.filter((s: string) => s === "succeeded").length, 898);
      assert.equal(statuses.filter((s: string) => s === "conflict").length, 1);
      assert.equal(statuses.filter((s: string) => s === "skipped").length, 1);
      const [result] = await tx.unsafe(
        "select public.get_crm_assignment_bulk_operation($1::uuid,$2::uuid)result",
        [actor, operation],
      );
      assert.equal(result.result.state, "done");
      await tx.unsafe("select public.apply_crm_assignment_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
        actor,
        operation,
        pending[2].entityId,
      ]);
      await tx`reset role`;
      assert.equal(
        Number(
          (
            await tx`select count(*) n from audit_log where actor_user_id=${actor}::uuid and action='supporter.assign_crm_followup'`
          )[0].n,
        ),
        898,
      );
      report.results = { succeeded: 898, skipped: 101, conflict: 1, assignmentAudits: 898 };
      report.auditRollbackAndRetry = true;
      report.catalogGrantsRls = true;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(Number((await db`select count(*) n from supporter`)[0].n), 0);
  assert.equal(Number((await db`select count(*) n from crm_assignment_bulk_operation`)[0].n), 0);
  report.cleanupRows = 0;
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
