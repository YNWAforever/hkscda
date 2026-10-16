import { SQL } from "bun";
import { expect, test } from "bun:test";
import { attendanceActionCapabilities } from "../actionEligibility";
const connection = process.env.VOLUNTEER_TEST_DATABASE_URL;
const enabled = process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1" && Boolean(connection);
if (connection) {
  const target = new URL(connection);
  if (target.hostname !== "127.0.0.1" || target.port !== "56322")
    throw new Error("Dedicated owned attendance DB required");
}

test.skipIf(!enabled)(
  "roster server capability marker and actions agree with the authoritative RPC",
  async () => {
    const db = new SQL(connection!, { max: 1, prepare: false });
    const rollback = new Error("owned attendance parity rollback");
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID();
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        for (const [status, attendance, activityStatus, future] of [
          ["approved", "not_marked", "published", false],
          ["waitlisted", "not_marked", "published", false],
          ["cancelled", "not_marked", "published", false],
          ["approved", "attended", "published", false],
          ["approved", "no_show", "published", false],
          ["approved", "not_marked", "cancelled", false],
          ["approved", "not_marked", "published", true],
        ] as const) {
          const activity = crypto.randomUUID(),
            registration = crypto.randomUUID();
          await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status)
        values(${activity}::uuid,'volunteer_shift','Synthetic DW parity',now()-interval '2 hours',now()-interval '1 hour','Synthetic',100,'published')`;
          await tx`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at)
        values(${registration}::uuid,${activity}::uuid,'individual',${status},1,'Synthetic','synthetic@example.invalid','00000000',${crypto.randomUUID()},now()+interval '1 day')`;
          if (attendance !== "not_marked") {
            const stamp = (
              await tx`select to_jsonb(updated_at)#>>'{}' stamp from public.volunteer_registration where id=${registration}::uuid`
            )[0].stamp;
            expect(
              (
                await tx`select public.set_volunteer_attendance_with_audit(${registration}::uuid,${actor}::uuid,${stamp}::timestamptz,${attendance},'record') result`
              )[0].result.kind,
            ).toBe("updated");
          }
          if (future)
            await tx`update public.volunteer_activity set starts_at=now()+interval '2 days',ends_at=now()+interval '2 days 1 hour' where id=${activity}::uuid`;
          if (activityStatus === "cancelled")
            await tx`update public.volunteer_activity set status='cancelled' where id=${activity}::uuid`;
          const detail = (
            await tx`select public.volunteer_bulk_command(${actor}::uuid,${JSON.stringify({ action: "detail", activity_id: activity, page: 1, history_page: 1 })}::jsonb) result`
          )[0].result;
          expect(detail.attendance_contract).toBe(1);
          expect(detail.registrations[0].participant_count).toBe(1);
          const row = detail.registrations[0];
          const actions = attendanceActionCapabilities(
            {
              ...row,
              starts_at: detail.activity.starts_at,
              ends_at: detail.activity.ends_at,
              activity_status: detail.activity.status,
            },
            () => new Date(detail.asOf),
          );
          for (const action of actions) {
            if (action.attendance_status === row.attendance_status) continue;
            let result: { kind: string } | undefined;
            const probeRollback = new Error("probe rollback");
            try {
              await tx.savepoint(async (probe) => {
                result = (
                  await probe`select public.set_volunteer_attendance_with_audit(${registration}::uuid,${actor}::uuid,${row.updated_at}::timestamptz,${action.attendance_status},${action.command},${action.command === "correct" ? "Synthetic parity correction" : null}) result`
                )[0].result;
                throw probeRollback;
              });
            } catch (error) {
              if (error !== probeRollback) throw error;
            }
            expect(
              action.allowed,
              `${status}/${attendance}/${activityStatus}/${future}/${action.command}/${action.attendance_status}`,
            ).toBe(result?.kind === "updated");
          }
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);
