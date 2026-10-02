import { afterAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";
const url = process.env.R01_ADMIN_ATOMIC_TEST_DATABASE_URL;
if (url) assertCloneUrl(url);
const db =
  url && process.env.R01_ADMIN_ATOMIC_ALLOW_LOCAL_FIXTURES === "1"
    ? new SQL(url, { max: 1 })
    : null;
const rollback = new Error("Task10 direct fence rollback");
async function fixture(run: (tx: SQL, actor: string, target: string) => Promise<void>) {
  if (!db) throw Error("Own clone required");
  try {
    await db.begin(async (sql) => {
      const tx = sql as SQL;
      await tx`set local role postgres`;
      const actor = randomUUID(),
        target = randomUUID();
      for (const id of [actor, target]) {
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${id}::uuid,${id + "@example.invalid"},'admin','active')`;
      }
      await run(tx, actor, target);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}
async function refuses(tx: SQL, run: () => Promise<unknown>, code: string, message?: string) {
  await tx`savepoint direct_probe`;
  let error: unknown;
  try {
    await run();
  } catch (e) {
    error = e;
  } finally {
    await tx`rollback to savepoint direct_probe`;
    await tx`release savepoint direct_probe`;
  }
  expect(error).toMatchObject({ errno: code, ...(message ? { message } : {}) });
}
describe.skipIf(!db)("Task10 actual direct admin access fence", () => {
  test("authenticated administrator can read other admin identities", () =>
    fixture(async (tx, actor, target) => {
      await tx.unsafe(
        "set local request.jwt.claim.sub='" +
          actor +
          "';set local request.jwt.claim.role='authenticated';set local role authenticated",
      );
      const rows =
        await tx`select auth_user_id from public.admin_user where auth_user_id in(${actor}::uuid,${target}::uuid) order by auth_user_id`;
      expect(rows.map((r: { auth_user_id: string }) => r.auth_user_id).sort()).toEqual(
        [actor, target].sort(),
      );
    }));
  for (const role of ["staff", "treasurer"] as const)
    test(`authenticated ${role} retains own-role read only`, () =>
      fixture(async (tx, actor, target) => {
        await tx`update public.admin_user set role=${role} where auth_user_id=${target}::uuid`;
        await tx.unsafe(
          "set local request.jwt.claim.sub='" +
            target +
            "';set local request.jwt.claim.role='authenticated';set local role authenticated",
        );
        const rows =
          await tx`select auth_user_id,role from public.admin_user where auth_user_id in(${actor}::uuid,${target}::uuid)`;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ auth_user_id: target, role });
      }));
  for (const operation of ["insert", "update", "delete"] as const)
    test(`authenticated admin JWT cannot directly ${operation} admin identities`, () =>
      fixture(async (tx, actor, target) => {
        await tx.unsafe(
          "set local request.jwt.claim.sub='" +
            actor +
            "';set local request.jwt.claim.role='authenticated';set local role authenticated",
        );
        await refuses(
          tx,
          () =>
            operation === "insert"
              ? tx`insert into public.admin_user(auth_user_id,email,role,status) values(${randomUUID()}::uuid,${randomUUID() + "@example.invalid"},'admin','active')`
              : operation === "update"
                ? tx`update public.admin_user set status='disabled' where auth_user_id=${target}::uuid`
                : tx`delete from public.admin_user where auth_user_id=${target}::uuid`,
          "42501",
          "permission denied for table admin_user",
        );
      }));
  for (const operation of ["update", "delete"] as const)
    test(`service direct bulk ${operation} cannot remove final active admins`, () =>
      fixture(async (tx) => {
        // This test begins with only owned rows. Current runner sentinel is excluded by
        // the WHERE only when present; the global guard is tested in a fresh direct RED.
        await tx`set local role service_role`;
        await refuses(
          tx,
          () =>
            operation === "update"
              ? tx`update public.admin_user set status='disabled' where role='admin' and status='active'`
              : tx`delete from public.admin_user where role='admin' and status='active'`,
          "P0001",
          "last_active_admin",
        );
      }));
});
describe.skipIf(!db)("Task10 scoped TRUNCATE browser fence", () => {
  for (const role of ["anon", "authenticated"] as const)
    test(`${role} has no TRUNCATE privilege and RESTRICT fails42501`, () =>
      fixture(async (tx, actor) => {
        await tx.unsafe(
          "set local request.jwt.claim.sub='" +
            actor +
            "';set local request.jwt.claim.role='" +
            role +
            "';set local role " +
            role,
        );
        const [r] =
          await tx`select current_user role,has_table_privilege(current_user,'public.admin_user','TRUNCATE') allowed`;
        expect(r.role).toBe(role);
        expect(r.allowed).toBe(false);
        await refuses(
          tx,
          () => tx`truncate table public.admin_user restrict`,
          "42501",
          "permission denied for table admin_user",
        );
      }));
});
afterAll(async () => {
  await db?.close();
});
