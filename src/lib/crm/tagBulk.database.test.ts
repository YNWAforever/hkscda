import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.CRM_TAG_BULK_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  const target =
    ((url.port === "57322" || url.port === "55322") && url.pathname === "/postgres") ||
    (url.port === "52322" && url.pathname === "/audit_pr135_20260929");
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    !target ||
    url.search ||
    url.hash
  ) {
    throw new Error("CRM tag bulk test requires the dedicated loopback database");
  }
}
const enabled = Boolean(databaseUrl) && process.env.CRM_TAG_BULK_TEST_ALLOW_LOCAL_FIXTURES === "1";

for (const heldRow of ["operation", "supporter"] as const) {
  test.skipIf(!enabled)(
    `CRM bulk rejects expiry while waiting for the ${heldRow} lock`,
    async () => {
      const db = new SQL(databaseUrl!, { max: 1, prepare: false });
      const blocker = new SQL(databaseUrl!, { max: 1, prepare: false });
      const applier = new SQL(databaseUrl!, { max: 1, prepare: false });
      const actor = crypto.randomUUID();
      const supporter = crypto.randomUUID();
      let operation: string | undefined;
      let releaseLock = () => {};
      let held: Promise<unknown> | undefined;
      let applying: Promise<{ error?: unknown; result?: unknown }> | undefined;
      try {
        await db.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, `crm-expiry-${actor}@example.invalid`],
        );
        await db.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
          [actor, `crm-expiry-${actor}@example.invalid`],
        );
        await db.unsafe(
          "insert into public.supporter(id,name,email,tags) values($1::uuid,'Synthetic expiry fixture',$2,array['old'])",
          [supporter, `${supporter}@example.invalid`],
        );
        const preview = await db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          return tx.unsafe(
            "select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],'reviewed',$3) result",
            [actor, `{${supporter}}`, "e".repeat(64)],
          );
        });
        operation = preview[0].result.operationId as string;
        await db.unsafe(
          "update public.crm_tag_bulk_operation set expires_at=clock_timestamp()+interval '2 seconds' where id=$1::uuid",
          [operation],
        );
        let lockReady = () => {};
        const ready = new Promise<void>((resolve) => {
          lockReady = resolve;
        });
        const release = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        held = blocker.begin(async (tx) => {
          const table =
            heldRow === "operation" ? "public.crm_tag_bulk_operation" : "public.supporter";
          await tx.unsafe(`select id from ${table} where id=$1::uuid for update`, [
            heldRow === "operation" ? operation! : supporter,
          ]);
          lockReady();
          await release;
        });
        await ready;
        let markPidReady = (value: number) => {
          void value;
        };
        const pidReady = new Promise<number>((resolve) => {
          markPidReady = resolve;
        });
        applying = applier
          .begin(async (tx) => {
            await tx.unsafe("set local statement_timeout='8s'");
            const pid = await tx.unsafe("select pg_backend_pid() as pid");
            markPidReady(pid[0].pid as number);
            await tx.unsafe("set local role service_role");
            return tx.unsafe("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
              actor,
              operation!,
              supporter,
            ]);
          })
          .then(
            (result) => ({ result }),
            (error: unknown) => ({ error }),
          );
        const pid = await pidReady;
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const state = await db.unsafe(
            "select cardinality(pg_blocking_pids($1::int))>0 blocked,expires_at>clock_timestamp() live from public.crm_tag_bulk_operation where id=$2::uuid",
            [pid, operation],
          );
          if (state[0].blocked) {
            expect(state[0].live).toBe(true);
            waiting = true;
            break;
          }
          await Bun.sleep(10);
        }
        expect(waiting).toBe(true);
        await db.unsafe(
          "select pg_sleep(greatest(0,extract(epoch from(expires_at-clock_timestamp())))+0.02) from public.crm_tag_bulk_operation where id=$1::uuid",
          [operation],
        );
        releaseLock();
        await held;
        const outcome = await applying;
        expect(outcome).toMatchObject({ error: { errno: "P0001" } });
        const unchanged = await db.unsafe(
          "select s.tags,s.edit_version,i.status from public.supporter s join public.crm_tag_bulk_item i on i.supporter_id=s.id where s.id=$1::uuid and i.operation_id=$2::uuid",
          [supporter, operation],
        );
        expect(unchanged[0].tags).toEqual(["old"]);
        expect(String(unchanged[0].edit_version)).toBe("1");
        expect(unchanged[0].status).toBe("pending");
        const audit = await db.unsafe(
          "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='supporter.bulk_tag_add'",
          [actor],
        );
        expect(audit[0].n).toBe(0);
      } finally {
        releaseLock();
        await held?.catch(() => {});
        await applying;
        await db.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
        if (operation) {
          await db.unsafe("delete from public.crm_tag_bulk_item where operation_id=$1::uuid", [
            operation,
          ]);
          await db.unsafe("delete from public.crm_tag_bulk_operation where id=$1::uuid", [
            operation,
          ]);
        }
        await db.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
        await db.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [actor]);
        await db.unsafe("delete from auth.users where id=$1::uuid", [actor]);
        await Promise.all([blocker.close(), applier.close(), db.close()]);
      }
    },
    15000,
  );
}

test.skipIf(!enabled)(
  "CRM tag preview and per-item apply fence stale versions and double submit",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback CRM tag bulk fixture");
    const actor = crypto.randomUUID();
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    try {
      await db.begin(async (tx) => {
        const serviceCall = async (query: string, args: string[]) => {
          await tx.unsafe("set local role service_role");
          const rows = await tx.unsafe(query, args);
          await tx.unsafe("reset role");
          return rows;
        };
        const email = "crm-bulk-" + actor + "@example.invalid";
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, email],
        );
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
          [actor, email],
        );
        for (const id of ids) {
          await tx.unsafe(
            "insert into public.supporter(id,name,email,tags) values($1::uuid,'Synthetic supporter',$2,array['old']::text[])",
            [id, id + "@example.invalid"],
          );
        }
        const alreadyTagged = (await serviceCall(
          "select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + ids[0] + "}", "old", "a".repeat(64)],
        )) as Array<{
          result: { items: Array<{ status: string; beforeTags: string[]; afterTags: string[] }> };
        }>;
        expect(alreadyTagged[0]!.result.items[0]).toMatchObject({
          status: "skipped",
          beforeTags: ["old"],
          afterTags: ["old"],
        });
        const preview = (await serviceCall(
          "select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + ids.join(",") + "}", "reviewed", "a".repeat(64)],
        )) as Array<{ result: { operationId: string; items: Array<{ status: string }> } }>;
        const operationId = preview[0]!.result.operationId;
        expect(preview[0]!.result.items).toHaveLength(3);
        const first = (await serviceCall(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, ids[0]],
        )) as Array<{ result: { status: string } }>;
        expect(first[0]!.result.status).toBe("succeeded");
        const repeat = (await serviceCall(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, ids[0]],
        )) as Array<{ result: { status: string } }>;
        expect(repeat[0]!.result.status).toBe("succeeded");
        await tx.unsafe(
          "update public.supporter set tags=array['changed']::text[] where id=$1::uuid",
          [ids[1]],
        );
        const stale = (await serviceCall(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, ids[1]],
        )) as Array<{ result: { status: string; reasonCode: string } }>;
        expect(stale[0]!.result).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        const third = (await serviceCall(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, ids[2]],
        )) as Array<{ result: { status: string } }>;
        expect(third[0]!.result.status).toBe("succeeded");
        const result = (await serviceCall(
          "select public.get_crm_tag_bulk_operation($1::uuid,$2::uuid) result",
          [actor, operationId],
        )) as Array<{ result: { state: string; items: Array<{ status: string }> } }>;
        expect(result[0]!.result.state).toBe("done");
        expect(result[0]!.result.items.map((item) => item.status)).toEqual([
          "succeeded",
          "conflict",
          "succeeded",
        ]);
        const audits = (await tx.unsafe(
          "select count(*)::int count from public.audit_log where actor_user_id=$1::uuid and action='supporter.bulk_tag_add'",
          [actor],
        )) as Array<{ count: number }>;
        expect(audits[0]!.count).toBe(2);
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
  "CRM bulk rejects oversized previews, revoked actor and expired snapshot; audit failure rolls back update",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback CRM bulk safety fixture");
    const actor = crypto.randomUUID();
    const id = crypto.randomUUID();
    const hash = "b".repeat(64);
    try {
      await db.begin(async (tx) => {
        const serviceCall = async (query: string, args: string[]) => {
          await tx.unsafe("set local role service_role");
          const rows = await tx.unsafe(query, args);
          await tx.unsafe("reset role");
          return rows;
        };
        const email = actor + "@example.invalid";
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, email],
        );
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
          [actor, email],
        );
        await tx.unsafe(
          "insert into public.supporter(id,name,email,tags) values($1::uuid,'Synthetic supporter',$2,array['old']::text[])",
          [id, id + "@example.invalid"],
        );
        const expectFailure = async (call: () => Promise<unknown>, code: string) => {
          await tx.unsafe("savepoint bulk_expected_failure");
          let received: unknown;
          try {
            await call();
          } catch (error) {
            received = error;
          }
          await tx.unsafe("rollback to savepoint bulk_expected_failure");
          expect((received as { errno?: string } | undefined)?.errno).toBe(code);
        };
        const tooMany = Array.from({ length: 1001 }, () => crypto.randomUUID());
        await expectFailure(
          () =>
            serviceCall("select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],$3,$4)", [
              actor,
              "{" + tooMany.join(",") + "}",
              "reviewed",
              hash,
            ]),
          "22023",
        );
        const preview = (await serviceCall(
          "select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + id + "}", "reviewed", hash],
        )) as Array<{ result: { operationId: string } }>;
        const operationId = preview[0]!.result.operationId;
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [actor],
        );
        await expectFailure(
          () =>
            serviceCall("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
              actor,
              operationId,
              id,
            ]),
          "42501",
        );
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [actor],
        );
        for (const [deny, restore] of [
          [
            "update public.admin_user set role='staff' where auth_user_id=$1::uuid",
            "update public.admin_user set role='treasurer' where auth_user_id=$1::uuid",
          ],
          [
            "update auth.users set banned_until=now()+interval '1 day' where id=$1::uuid",
            "update auth.users set banned_until=null where id=$1::uuid",
          ],
          [
            "update auth.users set email_confirmed_at=null where id=$1::uuid",
            "update auth.users set email_confirmed_at=now() where id=$1::uuid",
          ],
        ]) {
          await tx.unsafe(deny, [actor]);
          await expectFailure(
            () =>
              serviceCall("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
                actor,
                operationId,
                id,
              ]),
            "42501",
          );
          await tx.unsafe(restore, [actor]);
        }
        for (const role of ["anon", "authenticated"]) {
          await expectFailure(async () => {
            await tx.unsafe("set local role " + role);
            await tx.unsafe("select public.get_crm_tag_bulk_operation($1::uuid,$2::uuid)", [
              actor,
              operationId,
            ]);
          }, "42501");
        }
        await tx.unsafe(
          "update public.crm_tag_bulk_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [operationId],
        );
        await expectFailure(
          () =>
            serviceCall("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
              actor,
              operationId,
              id,
            ]),
          "P0001",
        );
        await tx.unsafe(
          "update public.crm_tag_bulk_operation set expires_at=now()+interval '15 minutes' where id=$1::uuid",
          [operationId],
        );
        await tx.unsafe(
          "create function pg_temp.fail_crm_bulk_audit() returns trigger language plpgsql as $$ begin if new.action='supporter.bulk_tag_add' then raise exception 'synthetic audit failure' using errcode='P0002'; end if; return new; end $$",
        );
        await tx.unsafe(
          "create trigger fail_crm_bulk_audit before insert on public.audit_log for each row execute function pg_temp.fail_crm_bulk_audit()",
        );
        await expectFailure(
          () =>
            serviceCall("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
              actor,
              operationId,
              id,
            ]),
          "P0002",
        );
        const rows = (await tx.unsafe("select tags from public.supporter where id=$1::uuid", [
          id,
        ])) as Array<{ tags: string[] }>;
        expect(rows[0]!.tags).toEqual(["old"]);
        const unchanged = await tx.unsafe(
          "select s.edit_version,i.status from public.supporter s join public.crm_tag_bulk_item i on i.supporter_id=s.id where s.id=$1::uuid and i.operation_id=$2::uuid",
          [id, operationId],
        );
        expect(String(unchanged[0].edit_version)).toBe("1");
        expect(unchanged[0].status).toBe("pending");
        await tx.unsafe("drop trigger fail_crm_bulk_audit on public.audit_log");
        const applied = (await serviceCall(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, id],
        )) as Array<{ result: { status: string } }>;
        expect(applied[0]!.result.status).toBe("succeeded");
        const grants = (await tx.unsafe(
          "select has_function_privilege('authenticated','public.create_crm_tag_bulk_preview(uuid,uuid[],text,text)','EXECUTE') preview, has_function_privilege('anon','public.apply_crm_tag_bulk_item(uuid,uuid,uuid)','EXECUTE') apply, has_table_privilege('authenticated','public.crm_tag_bulk_item','SELECT') item",
        )) as Array<{ preview: boolean; apply: boolean; item: boolean }>;
        expect(grants[0]).toEqual({ preview: false, apply: false, item: false });
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
  "CRM bulk holds actor authorization until its transaction completes",
  async () => {
    const db = new SQL(databaseUrl!, { max: 2, prepare: false });
    const other = new SQL(databaseUrl!, { max: 1, prepare: false });
    const actor = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const email = "crm-bulk-lock-" + actor + "@example.invalid";
    let operation: string | undefined;
    try {
      await db.unsafe(
        "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
        [actor, email],
      );
      await db.unsafe(
        "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
        [actor, email],
      );
      await db.unsafe(
        "insert into public.supporter(id,name,email,tags) values($1::uuid,'Synthetic lock fixture',$2,array['old'])",
        [supporter, supporter + "@example.invalid"],
      );
      await db.begin(async (tx) => {
        await tx.unsafe("set local role service_role");
        const rows = await tx.unsafe(
          "select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],'reviewed',$3) result",
          [actor, "{" + supporter + "}", "c".repeat(64)],
        );
        operation = rows[0].result.operationId;
      });
      const rewind = new Error("rewind permission lock probe");
      try {
        await db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          await tx.unsafe("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
            actor,
            operation!,
            supporter,
          ]);
          for (const query of [
            "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
            "update auth.users set banned_until=now()+interval '1 day' where id=$1::uuid",
          ]) {
            await expect(
              other.begin(async (revoker) => {
                await revoker.unsafe("set local lock_timeout='150ms'");
                await revoker.unsafe(query, [actor]);
              }),
            ).rejects.toMatchObject({ errno: "55P03" });
          }
          throw rewind;
        });
      } catch (error) {
        if (error !== rewind) throw error;
      }
      const apply = (connection: SQL) =>
        connection.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          const rows = await tx.unsafe(
            "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
            [actor, operation!, supporter],
          );
          return rows[0].result.status as string;
        });
      expect(await Promise.all([apply(db), apply(other)])).toEqual(["succeeded", "succeeded"]);
      const audited = await db.unsafe(
        "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='supporter.bulk_tag_add'",
        [actor],
      );
      expect(audited[0].n).toBe(1);
      await other.unsafe(
        "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
        [actor],
      );
      await expect(
        db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          await tx.unsafe("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
            actor,
            operation!,
            supporter,
          ]);
        }),
      ).rejects.toMatchObject({ errno: "42501" });
    } finally {
      await db.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
      if (operation) {
        await db.unsafe("delete from public.crm_tag_bulk_item where operation_id=$1::uuid", [
          operation,
        ]);
        await db.unsafe("delete from public.crm_tag_bulk_operation where id=$1::uuid", [operation]);
      }
      await db.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
      await db.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [actor]);
      await db.unsafe("delete from auth.users where id=$1::uuid", [actor]);
      await other.close();
      await db.close();
    }
  },
  30000,
);

test.skipIf(!enabled)(
  "1000-row snapshot preserves per-item conflicts and repeat results",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const actor = crypto.randomUUID();
    const rollback = new Error("rollback 1000 synthetic bulk records");
    try {
      await db.begin(async (tx) => {
        const email = actor + "@example.invalid";
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, email],
        );
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
          [actor, email],
        );
        const seeded = await tx.unsafe(
          "insert into public.supporter(id,name,email,tags) select id,'Synthetic bulk 1000',id::text||'@example.invalid',case when n<=100 then array['reviewed'] else array['old'] end from (select gen_random_uuid() id,n from generate_series(1,1000) n) f returning id",
          [],
        );
        const ids = seeded.map((row: { id: string }) => row.id);
        await tx.unsafe("set local role service_role");
        const preview = await tx.unsafe(
          "select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],'reviewed',$3) result",
          [actor, "{" + ids.join(",") + "}", "d".repeat(64)],
        );
        const operation = preview[0].result as {
          operationId: string;
          items: Array<{ entityId: string; status: string }>;
        };
        expect(operation.items).toHaveLength(1000);
        const pending = operation.items.filter((item) => item.status === "pending");
        expect(pending).toHaveLength(900);
        await tx.unsafe("reset role");
        await tx.unsafe("update public.supporter set tags=array['other'] where id=$1::uuid", [
          pending[0].entityId,
        ]);
        await tx.unsafe("update public.supporter set deleted_at=now() where id=$1::uuid", [
          pending[1].entityId,
        ]);
        await tx.unsafe("set local role service_role");
        const applied = await tx.unsafe(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,supporter_id) result from public.crm_tag_bulk_item where operation_id=$2::uuid and status='pending' order by ordinal",
          [actor, operation.operationId],
        );
        const outcomes = applied.map((row: { result: { status: string } }) => row.result.status);
        expect(outcomes.filter((status: string) => status === "succeeded")).toHaveLength(898);
        expect(outcomes.filter((status: string) => status === "conflict")).toHaveLength(1);
        expect(outcomes.filter((status: string) => status === "skipped")).toHaveLength(1);
        await tx.unsafe("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
          actor,
          operation.operationId,
          pending[2].entityId,
        ]);
        const result = await tx.unsafe(
          "select public.get_crm_tag_bulk_operation($1::uuid,$2::uuid) result",
          [actor, operation.operationId],
        );
        expect(result[0].result.state).toBe("done");
        const counts = await tx.unsafe(
          "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='supporter.bulk_tag_add'",
          [actor],
        );
        expect(counts[0].n).toBe(898);
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
