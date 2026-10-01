import { SQL } from "bun";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
if (process.env.CRM_VERSION_FENCE_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Explicit synthetic opt-in required");
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929", {
  max: 1,
  prepare: false,
});
const source = readFileSync(
  "supabase/migrations/20260928113000_crm_supporter_version_fence.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const report: Record<string, unknown> = {
  environment: "isolated schema clone52322",
  sha256: createHash("sha256").update(source).digest("hex"),
};
const rollback = Error("rollback version-fence rehearsal");
try {
  try {
    await db.begin(async (tx) => {
      assert.equal(Number((await tx`select count(*) n from public.supporter`)[0].n), 0);
      const ids = Array.from({ length: 15 }, () => crypto.randomUUID());
      for (const id of ids)
        await tx`insert into public.supporter(id,name,email) values(${id},'Synthetic supporter',${id + "@example.invalid"})`;
      const before = await tx`select to_jsonb(s) record from public.supporter s order by id`;
      const triggers =
        await tx`select tgname,pg_get_triggerdef(oid) definition from pg_trigger where tgrelid in ('public.supporter'::regclass,'public.supporter_role'::regclass) and not tgisinternal order by tgname`;
      const functions =
        await tx`select oid,pg_get_functiondef(oid) definition from pg_proc where oid in ('private.bump_supporter_edit_version()'::regprocedure,'private.bump_supporter_edit_version_from_role()'::regprocedure)`;
      const started = performance.now();
      await tx.unsafe(source);
      report.migrationMs = +(performance.now() - started).toFixed(2);
      assert.deepEqual(
        [...(await tx`select to_jsonb(s) record from public.supporter s order by id`)],
        [...before],
      );
      assert.deepEqual(
        [
          ...(await tx`select tgname,pg_get_triggerdef(oid) definition from pg_trigger where tgrelid in ('public.supporter'::regclass,'public.supporter_role'::regclass) and not tgisinternal order by tgname`),
        ],
        [...triggers],
      );
      assert.deepEqual(
        [
          ...(await tx`select oid,pg_get_functiondef(oid) definition from pg_proc where oid in ('private.bump_supporter_edit_version()'::regprocedure,'private.bump_supporter_edit_version_from_role()'::regprocedure)`),
        ],
        [...functions],
      );
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal(
          (
            await tx`select has_function_privilege(${role},'private.bump_supporter_edit_version()','EXECUTE') allowed`
          )[0].allowed,
          false,
        );
      await tx`set local role service_role`;
      await tx`update public.supporter set name='Edited',edit_version=99999 where id=${ids[0]}::uuid`;
      assert.equal(
        Number(
          (await tx`select edit_version v from public.supporter where id=${ids[0]}::uuid`)[0].v,
        ),
        2,
      );
      await tx`insert into public.supporter_role(supporter_id,role) values(${ids[0]}::uuid,'donor')`;
      assert.equal(
        Number(
          (await tx`select edit_version v from public.supporter where id=${ids[0]}::uuid`)[0].v,
        ),
        3,
      );
      await tx`reset role`;
      report.rowsUnchangedByMigration = 15;
      report.functionsTriggersUnchanged = true;
      report.revokedDirectExecute = true;
      report.serviceRoleUpdateAndRoleTriggerWork = true;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(Number((await db`select count(*) n from public.supporter`)[0].n), 0);
  report.cleanupRows = 0;
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
