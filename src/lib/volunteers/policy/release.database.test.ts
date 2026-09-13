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
    throw new Error("Isolated56322 required");
}
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "once release persists exactly once while virtual reads remain pure and dynamic recovers",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    let completed = false;
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID(),
          senior = crypto.randomUUID(),
          activity = crypto.randomUUID(),
          version = crypto.randomUUID();
        for (const id of [actor, senior])
          await tx`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
        const [profile] =
          await tx`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${actor}::uuid,'Synthetic','1990-01-01','regular','active',${actor}::uuid,now()) returning id`;
        await tx`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at) values(${senior}::uuid,'Synthetic','1990-01-01','senior','active',${actor}::uuid,now())`;
        const body = structuredClone(initialPolicyCatalogue[0]);
        body.booking.auto_approve = true;
        body.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
        body.capacity.volunteers = { state: "value", value: 2 };
        body.roles = [
          {
            key: "experienced",
            label: "Senior",
            minimum: 0,
            reserved: 2,
            maximum: { state: "unlimited" },
            allowed_tiers: ["senior"],
            credentials: { mode: "all", keys: [] },
          },
          {
            key: "volunteer",
            label: "Volunteer",
            minimum: 0,
            reserved: 0,
            maximum: { state: "unlimited" },
            allowed_tiers: ["regular"],
            credentials: { mode: "all", keys: [] },
          },
        ];
        const rule = {
          key: "once_pool",
          priority: 1,
          semantics: "once" as const,
          within_hours: 48,
          condition: { tiers: ["senior" as const], operator: "lt" as const, threshold: 1 },
          action: { type: "release_reserved" as const, pool: "experienced", quantity: 2 },
          allowed_tiers: ["regular" as const],
          credentials: { mode: "all" as const, keys: [] },
          weekdays: "preserve" as const,
        };
        body.release_rules = [rule];
        await tx`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason) values(${version}::uuid,${body.template_key},${JSON.stringify(body)}::jsonb,'synthetic',now(),${actor}::uuid,'Synthetic once release')`;
        await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status,policy_version_id,shelter_key) values(${activity}::uuid,'volunteer_shift','Synthetic release',now()+interval '1 day',now()+interval '1 day 4 hours','Synthetic',2,'published',${version}::uuid,'cat')`;
        const evaluate = async () =>
          (
            await tx`select public.volunteer_policy_evaluate(${activity}::uuid,${profile.id}::uuid,'volunteer',clock_timestamp()) as r`
          )[0].r;
        await tx`insert into public.admin_user(auth_user_id,email,role) values(${actor}::uuid,${actor + "@example.invalid"},'admin')`;
        body.template_key = "simulation-" + activity;
        await tx`insert into public.volunteer_policy_draft(template_key,body,updated_by) values(${body.template_key},${JSON.stringify(body)}::jsonb,${actor}::uuid)`;
        const command = {
          action: "simulate",
          template_key: body.template_key,
          draft_revision: 1,
          activity_id: activity,
          profile_id: profile.id,
          role: "volunteer",
          simulation_time: new Date().toISOString(),
        };
        const before = (await tx`select count(*)::int as n from public.volunteer_policy_version`)[0]
          .n;
        const simulation = (
          await tx`select public.volunteer_policy_simulation(${actor}::uuid,${JSON.stringify(command)}::jsonb) as result`
        )[0].result;
        expect(simulation.kind).toBe("simulated");
        expect(simulation.simulation_only).toBe(true);
        expect(simulation.evaluation.allowed).toBe(true);
        expect(
          (await tx`select count(*)::int as n from public.volunteer_policy_version`)[0].n,
        ).toBe(before);
        expect(
          (
            await tx`select policy_version_id from public.volunteer_activity where id=${activity}::uuid`
          )[0].policy_version_id,
        ).toBe(version);
        expect(
          (
            await tx`select public.volunteer_policy_simulation(${actor}::uuid,${JSON.stringify({ ...command, draft_revision: 2 })}::jsonb) as result`
          )[0].result.kind,
        ).toBe("conflict");
        expect((await evaluate()).allowed).toBe(true);
        expect(
          (
            await tx`select count(*)::int as n from public.volunteer_release_transition where binding_key=${"session:" + activity + ":" + version}`
          )[0].n,
        ).toBe(0);
        expect(
          (
            await tx`select public.volunteer_persist_releases(${activity}::uuid,now()+interval '100 years') as n`
          )[0].n,
        ).toBe(1);
        expect(
          (await tx`select public.volunteer_persist_releases(${activity}::uuid,now()) as n`)[0].n,
        ).toBe(0);
        const result = (
          await tx`select public.volunteer_booking_command(${senior}::uuid,${JSON.stringify({ action: "book", activity_id: activity, role: "experienced", remarks: "", accept_terms: true, terms_version_id: body.terms.version_id, idempotency_key: crypto.randomUUID() })}::jsonb) as r`
        )[0].r;
        expect(result.kind).toBe("booked");
        expect((await evaluate()).allowed).toBe(true);
        const binding = "session:" + activity + ":" + version;
        expect(
          (
            await tx`select public.volunteer_release_is_active(${binding},${JSON.stringify(rule)}::jsonb,now()+interval '1 day',1,now()) as active`
          )[0].active,
        ).toBe(true);
        expect(
          (
            await tx`select public.volunteer_release_is_active(${binding},${JSON.stringify({ ...rule, semantics: "dynamic" })}::jsonb,now()+interval '1 day',1,now()) as active`
          )[0].active,
        ).toBe(false);
        expect(
          (
            await tx`select public.volunteer_release_is_active(${binding},${JSON.stringify({ ...rule, key: "new_rule" })}::jsonb,now()+interval '1 day',1,now()) as active`
          )[0].active,
        ).toBe(false);
        completed = true;
        throw new Error("rollback release fixture");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "rollback release fixture") throw error;
    } finally {
      await db.close({ timeout: 1 });
    }
    expect(completed).toBe(true);
  },
);
