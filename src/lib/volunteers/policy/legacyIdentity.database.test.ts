import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "./catalogue";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url && (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "56322"))
  throw new Error("Disposable database required");
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "legacy identity linkage preserves submitted facts and requires authoritative policy and personal current consent",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const admin = crypto.randomUUID(),
      actor = crypto.randomUUID(),
      profile = crypto.randomUUID(),
      activity = crypto.randomUUID(),
      registration = crypto.randomUUID(),
      version = crypto.randomUUID();
    const rejected = async (fn: () => Promise<unknown>) => {
      let failure = false;
      try {
        await fn();
      } catch {
        failure = true;
      }
      expect(failure).toBe(true);
    };
    try {
      for (const id of [admin, actor])
        await db`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${admin}::uuid,${admin + "@example.invalid"},'staff','active')`;
      await db`insert into public.volunteer_profile(id,auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${profile}::uuid,${actor}::uuid,'Synthetic verified legacy person','1990-01-01','regular','active',${admin}::uuid,now())`;
      await db`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status) values(${activity}::uuid,'volunteer_shift','Synthetic legacy reconciliation',now()-interval '2 days',now()-interval '1 day','Synthetic',5,'published')`;
      await db`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,language,notes,status_token_hash,status_token_expires_at) values(${registration}::uuid,${activity}::uuid,'individual','pending',1,'Original submitted name','legacy@example.invalid','','zh-HK','Original submitted remark',${registration},now()+interval '90 days')`;
      await db`update public.volunteer_activity set starts_at=now()+interval '25 days',ends_at=now()+interval '25 days 4 hours' where id=${activity}::uuid`;
      await rejected(
        () =>
          db`update public.volunteer_registration set status='approved' where id=${registration}::uuid`,
      );
      const before = (
        await db`select *,updated_at::text as updated_at from public.volunteer_registration where id=${registration}::uuid`
      )[0];
      const link = {
        action: "link_legacy",
        registration_id: registration,
        profile_id: profile,
        expected_updated_at: before.updated_at,
        reason: "Synthetic proof of original identity",
      };
      await rejected(
        () =>
          db`select public.volunteer_legacy_identity_command(${actor}::uuid,${JSON.stringify(link)}::jsonb)`,
      );
      for (let i = 0; i < 2; i++)
        expect(
          (
            await db`select public.volunteer_legacy_identity_command(${admin}::uuid,${JSON.stringify(link)}::jsonb) result`
          )[0].result.kind,
        ).toBe("linked");
      const body = structuredClone(initialPolicyCatalogue[0]);
      body.template_key = "legacy-" + version;
      body.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
      await db`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason) values(${version}::uuid,${body.template_key},${JSON.stringify(body)}::jsonb,'synthetic',now(),${admin}::uuid,'Synthetic adoption of legacy session')`;
      await db`update public.volunteer_activity set policy_version_id=${version}::uuid,template_key=${body.template_key},shelter_key='cat' where id=${activity}::uuid`;
      await rejected(
        () =>
          db`update public.volunteer_registration set status='approved' where id=${registration}::uuid`,
      );
      const accept = {
        action: "accept_terms",
        activity_id: activity,
        accept_terms: true,
        terms_version_id: body.terms.version_id,
        idempotency_key: crypto.randomUUID(),
      };
      expect(
        (
          await db`select public.volunteer_booking_command(${actor}::uuid,${JSON.stringify(accept)}::jsonb) result`
        )[0].result.kind,
      ).toBe("accepted");
      await db`update public.volunteer_registration set status='approved' where id=${registration}::uuid`;
      const after = (
        await db`select * from public.volunteer_registration where id=${registration}::uuid`
      )[0];
      const summary = (
        await db`select public.volunteer_public_session_summary(array[${activity}::uuid]) result`
      )[0].result[activity];
      expect(summary.confirmed).toBe(1);
      expect(summary.remaining).toBe(4);
      expect(Object.keys(summary).sort()).toEqual(
        [
          "confirmed",
          "waitlisted",
          "remaining",
          "window_state",
          "opens_at",
          "closes_at",
          "next_transition_at",
          "timezone",
        ].sort(),
      );
      expect(after.profile_id).toBe(profile);
      expect(after.contact_name).toBe(before.contact_name);
      expect(after.notes).toBe(before.notes);
      expect(after.booking_policy_version_id).toBeNull();
      expect(after.terms_acceptance_id).toBeNull();
      expect(
        (
          await db`select count(*)::int n from public.volunteer_legacy_identity_link where registration_id=${registration}::uuid`
        )[0].n,
      ).toBe(1);
      await rejected(
        () =>
          db`update public.volunteer_legacy_identity_link set reason='overwrite' where registration_id=${registration}::uuid`,
      );
      await rejected(
        () =>
          db`update public.volunteer_registration set profile_id=null where id=${registration}::uuid`,
      );
    } finally {
      await db.close();
    }
  },
  30000,
);
