import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.CRM_ASSIGNMENT_BULK_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "57322" || url.pathname !== "/postgres") {
    throw new Error("CRM assignment fixture requires the named loopback database");
  }
}
const enabled =
  Boolean(databaseUrl) && process.env.CRM_ASSIGNMENT_BULK_TEST_ALLOW_LOCAL_FIXTURES === "1";

async function addUser(
  tx: { unsafe: (query: string, values?: unknown[]) => Promise<unknown> },
  id: string,
) {
  const email = id + "@example.invalid";
  await tx.unsafe(
    "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
    [id, email],
  );
  await tx.unsafe(
    "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
    [id, email],
  );
}

test.skipIf(!enabled)(
  "CRM assignment snapshot reports each outcome and audits only the applied owner",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback CRM assignment fixture");
    const actor = crypto.randomUUID();
    const assignee = crypto.randomUUID();
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    try {
      await db.begin(async (tx) => {
        await addUser(tx, actor);
        await addUser(tx, assignee);
        for (const id of [ids[0], ids[1], ids[2], ids[4]]) {
          await tx.unsafe(
            "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic supporter',$2)",
            [id, id + "@example.invalid"],
          );
        }
        await tx.unsafe(
          "update public.supporter set crm_assignee_user_id=$2::uuid where id=$1::uuid",
          [ids[1], assignee],
        );
        await tx.unsafe("update public.supporter set deleted_at=now() where id=$1::uuid", [ids[2]]);
        const preview = (await tx.unsafe(
          "select public.create_crm_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + ids.join(",") + "}", assignee, "a".repeat(64)],
        )) as Array<{ result: { operationId: string; items: Array<{ status: string }> } }>;
        expect(preview[0]!.result.items.map((item) => item.status)).toEqual([
          "pending",
          "skipped",
          "skipped",
          "skipped",
          "pending",
        ]);
        const operation = preview[0]!.result.operationId;
        const competing = (await tx.unsafe(
          "select public.create_crm_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + ids[0] + "}", assignee, "b".repeat(64)],
        )) as Array<{ result: { operationId: string } }>;
        const apply = async (op: string, id: string) =>
          (await tx.unsafe(
            "select public.apply_crm_assignment_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
            [actor, op, id],
          )) as Array<{ result: { status: string; reasonCode: string | null } }>;
        expect((await apply(operation, ids[0]!))[0]!.result.status).toBe("succeeded");
        expect((await apply(operation, ids[0]!))[0]!.result.status).toBe("succeeded");
        expect((await apply(competing[0]!.result.operationId, ids[0]!))[0]!.result).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        await tx.unsafe(
          "update public.supporter set name='Edited after preview' where id=$1::uuid",
          [ids[4]],
        );
        expect((await apply(operation, ids[4]!))[0]!.result).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        const result = (await tx.unsafe(
          "select public.get_crm_assignment_bulk_operation($1::uuid,$2::uuid) result",
          [actor, operation],
        )) as Array<{ result: { state: string; items: Array<{ status: string }> } }>;
        expect(result[0]!.result.state).toBe("done");
        expect(result[0]!.result.items.map((item) => item.status)).toEqual([
          "succeeded",
          "skipped",
          "skipped",
          "skipped",
          "conflict",
        ]);
        const rows = (await tx.unsafe(
          "select id,crm_assignee_user_id from public.supporter where id=any($1::uuid[]) order by id",
          ["{" + [ids[0], ids[4]].join(",") + "}"],
        )) as Array<{ id: string; crm_assignee_user_id: string | null }>;
        expect(rows.find((row) => row.id === ids[0])?.crm_assignee_user_id).toBe(assignee);
        expect(rows.find((row) => row.id === ids[4])?.crm_assignee_user_id).toBeNull();
        const audits = (await tx.unsafe(
          "select count(*)::int count from public.audit_log where actor_user_id=$1::uuid and action='supporter.assign_crm_followup'",
          [actor],
        )) as Array<{ count: number }>;
        expect(audits[0]!.count).toBe(1);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
  30000,
);

test.skipIf(!enabled)(
  "CRM assignment rechecks roles, expiry and audit in each item transaction",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback CRM assignment safety fixture");
    const actor = crypto.randomUUID();
    const assignee = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        await addUser(tx, actor);
        await addUser(tx, assignee);
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic supporter',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        const fail = async (command: () => Promise<unknown>, code: string) => {
          await tx.unsafe("savepoint crm_assignment_failure");
          let actual: unknown;
          try {
            await command();
          } catch (error) {
            actual = error;
          }
          await tx.unsafe("rollback to savepoint crm_assignment_failure");
          expect((actual as { errno?: string } | undefined)?.errno).toBe(code);
        };
        const preview = () =>
          tx.unsafe(
            "select public.create_crm_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
            [actor, "{" + supporter + "}", assignee, "a".repeat(64)],
          );
        await fail(
          () =>
            tx.unsafe(
              "select public.create_crm_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4)",
              [
                actor,
                "{" + Array.from({ length: 1001 }, () => crypto.randomUUID()).join(",") + "}",
                assignee,
                "a".repeat(64),
              ],
            ),
          "22023",
        );
        const operation = (await preview())[0].result.operationId as string;
        const listed = (await tx.unsafe(
          "select public.list_crm_assignment_assignees($1::uuid) result",
          [actor],
        )) as Array<{ result: Array<{ authUserId: string }> }>;
        expect(listed[0]!.result.some((person) => person.authUserId === assignee)).toBe(true);
        const apply = () =>
          tx.unsafe(
            "select public.apply_crm_assignment_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
            [actor, operation, supporter],
          );
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [actor],
        );
        await fail(apply, "42501");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [actor],
        );
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [assignee],
        );
        const afterDisable = (await tx.unsafe(
          "select public.list_crm_assignment_assignees($1::uuid) result",
          [actor],
        )) as Array<{ result: Array<{ authUserId: string }> }>;
        expect(afterDisable[0]!.result.some((person) => person.authUserId === assignee)).toBe(
          false,
        );
        await fail(apply, "42501");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [assignee],
        );
        await tx.unsafe(
          "update public.crm_assignment_bulk_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [operation],
        );
        await fail(apply, "P0001");
        await tx.unsafe(
          "update public.crm_assignment_bulk_operation set expires_at=now()+interval '15 minutes' where id=$1::uuid",
          [operation],
        );
        await tx.unsafe(
          "create function pg_temp.fail_crm_assignment_audit() returns trigger language plpgsql as $$ begin if new.action='supporter.assign_crm_followup' then raise exception 'synthetic audit failure' using errcode='P0002'; end if; return new; end $$",
        );
        await tx.unsafe(
          "create trigger fail_crm_assignment_audit before insert on public.audit_log for each row execute function pg_temp.fail_crm_assignment_audit()",
        );
        await fail(apply, "P0002");
        const before = (await tx.unsafe(
          "select crm_assignee_user_id from public.supporter where id=$1::uuid",
          [supporter],
        )) as Array<{ crm_assignee_user_id: string | null }>;
        expect(before[0]!.crm_assignee_user_id).toBeNull();
        await tx.unsafe("drop trigger fail_crm_assignment_audit on public.audit_log");
        const applied = (await apply()) as Array<{ result: { status: string } }>;
        expect(applied[0]!.result.status).toBe("succeeded");
        const grants = (await tx.unsafe(
          "select has_function_privilege('authenticated','public.create_crm_assignment_bulk_preview(uuid,uuid[],uuid,text)','EXECUTE') as preview, has_function_privilege('anon','public.apply_crm_assignment_bulk_item(uuid,uuid,uuid)','EXECUTE') as apply, has_function_privilege('authenticated','public.list_crm_assignment_assignees(uuid)','EXECUTE') as assignees, has_table_privilege('authenticated','public.crm_assignment_bulk_item','SELECT') as item",
        )) as Array<{ preview: boolean; apply: boolean; assignees: boolean; item: boolean }>;
        expect(grants[0]).toEqual({ preview: false, apply: false, assignees: false, item: false });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
  30000,
);
