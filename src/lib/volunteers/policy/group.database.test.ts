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
    throw new Error("Dedicated isolated56322 required");
}
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
const uuid = () => crypto.randomUUID();
type Result = Record<string, unknown>;
async function rejected(f: () => Promise<unknown>) {
  let failed = false;
  try {
    await f();
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}
test.skipIf(!enabled)(
  "group enquiry→review→paired A/B confirmation/cancel; immutable snapshot and reviewed reschedule",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const admin = uuid(),
      owner = uuid(),
      volunteer = uuid(),
      other = uuid(),
      enquiry = uuid(),
      suffix = uuid().replaceAll("-", "");
    const date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      next = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
    const pc = (cmd: Record<string, unknown>) =>
      db`select public.volunteer_policy_command(${admin}::uuid,${JSON.stringify(cmd)}::jsonb) as result`.then(
        (rows) => rows[0].result as Result,
      );
    const op = (cmd: Record<string, unknown>, actor = admin) =>
      db`select public.volunteer_operation_command(${actor}::uuid,${JSON.stringify(cmd)}::jsonb) as result`.then(
        (rows) => rows[0].result as Result,
      );
    const book = (actor: string, activity: string) =>
      db`select public.volunteer_booking_command(${actor}::uuid,${JSON.stringify({ action: "book", activity_id: activity, role: "volunteer", remarks: "Synthetic group fixture", accept_terms: true, terms_version_id: "c9c6278a-c73a-4f0c-9b93-6e2b4089141a", idempotency_key: uuid() })}::jsonb) as result`.then(
        (rows) => rows[0].result as Result,
      );
    const publish = async (body: PolicyDraft) => {
      expect(
        (await pc({ action: "save", template_key: body.template_key, body, expected_revision: 0 }))
          .kind,
      ).toBe("saved");
      const p = await pc({
        action: "preview",
        template_key: body.template_key,
        expected_revision: 1,
        effective_from: `${date}T00:00:00Z`,
        effective_until: null,
        activity_ids: [],
      });
      expect(p.kind).toBe("preview");
      expect(
        (
          await pc({
            action: "publish",
            preview_id: p.preview_id,
            idempotency_key: uuid(),
            reason: "Synthetic group pairing",
          })
        ).kind,
      ).toBe("published");
    };
    const generate = async (template_key: string, day = date) => {
      const a = await pc({ action: "generate", template_key, date: day, idempotency_key: uuid() });
      expect(a.kind).toBe("generated");
      return String(a.activity_id);
    };
    try {
      for (const id of [admin, owner, volunteer, other])
        await db`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
      await db`insert into public.admin_user(auth_user_id,email,role) values(${admin}::uuid,${admin + "@example.invalid"},'admin')`;
      for (const id of [volunteer, other])
        await db`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${id}::uuid,'Synthetic group volunteer','1990-01-01','newcomer','active',${admin}::uuid,now())`;
      await db`insert into public.group_enquiries(id,organisation,contact_name,contact_email,contact_phone,activity_type,participant_count,idempotency_key) values(${enquiry}::uuid,'Synthetic group','Original snapshot',${owner + "@example.invalid"},'00000000','shelter_visit',15,${uuid()})`;
      const a = structuredClone(
        initialPolicyCatalogue.find((p) => p.template_key === "cat-cleaning-a")!,
      );
      const b = structuredClone(
        initialPolicyCatalogue.find((p) => p.template_key === "cat-cleaning-b")!,
      );
      a.template_key = `group-a-${suffix}`;
      b.template_key = `group-b-${suffix}`;
      for (const p of [a, b]) {
        p.schedule.start_time = "13:00";
        p.schedule.end_time = "17:00";
        p.booking.group_open = { mode: "unrestricted" };
        p.booking.group_close = { mode: "hours_before", value: 168 };
        p.booking.individual_open = { mode: "unrestricted" };
        p.booking.auto_approve = true;
        p.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
        p.release_rules = [];
        p.booking.scenario_templates = {
          with_group: a.template_key,
          without_group: b.template_key,
        };
      }
      a.capacity.role_count_model = "leader_separate";
      await publish(a);
      await publish(b);
      const activity = await generate(b.template_key);
      const destination = await generate(b.template_key, next);
      const submitted = await op(
        {
          action: "request",
          activity_id: activity,
          enquiry_id: enquiry,
          headcount: 15,
          idempotency_key: uuid(),
        },
        owner,
      );
      expect(submitted.kind).toBe("requested");
      expect(
        (
          await db`select group_headcount from public.volunteer_activity where id=${activity}::uuid`
        )[0].group_headcount,
      ).toBe(0);
      await rejected(() =>
        op(
          {
            action: "group_preview",
            request_id: submitted.request_id,
            expected_revision: 1,
            operation: "confirm",
            headcount: 15,
            acknowledge_late_change: false,
          },
          owner,
        ),
      );
      const preview = await op({
        action: "group_preview",
        request_id: submitted.request_id,
        expected_revision: 1,
        operation: "confirm",
        headcount: 15,
        acknowledge_late_change: false,
      });
      expect(preview.kind).toBe("preview");
      expect(
        (
          await db`select group_headcount from public.volunteer_activity where id=${activity}::uuid`
        )[0].group_headcount,
      ).toBe(0);
      const booked = await book(volunteer, activity);
      expect(booked.kind).toBe("booked");
      expect(
        (
          await op({
            action: "group_apply",
            preview_id: preview.preview_id,
            idempotency_key: uuid(),
            reason: "Stale group preview",
          })
        ).kind,
      ).toBe("conflict");
      const fresh = await op({
        action: "group_preview",
        request_id: submitted.request_id,
        expected_revision: 1,
        operation: "confirm",
        headcount: 15,
        acknowledge_late_change: false,
      });
      expect(fresh.kind).toBe("preview");
      const key = uuid();
      const applied = await op({
        action: "group_apply",
        preview_id: fresh.preview_id,
        idempotency_key: key,
        reason: "Confirmed exact group",
      });
      expect(applied.kind).toBe("applied");
      expect(
        await op({
          action: "group_apply",
          preview_id: fresh.preview_id,
          idempotency_key: key,
          reason: "Confirmed exact group",
        }),
      ).toEqual(applied);
      const confirmed = (
        await db`select group_headcount,capacity,template_key from public.volunteer_activity where id=${activity}::uuid`
      )[0];
      expect(confirmed.group_headcount).toBe(15);
      expect(confirmed.capacity).toBe(10);
      expect(confirmed.template_key).toBe(a.template_key);
      expect((await book(other, activity)).reason).toBe("reserved_for_core_role");
      await rejected(
        async () =>
          await db`update public.volunteer_activity set group_headcount=0 where id=${activity}::uuid`,
      );
      await db`update public.group_enquiries set contact_name='New source detail' where id=${enquiry}::uuid`;
      expect(
        (
          await db`select contact_snapshot->>'contact_name' as name from public.volunteer_group_request where id=${submitted.request_id}::uuid`
        )[0].name,
      ).toBe("Original snapshot");
      await rejected(
        async () =>
          await db`update public.volunteer_group_request set contact_snapshot='{}'::jsonb where id=${submitted.request_id}::uuid`,
      );
      const cancel = await op({
        action: "group_preview",
        request_id: submitted.request_id,
        expected_revision: 2,
        operation: "cancel",
        headcount: 0,
        acknowledge_late_change: false,
      });
      expect(cancel.kind).toBe("preview");
      expect(
        (
          await op({
            action: "group_apply",
            preview_id: cancel.preview_id,
            idempotency_key: uuid(),
            reason: "Group cancelled; return to configured B",
          })
        ).kind,
      ).toBe("applied");
      expect(
        (
          await db`select group_headcount,template_key from public.volunteer_activity where id=${activity}::uuid`
        )[0],
      ).toMatchObject({ group_headcount: 0, template_key: b.template_key });
      const version = async () =>
        String(
          (
            await db`select updated_at::text as version from public.volunteer_registration where id=${booked.registration_id}::uuid`
          )[0].version,
        );
      const move = await op(
        {
          action: "move_preview",
          registration_id: booked.registration_id,
          expected_updated_at: await version(),
          activity_id: destination,
          role: "volunteer",
        },
        volunteer,
      );
      expect(move.kind).toBe("preview");
      expect((await book(other, destination)).kind).toBe("booked");
      expect(
        (
          await op(
            {
              action: "move_apply",
              preview_id: move.preview_id,
              idempotency_key: uuid(),
              reason: "Stale move",
            },
            volunteer,
          )
        ).kind,
      ).toBe("conflict");
      expect(
        (
          await db`select activity_id from public.volunteer_registration where id=${booked.registration_id}::uuid`
        )[0].activity_id,
      ).toBe(activity);
      const moveFresh = await op(
        {
          action: "move_preview",
          registration_id: booked.registration_id,
          expected_updated_at: await version(),
          activity_id: destination,
          role: "volunteer",
        },
        volunteer,
      );
      expect(moveFresh.kind).toBe("preview");
      expect(
        (
          await op(
            {
              action: "move_apply",
              preview_id: moveFresh.preview_id,
              idempotency_key: uuid(),
              reason: "Volunteer requested next day",
            },
            volunteer,
          )
        ).kind,
      ).toBe("applied");
      expect(
        (
          await db`select activity_id from public.volunteer_registration where id=${booked.registration_id}::uuid`
        )[0].activity_id,
      ).toBe(destination);
      expect(
        (
          await db`select count(*)::int as n from public.volunteer_operation_event where entity_id=${booked.registration_id}::uuid and kind='move_apply'`
        )[0].n,
      ).toBe(1);
      const list = await op({ action: "list" }, owner);
      expect(list.staff).toBe(false);
      expect(list.requests).toHaveLength(1);
    } finally {
      await db.close({ timeout: 1 });
    }
  },
  60000,
);
