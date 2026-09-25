import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url && (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "56322"))
  throw new Error("Disposable database required");
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "notification expiry fencing, configured attempt cap, staff retry and immutable task completion",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false }),
      rollback = new Error("rollback notification fixtures"),
      id = crypto.randomUUID(),
      task = crypto.randomUUID(),
      staff = crypto.randomUUID(),
      ordinary = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        for (const actor of [staff, ordinary])
          await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${staff}::uuid,${staff + "@example.invalid"},'staff','active')`;
        await tx`insert into public.volunteer_operation_outbox(id,dedup_key,kind,payload,available_at) values(${id}::uuid,${id},'volunteer_policy_reminder','{"max_attempts":2}','1900-01-01')`;
        let rows =
          await tx`select * from public.claim_volunteer_operation_outbox(1,clock_timestamp()-interval '1 second')`;
        expect(rows[0].id).toBe(id);
        expect(rows[0].attempts).toBe(1);
        rows =
          await tx`select * from public.claim_volunteer_operation_outbox(1,clock_timestamp()+interval '5 minutes')`;
        expect(rows[0].id).toBe(id);
        expect(rows[0].attempts).toBe(2);
        expect(
          (
            await tx`select public.settle_volunteer_operation_outbox(${id}::uuid,1,'provider_accepted',null,null,'old-worker') ok`
          )[0].ok,
        ).toBe(false);
        expect(
          (
            await tx`select public.settle_volunteer_operation_outbox(${id}::uuid,2,'failed','synthetic provider failure','1900-01-01',null) ok`
          )[0].ok,
        ).toBe(true);
        rows =
          await tx`select * from public.claim_volunteer_operation_outbox(1,clock_timestamp()+interval '5 minutes')`;
        expect(rows.some((row: { id: string }) => row.id === id)).toBe(false);
        expect(
          (
            await tx`select public.volunteer_task_command(${staff}::uuid,${JSON.stringify({ action: "retry", id })}::jsonb) result`
          )[0].result.kind,
        ).toBe("retried");
        await tx`update public.volunteer_operation_outbox set available_at='1900-01-01' where id=${id}::uuid`;
        rows =
          await tx`select * from public.claim_volunteer_operation_outbox(1,clock_timestamp()+interval '5 minutes')`;
        expect(rows[0].attempts).toBe(3);
        expect(
          (
            await tx`select public.settle_volunteer_operation_outbox(${id}::uuid,3,'provider_accepted',null,null,'new-worker') ok`
          )[0].ok,
        ).toBe(true);
        expect(
          (
            await tx`select status,payload->>'providerMessageId' provider from public.volunteer_operation_outbox where id=${id}::uuid`
          )[0],
        ).toEqual({ status: "provider_accepted", provider: "new-worker" });
        const expired = crypto.randomUUID();
        await tx`insert into public.volunteer_operation_outbox(id,dedup_key,kind,payload,available_at) values(${expired}::uuid,${expired},'volunteer_policy_reminder','{"max_attempts":1}','1900-01-01')`;
        rows =
          await tx`select * from public.claim_volunteer_operation_outbox(1,clock_timestamp()-interval '1 second')`;
        expect(rows[0].id).toBe(expired);
        rows =
          await tx`select * from public.claim_volunteer_operation_outbox(1,clock_timestamp()+interval '5 minutes')`;
        expect(rows.some((row: { id: string }) => row.id === expired)).toBe(false);
        expect(
          (
            await tx`select status,claimed_until,last_error from public.volunteer_operation_outbox where id=${expired}::uuid`
          )[0],
        ).toMatchObject({
          status: "failed",
          claimed_until: null,
          last_error: "notification_attempts_exhausted",
        });
        const deferred = crypto.randomUUID();
        await tx`insert into public.volunteer_operation_outbox(id,dedup_key,kind,payload,available_at) values(${deferred}::uuid,${deferred},'volunteer_policy_reminder','{"max_attempts":1}','1900-01-01')`;
        rows =
          await tx`select * from public.claim_volunteer_operation_outbox(1,clock_timestamp()+interval '5 minutes')`;
        expect(rows[0].id).toBe(deferred);
        expect(
          (
            await tx`select public.settle_volunteer_operation_outbox(${deferred}::uuid,1,'queued','dry_run_no_provider_delivery','1900-01-01',null) ok`
          )[0].ok,
        ).toBe(true);
        rows =
          await tx`select * from public.claim_volunteer_operation_outbox(1,clock_timestamp()+interval '5 minutes')`;
        expect(rows.some((row: { id: string }) => row.id === deferred)).toBe(false);
        expect(
          (
            await tx`select status,last_error from public.volunteer_operation_outbox where id=${deferred}::uuid`
          )[0],
        ).toMatchObject({ status: "failed", last_error: "notification_attempts_exhausted" });
        expect(
          (
            await tx`select public.volunteer_task_command(${staff}::uuid,${JSON.stringify({ action: "retry", id: expired })}::jsonb) result`
          )[0].result.kind,
        ).toBe("retried");
        await tx`insert into public.volunteer_operation_outbox(id,dedup_key,kind,payload) values(${task}::uuid,${task},'volunteer_operation_changed','{}')`;
        const cmd = { action: "complete", id: task, reason: "Synthetic staff follow-up recorded" };
        let denied = false;
        try {
          await tx.savepoint(async (sp) => {
            await sp`select public.volunteer_task_command(${ordinary}::uuid,${JSON.stringify(cmd)}::jsonb)`;
          });
        } catch {
          denied = true;
        }
        expect(denied).toBe(true);
        for (let i = 0; i < 2; i++)
          expect(
            (
              await tx`select public.volunteer_task_command(${staff}::uuid,${JSON.stringify(cmd)}::jsonb) result`
            )[0].result.kind,
          ).toBe("completed");
        expect(
          (
            await tx`select count(*)::int n from public.volunteer_task_completion where outbox_id=${task}::uuid`
          )[0].n,
        ).toBe(1);
        expect(
          (await tx`select status from public.volunteer_operation_outbox where id=${task}::uuid`)[0]
            .status,
        ).toBe("queued");
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
