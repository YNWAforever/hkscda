import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "./catalogue";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).port !== "56322" ||
    new URL(url).pathname !== "/postgres")
)
  throw new Error("Dedicated disposable database required");
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "VOL12 current terms gate approval, explicit reconsent preserves original fact, disabled waitlist and suspended cancellation",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false }),
      admin = crypto.randomUUID(),
      actor = crypto.randomUUID(),
      version = crypto.randomUUID(),
      activity = crypto.randomUUID(),
      profile = crypto.randomUUID(),
      terms = crypto.randomUUID(),
      version2 = crypto.randomUUID();
    const command = async (body: object) =>
      (
        await db`select public.volunteer_booking_command(${actor}::uuid,${JSON.stringify(body)}::jsonb) result`
      )[0].result;
    const rejected = async (fn: () => Promise<unknown>) => {
      let failed = false;
      try {
        await fn();
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    };
    try {
      for (const id of [admin, actor])
        await db`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${admin}::uuid,${admin + "@example.invalid"},'admin','active')`;
      await db`insert into public.volunteer_profile(id,auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${profile}::uuid,${actor}::uuid,'Synthetic terms volunteer','1990-01-01','regular','active',${admin}::uuid,now())`;
      const body = structuredClone(initialPolicyCatalogue[0]);
      body.template_key = "terms-" + version;
      body.booking.auto_approve = false;
      body.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
      await db`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason) values(${version}::uuid,${body.template_key},${JSON.stringify(body)}::jsonb,'synthetic',now(),${admin}::uuid,'Synthetic terms acceptance')`;
      await db`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status,policy_version_id,template_key,shelter_key) values(${activity}::uuid,'volunteer_shift','Synthetic terms session',now()+interval '25 days',now()+interval '25 days 4 hours','Synthetic shelter',5,'published',${version}::uuid,${body.template_key},'cat')`;
      const booked = await command({
        action: "book",
        activity_id: activity,
        role: "volunteer",
        accept_terms: true,
        terms_version_id: "c9c6278a-c73a-4f0c-9b93-6e2b4089141a",
        remarks: "",
        idempotency_key: crypto.randomUUID(),
      });
      expect(booked.status).toBe("pending");
      const registration = (
        await db`select *,updated_at::text as updated_at from public.volunteer_registration where id=${booked.registration_id}::uuid`
      )[0];
      await rejected(
        () =>
          db`update public.volunteer_registration set status='waitlisted' where id=${registration.id}::uuid`,
      );
      await db`insert into public.volunteer_terms_version(id,body,content_hash,published_at,published_by) values(${terms}::uuid,'Synthetic changed terms','synthetic-hash','2000-01-01'::timestamptz,${admin}::uuid)`;
      body.terms = { version_id: terms, reconsent: "require_current" };
      await db`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason) values(${version2}::uuid,${body.template_key},${JSON.stringify(body)}::jsonb,'synthetic2',now(),${admin}::uuid,'Synthetic current terms policy')`;
      await db.begin(async (tx) => {
        await tx`select set_config('hkscda.policy_command','apply',true)`;
        await tx`update public.volunteer_activity set policy_version_id=${version2}::uuid,policy_revision=policy_revision+1 where id=${activity}::uuid`;
      });
      const approve = async () =>
        db`select public.set_volunteer_registration_status_with_audit(${registration.id}::uuid,${admin}::uuid,${registration.updated_at}::timestamptz,'approved')`;
      await rejected(approve);
      expect(
        (
          await db`select public.record_volunteer_promotion_review(${admin}::uuid,${registration.id}::uuid,'current_terms_required') queued`
        )[0].queued,
      ).toBe(true);
      expect(
        (
          await db`select public.record_volunteer_promotion_review(${admin}::uuid,${registration.id}::uuid,'current_terms_required') queued`
        )[0].queued,
      ).toBe(false);
      expect(
        (
          await db`select count(*)::int n from public.volunteer_operation_outbox where dedup_key like ${"promotion_review:" + registration.id + ":%"} and kind='volunteer_qualification_review'`
        )[0].n,
      ).toBe(1);
      expect(
        (
          await db`select count(*)::int n from public.audit_log where entity_id=${registration.id} and action='volunteer_registration.promotion_review_required'`
        )[0].n,
      ).toBe(1);

      expect(
        (
          await db`select status from public.volunteer_registration where id=${registration.id}::uuid`
        )[0].status,
      ).toBe("pending");
      expect(
        (
          await command({
            action: "accept_terms",
            activity_id: activity,
            accept_terms: true,
            terms_version_id: crypto.randomUUID(),
            idempotency_key: crypto.randomUUID(),
          })
        ).reason,
      ).toBe("terms_version_changed");
      const consent = {
        action: "accept_terms",
        activity_id: activity,
        accept_terms: true,
        terms_version_id: terms,
        idempotency_key: crypto.randomUUID(),
      };
      expect((await command(consent)).kind).toBe("accepted");
      expect((await command(consent)).kind).toBe("accepted");
      expect(
        (
          await db`select count(*)::int n from public.volunteer_terms_acceptance where profile_id=${profile}::uuid`
        )[0].n,
      ).toBe(2);
      expect(
        (
          await db`select terms_acceptance_id from public.volunteer_registration where id=${registration.id}::uuid`
        )[0].terms_acceptance_id,
      ).toBe(registration.terms_acceptance_id);
      await approve();
      await db`select public.volunteer_profile_command(${admin}::uuid,${JSON.stringify({ action: "suspend", profile_id: profile, expected_revision: 1, reason: "Synthetic suspended future signup" })}::jsonb)`;
      expect(
        (
          await command({
            action: "cancel",
            activity_id: activity,
            idempotency_key: crypto.randomUUID(),
          })
        ).kind,
      ).toBe("cancelled");
      expect(
        (
          await db`select status from public.volunteer_registration where id=${registration.id}::uuid`
        )[0].status,
      ).toBe("cancelled");
    } finally {
      await db.close();
    }
  },
  30000,
);
