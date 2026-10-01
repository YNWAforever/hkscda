import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.SPONSORSHIP_FOLLOWUP_TEST_DATABASE_URL;
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
    throw new Error("Dedicated local sponsorship follow-up database required");
  }
}
const enabled = Boolean(url && process.env.SPONSORSHIP_FOLLOWUP_TEST_ALLOW_LOCAL_FIXTURES === "1");

test.skipIf(!enabled)(
  "guarded sponsorship follow-up command is installed with RLS and grants",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    try {
      const rows = await db`select
      to_regprocedure('public.assign_sponsorship_followup(uuid,uuid,uuid,bigint)') as signature,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='sponsorship_pledge' and column_name='followup_version') as version_column,
      exists(select 1 from pg_trigger where tgrelid='public.sponsorship_pledge'::regclass and tgname='sponsorship_pledge_followup_version_before_update' and tgenabled='O') as version_trigger,
      exists(select 1 from pg_indexes where schemaname='public' and tablename='sponsorship_pledge' and indexname='sponsorship_pledge_followup_assignee_idx') as followup_index,
      (select relrowsecurity from pg_class where oid='public.sponsorship_pledge'::regclass) as rls,
      not exists(select 1 from pg_policies where schemaname='public' and tablename='sponsorship_pledge' and cmd in ('UPDATE','ALL')) as no_browser_update_policy,
      has_function_privilege('authenticated','public.assign_sponsorship_followup(uuid,uuid,uuid,bigint)','EXECUTE') as browser_execute,
      has_function_privilege('anon','public.assign_sponsorship_followup(uuid,uuid,uuid,bigint)','EXECUTE') as anonymous_execute,
      has_function_privilege('service_role','public.assign_sponsorship_followup(uuid,uuid,uuid,bigint)','EXECUTE') as service_execute`;
      expect(rows[0]).toMatchObject({
        signature: "assign_sponsorship_followup(uuid,uuid,uuid,bigint)",
        version_column: true,
        version_trigger: true,
        followup_index: true,
        rls: true,
        no_browser_update_policy: true,
        browser_execute: false,
        anonymous_execute: false,
        service_execute: true,
      });
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!enabled)(
  "follow-up assignment fences versions and roles, retries once, and atomically audits",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback sponsorship follow-up fixture");
    const actor = crypto.randomUUID();
    const assignee = crypto.randomUUID();
    const alternate = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const pledge = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        for (const id of [actor, assignee, alternate]) {
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
        const call = async (who: string, to: string, version: number) => {
          await tx.unsafe("set local role service_role");
          const result = (
            (await tx.unsafe(
              "select public.assign_sponsorship_followup($1::uuid,$2::uuid,$3::uuid,$4::bigint) result",
              [who, pledge, to, version],
            )) as Array<{
              result: {
                pledgeId: string;
                assigneeUserId: string;
                version: number;
                replayed: boolean;
              };
            }>
          )[0]!.result;
          await tx.unsafe("reset role");
          return result;
        };
        const fail = async (action: () => Promise<unknown>, errno: string) => {
          await tx.unsafe("savepoint sponsorship_followup_failure");
          let received: unknown;
          try {
            await action();
          } catch (error) {
            received = error;
          }
          await tx.unsafe("rollback to savepoint sponsorship_followup_failure");
          expect((received as { errno?: string } | undefined)?.errno).toBe(errno);
        };
        expect(await call(actor, assignee, 1)).toEqual({
          pledgeId: pledge,
          assigneeUserId: assignee,
          version: 2,
          replayed: false,
        });
        expect(await call(actor, assignee, 1)).toEqual({
          pledgeId: pledge,
          assigneeUserId: assignee,
          version: 2,
          replayed: true,
        });
        await fail(() => call(actor, alternate, 1), "40001");
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [actor],
        );
        await fail(() => call(actor, alternate, 2), "42501");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [actor],
        );
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [alternate],
        );
        await fail(() => call(actor, alternate, 2), "42501");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [alternate],
        );
        await tx.unsafe(
          "update auth.users set banned_until=now()+interval '1 day' where id=$1::uuid",
          [alternate],
        );
        await fail(() => call(actor, alternate, 2), "42501");
        await tx.unsafe("update auth.users set banned_until=null where id=$1::uuid", [alternate]);
        await tx.unsafe("update auth.users set email_confirmed_at=null where id=$1::uuid", [actor]);
        await fail(() => call(actor, alternate, 2), "42501");
        await tx.unsafe("update auth.users set email_confirmed_at=now() where id=$1::uuid", [
          actor,
        ]);
        await tx.unsafe(
          "create function pg_temp.fail_sponsorship_followup_audit() returns trigger language plpgsql as $$ begin if new.action='sponsorship_pledge.assign_followup' then raise exception 'synthetic audit failure' using errcode='P0002';end if;return new;end $$",
        );
        await tx.unsafe(
          "create trigger fail_sponsorship_followup_audit before insert on public.audit_log for each row execute function pg_temp.fail_sponsorship_followup_audit()",
        );
        await fail(() => call(actor, alternate, 2), "P0002");
        await tx.unsafe("drop trigger fail_sponsorship_followup_audit on public.audit_log");
        const middle = (await tx.unsafe(
          "select followup_assignee_user_id,followup_version::int as followup_version,status,amount_cents from public.sponsorship_pledge where id=$1::uuid",
          [pledge],
        )) as Array<{
          followup_assignee_user_id: string;
          followup_version: number;
          status: string;
          amount_cents: number;
        }>;
        expect(middle[0]).toMatchObject({
          followup_assignee_user_id: assignee,
          followup_version: 2,
          status: "needs_followup",
          amount_cents: 10000,
        });
        expect(await call(actor, alternate, 2)).toEqual({
          pledgeId: pledge,
          assigneeUserId: alternate,
          version: 3,
          replayed: false,
        });
        await tx.unsafe("update public.sponsorship_pledge set status='active' where id=$1::uuid", [
          pledge,
        ]);
        await fail(() => call(actor, assignee, 3), "40001");
        const audits = (await tx.unsafe(
          "select count(*)::int count from public.audit_log where entity_id=$1 and action='sponsorship_pledge.assign_followup'",
          [pledge],
        )) as Array<{ count: number }>;
        expect(audits[0]!.count).toBe(2);
        await tx.unsafe("set local role authenticated");
        const direct = await tx.unsafe(
          "update public.sponsorship_pledge set followup_assignee_user_id=$1::uuid where id=$2::uuid returning id",
          [assignee, pledge],
        );
        expect(direct).toHaveLength(0);
        await tx.unsafe("reset role");
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
  "competing follow-up assignments commit exactly one audit and retry safely",
  async () => {
    const db = new SQL(url!, { max: 4, prepare: false });
    const actor = crypto.randomUUID();
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const pledge = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        for (const id of [actor, first, second]) {
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
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic concurrency supporter',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language,status) values($1::uuid,$2::uuid,'100',10000,'zh-HK','needs_followup')",
          [pledge, supporter],
        );
      });
      const call = async (assignee: string) =>
        db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          return (
            (await tx.unsafe(
              "select public.assign_sponsorship_followup($1::uuid,$2::uuid,$3::uuid,1) result",
              [actor, pledge, assignee],
            )) as Array<{ result: { assigneeUserId: string; version: number; replayed: boolean } }>
          )[0]!.result;
        });
      const outcomes = await Promise.allSettled([call(first), call(second)]);
      expect(outcomes.map((item) => item.status).sort()).toEqual(["fulfilled", "rejected"]);
      const winner = outcomes.find((item) => item.status === "fulfilled") as PromiseFulfilledResult<
        Awaited<ReturnType<typeof call>>
      >;
      const loser = outcomes.find((item) => item.status === "rejected") as PromiseRejectedResult;
      expect((loser.reason as { errno?: string }).errno).toBe("40001");
      expect(winner.value).toMatchObject({ version: 2, replayed: false });
      expect(await call(winner.value.assigneeUserId)).toMatchObject({ version: 2, replayed: true });
      const state = (await db.unsafe(
        "select followup_assignee_user_id,followup_version::int version from public.sponsorship_pledge where id=$1::uuid",
        [pledge],
      )) as Array<{ followup_assignee_user_id: string; version: number }>;
      expect(state[0]).toEqual({
        followup_assignee_user_id: winner.value.assigneeUserId,
        version: 2,
      });
      const audit = (await db.unsafe(
        "select count(*)::int count from public.audit_log where entity_id=$1 and action='sponsorship_pledge.assign_followup'",
        [pledge],
      )) as Array<{ count: number }>;
      expect(audit[0]!.count).toBe(1);
    } finally {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "delete from public.audit_log where entity_id=$1 and action='sponsorship_pledge.assign_followup'",
          [pledge],
        );
        await tx.unsafe("delete from public.sponsorship_pledge where id=$1::uuid", [pledge]);
        await tx.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
        await tx.unsafe("delete from public.admin_user where auth_user_id=any($1::uuid[])", [
          "{" + [actor, first, second].join(",") + "}",
        ]);
        await tx.unsafe("delete from auth.users where id=any($1::uuid[])", [
          "{" + [actor, first, second].join(",") + "}",
        ]);
      });
      await db.close();
    }
  },
  30000,
);

test.skipIf(!enabled)(
  "picker excludes banned, unconfirmed, disabled and finance-only actors using service-role RPC",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false }),
      rollback = new Error("synthetic picker rollback");
    const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
    try {
      await db.begin(async (tx) => {
        for (let i = 0; i < ids.length; i++) {
          await tx`insert into auth.users(id,email,email_confirmed_at,banned_until) values(${ids[i]},${ids[i] + "@example.invalid"},${i === 2 ? null : new Date().toISOString()},${i === 3 ? new Date(Date.now() + 86400000).toISOString() : null})`;
          await tx`insert into admin_user(auth_user_id,email,role,status) values(${ids[i]},${ids[i] + "@example.invalid"},${i === 4 ? "treasurer" : i === 1 ? "admin" : "staff"},${i === 5 ? "disabled" : "active"})`;
        }
        await tx`set local role service_role`;
        const rows =
          await tx`select * from public.list_sponsorship_followup_assignees(${ids[0]}::uuid)`;
        expect(rows.map((r: { authUserId: string }) => r.authUserId).sort()).toEqual(
          ids.slice(0, 2).sort(),
        );
        await tx`reset role`;
        for (const role of ["anon", "authenticated"])
          expect(
            (
              await tx`select has_function_privilege(${role},'public.list_sponsorship_followup_assignees(uuid)','EXECUTE') allowed`
            )[0].allowed,
          ).toBe(false);
        await tx`update auth.users set banned_until=now()+interval '1 day' where id=${ids[0]}`;
        await tx`savepoint withdrawn_actor`;
        let denied: unknown;
        try {
          await tx`set local role service_role`;
          await tx`select * from public.list_sponsorship_followup_assignees(${ids[0]}::uuid)`;
        } catch (error) {
          denied = error;
        }
        await tx`rollback to savepoint withdrawn_actor`;
        expect((denied as { errno?: string })?.errno).toBe("42501");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);
