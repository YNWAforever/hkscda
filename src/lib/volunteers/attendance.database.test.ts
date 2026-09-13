import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "56322" ||
    target.pathname !== "/postgres" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      "Attendance tests require the dedicated isolated 127.0.0.1:56322/postgres database",
    );
  }
}
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "VOL-10 attendance future/version, correction, audit rollback and cancel race",
  async () => {
    const db = new SQL(url!, { max: 1 });
    const competitor = new SQL(url!, { max: 1 });
    const actor = crypto.randomUUID();
    const activity = crypto.randomUUID();
    const registration = crypto.randomUUID();
    try {
      await db`insert into public.admin_user(auth_user_id,email,role) values(${actor}::uuid,${actor + "@example.invalid"},'admin')`;
      await db`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status) values(${activity}::uuid,'volunteer_shift','Synthetic attendance acceptance',now()-interval '2 days',now()-interval '1 day','Isolated test',10,'published')`;
      await db`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at) values(${registration}::uuid,${activity}::uuid,'individual','approved',1,'Synthetic attendance',${registration + "@example.invalid"},'00000000',${registration},now()+interval '1 day')`;
      await db`update public.volunteer_activity set starts_at=now()+interval '2 days',ends_at=now()+interval '2 days 2 hours' where id=${activity}::uuid`;
      const version = async () =>
        (
          await db`select updated_at::text as version from public.volunteer_registration where id=${registration}::uuid`
        )[0].version as string;
      const mark = async (
        expected: string,
        status = "completed",
        command = "record",
        reason: string | null = null,
      ) =>
        (
          await db`select public.set_volunteer_attendance_with_audit(${registration}::uuid,${actor}::uuid,${expected}::timestamptz,${status}::text,${command}::text,${reason}::text) as result`
        )[0].result;
      const originalVersion = await version();
      expect((await mark(originalVersion)).kind).toBe("future_attendance");
      expect(
        (
          await db`select count(*)::int as count from public.volunteer_attendance_event where registration_id=${registration}::uuid`
        )[0].count,
      ).toBe(0);
      await db`update public.volunteer_activity set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where id=${activity}::uuid`;
      const completed = await mark(originalVersion);
      expect(completed.kind).toBe("updated");
      expect((await mark(originalVersion)).kind).toBe("conflict");
      const normalCorrection = await mark(await version(), "no_show");
      expect(normalCorrection.kind).toBe("attendance_correction_required");
      let invalidReason = false;
      try {
        await mark(await version(), "no_show", "correct", " ");
      } catch {
        invalidReason = true;
      }
      expect(invalidReason).toBe(true);
      const correctionVersion = await version();
      const corrected = await mark(
        correctionVersion,
        "no_show",
        "correct",
        "Staff corrected a mistaken completion",
      );
      expect(corrected.kind).toBe("updated");
      const facts =
        await db`select command,before_fact,after_fact from public.volunteer_attendance_event where registration_id=${registration}::uuid order by recorded_at,id`;
      expect(facts).toHaveLength(2);
      expect(facts[0].after_fact.attendanceStatus).toBe("completed");
      expect(facts[1].before_fact.attendanceStatus).toBe("completed");
      expect(facts[1].after_fact.attendanceStatus).toBe("no_show");
      let historicalTimeProtected = false;
      try {
        await db.begin(async (tx) => {
          await tx`update public.volunteer_activity set starts_at=starts_at-interval '1 hour',ends_at=ends_at-interval '1 hour' where id=${activity}::uuid`;
          throw Error("rollback historical rewrite");
        });
      } catch (error) {
        historicalTimeProtected = String(error).includes("attendance_activity_time_immutable");
      }
      expect(historicalTimeProtected).toBe(true);

      let deleteFailed = false;
      try {
        await db`delete from public.volunteer_attendance_event where registration_id=${registration}::uuid`;
      } catch {
        deleteFailed = true;
      }
      expect(deleteFailed).toBe(true);
      let registrationDeleteFailed = false;
      try {
        await db`delete from public.volunteer_registration where id=${registration}::uuid`;
      } catch {
        registrationDeleteFailed = true;
      }
      expect(registrationDeleteFailed).toBe(true);

      // Failure injection is transaction scoped and cannot leak to other tests.
      const beforeFailure = await version();
      let auditFailure = "";
      try {
        await db.begin(async (tx) => {
          await tx.unsafe(
            `create function pg_temp.reject_attendance_audit() returns trigger language plpgsql as $$ begin if new.entity_id='${registration}' then raise exception 'synthetic attendance audit failure'; end if; return new; end $$`,
          );
          await tx.unsafe(
            "create trigger attendance_test_audit_failure before insert on public.audit_log for each row execute function pg_temp.reject_attendance_audit()",
          );
          await tx`select public.set_volunteer_attendance_with_audit(${registration}::uuid,${actor}::uuid,${beforeFailure}::timestamptz,'completed','correct','Audit failure fixture')`;
        });
      } catch (error) {
        auditFailure = error instanceof Error ? error.message : String(error);
      }
      expect(auditFailure).toContain("synthetic attendance audit failure");
      expect(await version()).toBe(beforeFailure);
      expect(
        (
          await db`select count(*)::int as count from public.volunteer_attendance_event where registration_id=${registration}::uuid`
        )[0].count,
      ).toBe(2);

      expect(
        (await mark(await version(), "not_marked", "correct", "Reset synthetic fact for race"))
          .kind,
      ).toBe("updated");
      const raceVersion = await version();
      const [attendance, cancellation] = await Promise.all([
        mark(raceVersion),
        competitor`select public.set_volunteer_registration_status_with_audit(${registration}::uuid,${actor}::uuid,${raceVersion}::timestamptz,'cancelled') as result`.then(
          (rows) => rows[0].result,
        ),
      ]);
      expect(
        [attendance.kind, cancellation.kind].filter((kind) => kind === "updated"),
      ).toHaveLength(1);
      const [final] =
        await db`select status,attendance_status from public.volunteer_registration where id=${registration}::uuid`;
      expect(
        (final.status === "approved" && final.attendance_status === "completed") ||
          (final.status === "cancelled" && final.attendance_status === "not_marked"),
      ).toBe(true);
      const [grants] =
        await db`select has_function_privilege('anon','public.set_volunteer_attendance_with_audit(uuid,uuid,timestamptz,text,text,text,numeric,boolean,text,boolean)','EXECUTE') as anonymous,has_table_privilege('service_role','public.volunteer_attendance_event','TRUNCATE') as truncate`;
      expect(grants.anonymous).toBe(false);
      expect(grants.truncate).toBe(false);
    } finally {
      // Append-only synthetic facts deliberately remain in this disposable stack.
      await Promise.all([db.close({ timeout: 1 }), competitor.close({ timeout: 1 })]);
    }
  },
  30000,
);
