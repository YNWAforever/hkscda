import { assertDocumentTestTarget, type DocumentTestTarget } from "./documentGuardTestTarget";
import { SQL, type TransactionSQL } from "bun";
import { assertSafeFixtureTables } from "./productionSchemaClone";
import { fixtureAsset, fixtureReference } from "./documentGuardBusiness";

const rollback = new Error("Private publication fence test rollback");
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(message);
}
const state = (e: unknown) =>
  e instanceof SQL.PostgresError && typeof e.errno === "string" && /^[0-9A-Z]{5}$/.test(e.errno)
    ? e.errno
    : undefined;
const actual = (e: SQL.PostgresError) => ({
  type: e.constructor.name,
  message: e.message,
  code: e.code,
  errno: e.errno,
  severity: e.severity,
  detail: e.detail,
  hint: e.hint,
  routine: e.routine,
  stack: e.stack,
});

/** Executable tests on the caller's already-restored, separately-strengthened owned clone.
 * The unchanged 26 business/12 race matrices run separately after these cases.
 * No definitions or fixture queries execute at import time.
 */
export async function documentPublicationFenceTests(clone: DocumentTestTarget) {
  await assertDocumentTestTarget(clone);
  await assertSafeFixtureTables(clone.sql, [
    "public.document_assets",
    "public.site_document_slots",
    "public.knowledge_posts",
    "public.annual_reports",
    "public.audit_log",
    "private.document_publication_fences",
  ]);
  const results: { name: string; outcome: string; actualError?: unknown }[] = [];
  const baseline =
    await clone.sql`select count(*)::text n from private.document_publication_fences`;
  require(baseline.length === 1 &&
    baseline[0].n === "0", "Expected zero initial private fence rows");
  const run = async (name: string, action: (tx: TransactionSQL) => Promise<void>) => {
    try {
      await clone.sql.begin(async (tx) => {
        await tx`set local lock_timeout='5s'`;
        await tx`set local statement_timeout='30s'`;
        await action(tx);
        throw rollback;
      });
      throw Error("Fence case unexpectedly committed");
    } catch (e) {
      if (e !== rollback)
        throw Object.assign(new Error("Fence case failed: " + name), {
          cause: e,
          successfulPrefix: [...results],
        });
      const rows =
        await clone.sql`select count(*)::text n from private.document_publication_fences`;
      require(rows.length === 1 && rows[0].n === "0", "Outer rollback leaked private fence rows");
      results.push({ name, outcome: "COMPLETED_THEN_ROLLED_BACK" });
    }
  };
  for (const role of ["anon", "authenticated", "service_role"] as const) {
    for (const operation of ["select", "insert", "update", "delete", "execute"] as const) {
      const name = role + " cannot directly " + operation + " publication fence";
      let error: unknown;
      await run(name, async (tx) => {
        const privileges =
          await tx`select has_table_privilege(${role},'private.document_publication_fences','SELECT') as can_select,
          has_table_privilege(${role},'private.document_publication_fences','INSERT') as can_insert,
          has_table_privilege(${role},'private.document_publication_fences','UPDATE') as can_update,
          has_table_privilege(${role},'private.document_publication_fences','DELETE') as can_delete,
          has_function_privilege(${role},'private.touch_document_publication_fence(uuid)','EXECUTE') as can_execute,
          has_function_privilege(${role},'private.coordinate_annual_report_publication()','EXECUTE') as can_execute_annual_publication,
          has_function_privilege(${role},'private.coordinate_annual_asset_change()','EXECUTE') as can_execute_annual_asset_change`;
        require(privileges.length === 1 &&
          Object.values(privileges[0]).every(
            (v) => v === false,
          ), "Private fence permission bypass");
        await tx`savepoint direct_fence_operation`;
        await tx.unsafe("set local role " + role);
        const context = await tx`select current_user as actor`;
        require(context.length === 1 && context[0].actor === role, "Wrong test role");
        try {
          if (operation === "select") await tx`select * from private.document_publication_fences`;
          else if (operation === "insert")
            await tx`insert into private.document_publication_fences(asset_id,version) values('00000000-0000-4000-8000-000000000001',false)`;
          else if (operation === "update")
            await tx`update private.document_publication_fences set version=not version`;
          else if (operation === "delete")
            await tx`delete from private.document_publication_fences`;
          else
            await tx`select private.touch_document_publication_fence('00000000-0000-4000-8000-000000000001')`;
        } catch (e) {
          error = e;
        }
        await tx`rollback to savepoint direct_fence_operation`;
        await tx`release savepoint direct_fence_operation`;
        require(error instanceof SQL.PostgresError &&
          state(error) === "42501", "Expected actual private fence permission refusal");
      });
      require(error instanceof SQL.PostgresError, "Missing actual permission error");
      results[results.length - 1] = {
        name,
        outcome: "REFUSED_42501_AND_ROLLED_BACK",
        actualError: actual(error),
      };
    }
  }
  await run("publication fence preserves asset content timestamps and audit", async (tx) => {
    const asset = await fixtureAsset(tx, true);
    const before =
      await tx`select row_to_json(a)::text raw from public.document_assets a where id=${asset}::uuid`;
    const auditsBefore = await tx`select count(*)::text n from public.audit_log`;
    const reference = await fixtureReference(tx, "site", asset, true);
    const fence =
      await tx`select version from private.document_publication_fences where asset_id=${asset}::uuid`;
    require(fence.length === 1 &&
      typeof fence[0].version === "boolean", "Publication did not create exact own fence");
    const after =
      await tx`select row_to_json(a)::text raw from public.document_assets a where id=${asset}::uuid`;
    const auditsAfter = await tx`select count(*)::text n from public.audit_log`;
    require(before.length === 1 &&
      after.length === 1 &&
      before[0].raw === after[0].raw, "Publication fence changed asset row/content/updated_at");
    require(auditsBefore.length === 1 &&
      auditsAfter.length === 1 &&
      auditsBefore[0].n === auditsAfter[0].n, "Publication fence changed audit behavior");
    await tx`update public.site_document_slots set is_published=false where id=${reference}::uuid`;
    await tx`update public.document_assets set is_published=false where id=${asset}::uuid`;
    const updated =
      await tx`select version from private.document_publication_fences where asset_id=${asset}::uuid`;
    require(updated.length === 1 &&
      updated[0].version !== fence[0].version, "Inverse path did not update SAME asset fence");
  });
  await run("unreferenced asset deletion cascades private fence cleanup", async (tx) => {
    const asset = await fixtureAsset(tx, true),
      reference = await fixtureReference(tx, "site", asset, true);
    const exists =
      await tx`select count(*)::text n from private.document_publication_fences where asset_id=${asset}::uuid`;
    require(exists.length === 1 && exists[0].n === "1", "Missing exact fixture fence");
    await tx`delete from public.site_document_slots where id=${reference}::uuid`;
    await tx`delete from public.document_assets where id=${asset}::uuid`;
    const missing =
      await tx`select count(*)::text n from private.document_publication_fences where asset_id=${asset}::uuid`;
    require(missing.length === 1 &&
      missing[0].n === "0", "Private fence blocked or leaked unreferenced asset deletion");
  });
  return { results, outerRollbackVerified: true, privateFenceRowsRemainZero: true };
}
