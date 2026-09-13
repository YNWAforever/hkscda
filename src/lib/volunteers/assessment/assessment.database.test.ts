import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL,
  enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
test.skipIf(!enabled)(
  "monthly assessment fixes version, preserves unknown/senior and deduplicates reminder",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false }),
      admin = crypto.randomUUID(),
      unknown = crypto.randomUUID(),
      senior = crypto.randomUUID(),
      known = crypto.randomUUID(),
      zero = crypto.randomUUID(),
      joinedLater = crypto.randomUUID(),
      julyCat = crypto.randomUUID(),
      julyCatSameDay = crypto.randomUUID(),
      julyDog = crypto.randomUUID(),
      juneCat = crypto.randomUUID(),
      policy = {
        regular_attendance_threshold: 10,
        senior_years: 2,
        senior_regular_observation_months: 12,
        attendance_unit: "once_per_day",
        shelter_scope: "combined",
        promotion_trigger: "monthly_assessment",
        regular_monthly_minimum: 1,
        senior_monthly_minimum: 2,
        regular_zero_months: 1,
        senior_zero_months: 2,
        senior_auto_demotion: false,
        assessment_day: 1,
        assessment_time: "09:00",
        short_month: "last_day",
        timezone: "Asia/Hong_Kong",
        notifications: {
          enabled: true,
          dry_run: true,
          channels: ["email"],
          regular_template: "提示",
          senior_template: "關懷",
          max_attempts: 3,
        },
      };
    const command = (c: unknown) =>
      db`select public.volunteer_assessment_command(${admin}::uuid,${JSON.stringify(c)}::jsonb) result`.then(
        (r) => r[0].result,
      );
    try {
      await db`begin`;
      for (const id of [admin, unknown, senior, known, zero, joinedLater])
        await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)values(${id}::uuid,${id + "@example.invalid"},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status)values(${admin}::uuid,${admin + "@example.invalid"},'admin','active')`;
      await db`insert into public.volunteer_profile(auth_user_id,display_name,tier,status,verified_by,verified_at,joined_on,history_coverage_start)values(${unknown}::uuid,'Unknown','senior','active',${admin}::uuid,now(),null,null),(${senior}::uuid,'Senior','senior','active',${admin}::uuid,now(),'2020-01-01','2020-01-01'),(${known}::uuid,'Known','regular','active',${admin}::uuid,now(),'2020-01-01','2020-01-01'),(${zero}::uuid,'Zero','regular','active',${admin}::uuid,now(),'2020-01-01','2020-01-01'),(${joinedLater}::uuid,'Joined Later','regular','active',${admin}::uuid,now(),'2024-08-01','2024-08-01')`;
      const zeroProfile = (
        await db`select id from public.volunteer_profile where auth_user_id=${zero}::uuid`
      )[0].id;
      const knownProfile = (
        await db`select id from public.volunteer_profile where auth_user_id=${known}::uuid`
      )[0].id;
      await db`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status,shelter_key) values
        (${julyCat}::uuid,'volunteer_shift','July cat','2024-07-05T01:00:00Z','2024-07-05T03:00:00Z','test',10,'published','cat'),
        (${julyCatSameDay}::uuid,'volunteer_shift','July cat same day','2024-07-05T05:00:00Z','2024-07-05T07:00:00Z','test',10,'published','cat'),
        (${julyDog}::uuid,'volunteer_shift','July dog','2024-07-06T01:00:00Z','2024-07-06T03:00:00Z','test',10,'published','dog'),
        (${juneCat}::uuid,'volunteer_shift','June cat','2024-06-05T01:00:00Z','2024-06-05T03:00:00Z','test',10,'published','cat')`;
      const registrations = [julyCat, julyCatSameDay, julyDog, juneCat].map(() =>
        crypto.randomUUID(),
      );
      for (let index = 0; index < registrations.length; index++)
        await db`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at,profile_id,attendance_status) values(${registrations[index]}::uuid,${[julyCat, julyCatSameDay, julyDog, juneCat][index]}::uuid,'individual','approved',1,'Known',${known + "@example.invalid"},'00000000',${registrations[index]},now()+interval '1 day',${knownProfile}::uuid,'completed')`;
      for (const registration of [registrations[0], registrations[1], registrations[3]])
        await db`insert into public.volunteer_attendance_event(registration_id,actor_user_id,command,before_fact,after_fact) values(${registration}::uuid,${admin}::uuid,'record','{}','{"attendanceStatus":"completed"}')`;
      const currentRevision = Number(
        (await db`select revision from public.volunteer_assessment_policy_draft where id=true`)[0]
          ?.revision ?? 0,
      );
      await command({ kind: "save", body: policy, expected_revision: currentRevision });
      await command({
        kind: "publish",
        expected_revision: currentRevision + 1,
        effective_from: "2024-01-01",
        reason: "v1",
      });
      await command({ kind: "run", period_start: "2024-06-01", scope_key: "combined" });
      const run = await command({ kind: "run", period_start: "2024-07-01", scope_key: "combined" });
      const rows =
        await db`select r.profile_id,r.attendance_count,r.coverage,r.recommended_tier,p.auth_user_id from public.volunteer_monthly_assessment_result r join public.volunteer_profile p on p.id=r.profile_id where assessment_id=${run.assessment_id}::uuid and p.auth_user_id in (${unknown}::uuid,${senior}::uuid,${known}::uuid,${joinedLater}::uuid) order by profile_id`;
      const u = rows.find((x: { auth_user_id: string }) => x.auth_user_id === unknown);
      const k = rows.find((x: { auth_user_id: string }) => x.auth_user_id === known);
      expect(k.attendance_count).toBe(1);
      expect(u.attendance_count).toBeNull();
      expect(u.recommended_tier).toBe("senior");
      const seniorRow = rows.find((x: { auth_user_id: string }) => x.auth_user_id === senior);
      expect(seniorRow.recommended_tier).toBe("senior");
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_operation_outbox where dedup_key = ${"monthly-assessment:" + seniorRow.profile_id + ":2024-06-01:senior_reminder"}`
          )[0].n,
        ),
      ).toBe(0);
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_operation_outbox where dedup_key = ${"monthly-assessment:" + seniorRow.profile_id + ":2024-07-01:senior_reminder"}`
          )[0].n,
        ),
      ).toBe(1);
      const later = rows.find((x: { auth_user_id: string }) => x.auth_user_id === joinedLater);
      expect(later.attendance_count).toBeNull();
      expect(later.coverage).toBe("unknown");
      await command({
        kind: "save",
        body: { ...policy, regular_monthly_minimum: 2 },
        expected_revision: currentRevision + 1,
      });
      await command({
        kind: "publish",
        expected_revision: currentRevision + 2,
        effective_from: "2024-01-01",
        reason: "v2",
      });
      const rerun = await command({
        kind: "run",
        period_start: "2024-07-01",
        scope_key: "combined",
      });
      expect(rerun.policy_version_id).toBe(run.policy_version_id);
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_operation_outbox where payload->>'profile_id'=${later.profile_id}`
          )[0].n,
        ),
      ).toBe(0);
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_operation_outbox where dedup_key like ${"monthly-assessment:" + zeroProfile + ":2024-07-01:regular_reminder"}`
          )[0].n,
        ),
      ).toBe(1);
    } finally {
      await db`rollback`;
      await db.close({ timeout: 1 });
    }
  },
  30000,
);
