import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "./catalogue";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url) {
  const u = new URL(url);
  if (
    u.hostname !== "127.0.0.1" ||
    u.port !== "56322" ||
    u.pathname !== "/postgres" ||
    u.search ||
    u.hash
  )
    throw new Error("Dedicated isolated56322 required");
}
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "cat included-leader reservation and maximum count one seat per person",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    let completed = false;
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID(),
          activity = crypto.randomUUID(),
          version = crypto.randomUUID();
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        const body = structuredClone(
          initialPolicyCatalogue.find((p) => p.template_key === "cat-cleaning-a")!,
        );
        body.schedule.start_time = "09:00";
        body.schedule.end_time = "12:00";
        body.booking.individual_open = { mode: "unrestricted" };
        body.booking.group_open = { mode: "disabled" };
        body.booking.group_close = { mode: "disabled" };
        body.release_rules = [];
        body.capacity.role_count_model = "leader_in_assistants";
        body.booking.auto_approve = true;
        body.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
        await tx`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason) values(${version}::uuid,${body.template_key},${JSON.stringify(body)}::jsonb,'synthetic',now(),${actor}::uuid,'Synthetic included leader')`;
        await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status,policy_version_id,shelter_key,group_headcount) values(${activity}::uuid,'volunteer_shift','Synthetic included leader',now()+interval '30000 days',now()+interval '30000 days 3 hours','Synthetic',25,'published',${version}::uuid,'cat',10)`;
        const book = async (tier: string, role: string) => {
          const id = crypto.randomUUID();
          await tx`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
          await tx`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${id}::uuid,'Synthetic','1990-01-01',${tier},'active',${actor}::uuid,now())`;
          return (
            await tx`select public.volunteer_booking_command(${id}::uuid,${JSON.stringify({ action: "book", activity_id: activity, role, remarks: "", accept_terms: true, terms_version_id: "c9c6278a-c73a-4f0c-9b93-6e2b4089141a", idempotency_key: crypto.randomUUID() })}::jsonb) as result`
          )[0].result;
        };
        for (let i = 0; i < 9; i++)
          expect((await book("regular", "assistant")).kind).toBe("booked");
        expect((await book("regular", "assistant")).reason).toBe("role_full");
        expect((await book("senior", "leader")).kind).toBe("booked");
        expect((await book("regular", "assistant")).reason).toBe("role_full");
        expect((await book("newcomer", "volunteer")).kind).toBe("booked");
        completed = true;
        throw new Error("rollback included leader fixture");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "rollback included leader fixture")
        throw error;
    } finally {
      await db.close({ timeout: 1 });
    }
    expect(completed).toBe(true);
  },
);
