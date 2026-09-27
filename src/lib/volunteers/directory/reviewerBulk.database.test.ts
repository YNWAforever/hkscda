import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.VOLUNTEER_REVIEW_BULK_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "57322" || url.pathname !== "/postgres") {
    throw new Error("Volunteer review bulk test requires dedicated loopback DB");
  }
}
const enabled =
  Boolean(databaseUrl) && process.env.VOLUNTEER_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES === "1";

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
        const apply = async (id: string) =>
          (
            (await tx.unsafe(
              "select public.apply_volunteer_review_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
              [actor, op, id],
            )) as Array<{ result: { status: string; reasonCode: string | null } }>
          )[0]!.result;
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        await tx.unsafe(
          "update public.volunteer_profile set revision=revision+1 where id=$1::uuid",
          [ids[1]],
        );
        expect(await apply(ids[1]!)).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
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
          [reviewer],
        );
        await fail(apply, "42501");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [reviewer],
        );
        await tx.unsafe(
          "update public.volunteer_review_bulk_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [op],
        );
        await fail(apply, "P0001");
        await tx.unsafe(
          "update public.volunteer_review_bulk_operation set expires_at=now()+interval '15 minutes' where id=$1::uuid",
          [op],
        );
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
