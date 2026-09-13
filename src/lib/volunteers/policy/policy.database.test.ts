import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "./catalogue";
import type { PolicyDraft } from "./schemas";

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
  )
    throw new Error("Policy acceptance requires dedicated isolated 127.0.0.1:56322/postgres");
}
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
const uuid = () => crypto.randomUUID();
type Result = Record<string, unknown>;
async function mustReject(operation: () => Promise<unknown>) {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

// Every row is synthetic and uniquely scoped. Immutable facts intentionally remain
// in this disposable stack; cleanup must never delete policy or attendance history.
test.skipIf(!enabled)(
  "CFG-02/08/09/10 policy save→preview→publish→generate→concurrent booking and legacy bypass",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const raceDb = new SQL(url!, { max: 1, prepare: false });
    const suffix = uuid().replaceAll("-", "");
    const admin = uuid();
    const staff = uuid();
    const inactive = uuid();
    const day = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const nextDay = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
    const effectiveFrom = `${day}T00:00:00Z`;
    const template = `cat-chores-test-${suffix}`;
    const actors = Array.from({ length: 9 }, uuid);
    const policy = (actor: string, command: Record<string, unknown>) =>
      db`select public.volunteer_policy_command(${actor}::uuid,${JSON.stringify(command)}::jsonb) as result`.then(
        (rows) => rows[0].result as Result,
      );
    const booking = (actor: string, activity: string, idempotency_key = uuid(), connection = db) =>
      connection`select public.volunteer_booking_command(${actor}::uuid,${JSON.stringify({ action: "book", activity_id: activity, role: "volunteer", remarks: "Synthetic policy acceptance", accept_terms: true, terms_version_id: "c9c6278a-c73a-4f0c-9b93-6e2b4089141a", idempotency_key })}::jsonb) as result`.then(
        (rows) => rows[0].result as Result,
      );
    const revision = async (key: string) =>
      Number(
        (await db`select revision from public.volunteer_policy_draft where template_key=${key}`)[0]
          ?.revision ?? 0,
      );
    const save = async (body: PolicyDraft) =>
      policy(admin, {
        action: "save",
        template_key: body.template_key,
        expected_revision: await revision(body.template_key),
        body,
      });
    const preview = async (key: string, activity_ids: string[] = []) => {
      const result = await policy(admin, {
        action: "preview",
        template_key: key,
        expected_revision: await revision(key),
        effective_from: effectiveFrom,
        effective_until: null,
        activity_ids,
      });
      expect(typeof result.preview_id).toBe("string");
      return String(result.preview_id);
    };
    const publish = (preview_id: string, idempotency_key = uuid()) =>
      policy(admin, {
        action: "publish",
        preview_id,
        idempotency_key,
        reason: "Synthetic isolated acceptance publication",
      });
    const generate = async (key: string, date: string) => {
      const result = await policy(admin, {
        action: "generate",
        template_key: key,
        date,
        idempotency_key: uuid(),
      });
      expect(typeof result.activity_id).toBe("string");
      return String(result.activity_id);
    };
    const approved = async (activity: string) =>
      Number(
        (
          await db`select count(*)::int as n from public.volunteer_registration where activity_id=${activity}::uuid and status='approved'`
        )[0].n,
      );
    try {
      for (const actor of [admin, staff, inactive, ...actors])
        await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values(${actor}::uuid,${actor + "@example.invalid"},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${admin}::uuid,${admin + "@example.invalid"},'admin','active'),(${staff}::uuid,${staff + "@example.invalid"},'staff','active'),(${inactive}::uuid,${inactive + "@example.invalid"},'admin','disabled')`;
      for (const actor of actors)
        await db`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${actor}::uuid,'Synthetic policy volunteer','1990-01-01','regular','active',${admin}::uuid,now())`;
      for (const actor of [staff, inactive])
        await mustReject(() => policy(actor, { action: "list" }));
      const body = structuredClone(initialPolicyCatalogue[0]);
      body.template_key = template;
      body.booking.auto_approve = true;
      body.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
      body.source = "Synthetic isolated CFG acceptance";
      await save(body);
      const staleRevision = await revision(template);
      await save({ ...body, name: "Synthetic revised afternoon" });
      expect(
        (
          await policy(admin, {
            action: "save",
            template_key: template,
            expected_revision: staleRevision,
            body,
          })
        ).kind,
      ).toBe("conflict");
      expect(await revision(template)).toBe(staleRevision + 1);
      const firstPreview = await preview(template);
      const publishKey = uuid();
      const firstPublished = await publish(firstPreview, publishKey);
      expect(await publish(firstPreview, publishKey)).toEqual(firstPublished);
      const activity = await generate(template, day);
      const untouched = await generate(template, nextDay);
      const originalBinding = (
        await db`select policy_version_id,capacity from public.volunteer_activity where id=${untouched}::uuid`
      )[0];
      expect(originalBinding.capacity).toBe(5);
      const bookKey = uuid();
      const booked = await booking(actors[0], activity, bookKey);
      expect(await approved(activity)).toBe(1);
      expect(await booking(actors[0], activity, bookKey)).toEqual(booked);
      await booking(actors[0], activity);
      expect(await approved(activity)).toBe(1);
      for (const actor of actors.slice(1, 4)) await booking(actor, activity);
      expect(await approved(activity)).toBe(4);
      const increased = structuredClone(body);
      increased.capacity.volunteers = { state: "value", value: 6 };
      await save(increased);
      const invalidatedPreview = await preview(template, [activity]);
      await booking(actors[4], activity);
      expect(await approved(activity)).toBe(5);
      expect((await publish(invalidatedPreview)).kind).toBe("conflict");
      expect(
        (await db`select capacity from public.volunteer_activity where id=${activity}::uuid`)[0]
          .capacity,
      ).toBe(5);
      await publish(await preview(template, [activity]));
      expect(
        (await db`select capacity from public.volunteer_activity where id=${activity}::uuid`)[0]
          .capacity,
      ).toBe(6);
      // Bun pool uses separate connections; two actor identities compete atomically.
      const raced = await Promise.all([
        booking(actors[5], activity),
        booking(actors[6], activity, uuid(), raceDb),
      ]);
      expect(raced).toHaveLength(2);
      expect(await approved(activity)).toBe(6);
      const racers =
        await db`select p.auth_user_id,r.status from public.volunteer_registration r join public.volunteer_profile p on p.id=r.profile_id where r.activity_id=${activity}::uuid and p.auth_user_id in (${actors[5]}::uuid,${actors[6]}::uuid)`;
      expect(racers.filter((r: { status: string }) => r.status === "approved")).toHaveLength(1);
      const seventh = await booking(actors[7], activity);
      expect(JSON.stringify(seventh)).toContain("capacity");
      expect(await approved(activity)).toBe(6);
      const preserved = (
        await db`select policy_version_id,capacity from public.volunteer_activity where id=${untouched}::uuid`
      )[0];
      expect(preserved).toEqual(originalBinding);
      const [accepted] =
        await db`select count(*)::int as n from public.volunteer_registration r join public.volunteer_terms_acceptance a on a.id=r.terms_acceptance_id where r.activity_id=${activity}::uuid and r.status='approved'`;
      expect(accepted.n).toBe(6);

      const overlapping = structuredClone(body);
      overlapping.template_key = `cat-overlap-test-${suffix}`;
      overlapping.schedule.start_time = "15:00";
      overlapping.schedule.end_time = "16:30";
      await save(overlapping);
      await publish(await preview(overlapping.template_key));
      const overlapActivity = await generate(overlapping.template_key, day);
      expect(JSON.stringify(await booking(actors[0], overlapActivity))).toContain("overlap");
      expect(await approved(overlapActivity)).toBe(0);
      await mustReject(
        async () =>
          db`select public.create_volunteer_registration(${overlapActivity}::uuid,null::uuid,'individual',1,'Synthetic legacy bypass',${uuid() + "@example.invalid"},'00000000','zh-HK',null::text,30,null::integer,null::text,null::text,null::text,${uuid()},now()+interval '1 day')`,
      );
      expect(await approved(overlapActivity)).toBe(0);
      const [version] =
        await db`select policy_version_id from public.volunteer_activity where id=${activity}::uuid`;
      await mustReject(
        async () =>
          db`update public.volunteer_policy_version set reason='Forbidden overwrite' where id=${version.policy_version_id}::uuid`,
      );
      const [grants] =
        await db`select has_function_privilege('anon','public.volunteer_policy_command(uuid,jsonb)','EXECUTE') as anon_policy,has_function_privilege('authenticated','public.volunteer_booking_command(uuid,jsonb)','EXECUTE') as browser_booking`;
      expect(grants.anon_policy).toBe(false);
      expect(grants.browser_booking).toBe(false);
    } finally {
      await db.close({ timeout: 1 });
      await raceDb.close({ timeout: 1 });
    }
  },
  60000,
);

test.skipIf(!enabled)(
  "CFG14 database rejects incomplete and unknown nested policy structures",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    try {
      const check = async (value: unknown) =>
        (
          await db`select public.volunteer_validate_policy(${JSON.stringify(value)}::jsonb) as issues`
        )[0].issues as string[];
      for (const draft of initialPolicyCatalogue) {
        const [shape] =
          await db`select public.volunteer_validate_policy_shape(${JSON.stringify(draft)}::jsonb) as issues`;
        expect(shape.issues).toEqual([]);
      }
      const [permissions] =
        await db`select has_function_privilege('service_role','public.volunteer_policy_json_matches(jsonb,jsonb,integer)','EXECUTE') as custom_schema,has_function_privilege('service_role','public.volunteer_validate_policy_shape(jsonb)','EXECUTE') as fixed_schema`;
      expect(permissions.custom_schema).toBe(false);
      expect(permissions.fixed_schema).toBe(true);
      expect(await check(initialPolicyCatalogue[0])).toEqual([]);
      for (const value of [
        { timezone: "Asia/Hong_Kong" },
        {
          ...initialPolicyCatalogue[0],
          eligibility: { ...initialPolicyCatalogue[0].eligibility, script: "eval(1)" },
        },
        {
          ...initialPolicyCatalogue[0],
          capacity: {
            ...initialPolicyCatalogue[0].capacity,
            volunteers: { state: "value", value: -1 },
          },
        },
        {
          ...initialPolicyCatalogue[0],
          capacity: {
            ...initialPolicyCatalogue[0].capacity,
            volunteers: { state: "value", value: "6" },
          },
        },
        {
          ...initialPolicyCatalogue[0],
          remarks: { ...initialPolicyCatalogue[0].remarks, required: "yes" },
        },
        {
          ...initialPolicyCatalogue[0],
          eligibility: { ...initialPolicyCatalogue[0].eligibility, allowed_tiers: ["root"] },
        },
      ])
        expect((await check(value)).length).toBeGreaterThan(0);
    } finally {
      await db.close({ timeout: 1 });
    }
  },
);
