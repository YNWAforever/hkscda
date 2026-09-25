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
      "Volunteer public registration tests require the isolated 127.0.0.1:56322/postgres database",
    );
  }
}
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "public registration retry returns one row and rejects changed payload",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const activityId = crypto.randomUUID();
    const tokenHash = "a".repeat(64);
    let conflict: unknown = null;
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.volunteer_activity
        (id,type,title,starts_at,ends_at,location,capacity,status,auto_approve)
        values (${activityId}::uuid,'volunteer_shift','Synthetic retry test',
          now()-interval '2 days',now()-interval '2 days'+interval '2 hours',
          'Isolated test',1,'published',true)`;

        const submit = async (name: string) =>
          (
            await tx`select public.create_volunteer_registration_idempotent(
          ${activityId}::uuid,null::uuid,'individual',1,${name},'volunteer@example.invalid',
          '91234567','zh-HK',null::text,21,null::integer,null::text,null::text,
          null::text,${tokenHash},now()+interval '30 days',false,false
        ) as result`
          )[0].result as {
            created: boolean;
            registration: { id: string; status: string };
          };

        const first = await submit("Ada");
        const retry = await submit("Ada");
        expect(first.created).toBe(true);
        expect(retry.created).toBe(false);
        expect(retry.registration.id).toBe(first.registration.id);
        expect(first.registration.status).toBe("pending");
        expect(
          (
            await tx`select count(*)::int as count from public.volunteer_registration
        where activity_id=${activityId}::uuid`
          )[0].count,
        ).toBe(1);

        await submit("Different person");
        throw new Error("Changed payload was accepted");
      });
    } catch (error) {
      conflict = error;
    } finally {
      await db.close();
    }
    expect(String(conflict)).toContain("volunteer_submission_token_conflict");
  },
);

test.skipIf(!enabled)(
  "a new token cannot consume a second active place for one supporter",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const activityId = crypto.randomUUID();
    const supporterId = crypto.randomUUID();
    let conflict: unknown = null;
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.supporter(id,name,email,source)
        values(${supporterId}::uuid,'Synthetic volunteer',${supporterId + "@example.invalid"},'volunteer_registration_form')`;
        await tx`insert into public.volunteer_activity
        (id,type,title,starts_at,ends_at,location,capacity,status,auto_approve)
        values (${activityId}::uuid,'volunteer_shift','Synthetic duplicate test',
          now()-interval '2 days',now()-interval '2 days'+interval '2 hours',
          'Isolated test',1,'published',true)`;
        const submit = async (tokenHash: string) =>
          (
            await tx`select public.create_volunteer_registration_idempotent(
          ${activityId}::uuid,${supporterId}::uuid,'individual',1,'Ada',
          ${supporterId + "@example.invalid"},'91234567','zh-HK',
          null::text,21,null::integer,null::text,null::text,null::text,
          ${tokenHash},now()+interval '30 days',false,false
        ) as result`
          )[0].result;
        await submit("b".repeat(64));
        expect(
          (
            await tx`select count(*)::int as count from public.volunteer_registration
        where activity_id=${activityId}::uuid`
          )[0].count,
        ).toBe(1);
        await submit("c".repeat(64));
        throw new Error("Second active registration was accepted");
      });
    } catch (error) {
      conflict = error;
    } finally {
      await db.close();
    }
    expect(String(conflict)).toContain("volunteer_duplicate_active_registration");
  },
);
