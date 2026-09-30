import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.SPONSORSHIP_FOLLOWUP_BULK_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== "127.0.0.1" ||
    !(
      (parsed.port === "57322" && parsed.pathname === "/postgres") ||
      (parsed.port === "52322" && parsed.pathname === "/audit_pr135_20260929")
    ) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Dedicated local sponsorship bulk database required");
  }
}
const enabled = Boolean(
  url && process.env.SPONSORSHIP_FOLLOWUP_BULK_TEST_ALLOW_LOCAL_FIXTURES === "1",
);

test.skipIf(!enabled)(
  "sponsorship follow-up bulk RPCs and private snapshot tables are installed",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    try {
      const [row] = await db`select
      to_regprocedure('public.create_sponsorship_followup_bulk_preview(uuid,uuid[],uuid,text)') as preview,
      to_regprocedure('public.get_sponsorship_followup_bulk_operation(uuid,uuid)') as read,
      to_regprocedure('public.apply_sponsorship_followup_bulk_item(uuid,uuid,uuid)') as apply,
      to_regclass('public.sponsorship_followup_bulk_operation') as operation_table,
      to_regclass('public.sponsorship_followup_bulk_item') as item_table`;
      expect(Object.values(row).every(Boolean)).toBe(true);
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!enabled)(
  "bulk preview snapshots versions, applies once, and reports stale and skipped pledges",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback sponsorship bulk fixture");
    const actor = crypto.randomUUID();
    const assignee = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
    try {
      await db.begin(async (tx) => {
        const rpc = async (query: string, values: string[]) => {
          await tx.unsafe("set local role service_role");
          const result = await tx.unsafe(query, values);
          await tx.unsafe("reset role");
          return result;
        };
        for (const id of [actor, assignee]) {
          await tx.unsafe(
            "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
            [id, id + "@example.invalid"],
          );
          await tx.unsafe(
            "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'staff','active')",
            [id, id + "@example.invalid"],
          );
        }
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic supporter',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        for (const id of ids.slice(0, 3)) {
          await tx.unsafe(
            "insert into public.sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language,status) values($1::uuid,$2::uuid,'100',10000,'zh-HK','needs_followup')",
            [id, supporter],
          );
        }
        const preview = (await rpc(
          "select public.create_sponsorship_followup_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + ids.join(",") + "}", assignee, "a".repeat(64)],
        )) as Array<{
          result: {
            operationId: string;
            items: Array<{ status: string; reasonCode: string | null }>;
          };
        }>;
        const op = preview[0]!.result.operationId;
        const competing = await rpc(
          "select public.create_sponsorship_followup_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + ids[0] + "}", assignee, "b".repeat(64)],
        );
        const competingOp = competing[0].result.operationId as string;
        expect(preview[0]!.result.items.map((item) => item.status)).toEqual([
          "pending",
          "pending",
          "pending",
          "skipped",
        ]);
        const apply = async (id: string) =>
          (
            await rpc(
              "select public.apply_sponsorship_followup_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
              [actor, op, id],
            )
          )[0].result as { status: string; reasonCode: string | null };
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        const competingResult = await rpc(
          "select public.apply_sponsorship_followup_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, competingOp, ids[0]],
        );
        expect(competingResult[0].result).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        await tx.unsafe(
          "update public.sponsorship_pledge set updated_at=clock_timestamp() where id=$1::uuid",
          [ids[1]],
        );
        expect(await apply(ids[1]!)).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        await tx.unsafe("update public.sponsorship_pledge set status='active' where id=$1::uuid", [
          ids[2],
        ]);
        expect(await apply(ids[2]!)).toMatchObject({
          status: "conflict",
          reasonCode: "status_changed",
        });
        const result = (
          await rpc(
            "select public.get_sponsorship_followup_bulk_operation($1::uuid,$2::uuid) result",
            [actor, op],
          )
        )[0].result as { state: string; items: Array<{ status: string }> };
        expect(result.state).toBe("done");
        expect(result.items.map((item) => item.status)).toEqual([
          "succeeded",
          "conflict",
          "conflict",
          "skipped",
        ]);
        const audits = await tx.unsafe(
          "select count(*)::int count from public.audit_log where actor_user_id=$1::uuid and action='sponsorship_pledge.assign_followup'",
          [actor],
        );
        expect(audits[0].count).toBe(1);
        const pledge = await tx.unsafe(
          "select followup_assignee_user_id,status,amount_cents from public.sponsorship_pledge where id=$1::uuid",
          [ids[0]],
        );
        expect(pledge[0]).toMatchObject({
          followup_assignee_user_id: assignee,
          status: "needs_followup",
          amount_cents: 10000,
        });
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
  "bulk refuses revoked staff, expiry, and audit failure without changing a pledge",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback sponsorship bulk safety fixture");
    const actor = crypto.randomUUID(),
      assignee = crypto.randomUUID();
    const supporter = crypto.randomUUID(),
      pledge = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        const rpc = async (query: string, values: string[]) => {
          await tx.unsafe("set local role service_role");
          const result = await tx.unsafe(query, values);
          await tx.unsafe("reset role");
          return result;
        };
        for (const id of [actor, assignee]) {
          await tx.unsafe(
            "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
            [id, id + "@example.invalid"],
          );
          await tx.unsafe(
            "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'staff','active')",
            [id, id + "@example.invalid"],
          );
        }
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic supporter',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language,status) values($1::uuid,$2::uuid,'100',10000,'zh-HK','needs_followup')",
          [pledge, supporter],
        );
        const fail = async (action: () => Promise<unknown>, errno: string) => {
          await tx.unsafe("savepoint sponsorship_bulk_failure");
          let received: unknown;
          try {
            await action();
          } catch (error) {
            received = error;
          }
          await tx.unsafe("rollback to savepoint sponsorship_bulk_failure");
          expect((received as { errno?: string } | undefined)?.errno).toBe(errno);
        };
        await fail(
          () =>
            rpc(
              "select public.create_sponsorship_followup_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4)",
              [
                actor,
                "{" + Array.from({ length: 1001 }, () => crypto.randomUUID()).join(",") + "}",
                assignee,
                "a".repeat(64),
              ],
            ),
          "22023",
        );
        const preview = await rpc(
          "select public.create_sponsorship_followup_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + pledge + "}", assignee, "a".repeat(64)],
        );
        const op = preview[0].result.operationId as string;
        const apply = () =>
          rpc("select public.apply_sponsorship_followup_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
            actor,
            op,
            pledge,
          ]);
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
          "update auth.users set banned_until=now()+interval '1 day' where id=$1::uuid",
          [assignee],
        );
        await fail(apply, "42501");
        await tx.unsafe("update auth.users set banned_until=null where id=$1::uuid", [assignee]);
        await tx.unsafe(
          "update public.sponsorship_followup_bulk_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [op],
        );
        await fail(apply, "P0001");
        await tx.unsafe(
          "update public.sponsorship_followup_bulk_operation set expires_at=now()+interval '15 minutes' where id=$1::uuid",
          [op],
        );
        await tx.unsafe(
          "create function pg_temp.fail_sponsorship_bulk_audit() returns trigger language plpgsql as $$ begin if new.action='sponsorship_followup_bulk.item_result' then raise exception 'synthetic audit failure' using errcode='P0002';end if;return new;end $$",
        );
        await tx.unsafe(
          "create trigger fail_sponsorship_bulk_audit before insert on public.audit_log for each row execute function pg_temp.fail_sponsorship_bulk_audit()",
        );
        await fail(apply, "P0002");
        await tx.unsafe("drop trigger fail_sponsorship_bulk_audit on public.audit_log");
        const result = await tx.unsafe(
          "select followup_assignee_user_id,followup_version::int version,status,amount_cents from public.sponsorship_pledge where id=$1::uuid",
          [pledge],
        );
        expect(result[0]).toMatchObject({
          followup_assignee_user_id: null,
          version: 1,
          status: "needs_followup",
          amount_cents: 10000,
        });
        const item = await tx.unsafe(
          "select status from public.sponsorship_followup_bulk_item where operation_id=$1::uuid",
          [op],
        );
        expect(item[0].status).toBe("pending");
        const grants = await tx.unsafe(`select
        has_function_privilege('authenticated','public.create_sponsorship_followup_bulk_preview(uuid,uuid[],uuid,text)','EXECUTE') as preview,
        has_function_privilege('anon','public.apply_sponsorship_followup_bulk_item(uuid,uuid,uuid)','EXECUTE') as apply,
        has_table_privilege('authenticated','public.sponsorship_followup_bulk_item','SELECT') as item,
        (select relrowsecurity from pg_class where oid='public.sponsorship_followup_bulk_item'::regclass) as rls`);
        expect(grants[0]).toEqual({ preview: false, apply: false, item: false, rls: true });
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
  "concurrent operation retries commit one assignment and one item audit",
  async () => {
    const db = new SQL(url!, { max: 4, prepare: false }),
      actor = crypto.randomUUID(),
      assignee = crypto.randomUUID(),
      supporter = crypto.randomUUID(),
      pledge = crypto.randomUUID();
    let op: string | undefined;
    try {
      await db.begin(async (tx) => {
        for (const id of [actor, assignee]) {
          await tx`insert into auth.users(id,email,email_confirmed_at) values(${id},${id + "@example.invalid"},now())`;
          await tx`insert into admin_user(auth_user_id,email,role,status) values(${id},${id + "@example.invalid"},'staff','active')`;
        }
        await tx`insert into supporter(id,name,email) values(${supporter},'Synthetic concurrency supporter',${supporter + "@example.invalid"})`;
        await tx`insert into sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language,status) values(${pledge},${supporter},'100',10000,'zh-HK','needs_followup')`;
        await tx`set local role service_role`;
        op = (
          await tx`select create_sponsorship_followup_bulk_preview(${actor}::uuid,${"{" + pledge + "}"}::uuid[],${assignee}::uuid,${"c".repeat(64)}) result`
        )[0].result.operationId;
      });
      const apply = () =>
        db.begin(async (tx) => {
          await tx`set local role service_role`;
          return (
            await tx`select apply_sponsorship_followup_bulk_item(${actor}::uuid,${op}::uuid,${pledge}::uuid) result`
          )[0].result;
        });
      const results = await Promise.all([apply(), apply()]);
      expect(results.map((r) => r.status)).toEqual(["succeeded", "succeeded"]);
      const audits =
        await db`select action,count(*)::int n from audit_log where actor_user_id=${actor} group by action order by action`;
      expect([...audits]).toEqual([
        { action: "sponsorship_followup_bulk.item_result", n: 1 },
        { action: "sponsorship_followup_bulk.preview", n: 1 },
        { action: "sponsorship_pledge.assign_followup", n: 1 },
      ]);
      expect(
        (await db`select followup_version::int v from sponsorship_pledge where id=${pledge}`)[0].v,
      ).toBe(2);
    } finally {
      await db.begin(async (tx) => {
        if (op) {
          await tx`delete from sponsorship_followup_bulk_item where operation_id=${op}`;
          await tx`delete from sponsorship_followup_bulk_operation where id=${op}`;
        }
        await tx`delete from audit_log where actor_user_id=${actor}`;
        await tx`delete from sponsorship_pledge where id=${pledge}`;
        await tx`delete from supporter where id=${supporter}`;
        for (const id of [actor, assignee]) {
          await tx`delete from admin_user where auth_user_id=${id}`;
          await tx`delete from auth.users where id=${id}`;
        }
      });
      await db.close();
    }
  },
  30000,
);
