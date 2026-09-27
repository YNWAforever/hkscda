import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.ADOPTION_ASSIGNMENT_BULK_TEST_DATABASE_URL;
if (url && (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "57322")) {
  throw new Error("Dedicated disposable adoption bulk database required");
}

test.skipIf(!url || process.env.ADOPTION_ASSIGNMENT_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "adoption assignment bulk RPC is installed",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    try {
      const rows =
        await db`select to_regprocedure('public.create_adoption_assignment_bulk_preview(uuid,uuid[],uuid,uuid,integer,text)') as signature`;
      expect(rows[0].signature).not.toBeNull();
      const trigger =
        await db`select count(*)::int count from pg_trigger where tgrelid='public.adoption_case'::regclass and tgname='adoption_case_bulk_row_version_before_update' and tgenabled='O'`;
      expect(trigger[0].count).toBe(1);
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!url || process.env.ADOPTION_ASSIGNMENT_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "adoption assignment snapshots stage and age, retries, stale and closed cases",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback adoption assignment fixture");
    const actor = crypto.randomUUID();
    const assignee = crypto.randomUUID();
    const status = crypto.randomUUID();
    const cases = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    const recentId = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        for (const id of [actor, assignee]) {
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
          [assignee, assignee + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.coordinator_status(id,category,key,label_zh,label_en) values($1::uuid,'adoption_case',$2,'Open','Open')",
          [status, "bulk_" + status.replaceAll("-", "")],
        );
        for (const id of cases) {
          await tx.unsafe(
            "insert into public.adoption_case(id,status_id,applicant_name,applicant_phone,created_at) values($1::uuid,$2::uuid,'Synthetic adopter','90000000',now()-interval '10 days')",
            [id, status],
          );
        }
        await tx.unsafe(
          "insert into public.adoption_case(id,status_id,applicant_name,applicant_phone) values($1::uuid,$2::uuid,'Recent synthetic adopter','90000001')",
          [recentId, status],
        );
        const agePreview = (await tx.unsafe(
          "select public.create_adoption_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4::uuid,7,$5) result",
          [actor, "{" + recentId + "}", assignee, status, "a".repeat(64)],
        )) as Array<{ result: { items: Array<{ status: string; reasonCode: string }> } }>;
        expect(agePreview[0]!.result.items[0]).toMatchObject({
          status: "skipped",
          reasonCode: "too_recent",
        });
        const preview = (await tx.unsafe(
          "select public.create_adoption_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4::uuid,7,$5) result",
          [actor, "{" + cases.join(",") + "}", assignee, status, "a".repeat(64)],
        )) as Array<{ result: { operationId: string; items: Array<{ status: string }> } }>;
        const op = preview[0]!.result.operationId;
        expect(preview[0]!.result.items.map((item) => item.status)).toEqual([
          "pending",
          "pending",
          "pending",
          "pending",
        ]);
        const apply = async (id: string) =>
          (
            (await tx.unsafe(
              "select public.apply_adoption_assignment_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
              [actor, op, id],
            )) as Array<{ result: { status: string; reasonCode: string | null } }>
          )[0]!.result;
        expect((await apply(cases[0]!)).status).toBe("succeeded");
        expect((await apply(cases[0]!)).status).toBe("succeeded");
        await tx.unsafe(
          "update public.adoption_case set updated_at=clock_timestamp()+interval '1 second' where id=$1::uuid",
          [cases[1]],
        );
        expect(await apply(cases[1]!)).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        await tx.unsafe("update public.adoption_case set closed_at=now() where id=$1::uuid", [
          cases[2],
        ]);
        expect(await apply(cases[2]!)).toMatchObject({
          status: "skipped",
          reasonCode: "unavailable",
        });
        await tx.unsafe("update public.coordinator_status set is_closing=true where id=$1::uuid", [
          status,
        ]);
        expect(await apply(cases[3]!)).toMatchObject({
          status: "conflict",
          reasonCode: "stage_closed",
        });
        const rows = (await tx.unsafe(
          "select id,assigned_to from public.adoption_case where id=any($1::uuid[]) order by id",
          ["{" + cases.join(",") + "}"],
        )) as Array<{ id: string; assigned_to: string | null }>;
        expect(rows.filter((row) => row.assigned_to === assignee).map((row) => row.id)).toEqual([
          cases[0],
        ]);
        const audits = (await tx.unsafe(
          "select count(*)::int count from public.audit_log where actor_user_id=$1::uuid and action='adoption_case.bulk_assign_owner'",
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

test.skipIf(!url || process.env.ADOPTION_ASSIGNMENT_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "adoption bulk rejects revoked roles and expiry and rolls back on audit failure",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback adoption assignment safety fixture");
    const actor = crypto.randomUUID(),
      assignee = crypto.randomUUID(),
      status = crypto.randomUUID(),
      caseId = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        for (const id of [actor, assignee]) {
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
          [assignee, assignee + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.coordinator_status(id,category,key,label_zh,label_en) values($1::uuid,'adoption_case',$2,'Open','Open')",
          [status, "bulk_" + status.replaceAll("-", "")],
        );
        await tx.unsafe(
          "insert into public.adoption_case(id,status_id,applicant_name,applicant_phone,created_at) values($1::uuid,$2::uuid,'Synthetic adopter','90000000',now()-interval '10 days')",
          [caseId, status],
        );
        const fail = async (call: () => Promise<unknown>, errno: string) => {
          await tx.unsafe("savepoint adoption_bulk_failure");
          let received: unknown;
          try {
            await call();
          } catch (error) {
            received = error;
          }
          await tx.unsafe("rollback to savepoint adoption_bulk_failure");
          expect((received as { errno?: string } | undefined)?.errno).toBe(errno);
        };
        const tooMany = Array.from({ length: 1001 }, () => crypto.randomUUID());
        await fail(
          () =>
            tx.unsafe(
              "select public.create_adoption_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4::uuid,7,$5)",
              [actor, "{" + tooMany.join(",") + "}", assignee, status, "a".repeat(64)],
            ),
          "22023",
        );
        const preview = (await tx.unsafe(
          "select public.create_adoption_assignment_bulk_preview($1::uuid,$2::uuid[],$3::uuid,$4::uuid,7,$5) result",
          [actor, "{" + caseId + "}", assignee, status, "a".repeat(64)],
        )) as Array<{ result: { operationId: string } }>;
        const op = preview[0]!.result.operationId;
        const apply = () =>
          tx.unsafe(
            "select public.apply_adoption_assignment_bulk_item($1::uuid,$2::uuid,$3::uuid)",
            [actor, op, caseId],
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
        await fail(apply, "42501");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [assignee],
        );
        await tx.unsafe(
          "update public.adoption_assignment_bulk_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [op],
        );
        await fail(apply, "P0001");
        await tx.unsafe(
          "update public.adoption_assignment_bulk_operation set expires_at=now()+interval '15 minutes' where id=$1::uuid",
          [op],
        );
        await tx.unsafe(
          "create function pg_temp.fail_adoption_bulk_audit() returns trigger language plpgsql as $$ begin if new.action='adoption_case.bulk_assign_owner' then raise exception 'synthetic audit failure' using errcode='P0002';end if;return new;end $$",
        );
        await tx.unsafe(
          "create trigger fail_adoption_bulk_audit before insert on public.audit_log for each row execute function pg_temp.fail_adoption_bulk_audit()",
        );
        await fail(apply, "P0002");
        const assignment = (await tx.unsafe(
          "select assigned_to from public.adoption_case where id=$1::uuid",
          [caseId],
        )) as Array<{ assigned_to: string | null }>;
        expect(assignment[0]!.assigned_to).toBeNull();
        await tx.unsafe("drop trigger fail_adoption_bulk_audit on public.audit_log");
        const grants = (await tx.unsafe(
          "select has_function_privilege('authenticated','public.create_adoption_assignment_bulk_preview(uuid,uuid[],uuid,uuid,integer,text)','EXECUTE') preview,has_function_privilege('anon','public.apply_adoption_assignment_bulk_item(uuid,uuid,uuid)','EXECUTE') apply,has_table_privilege('authenticated','public.adoption_assignment_bulk_item','SELECT') item",
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
