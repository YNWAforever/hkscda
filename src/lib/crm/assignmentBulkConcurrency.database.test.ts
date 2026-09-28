import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.CRM_ASSIGNMENT_BULK_TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "57322" || parsed.pathname !== "/postgres")
    throw new Error("CRM assignment concurrency fixture requires the named loopback database");
}
const enabled =
  Boolean(databaseUrl) && process.env.CRM_ASSIGNMENT_BULK_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "two concurrent assignment snapshots have one winner and one conflict",
  async () => {
    const first = new SQL(databaseUrl!, { max: 1, prepare: false });
    const second = new SQL(databaseUrl!, { max: 1, prepare: false });
    const actor = crypto.randomUUID();
    const assignee = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const operations: string[] = [];
    try {
      for (const user of [actor, assignee]) {
        const email = user + "@example.invalid";
        await first.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [user, email],
        );
        await first.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
          [user, email],
        );
      }
      await first.unsafe(
        "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic concurrent supporter',$2)",
        [supporter, supporter + "@example.invalid"],
      );
      for (const digest of ["a", "b"]) {
        const result = (await first.unsafe(
          "select public.create_crm_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + supporter + "}", assignee, digest.repeat(64)],
        )) as Array<{ result: { operationId: string } }>;
        operations.push(result[0]!.result.operationId);
      }
      const apply = (db: SQL, operation: string) =>
        db.unsafe(
          "select public.apply_crm_assignment_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operation, supporter],
        ) as Promise<Array<{ result: { status: string } }>>;
      const [one, two] = await Promise.all([
        apply(first, operations[0]!),
        apply(second, operations[1]!),
      ]);
      expect([one[0]!.result.status, two[0]!.result.status].sort()).toEqual([
        "conflict",
        "succeeded",
      ]);
      const [audit] = (await first.unsafe(
        "select count(*)::int count from public.audit_log where actor_user_id=$1::uuid and action='supporter.assign_crm_followup'",
        [actor],
      )) as Array<{ count: number }>;
      expect(audit!.count).toBe(1);
    } finally {
      await first.unsafe(
        "delete from public.crm_assignment_bulk_item where operation_id=any($1::uuid[])",
        ["{" + operations.join(",") + "}"],
      );
      await first.unsafe(
        "delete from public.crm_assignment_bulk_operation where id=any($1::uuid[])",
        ["{" + operations.join(",") + "}"],
      );
      await first.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
      await first.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
      await first.unsafe("delete from public.admin_user where auth_user_id=any($1::uuid[])", [
        "{" + [actor, assignee].join(",") + "}",
      ]);
      await first.unsafe("delete from auth.users where id=any($1::uuid[])", [
        "{" + [actor, assignee].join(",") + "}",
      ]);
      await first.close();
      await second.close();
    }
  },
  30000,
);
