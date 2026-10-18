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

test.skipIf(!allowed)(
  "pending work snapshot hydrates only a page, searches literally and preserves legacy counts",
  async () => {
    const db = new SQL(process.env.VOLUNTEER_TEST_DATABASE_URL!, { max: 1, prepare: false });
    const rollback = new Error("owned pending work rollback");
    try {
      await db.begin(async (tx) => {
        const actor = randomUUID(),
          first = randomUUID(),
          second = randomUUID(),
          approved = randomUUID();
        const activity = randomUUID(),
          otherActivity = randomUUID(),
          tag = `DW-${randomUUID()}`;
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        const read = (page: number, size: number, q: string) =>
          tx`select public.volunteer_pending_work_snapshot(${actor}::uuid,'all',${page},${size},'2026-10-16T00:00:00Z'::timestamptz,${q}) snapshot`.then(
            (rows) => rows[0].snapshot,
          );
        const legacyBefore = (
          await tx`select public.volunteer_pending_snapshot(${actor}::uuid,'all',1,0,'2026-10-16T00:00:00Z'::timestamptz) snapshot`
        )[0].snapshot;
        for (const [id, location] of [
          [activity, "Synthetic 50%_"],
          [otherActivity, "Synthetic 50XY"],
        ])
          await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status) values(${id}::uuid,'volunteer_shift',${tag},'2000-01-01','2000-01-02',${location},10,'draft')`;
        for (const [id, session, status, participants] of [
          [first, activity, "pending", 2],
          [second, otherActivity, "pending", 1],
          [approved, activity, "approved", 9],
        ] as const)
          await tx`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at)
          values(${id}::uuid,${session}::uuid,'group',${status},${participants},${tag + " Same name"},'synthetic@example.invalid','00000000',${randomUUID()},now()+interval '1 day')`;
        const literal = await read(1, 25, "50%_");
        expect(literal.registrations.map((r: { id: string }) => r.id)).toEqual([first]);
        expect(literal.registrations[0]).toMatchObject({
          participant_count: 2,
          capacity: 10,
          approved_participants: 9,
          remaining_capacity: 1,
          location: "Synthetic 50%_",
        });
        const page1 = await read(1, 1, tag),
          page2 = await read(2, 1, tag);
        expect(page1.filteredTotal).toBe(2);
        expect(page2.registrations).toHaveLength(1);
        expect(page1.registrations[0].id).not.toBe(page2.registrations[0].id);
        expect(page1.counts.total).toBe(legacyBefore.counts.total + 2);
        const zero = await read(1, 0, tag);
        expect(zero.registrations).toEqual([]);
        expect(zero.filteredTotal).toBe(2);
        const legacyAfter = (
          await tx`select public.volunteer_pending_snapshot(${actor}::uuid,'all',1,0,'2026-10-16T00:00:00Z'::timestamptz) snapshot`
        )[0].snapshot;
        expect(legacyAfter.counts).toEqual(page1.counts);
        const grants = (
          await tx`select has_function_privilege('anon','public.volunteer_pending_work_snapshot(uuid,text,integer,integer,timestamptz,text)','execute') anonymous,has_function_privilege('authenticated','public.volunteer_pending_work_snapshot(uuid,text,integer,integer,timestamptz,text)','execute') authenticated`
        )[0];
        expect(grants.anonymous).toBe(false);
        expect(grants.authenticated).toBe(false);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);
