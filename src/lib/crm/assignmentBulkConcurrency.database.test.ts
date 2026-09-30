import { SQL } from "bun";
import { expect, test } from "bun:test";
import { createCrmAssignmentBulkHandler } from "../../routes/api/admin/supporters/assignment-bulk";

const databaseUrl = process.env.CRM_ASSIGNMENT_BULK_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  const target =
    (url.port === "57322" && url.pathname === "/postgres") ||
    (url.port === "52322" && url.pathname === "/audit_pr135_20260929");
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    !target ||
    url.search ||
    url.hash
  )
    throw new Error("CRM assignment fixture requires the dedicated loopback database");
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
    const serviceCall = (db: SQL, query: string, values: unknown[]) =>
      db.begin(async (tx) => {
        await tx.unsafe("set local role service_role");
        return tx.unsafe(query, values);
      });
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
        const result = (await serviceCall(
          first,
          "select public.create_crm_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + supporter + "}", assignee, digest.repeat(64)],
        )) as Array<{ result: { operationId: string } }>;
        operations.push(result[0]!.result.operationId);
      }
      const apply = (db: SQL, operation: string) =>
        serviceCall(
          db,
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

for (const heldRow of ["operation", "supporter"] as const) {
  test.skipIf(!enabled)(
    `CRM assignment bulk rejects expiry while waiting for the ${heldRow} lock`,
    async () => {
      const db = new SQL(databaseUrl!, { max: 1, prepare: false });
      const blocker = new SQL(databaseUrl!, { max: 1, prepare: false });
      const applier = new SQL(databaseUrl!, { max: 1, prepare: false });
      const actor = crypto.randomUUID(),
        assignee = crypto.randomUUID();
      const supporter = crypto.randomUUID(),
        entity = supporter;
      let operation: string | undefined;
      let releaseLock = () => {};
      let held: Promise<unknown> | undefined;
      let applying: Promise<{ error?: unknown; result?: unknown }> | undefined;
      try {
        await db.begin(async (tx) => {
          for (const id of [actor, assignee]) {
            await tx.unsafe(
              "insert into auth.users(id,email,email_confirmed_at) values($1::uuid,$2,now())",
              [id, `${id}@example.invalid`],
            );
            await tx.unsafe(
              "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
              [id, `${id}@example.invalid`],
            );
          }
          await tx.unsafe(
            "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic assignment expiry',$2)",
            [supporter, `${supporter}@example.invalid`],
          );

          await tx.unsafe("set local role service_role");
          const preview = await tx.unsafe(
            "select public.create_crm_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
            [actor, `{${entity}}`, assignee, "e".repeat(64)],
          );
          operation = preview[0].result.operationId as string;
        });
        await db.unsafe(
          "update public.crm_assignment_bulk_operation set expires_at=clock_timestamp()+interval '2 seconds' where id=$1::uuid",
          [operation],
        );
        const state = () =>
          db.unsafe(
            "select e.crm_assignee_user_id as assignee,e.edit_version::text as version,i.status,i.reason_code,i.applied_at from public.supporter e join public.crm_assignment_bulk_item i on i.supporter_id=e.id where e.id=$1::uuid and i.operation_id=$2::uuid",
            [entity, operation],
          );
        const before = [...(await state())];
        const audits = () =>
          db.unsafe(
            "select id,action,entity,entity_id,detail from public.audit_log where actor_user_id=$1::uuid order by id",
            [actor],
          );
        const beforeAudits = [...(await audits())];
        expect(before[0]).toMatchObject({
          assignee: null,
          version: "1",
          status: "pending",
          reason_code: null,
          applied_at: null,
        });
        let lockReady = () => {};
        const ready = new Promise<void>((resolve) => {
          lockReady = resolve;
        });
        const release = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        held = blocker.begin(async (tx) => {
          const table =
            heldRow === "operation" ? "public.crm_assignment_bulk_operation" : "public.supporter";
          await tx.unsafe(`select id from ${table} where id=$1::uuid for update`, [
            heldRow === "operation" ? operation! : entity,
          ]);
          lockReady();
          await release;
        });
        await ready;
        let pidReady = (value: number) => {
          void value;
        };
        const pidPromise = new Promise<number>((resolve) => {
          pidReady = resolve;
        });
        applying = applier
          .begin(async (tx) => {
            await tx.unsafe("set local statement_timeout='8s'");
            pidReady((await tx.unsafe("select pg_backend_pid() pid"))[0].pid as number);
            await tx.unsafe("set local role service_role");
            return tx.unsafe(
              "select public.apply_crm_assignment_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
              [actor, operation!, entity],
            );
          })
          .then(
            (result) => ({ result }),
            (error: unknown) => ({ error }),
          );
        const pid = await pidPromise;
        let blocked = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const [row] = await db.unsafe(
            "select cardinality(pg_blocking_pids($1::int))>0 blocked,expires_at>clock_timestamp() live from public.crm_assignment_bulk_operation where id=$2::uuid",
            [pid, operation],
          );
          if (row.blocked) {
            expect(row.live).toBe(true);
            blocked = true;
            break;
          }
          await Bun.sleep(10);
        }
        expect(blocked).toBe(true);
        await db.unsafe(
          "select pg_sleep(greatest(0,extract(epoch from(expires_at-clock_timestamp())))+0.02) from public.crm_assignment_bulk_operation where id=$1::uuid",
          [operation],
        );
        const [expired] = await db.unsafe(
          "select expires_at<=clock_timestamp() expired,cardinality(pg_blocking_pids($1::int))>0 blocked from public.crm_assignment_bulk_operation where id=$2::uuid",
          [pid, operation],
        );
        expect(expired).toEqual({ expired: true, blocked: true });
        releaseLock();
        await held;
        const outcome = await applying;
        expect(outcome).toMatchObject({ error: { errno: "P0001" } });
        expect([...(await state())]).toEqual(before);
        expect([...(await audits())]).toEqual(beforeAudits);
        const error = outcome.error as { errno: string };
        const handler = createCrmAssignmentBulkHandler({
          authorize: async () => actor,
          preview: async () => {
            throw new Error("Unexpected preview");
          },
          read: async () => ({
            operationId: operation!,
            assigneeUserId: assignee,
            filterHash: "e".repeat(64),
            createdAt: "2026-01-01T00:00:00Z",
            expiresAt: "2026-01-01T00:15:00Z",
            state: "queued",
            items: [
              {
                entityId: entity,
                status: "pending",
                reasonCode: null,
                expectedVersion: 1,
                beforeAssignee: null,
                afterAssignee: assignee,
              },
            ],
          }),
          applyItem: async () => {
            throw { code: error.errno };
          },
        });
        const response = await handler(
          new Request("http://localhost/api/admin/supporters/assignment-bulk", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "apply", operationId: operation }),
          }),
        );
        expect(response.status).toBe(409);
        expect(response.headers.get("cache-control")).toBe("no-store");
      } finally {
        releaseLock();
        await held?.catch(() => {});
        await applying;
        await db.begin(async (tx) => {
          if (operation) {
            await tx.unsafe(
              "delete from public.crm_assignment_bulk_item where operation_id=$1::uuid",
              [operation],
            );
            await tx.unsafe("delete from public.crm_assignment_bulk_operation where id=$1::uuid", [
              operation,
            ]);
          }
          await tx.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);

          await tx.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
          for (const id of [actor, assignee]) {
            await tx.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [id]);
            await tx.unsafe("delete from auth.users where id=$1::uuid", [id]);
          }
        });
        await Promise.all([db.close(), blocker.close(), applier.close()]);
      }
    },
    15000,
  );
}
