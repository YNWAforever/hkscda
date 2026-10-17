import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
if (url && (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "56322"))
  throw new Error("Verified volunteer RLS stack required");

test.skipIf(!enabled)(
  "roster RPC grants reject browser roles and retain fresh service-side actor fences",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false }),
      rollback = new Error("owned role matrix rollback");
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID(),
          key = crypto.randomUUID();
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
        const invoke = async (role: "anon" | "authenticated" | "service_role") => {
          const done = new Error("rollback role probe");
          let kind: string | undefined, code: string | undefined;
          try {
            await tx.savepoint(async (scoped) => {
              await scoped.unsafe("set local role " + role);
              await scoped`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: "authenticated" })},true)`;
              kind = (
                await scoped`select public.volunteer_roster_attendance_command(${actor}::uuid,${JSON.stringify({ action: "attendance_lookup", idempotency_key: key })}::jsonb) result`
              )[0].result.kind;
              throw done;
            });
          } catch (error) {
            if (error !== done) code = (error as { errno?: string }).errno;
          }
          return { kind, code };
        };
        expect(await invoke("anon")).toMatchObject({ code: "42501" });
        expect(await invoke("authenticated")).toMatchObject({ code: "42501" });
        expect(await invoke("service_role")).toEqual({ kind: "not_found", code: undefined });
        await tx`update public.admin_user set role='staff' where auth_user_id=${actor}::uuid`;
        expect((await invoke("service_role")).kind).toBe("not_found");
        await tx`update public.admin_user set role='treasurer' where auth_user_id=${actor}::uuid`;
        expect((await invoke("service_role")).code).toBe("42501");
        await tx`update public.admin_user set role='admin',status='disabled' where auth_user_id=${actor}::uuid`;
        expect((await invoke("service_role")).code).toBe("42501");
        await tx`update public.admin_user set status='active' where auth_user_id=${actor}::uuid`;
        await tx`update auth.users set email_confirmed_at=null where id=${actor}::uuid`;
        expect((await invoke("service_role")).code).toBe("42501");
        await tx`update auth.users set email_confirmed_at=now(),banned_until=now()+interval '1 day' where id=${actor}::uuid`;
        expect((await invoke("service_role")).code).toBe("42501");
        const privileges = (
          await tx`select
      (select relrowsecurity from pg_class where oid='public.volunteer_bulk_operation'::regclass) rls,
      has_function_privilege('service_role','public.volunteer_roster_attendance_result(public.volunteer_bulk_operation)','execute') helper,
      has_table_privilege('authenticated','public.volunteer_bulk_operation','select') browser_table,
      has_table_privilege('service_role','public.volunteer_attendance_event','update') event_update,
      has_table_privilege('service_role','public.volunteer_attendance_event','delete') event_delete,
      has_table_privilege('service_role','public.volunteer_attendance_event','truncate') event_truncate`
        )[0];
        expect(privileges).toEqual({
          rls: true,
          helper: false,
          browser_table: false,
          event_update: false,
          event_delete: false,
          event_truncate: false,
        });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);
