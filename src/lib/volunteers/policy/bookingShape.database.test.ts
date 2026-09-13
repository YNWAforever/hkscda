import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "./catalogue";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "56322" ||
    target.pathname !== "/postgres" ||
    target.search ||
    target.hash
  )
    throw Error("Dedicated isolated database required");
}
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "policy booking shape cannot inflate a verified person beyond capacity through a raw update",
  async () => {
    const db = new SQL(url!, { max: 1 });
    const actor = crypto.randomUUID(),
      profile = crypto.randomUUID(),
      version = crypto.randomUUID(),
      activity = crypto.randomUUID();
    try {
      await db`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      await db`insert into public.volunteer_profile(id,auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${profile}::uuid,${actor}::uuid,'Synthetic shape','1990-01-01','regular','active',${actor}::uuid,now())`;
      const body = structuredClone(initialPolicyCatalogue[0]);
      body.template_key = "shape-" + version;
      body.booking.auto_approve = true;
      body.capacity.volunteers = { state: "value", value: 1 };
      body.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
      await db`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason) values(${version}::uuid,${body.template_key},${body}::jsonb,'shape',now(),${actor}::uuid,'Synthetic shape test')`;
      await db`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status,policy_version_id,template_key,shelter_key) values(${activity}::uuid,'volunteer_shift','Synthetic shape',now()+interval '25 days',now()+interval '25 days 4 hours','Synthetic',1,'published',${version}::uuid,${body.template_key},'cat')`;
      const command = {
        action: "book",
        activity_id: activity,
        role: "volunteer",
        accept_terms: true,
        terms_version_id: body.terms.version_id,
        idempotency_key: crypto.randomUUID(),
        remarks: "",
      };
      const booked = (
        await db`select public.volunteer_booking_command(${actor}::uuid,${command}::jsonb) result`
      )[0].result;
      expect(booked.status).toBe("approved");
      let rejected = false;
      try {
        await db.begin(async (tx) => {
          await tx`update public.volunteer_registration set participant_count=2 where id=${booked.registration_id}::uuid`;
          throw Error("rollback successful bypass");
        });
      } catch (error) {
        rejected = String(error).includes("immutable_policy_booking_shape");
      }
      expect(rejected).toBe(true);
      expect(
        (
          await db`select participant_count from public.volunteer_registration where id=${booked.registration_id}::uuid`
        )[0].participant_count,
      ).toBe(1);
      let scopeRejected = false;
      try {
        await db.begin(async (tx) => {
          await tx`update public.volunteer_activity set shelter_key='dog' where id=${activity}::uuid`;
          throw Error("rollback successful scope bypass");
        });
      } catch (error) {
        scopeRejected = String(error).includes("policy_identity_requires_review");
      }
      expect(scopeRejected).toBe(true);
      expect(
        (await db`select shelter_key from public.volunteer_activity where id=${activity}::uuid`)[0]
          .shelter_key,
      ).toBe("cat");
    } finally {
      await db.close();
    }
  },
);
