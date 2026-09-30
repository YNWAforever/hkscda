import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.VOLUNTEER_REVIEW_BULK_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  const target = `${url.port}${url.pathname}`;
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.search ||
    url.hash ||
    ![
      "57322/postgres",
      "52322/audit_pr135_20260929",
      ...(process.env.CI ? ["55322/postgres"] : []),
    ].includes(target)
  ) {
    throw new Error("Volunteer review bulk test requires dedicated loopback DB");
  }
}
const enabled =
  Boolean(databaseUrl) && process.env.VOLUNTEER_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES === "1";

for (const lockedRow of ["operation", "profile", "assignment"] as const) {
  test.skipIf(!enabled)(
    `reviewer bulk rejects expiry while waiting for the ${lockedRow} lock without writes`,
    async () => {
      const db = new SQL(databaseUrl!, { max: 1, prepare: false });
      const locker = new SQL(databaseUrl!, { max: 1, prepare: false });
      const applier = new SQL(databaseUrl!, { max: 1, prepare: false });
      const actor = crypto.randomUUID(),
        reviewer = crypto.randomUUID(),
        person = crypto.randomUUID(),
        profile = crypto.randomUUID();
      let operation: string | undefined;
      let releaseLock: (() => void) | undefined;
      let heldLock: Promise<void> | undefined;
      let applying: Promise<{ error?: unknown; result?: unknown }> | undefined;
      try {
        await db.begin(async (tx) => {
          for (const id of [actor, reviewer, person]) {
            await tx.unsafe(
              "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
              [id, id + "@example.invalid"],
            );
          }
          for (const [id, role] of [
            [actor, "admin"],
            [reviewer, "staff"],
          ]) {
            await tx.unsafe(
              "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,$3,'active')",
              [id, id + "@example.invalid", role],
            );
          }
          await tx.unsafe(
            "insert into public.volunteer_profile(id,auth_user_id,display_name) values($1::uuid,$2::uuid,'Synthetic expiry lock volunteer')",
            [profile, person],
          );
          if (lockedRow === "assignment") {
            await tx.unsafe(
              "insert into public.volunteer_profile_review_assignment(profile_id,reviewer_user_id,updated_by) values($1::uuid,$2::uuid,$2::uuid)",
              [profile, actor],
            );
          }
          await tx.unsafe("set local role service_role");
          const rows = await tx.unsafe(
            "select public.create_volunteer_review_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
            [actor, "{" + profile + "}", reviewer, "d".repeat(64)],
          );
          operation = rows[0].result.operationId;
        });
        const readState = async () =>
          (
            await db.unsafe(
              "select (select to_jsonb(p) from public.volunteer_profile p where id=$1::uuid) profile, (select to_jsonb(a) from public.volunteer_profile_review_assignment a where profile_id=$1::uuid) assignment, (select to_jsonb(i) from public.volunteer_review_bulk_item i where operation_id=$2::uuid and profile_id=$1::uuid) item, (select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) from public.audit_log a where actor_user_id=$3::uuid) audits",
              [profile, operation!, actor],
            )
          )[0];
        const before = await readState();
        const [{ pid }] = await applier.unsafe("select pg_backend_pid() pid");
        await db.unsafe(
          "update public.volunteer_review_bulk_operation set expires_at=pg_catalog.clock_timestamp()+interval '3 seconds' where id=$1::uuid",
          [operation!],
        );
        const released = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        const lockSql = {
          operation:
            "select id from public.volunteer_review_bulk_operation where id=$1::uuid for update",
          profile: "select id from public.volunteer_profile where id=$1::uuid for update",
          assignment:
            "select profile_id from public.volunteer_profile_review_assignment where profile_id=$1::uuid for update",
        }[lockedRow];
        // Start apply only after the unchanged row is locked by a separate backend.
        const locked = Promise.withResolvers<number>();
        heldLock = locker
          .begin(async (tx) => {
            await tx.unsafe(lockSql, [lockedRow === "operation" ? operation! : profile]);
            const [{ pid: lockerPid }] = await tx.unsafe("select pg_backend_pid() pid");
            locked.resolve(lockerPid);
            await released;
          })
          .then(
            () => {},
            (error: unknown) => {
              locked.reject(error);
              throw error;
            },
          );
        const lockerPid = await locked.promise;
        applying = applier
          .begin(async (tx) => {
            await tx.unsafe("set local statement_timeout='10s'");
            await tx.unsafe("set local role service_role");
            return tx.unsafe(
              "select public.apply_volunteer_review_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
              [actor, operation!, profile],
            );
          })
          .then(
            (result: unknown) => ({ result }),
            (error: unknown) => ({ error }),
          );
        let blockedLive = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const [state] = await db.unsafe(
            "select $3::int=any(pg_blocking_pids($1::int)) blocked, expires_at>pg_catalog.clock_timestamp() live from public.volunteer_review_bulk_operation where id=$2::uuid",
            [pid, operation!, lockerPid],
          );
          if (state.blocked) {
            blockedLive = state.live;
            break;
          }
          await Bun.sleep(10);
        }
        expect(blockedLive).toBe(true);
        let expiredBlocked = false;
        for (let attempt = 0; attempt < 400; attempt++) {
          const [state] = await db.unsafe(
            "select $3::int=any(pg_blocking_pids($1::int)) blocked, expires_at<=pg_catalog.clock_timestamp() expired from public.volunteer_review_bulk_operation where id=$2::uuid",
            [pid, operation!, lockerPid],
          );
          if (state.expired && state.blocked) {
            expiredBlocked = true;
            break;
          }
          await Bun.sleep(10);
        }
        expect(expiredBlocked).toBe(true);
        releaseLock!();
        await heldLock;
        const outcome = await applying;
        // A transaction-start clock or missing post-lock check allows a real write here.
        expect((outcome.error as { errno?: string } | undefined)?.errno).toBe("P0001");
        expect(await readState()).toEqual(before);
      } finally {
        releaseLock?.();
        await heldLock;
        await applying;
        await db.begin(async (tx) => {
          await tx.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
          if (operation) {
            await tx.unsafe(
              "delete from public.volunteer_review_bulk_item where operation_id=$1::uuid",
              [operation],
            );
            await tx.unsafe(
              "delete from public.volunteer_review_bulk_operation where id=$1::uuid",
              [operation],
            );
          }
          await tx.unsafe(
            "delete from public.volunteer_profile_review_assignment where profile_id=$1::uuid",
            [profile],
          );
          await tx.unsafe("delete from public.volunteer_profile where id=$1::uuid", [profile]);
          await tx.unsafe("delete from public.admin_user where auth_user_id=any($1::uuid[])", [
            "{" + [actor, reviewer].join(",") + "}",
          ]);
          await tx.unsafe("delete from auth.users where id=any($1::uuid[])", [
            "{" + [actor, reviewer, person].join(",") + "}",
          ]);
        });
        await applier.close();
        await locker.close();
        await db.close();
      }
    },
    30000,
  );
}

test.skipIf(!enabled)(
  "volunteer reviewer bulk snapshots and applies with stale, repeat and suspended results",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback volunteer review fixture");
    const actor = crypto.randomUUID();
    const reviewer = crypto.randomUUID();
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const people = ids.map(() => crypto.randomUUID());
    try {
      await db.begin(async (tx) => {
        for (const id of [actor, reviewer, ...people]) {
          const email = id + "@example.invalid";
          await tx.unsafe(
            "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
            [id, email],
          );
        }
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'admin','active')",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'staff','active')",
          [reviewer, reviewer + "@example.invalid"],
        );
        for (let index = 0; index < ids.length; index++) {
          await tx.unsafe(
            "insert into public.volunteer_profile(id,auth_user_id,display_name) values($1::uuid,$2::uuid,'Synthetic volunteer')",
            [ids[index], people[index]],
          );
        }
        await tx.unsafe("set local role service_role");
        const preview = (await tx.unsafe(
          "select public.create_volunteer_review_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + ids.join(",") + "}", reviewer, "a".repeat(64)],
        )) as Array<{ result: { operationId: string; items: Array<{ status: string }> } }>;
        const op = preview[0]!.result.operationId;
        expect(preview[0]!.result.items.map((item) => item.status)).toEqual([
          "pending",
          "pending",
          "pending",
        ]);
        const apply = async (id: string) => {
          await tx.unsafe("set local role service_role");
          return (
            (await tx.unsafe(
              "select public.apply_volunteer_review_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
              [actor, op, id],
            )) as Array<{ result: { status: string; reasonCode: string | null } }>
          )[0]!.result;
        };
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.volunteer_profile set revision=revision+1 where id=$1::uuid",
          [ids[1]],
        );
        expect(await apply(ids[1]!)).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.volunteer_profile set status='suspended' where id=$1::uuid",
          [ids[2]],
        );
        expect(await apply(ids[2]!)).toMatchObject({
          status: "skipped",
          reasonCode: "unavailable",
        });
        const assignments = (await tx.unsafe(
          "select profile_id from public.volunteer_profile_review_assignment where profile_id=any($1::uuid[])",
          ["{" + ids.join(",") + "}"],
        )) as Array<{ profile_id: string }>;
        expect(assignments.map((row) => row.profile_id)).toEqual([ids[0]]);
        const audits = (await tx.unsafe(
          "select count(*)::int count from public.audit_log where actor_user_id=$1::uuid and action='volunteer_profile.bulk_assign_reviewer'",
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
  "volunteer reviewer bulk refuses revoked roles and expiry; audit failure rolls back assignment",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback volunteer review safety fixture");
    const actor = crypto.randomUUID(),
      reviewer = crypto.randomUUID(),
      person = crypto.randomUUID(),
      profile = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        for (const id of [actor, reviewer, person]) {
          await tx.unsafe(
            "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
            [id, id + "@example.invalid"],
          );
        }
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'admin','active')",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'staff','active')",
          [reviewer, reviewer + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.volunteer_profile(id,auth_user_id,display_name) values($1::uuid,$2::uuid,'Synthetic volunteer')",
          [profile, person],
        );
        const fail = async (call: () => Promise<unknown>, errno: string) => {
          await tx.unsafe("savepoint volunteer_bulk_failure");
          let received: unknown;
          try {
            await tx.unsafe("set local role service_role");
            await call();
          } catch (error) {
            received = error;
          }
          await tx.unsafe("rollback to savepoint volunteer_bulk_failure");
          expect((received as { errno?: string } | undefined)?.errno).toBe(errno);
        };
        const tooMany = Array.from({ length: 1001 }, () => crypto.randomUUID());
        await fail(
          () =>
            tx.unsafe(
              "select public.create_volunteer_review_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4)",
              [actor, "{" + tooMany.join(",") + "}", reviewer, "a".repeat(64)],
            ),
          "22023",
        );
        await tx.unsafe("set local role service_role");
        const preview = (await tx.unsafe(
          "select public.create_volunteer_review_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + profile + "}", reviewer, "a".repeat(64)],
        )) as Array<{ result: { operationId: string } }>;
        const op = preview[0]!.result.operationId;
        const apply = () =>
          tx.unsafe("select public.apply_volunteer_review_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
            actor,
            op,
            profile,
          ]);
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [actor],
        );
        await fail(apply, "42501");
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [actor],
        );
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [reviewer],
        );
        await fail(apply, "42501");
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [reviewer],
        );
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.volunteer_review_bulk_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [op],
        );
        await fail(apply, "P0001");
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.volunteer_review_bulk_operation set expires_at=now()+interval '15 minutes' where id=$1::uuid",
          [op],
        );
        await tx.unsafe("reset role");
        await tx.unsafe(
          "create function pg_temp.fail_volunteer_review_audit() returns trigger language plpgsql as $$ begin if new.action='volunteer_profile.bulk_assign_reviewer' then raise exception 'synthetic audit failure' using errcode='P0002';end if;return new;end $$",
        );
        await tx.unsafe(
          "create trigger fail_volunteer_review_audit before insert on public.audit_log for each row execute function pg_temp.fail_volunteer_review_audit()",
        );
        await fail(apply, "P0002");
        const assignments = (await tx.unsafe(
          "select count(*)::int count from public.volunteer_profile_review_assignment where profile_id=$1::uuid",
          [profile],
        )) as Array<{ count: number }>;
        expect(assignments[0]!.count).toBe(0);
        await tx.unsafe("reset role");
        await tx.unsafe("drop trigger fail_volunteer_review_audit on public.audit_log");
        const grants = (await tx.unsafe(
          "select has_function_privilege('authenticated','public.create_volunteer_review_bulk_preview(uuid,uuid[],uuid,text)','EXECUTE') preview,has_function_privilege('anon','public.apply_volunteer_review_bulk_item(uuid,uuid,uuid)','EXECUTE') apply,has_table_privilege('authenticated','public.volunteer_profile_review_assignment','SELECT') assignment",
        )) as Array<{ preview: boolean; apply: boolean; assignment: boolean }>;
        expect(grants[0]).toEqual({ preview: false, apply: false, assignment: false });
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
  "reviewer bulk locks actor and reviewer eligibility through commit",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const other = new SQL(databaseUrl!, { max: 1, prepare: false });
    const actor = crypto.randomUUID(),
      reviewer = crypto.randomUUID(),
      person = crypto.randomUUID(),
      profile = crypto.randomUUID();
    let operation: string | undefined;
    try {
      for (const id of [actor, reviewer, person])
        await db.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [id, id + "@example.invalid"],
        );
      for (const [id, role] of [
        [actor, "admin"],
        [reviewer, "staff"],
      ])
        await db.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,$3,'active')",
          [id, id + "@example.invalid", role],
        );
      await db.unsafe(
        "insert into public.volunteer_profile(id,auth_user_id,display_name) values($1::uuid,$2::uuid,'Synthetic lock volunteer')",
        [profile, person],
      );
      await db.begin(async (tx) => {
        await tx.unsafe("set local role service_role");
        const rows = await tx.unsafe(
          "select public.create_volunteer_review_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, "{" + profile + "}", reviewer, "b".repeat(64)],
        );
        operation = rows[0].result.operationId;
      });
      const rewind = new Error("rewind permission lock probe");
      try {
        await db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          await tx.unsafe(
            "select public.apply_volunteer_review_bulk_item($1::uuid,$2::uuid,$3::uuid)",
            [actor, operation!, profile],
          );
          for (const id of [actor, reviewer]) {
            for (const query of [
              "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
              "update auth.users set banned_until=now()+interval '1 day' where id=$1::uuid",
            ]) {
              await expect(
                other.begin(async (revoker) => {
                  await revoker.unsafe("set local lock_timeout='150ms'");
                  await revoker.unsafe(query, [id]);
                }),
              ).rejects.toMatchObject({ errno: "55P03" });
            }
          }
          throw rewind;
        });
      } catch (error) {
        if (error !== rewind) throw error;
      }
      const apply = (connection: SQL) =>
        connection.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          return (
            await tx.unsafe(
              "select public.apply_volunteer_review_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
              [actor, operation!, profile],
            )
          )[0].result.status as string;
        });
      expect(await Promise.all([apply(db), apply(other)])).toEqual(["succeeded", "succeeded"]);
      expect(
        (
          await db.unsafe(
            "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='volunteer_profile.bulk_assign_reviewer'",
            [actor],
          )
        )[0].n,
      ).toBe(1);
      await other.unsafe(
        "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
        [reviewer],
      );
      await expect(apply(db)).rejects.toMatchObject({ errno: "42501" });
    } finally {
      await db.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
      if (operation) {
        await db.unsafe(
          "delete from public.volunteer_review_bulk_item where operation_id=$1::uuid",
          [operation],
        );
        await db.unsafe("delete from public.volunteer_review_bulk_operation where id=$1::uuid", [
          operation,
        ]);
      }
      await db.unsafe(
        "delete from public.volunteer_profile_review_assignment where profile_id=$1::uuid",
        [profile],
      );
      await db.unsafe("delete from public.volunteer_profile where id=$1::uuid", [profile]);
      await db.unsafe("delete from public.admin_user where auth_user_id=any($1::uuid[])", [
        "{" + [actor, reviewer].join(",") + "}",
      ]);
      await db.unsafe("delete from auth.users where id=any($1::uuid[])", [
        "{" + [actor, reviewer, person].join(",") + "}",
      ]);
      await other.close();
      await db.close();
    }
  },
  30000,
);

test.skipIf(!enabled)(
  "1000 volunteer assignments retain conflicts, suspended skips and one audit per success",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const actor = crypto.randomUUID(),
      reviewer = crypto.randomUUID();
    const rollback = new Error("rollback volunteer thousand fixture");
    try {
      await db.begin(async (tx) => {
        for (const id of [actor, reviewer])
          await tx.unsafe(
            "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
            [id, id + "@example.invalid"],
          );
        for (const [id, role] of [
          [actor, "admin"],
          [reviewer, "staff"],
        ])
          await tx.unsafe(
            "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,$3,'active')",
            [id, id + "@example.invalid", role],
          );
        const people = await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) select id,id::text||'@example.invalid',now(),now(),now() from (select gen_random_uuid() id from generate_series(1,1000)) f returning id",
        );
        const ids = people.map((r: { id: string }) => r.id);
        const array = "{" + ids.join(",") + "}";
        await tx.unsafe(
          "insert into public.volunteer_profile(id,auth_user_id,display_name) select id,id,'Synthetic thousand volunteer' from unnest($1::uuid[]) id",
          [array],
        );
        await tx.unsafe(
          "insert into public.volunteer_profile_review_assignment(profile_id,reviewer_user_id,updated_by) select id,$2::uuid,$3::uuid from unnest($1::uuid[]) id",
          ["{" + ids.slice(0, 100).join(",") + "}", reviewer, actor],
        );
        await tx.unsafe("set local role service_role");
        const rows = await tx.unsafe(
          "select public.create_volunteer_review_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4) result",
          [actor, array, reviewer, "c".repeat(64)],
        );
        const op = rows[0].result as {
          operationId: string;
          items: Array<{ entityId: string; status: string }>;
        };
        expect(op.items).toHaveLength(1000);
        expect(op.items.filter((i) => i.status === "pending")).toHaveLength(900);
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.volunteer_profile set revision=revision+1 where id=$1::uuid",
          [ids[100]],
        );
        await tx.unsafe(
          "update public.volunteer_profile set status='suspended' where id=$1::uuid",
          [ids[101]],
        );
        await tx.unsafe("set local role service_role");
        const results = await tx.unsafe(
          "select public.apply_volunteer_review_bulk_item($1::uuid,$2::uuid,profile_id) result from public.volunteer_review_bulk_item where operation_id=$2::uuid and status='pending' order by ordinal",
          [actor, op.operationId],
        );
        const states = results.map((r: { result: { status: string } }) => r.result.status);
        expect(states.filter((s: string) => s === "succeeded")).toHaveLength(898);
        expect(states.filter((s: string) => s === "conflict")).toHaveLength(1);
        expect(states.filter((s: string) => s === "skipped")).toHaveLength(1);
        await tx.unsafe(
          "select public.apply_volunteer_review_bulk_item($1::uuid,$2::uuid,$3::uuid)",
          [actor, op.operationId, ids[102]],
        );
        expect(
          (
            await tx.unsafe(
              "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='volunteer_profile.bulk_assign_reviewer'",
              [actor],
            )
          )[0].n,
        ).toBe(898);
        expect(
          (
            await tx.unsafe(
              "select public.get_volunteer_review_bulk_operation($1::uuid,$2::uuid) result",
              [actor, op.operationId],
            )
          )[0].result.state,
        ).toBe("done");
        for (const role of ["anon", "authenticated"]) {
          await tx.unsafe("reset role");
          await tx.unsafe("savepoint denied_role");
          await tx.unsafe("set local role " + role);
          let error: unknown;
          try {
            await tx.unsafe(
              "select public.get_volunteer_review_bulk_operation($1::uuid,$2::uuid)",
              [actor, op.operationId],
            );
          } catch (cause) {
            error = cause;
          }
          await tx.unsafe("rollback to savepoint denied_role");
          expect((error as { errno?: string } | undefined)?.errno).toBe("42501");
        }
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
