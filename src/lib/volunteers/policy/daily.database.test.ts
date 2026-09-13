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
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    u.search ||
    u.hash
  )
    throw new Error("Dedicated isolated56322 database required");
}
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
const uuid = () => crypto.randomUUID();
type Result = Record<string, unknown>;
async function rejected(operation: () => Promise<unknown>) {
  let failed = false;
  try {
    await operation();
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}

test.skipIf(!enabled)(
  "CFG03/04/15/16 shared daily revision, quota-only late release, explicit anchors and races",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const other = new SQL(url!, { max: 1, prepare: false });
    const suffix = uuid().replaceAll("-", "");
    const admin = uuid();
    const staff = uuid();
    const actors = Array.from({ length: 12 }, uuid);
    // Immutable fixture facts remain; a random distant future date isolates repeats.
    const date = new Date(Date.now() + (400 + Math.floor(Math.random() * 200000)) * 86400000)
      .toISOString()
      .slice(0, 10);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const dailyKey = `newcomers_${suffix}`;
    const scopeKey = `dog:${dailyKey}`;
    const pc = (cmd: Record<string, unknown>) =>
      db`select public.volunteer_policy_command(${admin}::uuid,${JSON.stringify(cmd)}::jsonb) as result`.then(
        (rows) => rows[0].result as Result,
      );
    const dc = (cmd: Record<string, unknown>, actor = admin) =>
      db`select public.volunteer_daily_policy_command(${actor}::uuid,${JSON.stringify(cmd)}::jsonb) as result`.then(
        (rows) => rows[0].result as Result,
      );
    const book = (actor: string, activity: string, sql = db) =>
      sql`select public.volunteer_booking_command(${actor}::uuid,${JSON.stringify({ action: "book", activity_id: activity, role: "volunteer", remarks: "Synthetic daily scope", accept_terms: true, terms_version_id: "c9c6278a-c73a-4f0c-9b93-6e2b4089141a", idempotency_key: uuid() })}::jsonb) as result`.then(
        (rows) => rows[0].result as Result,
      );
    const publishTemplate = async (body: PolicyDraft) => {
      await pc({ action: "save", template_key: body.template_key, expected_revision: 0, body });
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
            reason: "Synthetic daily test",
          })
        ).kind,
      ).toBe("published");
      const a = await pc({
        action: "generate",
        template_key: body.template_key,
        date,
        idempotency_key: uuid(),
      });
      expect(a.kind).toBe("generated");
      return String(a.activity_id);
    };
    const dayRevision = async () =>
      Number(
        (
          await db`select revision from public.volunteer_daily_policy_binding where scope_key=${scopeKey} and service_date=${date}::date`
        )[0].revision,
      );
    const previewDay = async (body: PolicyDraft) =>
      dc({
        action: "preview",
        scope_key: scopeKey,
        service_date: date,
        expected_revision: await dayRevision(),
        body,
      });
    const publishDay = async (body: PolicyDraft) => {
      const p = await previewDay(body);
      expect(p.kind).toBe("preview");
      const id = uuid();
      const result = await dc({
        action: "publish",
        preview_id: p.preview_id,
        idempotency_key: id,
        reason: "Synthetic whole-day decision",
      });
      expect(result.kind).toBe("published");
      expect(
        await dc({
          action: "publish",
          preview_id: p.preview_id,
          idempotency_key: id,
          reason: "Synthetic whole-day decision",
        }),
      ).toEqual(result);
    };
    try {
      for (const id of [admin, staff, ...actors])
        await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values(${id}::uuid,${id + "@example.invalid"},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role) values(${admin}::uuid,${admin + "@example.invalid"},'admin'),(${staff}::uuid,${staff + "@example.invalid"},'staff')`;
      for (const [i, id] of actors.entries())
        await db`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${id}::uuid,'Synthetic daily volunteer','1990-01-01',${i === 11 ? "regular" : "newcomer"},'active',${admin}::uuid,now())`;
      const base = structuredClone(
        initialPolicyCatalogue.find((p) => p.template_key === "dog-cleaning-b")!,
      );
      base.template_key = `daily-am-${suffix}`;
      base.booking.auto_approve = true;
      base.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
      base.booking.group_open = { mode: "disabled" };
      base.booking.group_close = { mode: "disabled" };
      base.release_rules = [];
      base.daily_limits = [
        {
          key: dailyKey,
          tiers: ["newcomer"],
          maximum: { state: "value", value: 5 },
          scope: "shelter_day",
          count_mode: "distinct_people",
          include_group_visitors: false,
        },
      ];
      base.tier_quotas = [
        {
          key: "weekday_newcomer",
          tiers: ["newcomer"],
          maximum: { state: "unlimited" },
          weekdays: [0, 1, 2, 3, 4, 5, 6],
        },
      ];
      const am = await publishTemplate(base);
      const pmBody = structuredClone(base);
      pmBody.template_key = `daily-pm-${suffix}`;
      pmBody.schedule.start_time = "13:30";
      pmBody.schedule.end_time = "16:30";
      const pm = await publishTemplate(pmBody);
      const lateBody = structuredClone(base);
      lateBody.template_key = `daily-late-${suffix}`;
      lateBody.schedule.start_time = "18:00";
      lateBody.schedule.end_time = "19:00";
      lateBody.tier_quotas[0].weekdays = [(weekday + 1) % 7];
      const late = await publishTemplate(lateBody);
      for (let i = 0; i < 5; i++)
        expect((await book(actors[i], i % 2 === 0 ? am : pm)).kind).toBe("booked");
      expect((await book(actors[5], pm)).reason).toBe("daily_quota_full");
      expect((await book(actors[9], late)).reason).toBe("tier_weekday_not_allowed");
      const eight = structuredClone(base);
      eight.daily_limits[0].maximum = { state: "value", value: 8 };
      const preview = await previewDay(eight);
      expect(preview.kind).toBe("preview");
      expect(preview.activity_ids).toHaveLength(3);
      await rejected(() =>
        dc(
          {
            action: "publish",
            preview_id: preview.preview_id,
            idempotency_key: uuid(),
            reason: "Forbidden",
          },
          staff,
        ),
      );
      expect((await book(actors[11], am)).kind).toBe("booked");
      expect(
        (
          await dc({
            action: "publish",
            preview_id: preview.preview_id,
            idempotency_key: uuid(),
            reason: "Stale occupancy",
          })
        ).kind,
      ).toBe("conflict");
      await publishDay(eight);
      const listing = await dc({ action: "list" });
      const listed = (listing.bindings as { scope_key: string; policy_body: PolicyDraft }[]).find(
        (b) => b.scope_key === scopeKey,
      );
      expect(listed?.policy_body.daily_limits.find((q) => q.key === dailyKey)?.maximum).toEqual({
        state: "value",
        value: 8,
      });
      expect((await book(actors[5], am)).kind).toBe("booked");
      expect((await book(actors[6], pm)).kind).toBe("booked");
      const race = await Promise.all([book(actors[7], am), book(actors[8], pm, other)]);
      expect(race.filter((r) => r.kind === "booked")).toHaveLength(1);
      expect(race.filter((r) => r.reason === "daily_quota_full")).toHaveLength(1);
      const [used] =
        await db`select count(*)::int as n from public.volunteer_registration b join public.volunteer_activity a on a.id=b.activity_id join public.volunteer_profile v on v.id=b.profile_id where b.status='approved' and v.tier='newcomer' and a.shelter_key='dog' and (a.starts_at at time zone 'Asia/Hong_Kong')::date=${date}::date`;
      expect(used.n).toBe(8);
      expect((await previewDay(base)).reason).toBe("daily_capacity_below_occupancy");
      const [profile] =
        await db`select id from public.volunteer_profile where auth_user_id=${actors[9]}::uuid`;
      const evaluate = async (activity: string, hours: number, seconds = 0, anchor = am) =>
        (
          await db`select public.volunteer_policy_evaluate(${activity}::uuid,${profile.id}::uuid,'volunteer',(select starts_at from public.volunteer_activity where id=${anchor}::uuid)-make_interval(hours=>${hours},secs=>${seconds})) as result`
        )[0].result;
      const released = structuredClone(eight);
      released.release_rules = [
        {
          key: "late_daily",
          priority: 1,
          semantics: "dynamic",
          within_hours: 48,
          condition: { tiers: ["regular", "senior"], operator: "lt", threshold: 2 },
          action: {
            type: "relax_quota",
            quota: dailyKey,
            new_maximum: 10,
            scope: "shelter_day",
            daily_anchor: "first_session",
          },
          allowed_tiers: ["newcomer"],
          credentials: { mode: "all", keys: [] },
          weekdays: [0, 1, 2, 3, 4, 5, 6],
        },
      ];
      await publishDay(released);
      expect((await evaluate(am, 48, 1)).reason).toBe("daily_quota_full");
      for (const activity of [am, pm, late]) {
        const result = await evaluate(activity, 48);
        expect(result.allowed).toBe(true);
        expect(result.daily_limits[0].maximum).toBe(10);
        expect(result.capacity).toBe(10);
      }
      expect((await evaluate(am, 47)).allowed).toBe(true);
      const rule = released.release_rules[0];
      if ("state" in rule) throw new Error("Expected concrete rule");
      rule.within_hours = 24;
      await publishDay(released);
      expect((await evaluate(am, 25)).reason).toBe("daily_quota_full");
      expect((await evaluate(am, 24)).allowed).toBe(true);
      expect((await evaluate(am, 23)).allowed).toBe(true);
      if (rule.action.type !== "relax_quota") throw new Error("Expected quota action");
      rule.action.daily_anchor = "last_session";
      await publishDay(released);
      expect((await evaluate(am, 24)).reason).toBe("daily_quota_full");
      expect((await evaluate(late, 24, 0, late)).allowed).toBe(true);
      rule.condition.threshold = 1;
      await publishDay(released);
      expect((await evaluate(late, 24, 0, late)).reason).toBe("tier_weekday_not_allowed");
      expect(base.roles).toEqual([]);
    } finally {
      await db.close({ timeout: 1 });
      await other.close({ timeout: 1 });
    }
  },
  60000,
);
