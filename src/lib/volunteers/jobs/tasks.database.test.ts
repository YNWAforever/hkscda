import { expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";

const allowed =
  process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1" &&
  process.env.VOLUNTEER_TEST_DATABASE_URL ===
    "postgresql://postgres:postgres@127.0.0.1:56322/postgres";
test.skipIf(!allowed)(
  "real pending RPC classifies overdue/equal/future and paginates one snapshot (UC02/03/28)",
  async () => {
    const db = new SQL(process.env.VOLUNTEER_TEST_DATABASE_URL!, { max: 1 });
    const rollback = new Error("AUDIT fixture rollback");
    try {
      await db.begin(async (tx) => {
        const actor = randomUUID();
        // Historical rows obey the live policy trigger without inventing an approved future policy.
        // The snapshot clock is independently fixed, so before/equal/after still exercise the contract.
        const asOf = "2000-01-02T00:00:00Z";
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        const read = async (scope: string, pageSize = 100) =>
          (
            await tx`select public.volunteer_pending_snapshot(${actor}::uuid,${scope},1,${pageSize},${asOf}::timestamptz) snapshot`
          )[0].snapshot;
        const before = await read("all", 0);
        const registrations: string[] = [];
        for (const [starts, status] of [
          ["2000-01-01T00:00:00Z", "pending"],
          [asOf, "pending"],
          ["2000-01-03T00:00:00Z", "pending"],
          ["2000-01-03T00:00:00Z", "approved"],
        ]) {
          const activity = randomUUID(),
            id = randomUUID();
          registrations.push(id);
          await tx`insert into public.volunteer_activity(id,type,title,starts_at,location,capacity,status) values(${activity}::uuid,'volunteer_shift','AUDIT pending',${starts}::timestamptz,'AUDIT',10,'draft')`;
          await tx`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at) values(${id}::uuid,${activity}::uuid,'individual',${status},1,'AUDIT','audit@example.invalid','00000000',${randomUUID()},now()+interval '1 day')`;
        }
        const after = await read("all", 0);
        const legacy = (
          await tx`select public.volunteer_task_command(${actor}::uuid,'{"action":"list"}'::jsonb) snapshot`
        )[0].snapshot;
        expect(legacy.pending.map((r: { id: string }) => r.id)).not.toContain(registrations[0]);
        expect(after.counts.upcoming - before.counts.upcoming).toBe(1);
        expect(after.counts.overdue - before.counts.overdue).toBe(2);
        expect(after.counts.total - before.counts.total).toBe(3);
        const overdue = await read("overdue");
        expect(overdue.registrations.map((r: { id: string }) => r.id)).toContain(registrations[0]);
        expect(overdue.registrations.map((r: { id: string }) => r.id)).toContain(registrations[1]);
        expect(overdue.registrations.map((r: { id: string }) => r.id)).not.toContain(
          registrations[2],
        );
        expect((await read("all", 1)).registrations).toHaveLength(1);
        expect((await read("all", 0)).registrations).toEqual([]);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);
