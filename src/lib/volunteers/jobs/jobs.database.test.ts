import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "runtime lease is fenced and failed notifications require active admin retry",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const bucket = new Date(Date.now() + Math.floor(Math.random() * 1000000)).toISOString();
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    const admin = crypto.randomUUID();
    const outbox = crypto.randomUUID();
    try {
      expect(
        (
          await db`select public.claim_volunteer_runtime_job('acceptance',${bucket}::timestamptz,${first}::uuid,clock_timestamp()-interval '1 second') ok`
        )[0].ok,
      ).toBe(true);
      expect(
        (
          await db`select public.claim_volunteer_runtime_job('acceptance',${bucket}::timestamptz,${second}::uuid,clock_timestamp()+interval '5 minutes') ok`
        )[0].ok,
      ).toBe(true);
      expect(
        (
          await db`select public.finish_volunteer_runtime_job('acceptance',${bucket}::timestamptz,${first}::uuid,'complete','{}') ok`
        )[0].ok,
      ).toBe(false);
      expect(
        (
          await db`select public.finish_volunteer_runtime_job('acceptance',${bucket}::timestamptz,${second}::uuid,'complete','{}') ok`
        )[0].ok,
      ).toBe(true);

      await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values(${admin}::uuid,${admin + "@example.invalid"},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${admin}::uuid,${admin + "@example.invalid"},'admin','active')`;
      await db`insert into public.volunteer_operation_outbox(id,dedup_key,kind,payload,status,last_error) values(${outbox}::uuid,${"acceptance:" + outbox},'volunteer_monthly_assessment_notification','{}','failed','test')`;
      expect(
        (
          await db`select public.retry_volunteer_operation_outbox(${admin}::uuid,${outbox}::uuid) ok`
        )[0].ok,
      ).toBe(true);
      await db`update public.volunteer_operation_outbox set status='failed' where id=${outbox}::uuid`;
      await db`update public.admin_user set status='disabled' where auth_user_id=${admin}::uuid`;
      let rejected = false;
      try {
        await db`select public.retry_volunteer_operation_outbox(${admin}::uuid,${outbox}::uuid)`;
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);
    } finally {
      await db.close({ timeout: 1 });
    }
  },
  30000,
);
