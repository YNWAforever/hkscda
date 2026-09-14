import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "./catalogue";
import type { PolicyDraft } from "./schemas";
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
    throw Error("Dedicated isolated56322 required");
}
const enabled = !!url && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
const uuid = () => crypto.randomUUID();
type Result = Record<string, unknown>;
test.skipIf(!enabled)(
  "member cancellation boundaries, five waitlists, destination consent, rollback and exact future pages",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const admin = uuid(),
      actors = Array.from({ length: 9 }, uuid),
      suffix = uuid().replaceAll("-", ""),
      terms = uuid();
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const pc = (command: object) =>
      db`select public.volunteer_policy_command(${admin}::uuid,${JSON.stringify(command)}::jsonb) r`.then(
        (r) => r[0].r as Result,
      );
    const book = (actor: string, activity: string, action = "book", extra: object = {}) =>
      db`select public.volunteer_booking_command(${actor}::uuid,${JSON.stringify({ action, activity_id: activity, role: "volunteer", remarks: "Synthetic release acceptance", accept_terms: true, terms_version_id: "c9c6278a-c73a-4f0c-9b93-6e2b4089141a", idempotency_key: uuid(), ...extra })}::jsonb) r`.then(
        (r) => r[0].r as Result,
      );
    const op = (actor: string, command: object) =>
      db`select public.volunteer_operation_command(${actor}::uuid,${JSON.stringify(command)}::jsonb) r`.then(
        (r) => r[0].r as Result,
      );
    let serial = 0;
    const publish = async (change: (p: PolicyDraft) => void = () => {}) => {
      const p = structuredClone(
        initialPolicyCatalogue.find((p) => p.template_key === "adoption-driver")!,
      );
      p.template_key = `member-${serial++}-${suffix}`;
      p.name = "Synthetic member acceptance";
      p.shelter = `member-${suffix}`;
      p.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
      p.schedule.start_time = "09:00";
      p.schedule.end_time = "12:00";
      p.schedule.location = "Synthetic shelter";
      p.capacity.volunteers = { state: "value", value: 10 };
      p.eligibility.allowed_tiers = ["newcomer", "regular", "senior"];
      p.eligibility.credentials = { mode: "all", keys: [] };
      p.booking.auto_approve = true;
      p.terms = {
        version_id: "c9c6278a-c73a-4f0c-9b93-6e2b4089141a",
        reconsent: "require_current",
      };
      p.source = "Synthetic isolated operations-release acceptance; not an operating policy";
      change(p);
      expect(
        (await pc({ action: "save", template_key: p.template_key, expected_revision: 0, body: p }))
          .kind,
      ).toBe("saved");
      const preview = await pc({
        action: "preview",
        template_key: p.template_key,
        expected_revision: 1,
        effective_from: `${day(29)}T00:00:00Z`,
        effective_until: null,
        activity_ids: [],
      });
      if (preview.kind !== "preview") throw Error(JSON.stringify(preview));
      expect(preview.kind).toBe("preview");
      expect(
        (
          await pc({
            action: "publish",
            preview_id: preview.preview_id,
            idempotency_key: uuid(),
            reason: "Synthetic release fixture",
          })
        ).kind,
      ).toBe("published");
      return p.template_key;
    };
    const generate = async (template_key: string, offset = 30) => {
      const result = await pc({
        action: "generate",
        template_key,
        date: day(offset),
        idempotency_key: uuid(),
      });
      expect(result.kind).toBe("generated");
      return String(result.activity_id);
    };
    try {
      for (const id of [admin, ...actors])
        await db`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
      await db`insert into public.admin_user(auth_user_id,email,role) values(${admin}::uuid,${admin + "@example.invalid"},'admin')`;
      await db`insert into public.volunteer_shelter_definition(key,label,timezone,location) values(${`member-${suffix}`},'Synthetic isolated member shelter','Asia/Hong_Kong','Synthetic fixture')`;
      for (let i = 0; i < actors.length; i++)
        await db`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${actors[i]}::uuid,'Synthetic member','1990-01-01',${["newcomer", "regular", "senior"][i % 3]},'active',${admin}::uuid,now())`;
      await db`insert into public.volunteer_terms_version(id,body,content_hash,published_at) values(${terms}::uuid,'Synthetic destination terms',${terms},now())`;
      for (const [mode, expected] of [
        ["unrestricted", null],
        ["disabled", "cancellation_disabled"],
        ["hours_before", "cancellation_closed"],
      ] as const) {
        const template = await publish((p) => {
          p.booking.cancellation_close =
            mode === "hours_before" ? { mode, value: 100000 } : { mode };
        });
        const activity = await generate(template, 30 + serial);
        expect((await book(actors[0], activity)).kind).toBe("booked");
        const result = await book(actors[0], activity, "cancel");
        expect(expected ? result.reason : result.kind).toBe(expected ?? "cancelled");
      }
      const fixed = "2026-10-20T01:00:00Z";
      const boundary =
        await db`select public.volunteer_cancellation_reason('{"timezone":"Asia/Hong_Kong","booking":{"cancellation_close":{"mode":"hours_before","value":48}}}'::jsonb,${fixed}::timestamptz,${fixed}::timestamptz-interval '48 hours') exact, public.volunteer_cancellation_reason('{"timezone":"Asia/Hong_Kong","booking":{"cancellation_close":{"mode":"hours_before","value":48}}}'::jsonb,${fixed}::timestamptz,${fixed}::timestamptz-interval '48 hours 1 microsecond') before`;
      expect(boundary[0]).toMatchObject({ exact: "cancellation_closed", before: null });
      const reasons = [
        "capacity_full",
        "reserved_for_core_role",
        "role_full",
        "tier_quota_full",
        "daily_quota_full",
      ] as const;
      for (const reason of reasons) {
        const template = await publish((p) => {
          p.booking.allow_waitlist = true;
          p.booking.waitlist_limit = { state: "value", value: 1 };
          p.capacity.volunteers = {
            state: "value",
            value: reason === "capacity_full" ? 1 : reason === "reserved_for_core_role" ? 2 : 10,
          };
          const role = (key: string, reserved = 0) => ({
            key,
            label: key,
            minimum: 0,
            reserved,
            maximum: { state: "value" as const, value: 1 },
            allowed_tiers: ["newcomer", "regular", "senior"] as (
              | "newcomer"
              | "regular"
              | "senior"
            )[],
            credentials: { mode: "all" as const, keys: [] },
          });
          if (reason === "role_full") p.roles = [role("volunteer")];
          if (reason === "reserved_for_core_role")
            p.roles = [
              role("leader", 1),
              { ...role("volunteer"), maximum: { state: "unlimited" } },
            ];
          if (reason === "tier_quota_full")
            p.tier_quotas = [
              {
                key: "all",
                tiers: ["newcomer", "regular", "senior"],
                maximum: { state: "value", value: 1 },
                weekdays: [0, 1, 2, 3, 4, 5, 6],
              },
            ];
          if (reason === "daily_quota_full")
            p.daily_limits = [
              {
                key: `q-${suffix}`,
                tiers: ["newcomer", "regular", "senior"],
                maximum: { state: "value", value: 1 },
                scope: "shelter_day",
                count_mode: "distinct_people",
                include_group_visitors: false,
              },
            ];
        });
        const activity = await generate(template, 40 + serial);
        expect((await book(actors[3], activity)).status).toBe("approved");
        const availability = await book(actors[4], activity, "availability");
        expect(availability.reason).toBe(reason);
        expect(availability).toMatchObject({ reason, waitlist_allowed: true });
        expect((await book(actors[4], activity)).status).toBe("waitlisted");
        const full = await book(actors[5], activity, "availability");
        expect(full.waitlist_allowed).toBe(false);
        expect(full.waitlist_reason).toBe("waitlist_full");
        expect((await book(actors[5], activity)).reason).toBe("waitlist_full");
      }

      const queueTemplate = await publish((p) => {
        p.capacity.volunteers = { state: "value", value: 1 };
        p.booking.allow_waitlist = true;
        p.booking.waitlist_limit = { state: "value", value: 2 };
      });
      const queueActivity = await generate(queueTemplate, 57);
      expect((await book(actors[0], queueActivity)).status).toBe("approved");
      const first = await book(actors[1], queueActivity),
        second = await book(actors[2], queueActivity);
      expect(first.status).toBe("waitlisted");
      expect(second.status).toBe("waitlisted");
      const promote = async (id: unknown) => {
        const row = (
          await db`select updated_at::text from public.volunteer_registration where id=${id}::uuid`
        )[0];
        return (
          await db`select public.set_volunteer_registration_status_with_audit(${id}::uuid,${admin}::uuid,${row.updated_at}::timestamptz,'approved',null,false) r`
        )[0].r;
      };
      expect((await promote(first.registration_id)).kind).toBe("capacity_full");
      expect((await book(actors[0], queueActivity, "cancel")).kind).toBe("cancelled");
      let priorityDenied = false;
      try {
        await promote(second.registration_id);
      } catch (error) {
        priorityDenied = error instanceof Error && error.message.includes("waitlist_priority");
      }
      expect(priorityDenied).toBe(true);
      expect((await promote(first.registration_id)).kind).toBe("updated");
      expect((await book(actors[1], queueActivity, "cancel")).kind).toBe("cancelled");
      expect((await promote(second.registration_id)).kind).toBe("updated");
      const noQueue = await generate(
        await publish((p) => {
          p.capacity.volunteers = { state: "value", value: 1 };
        }),
        58,
      );
      expect((await book(actors[0], noQueue)).kind).toBe("booked");
      expect(await book(actors[1], noQueue, "availability")).toMatchObject({
        waitlist_allowed: false,
        waitlist_reason: "waitlist_disabled",
        reason: "capacity_full",
      });
      expect((await book(actors[1], noQueue)).kind).toBe("denied");
      const sourceTemplate = await publish(),
        destTemplate = await publish((p) => {
          p.terms.version_id = terms;
        });
      const source = await generate(sourceTemplate, 60),
        dest = await generate(destTemplate, 61);
      const booked = await book(actors[6], source);
      expect(booked.kind).toBe("booked");
      const row = (
        await db`select updated_at::text from public.volunteer_registration where id=${booked.registration_id}::uuid`
      )[0];
      const preview = await op(actors[6], {
        action: "move_preview",
        registration_id: booked.registration_id,
        expected_updated_at: row.updated_at,
        activity_id: dest,
        role: "volunteer",
      });
      if (preview.kind !== "preview") throw Error(JSON.stringify(preview));
      expect(preview.kind).toBe("preview");
      expect(preview.terms_version_id).toBe(terms);
      expect(preview.consent_required).toBe(true);
      expect(
        (
          await op(actors[6], {
            action: "move_apply",
            preview_id: preview.preview_id,
            idempotency_key: uuid(),
            reason: "Synthetic no consent",
          })
        ).reason,
      ).toBe("volunteer_terms_consent_required");
      expect(
        (
          await db`select activity_id from public.volunteer_registration where id=${booked.registration_id}::uuid`
        )[0].activity_id,
      ).toBe(source);
      const apply = {
        action: "move_apply",
        preview_id: preview.preview_id,
        idempotency_key: uuid(),
        reason: "Synthetic destination accepted",
        accept_terms: true,
        terms_version_id: terms,
        destination_policy_version_id: preview.destination_policy_version_id,
      };
      expect((await op(actors[6], { ...apply, terms_version_id: uuid() })).reason).toBe(
        "terms_version_changed",
      );
      const moved = await op(actors[6], apply);
      expect(moved.kind).toBe("applied");
      expect(await op(actors[6], apply)).toEqual(moved);
      expect(
        (
          await db`select count(*)::int n from public.volunteer_operation_event where entity_id=${booked.registration_id}::uuid and kind='move_apply' and after_fact->>'terms_version_id'=${terms}`
        )[0].n,
      ).toBe(1);
      expect((await book(actors[6], await generate(sourceTemplate, 61))).reason).toBe(
        "overlapping_duty",
      );
      const current = (
        await db`select updated_at::text from public.volunteer_registration where id=${booked.registration_id}::uuid`
      )[0];
      const completion = (
        await db`select public.set_volunteer_attendance_with_audit(${booked.registration_id}::uuid,${admin}::uuid,${current.updated_at}::timestamptz,'completed') r`
      )[0].r;
      expect(completion.kind).toBe("future_attendance");
      for (let i = 0; i < 27; i++)
        expect((await book(actors[8], await generate(sourceTemplate, 100 + i))).kind).toBe(
          "booked",
        );
      const page1 = (
        await db`select public.volunteer_member_registrations(${actors[8]}::uuid,1,1,25) r`
      )[0].r;
      const page2 = (
        await db`select public.volunteer_member_registrations(${actors[8]}::uuid,2,1,25) r`
      )[0].r;
      expect(page1.upcoming_total).toBe(27);
      expect(page1.registrations.length).toBe(25);
      expect(page2.registrations.length).toBe(2);
      expect(
        new Set([...page1.registrations, ...page2.registrations].map((r: { id: string }) => r.id))
          .size,
      ).toBe(27);

      const profileId = (
        await db`select id from public.volunteer_profile where auth_user_id=${actors[8]}::uuid`
      )[0].id;
      const pastIds =
        await db`insert into public.volunteer_activity(type,title,starts_at,ends_at,location,capacity,status)
       select 'volunteer_shift','Synthetic historical member record',now()-make_interval(days=>n+1),now()-make_interval(days=>n),'Synthetic history',10,'published' from generate_series(1,101) n returning id`;
      for (const past of pastIds)
        await db`insert into public.volunteer_registration(activity_id,profile_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,language,status_token_hash,status_token_expires_at)
       values(${past.id}::uuid,${profileId}::uuid,'individual','approved',1,'Synthetic history member','history@example.invalid','','zh-HK',${uuid()},now()+interval '90 days')`;
      const mixed = (
        await db`select public.volunteer_member_registrations(${actors[8]}::uuid,1,5,25) r`
      )[0].r;
      expect(mixed.upcoming_total).toBe(27);
      expect(mixed.history_total).toBe(101);
      expect(mixed.registrations.length).toBe(26);
      const pastRegistration = (
        await db`select id,updated_at::text from public.volunteer_registration where activity_id=${pastIds[0].id}::uuid and profile_id=${profileId}::uuid`
      )[0];
      const finished = (
        await db`select public.set_volunteer_attendance_with_audit(${pastRegistration.id}::uuid,${admin}::uuid,${pastRegistration.updated_at}::timestamptz,'completed') r`
      )[0].r;
      expect(finished.kind).toBe("updated");
      expect(
        (
          await db`select count(*)::int n from public.volunteer_attendance_event where registration_id=${pastRegistration.id}::uuid`
        )[0].n,
      ).toBe(1);
    } finally {
      await db.close({ timeout: 1 });
    }
  },
  120000,
);
