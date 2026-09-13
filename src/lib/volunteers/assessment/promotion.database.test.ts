import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "published promotion trigger drives execution and senior remains manual",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const admin = crypto.randomUUID(),
      monthlyUser = crypto.randomUUID(),
      verifiedUser = crypto.randomUUID(),
      reconciliationUser = crypto.randomUUID();
    const activityA = crypto.randomUUID(),
      activityB = crypto.randomUUID(),
      activityC = crypto.randomUUID(),
      activityD = crypto.randomUUID(),
      activityE = crypto.randomUUID();
    const registrationA = crypto.randomUUID(),
      registrationB = crypto.randomUUID(),
      registrationC = crypto.randomUUID(),
      registrationD = crypto.randomUUID(),
      registrationE = crypto.randomUUID(),
      reconciliationRegistration = crypto.randomUUID();
    const policy = (
      trigger: "verified_attendance" | "monthly_assessment",
      threshold = 1,
      unit:
        | "once_per_day"
        | "each_verified_nonoverlapping_session" = "each_verified_nonoverlapping_session",
      shelterScope: "combined" | "separate" = "combined",
    ) => ({
      regular_attendance_threshold: threshold,
      senior_years: 0,
      senior_regular_observation_months: 0,
      attendance_unit: unit,
      shelter_scope: shelterScope,
      promotion_trigger: trigger,
      regular_monthly_minimum: 0,
      senior_monthly_minimum: 0,
      regular_zero_months: 1,
      senior_zero_months: 2,
      senior_auto_demotion: false,
      assessment_day: 1,
      assessment_time: "09:00",
      short_month: "last_day",
      timezone: "Asia/Hong_Kong",
      notifications: {
        enabled: false,
        dry_run: true,
        channels: ["email"],
        regular_template: "r",
        senior_template: "s",
        max_attempts: 3,
      },
    });
    try {
      await db`begin`;
      for (const id of [admin, monthlyUser, verifiedUser, reconciliationUser])
        await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values(${id}::uuid,${id + "@example.invalid"},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${admin}::uuid,${admin + "@example.invalid"},'admin','active')`;
      await db`insert into public.volunteer_profile(auth_user_id,display_name,tier,status,verified_by,verified_at,joined_on,history_coverage_start)
      values(${monthlyUser}::uuid,'Monthly trigger','newcomer','active',${admin}::uuid,now(),'2020-01-01','2020-01-01'),
      (${verifiedUser}::uuid,'Verified trigger','newcomer','active',${admin}::uuid,now(),'2020-01-01','2020-01-01')`;
      await db`insert into public.volunteer_profile(auth_user_id,display_name,tier,status,verified_by,verified_at,joined_on,history_coverage_start) values(${reconciliationUser}::uuid,'Reconciliation trigger','newcomer','active',${admin}::uuid,now(),'2020-01-01','2020-01-01')`;
      const profiles =
        await db`select id,auth_user_id from public.volunteer_profile where auth_user_id in (${monthlyUser}::uuid,${verifiedUser}::uuid,${reconciliationUser}::uuid)`;
      const policyOrder = (
        await db`select (coalesce(max(created_at),clock_timestamp()) + interval '1 day')::text monthly_at,(coalesce(max(created_at),clock_timestamp()) + interval '2 days')::text verified_at from public.volunteer_assessment_policy_version`
      )[0];
      for (const row of profiles)
        await db`insert into public.volunteer_profile_event(profile_id,actor_user_id,event_type,reason,before_snapshot,after_snapshot)
        values(${row.id}::uuid,${admin}::uuid,'verify','fixture','{}',jsonb_build_object('tier','newcomer'))`;
      await db`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status,shelter_key) values
      (${activityA}::uuid,'volunteer_shift','A','2022-03-05T01:00:00Z','2022-03-05T03:00:00Z','test',10,'published','cat'),
      (${activityB}::uuid,'volunteer_shift','B','2022-03-06T01:00:00Z','2022-03-06T03:00:00Z','test',10,'published','cat'),
      (${activityC}::uuid,'volunteer_shift','C','2022-03-06T04:00:00Z','2022-03-06T06:00:00Z','test',10,'published','cat'),
      (${activityD}::uuid,'volunteer_shift','D','2022-03-07T01:00:00Z','2022-03-07T03:00:00Z','test',10,'published','dog'),
      (${activityE}::uuid,'volunteer_shift','E','2022-03-07T02:00:00Z','2022-03-07T04:00:00Z','test',10,'published','cat')`;
      const monthlyProfile = profiles.find(
        (x: { auth_user_id: string }) => x.auth_user_id === monthlyUser,
      ).id;
      const verifiedProfile = profiles.find(
        (x: { auth_user_id: string }) => x.auth_user_id === verifiedUser,
      ).id;
      const reconciliationProfile = profiles.find(
        (x: { auth_user_id: string }) => x.auth_user_id === reconciliationUser,
      ).id;
      await db`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at,profile_id,attendance_status) values
      (${registrationA}::uuid,${activityA}::uuid,'individual','approved',1,'M',${monthlyUser + "@example.invalid"},'0',${registrationA},now()+interval '1 day',${monthlyProfile}::uuid,'completed'),
      (${registrationB}::uuid,${activityB}::uuid,'individual','approved',1,'V',${verifiedUser + "@example.invalid"},'0',${registrationB},now()+interval '1 day',${verifiedProfile}::uuid,'completed'),
      (${registrationC}::uuid,${activityC}::uuid,'individual','approved',1,'V',${verifiedUser + "@example.invalid"},'0',${registrationC},now()+interval '1 day',${verifiedProfile}::uuid,'completed'),
      (${registrationD}::uuid,${activityD}::uuid,'individual','approved',1,'V',${verifiedUser + "@example.invalid"},'0',${registrationD},now()+interval '1 day',${verifiedProfile}::uuid,'completed'),
      (${registrationE}::uuid,${activityE}::uuid,'individual','approved',1,'V',${verifiedUser + "@example.invalid"},'0',${registrationE},now()+interval '1 day',${verifiedProfile}::uuid,'completed'),
      (${reconciliationRegistration}::uuid,${activityA}::uuid,'individual','approved',1,'R',${reconciliationUser + "@example.invalid"},'0',${reconciliationRegistration},now()+interval '1 day',${reconciliationProfile}::uuid,'completed')`;
      await db`insert into public.volunteer_assessment_policy_version(body,content_hash,effective_from,reason,published_by,created_at)
      values(${JSON.stringify(policy("monthly_assessment"))}::jsonb,${"m-" + crypto.randomUUID()},'2022-01-01','monthly fixture',${admin}::uuid,${policyOrder.monthly_at}::timestamptz - interval '1 second'),
      (${JSON.stringify(policy("monthly_assessment"))}::jsonb,${"m-current-" + crypto.randomUUID()},current_date,'monthly current fixture',${admin}::uuid,${policyOrder.monthly_at}::timestamptz)`;
      await db`savepoint invalid_scope`;
      let invalidScopeRejected = false;
      try {
        await db`select public.volunteer_assessment_command(${admin}::uuid,${JSON.stringify({ kind: "run", period_start: "2022-02-01", scope_key: "cat" })}::jsonb)`;
      } catch {
        invalidScopeRejected = true;
        await db`rollback to savepoint invalid_scope`;
      }
      expect(invalidScopeRejected).toBe(true);
      expect(
        Number(
          (
            await db`select count(*) count from public.volunteer_monthly_assessment where period_start='2022-02-01' and scope_key='cat'`
          )[0].count,
        ),
      ).toBe(0);
      await db`insert into public.volunteer_attendance_event(registration_id,actor_user_id,command,before_fact,after_fact)
      values(${registrationA}::uuid,${admin}::uuid,'record','{}','{"attendanceStatus":"completed"}')`;
      expect(
        (await db`select tier from public.volunteer_profile where id=${monthlyProfile}::uuid`)[0]
          .tier,
      ).toBe("newcomer");
      const monthlyRun = (
        await db`select public.volunteer_assessment_command(${admin}::uuid,${JSON.stringify({ kind: "run", period_start: "2022-03-01", scope_key: "combined" })}::jsonb) result`
      )[0].result;
      const monthlyResult = (
        await db`select prior_tier,recommended_tier,attendance_count from public.volunteer_monthly_assessment_result where assessment_id=${monthlyRun.assessment_id}::uuid and profile_id=${monthlyProfile}::uuid`
      )[0];
      expect(monthlyResult).toMatchObject({
        prior_tier: "newcomer",
        recommended_tier: "regular",
        attendance_count: 1,
      });
      expect(
        (await db`select tier from public.volunteer_profile where id=${monthlyProfile}::uuid`)[0]
          .tier,
      ).toBe("regular");
      expect(
        (
          await db`select trigger_kind from public.volunteer_tier_candidate where profile_id=${monthlyProfile}::uuid`
        )[0].trigger_kind,
      ).toBe("monthly_assessment");
      await db`insert into public.volunteer_attendance_event(registration_id,actor_user_id,command,before_fact,after_fact) values(${reconciliationRegistration}::uuid,${admin}::uuid,'record','{}','{"attendanceStatus":"completed"}')`;
      await db`insert into public.volunteer_assessment_policy_version(body,content_hash,effective_from,reason,published_by,created_at)
      values(${JSON.stringify(policy("verified_attendance", 2, "once_per_day", "separate"))}::jsonb,${"v-" + crypto.randomUUID()},current_date,'verified fixture',${admin}::uuid,${policyOrder.verified_at}::timestamptz)`;
      const reconciliationVersion = (
        await db`insert into public.volunteer_assessment_policy_version(body,content_hash,effective_from,reason,published_by,created_at) values(${JSON.stringify(policy("verified_attendance"))}::jsonb,${"reconcile-" + crypto.randomUUID()},'2022-04-01','verified reconciliation fixture',${admin}::uuid,${policyOrder.monthly_at}::timestamptz) returning id`
      )[0].id;
      const reconciliationRun = (
        await db`select public.volunteer_assessment_command(${admin}::uuid,${JSON.stringify({ kind: "run", period_start: "2022-04-01", scope_key: "combined" })}::jsonb) result`
      )[0].result;
      expect(reconciliationRun).toMatchObject({
        kind: "completed",
        policy_version_id: reconciliationVersion,
      });
      expect(
        (
          await db`select tier from public.volunteer_profile where id=${reconciliationProfile}::uuid`
        )[0].tier,
      ).toBe("regular");
      expect(
        (
          await db`select event_type from public.volunteer_profile_event where profile_id=${reconciliationProfile}::uuid order by created_at desc,id desc limit 1`
        )[0].event_type,
      ).toBe("monthly_verified_attendance_reconciliation");
      await db`insert into public.volunteer_attendance_event(registration_id,actor_user_id,command,before_fact,after_fact)
      values(${registrationB}::uuid,${admin}::uuid,'record','{}','{"attendanceStatus":"completed"}')`;
      await db`insert into public.volunteer_attendance_event(registration_id,actor_user_id,command,before_fact,after_fact) values(${registrationC}::uuid,${admin}::uuid,'record','{}','{"attendanceStatus":"completed"}')`;
      expect(
        (await db`select tier from public.volunteer_profile where id=${verifiedProfile}::uuid`)[0]
          .tier,
      ).toBe("newcomer");
      await db`insert into public.volunteer_attendance_event(registration_id,actor_user_id,command,before_fact,after_fact) values(${registrationD}::uuid,${admin}::uuid,'record','{}','{"attendanceStatus":"completed"}')`;
      expect(
        (await db`select tier from public.volunteer_profile where id=${verifiedProfile}::uuid`)[0]
          .tier,
      ).toBe("newcomer");
      await db`insert into public.volunteer_attendance_event(registration_id,actor_user_id,command,before_fact,after_fact) values(${registrationE}::uuid,${admin}::uuid,'record','{}','{"attendanceStatus":"completed"}')`;
      const nonoverlappingCount = (
        await db`select public.volunteer_verified_attendance_count(${verifiedProfile}::uuid,${JSON.stringify(policy("verified_attendance", 2, "each_verified_nonoverlapping_session", "combined"))}::jsonb,'combined',current_date+1) count`
      )[0].count;
      expect(Number(nonoverlappingCount)).toBe(2);
      expect(
        (await db`select tier from public.volunteer_profile where id=${verifiedProfile}::uuid`)[0]
          .tier,
      ).toBe("regular");
      const candidate =
        await db`select trigger_kind,evidence from public.volunteer_tier_candidate where profile_id=${verifiedProfile}::uuid`;
      expect(candidate).toHaveLength(1);
      expect(candidate[0].trigger_kind).toBe("verified_attendance");
      expect(candidate[0].evidence.profile_revision).toBeDefined();
      const interruptedUser = crypto.randomUUID();
      await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values(${interruptedUser}::uuid,${interruptedUser + "@example.invalid"},now(),now(),now())`;
      const interruptedProfile = (
        await db`insert into public.volunteer_profile(auth_user_id,display_name,tier,status,verified_by,verified_at,joined_on,history_coverage_start) values(${interruptedUser}::uuid,'Interrupted regular','regular','active',${admin}::uuid,now(),'2020-01-01','2020-01-01') returning id`
      )[0].id;
      await db`insert into public.volunteer_profile_event(profile_id,actor_user_id,event_type,reason,before_snapshot,after_snapshot,created_at) values
        (${interruptedProfile}::uuid,${admin}::uuid,'verify','first regular','{"tier":"newcomer"}','{"tier":"regular"}','2020-01-01'),
        (${interruptedProfile}::uuid,${admin}::uuid,'verify','interrupted','{"tier":"regular"}','{"tier":"newcomer"}','2021-01-01'),
        (${interruptedProfile}::uuid,${admin}::uuid,'verify','restored','{"tier":"newcomer"}','{"tier":"regular"}',clock_timestamp())`;
      const observationVersion = (
        await db`insert into public.volunteer_assessment_policy_version(body,content_hash,effective_from,reason,published_by,created_at) values(${JSON.stringify({ ...policy("verified_attendance"), senior_regular_observation_months: 12 })}::jsonb,${"observation-" + crypto.randomUUID()},current_date,'observation fixture',${admin}::uuid,${policyOrder.verified_at}::timestamptz+interval '1 day') returning id`
      )[0].id;
      await db`select public.volunteer_record_senior_candidate(${interruptedProfile}::uuid,${observationVersion}::uuid,'verified_attendance')`;
      expect(
        Number(
          (
            await db`select count(*) count from public.volunteer_tier_candidate where profile_id=${interruptedProfile}::uuid`
          )[0].count,
        ),
      ).toBe(0);
    } finally {
      await db`rollback`;
      await db.close({ timeout: 1 });
    }
  },
  30000,
);
