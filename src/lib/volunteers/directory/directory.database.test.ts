import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "56322" ||
    target.pathname !== "/postgres" ||
    target.search ||
    target.hash ||
    !["postgres:", "postgresql:"].includes(target.protocol)
  )
    throw new Error("Directory tests require dedicated isolated 127.0.0.1:56322/postgres");
}
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
test.skipIf(!enabled)(
  "directory restricted SQL: zero bookings, same names, literal email, stable pagination, detail coverage and roles",
  async () => {
    const db = new SQL(url!, { max: 1 });
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID(),
          user = crypto.randomUUID(),
          other = crypto.randomUUID();
        const marker = "Directory " + crypto.randomUUID();
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now()),(${user}::uuid,${"literal%_" + user + "@example.invalid"},now()),(${other}::uuid,${other + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        await tx`insert into public.volunteer_profile(id,auth_user_id,display_name) values(${user}::uuid,${user}::uuid,${marker}),(${other}::uuid,${other}::uuid,${marker})`;
        const read = async (query: Record<string, unknown>) =>
          (
            await tx`select public.volunteer_admin_directory_read(${actor}::uuid,${query}::jsonb) as data`
          )[0].data;
        const first = await read({ q: marker, limit: 1, page: 1 }),
          second = await read({ q: marker, limit: 1, page: 2 });
        expect(first.total).toBe(2);
        expect(first.profiles).toHaveLength(1);
        expect(second.profiles[0].id).not.toBe(first.profiles[0].id);
        expect((await read({ q: marker, limit: 1, page: 1 })).profiles[0].id).toBe(
          first.profiles[0].id,
        );
        expect(
          (await read({ q: "literal%_" + user + "@example.invalid" })).profiles[0],
        ).toMatchObject({ id: user, email_verified: true, status: "pending" });
        expect((await read({ q: "literal%_" })).total).toBe(1);
        expect((await read({ q: "no-match-" + marker })).total).toBe(0);
        const detail = await read({ profile_id: user });
        expect(detail.registrations).toEqual([]);
        expect(detail.attendance_events).toEqual([]);
        expect(detail.coverage).toMatchObject({
          history_coverage_start: null,
          registration_total: 0,
          scope: "linked_profile_records_only",
        });
        expect(await read({ profile_id: crypto.randomUUID() })).toBeNull();

        const activity = crypto.randomUUID(),
          registration = crypto.randomUUID();
        await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status) values(${activity}::uuid,'volunteer_shift',${marker},now()-interval '2 days',now()-interval '1 day','Synthetic test',10,'published')`;
        await tx`insert into public.volunteer_registration(id,activity_id,profile_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at) values(${registration}::uuid,${activity}::uuid,${user}::uuid,'individual','approved',1,${marker},${user + "@example.invalid"},'00000000',${registration},now()+interval '1 day')`;
        const version = (
          await tx`select updated_at::text as version from public.volunteer_registration where id=${registration}::uuid`
        )[0].version;
        const attendance = (
          await tx`select public.set_volunteer_attendance_with_audit(${registration}::uuid,${actor}::uuid,${version}::timestamptz,'completed','record',null) as result`
        )[0].result;
        expect(attendance.kind).toBe("updated");
        await tx`insert into public.volunteer_profile_event(profile_id,actor_user_id,event_type,reason,after_snapshot) select ${user}::uuid,${actor}::uuid,'synthetic_verification','Synthetic coverage fixture','{}'::jsonb from generate_series(1,101)`;
        const recorded = await read({ profile_id: user });
        expect(recorded.registrations[0]).toMatchObject({
          id: registration,
          attendance_status: "completed",
        });
        expect(recorded.attendance_events[0]).toMatchObject({
          registration_id: registration,
          command: "record",
          after_fact: { attendanceStatus: "completed" },
        });
        expect(recorded.coverage).toMatchObject({
          registration_total: 1,
          attendance_event_total: 1,
          verification_event_total: 101,
          records_limit: 100,
        });
        expect(recorded.verification_history).toHaveLength(100);
        expect((await read({ profile_id: other })).registrations).toEqual([]);
        await tx`update public.admin_user set role='admin' where auth_user_id=${actor}::uuid`;
        expect((await read({ q: marker })).total).toBe(2);
        for (const invalid of [
          { limit: 51 },
          { page: 0 },
          { status: "invalid" },
          { tier: "invalid" },
        ]) {
          await tx.unsafe(
            `do $$ begin perform public.volunteer_admin_directory_read('${actor}'::uuid,'${JSON.stringify(invalid)}'::jsonb); raise exception 'expected query rejection'; exception when invalid_parameter_value then null; end $$;`,
          );
        }
        expect((await read({ q: marker })).total).toBe(2);
        for (const role of ["anon", "authenticated"]) {
          const permission =
            await tx`select has_function_privilege(${role},'public.volunteer_admin_directory_read(uuid,jsonb)','EXECUTE') as allowed`;
          expect(permission[0].allowed).toBe(false);
        }
        expect(
          (
            await tx`select has_function_privilege('service_role','public.volunteer_admin_directory_read(uuid,jsonb)','EXECUTE') as allowed`
          )[0].allowed,
        ).toBe(true);
        await tx.unsafe(
          `do $$ begin perform public.volunteer_admin_directory_read('${user}'::uuid,'{}'); raise exception 'expected permission rejection'; exception when insufficient_privilege then null; end $$;`,
        );
        await tx`update public.admin_user set role='treasurer' where auth_user_id=${actor}::uuid`;
        await tx.unsafe(
          `do $$ begin perform public.volunteer_admin_directory_read('${actor}'::uuid,'{}'); raise exception 'expected permission rejection'; exception when insufficient_privilege then null; end $$;`,
        );
        throw new Error("ROLLBACK_SYNTHETIC_DIRECTORY_FIXTURES");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "ROLLBACK_SYNTHETIC_DIRECTORY_FIXTURES")
        throw error;
    } finally {
      await db.close();
    }
  },
);
