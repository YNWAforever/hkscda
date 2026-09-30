import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "../policy/catalogue";
import { addHkDays } from "./service";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
const localUrls = [
  "postgresql://postgres:postgres@127.0.0.1:56322/postgres",
  "postgres://postgres:postgres@127.0.0.1:56322/postgres",
];
// The GitHub job starts its own disposable Supabase stack on 55322.
if (process.env.CI === "true")
  localUrls.push("postgresql://postgres:postgres@127.0.0.1:55322/postgres");
if (url && !localUrls.includes(url))
  throw new Error("Dedicated isolated volunteer database required");
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
const uuid = () => crypto.randomUUID();
type Result = {
  kind: string;
  reason?: string;
  preview_id: string;
  activity_id: string;
  operation: { id: string; groups: { index: number; state: string; items: unknown[] }[] };
};

test.skipIf(!enabled)(
  "mandatory capacity 10 concurrent eleventh, active role downgrade, and 104 policy-bound cross-shelter global-day quota groups",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const other = new SQL(url!, { max: 1, prepare: false });
    const admin = uuid();
    const suffix = admin.replaceAll("-", "");
    const actors = Array.from({ length: 11 }, uuid);
    const day = new Date(Date.now() + (1000 + Math.floor(Math.random() * 200000)) * 86400000)
      .toISOString()
      .slice(0, 10);
    const terms = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
    const pc = (command: unknown) =>
      db`select public.volunteer_policy_command(${admin}::uuid,${JSON.stringify(command)}::jsonb) result`.then(
        (r) => r[0].result as Result,
      );
    const bulk = (command: unknown) =>
      db`select public.volunteer_bulk_command(${admin}::uuid,${JSON.stringify(command)}::jsonb) result`.then(
        (r) => r[0].result as Result,
      );
    const book = (actor: string, activity: string, connection = db) =>
      connection`select public.volunteer_booking_command(${actor}::uuid,${JSON.stringify({ action: "book", activity_id: activity, role: "volunteer", accept_terms: true, terms_version_id: terms, idempotency_key: uuid() })}::jsonb) result`.then(
        (r) => r[0].result as Result,
      );
    const select = (ids: string[]) =>
      bulk({
        action: "select",
        mode: "page",
        ids,
        filter: { sort: "asc" },
        idempotency_key: uuid(),
      });
    const publish = async (index: number, global: boolean) => {
      const body = structuredClone(initialPolicyCatalogue[0]);
      body.template_key = `mandatory-${suffix}-${index}`;
      body.shelter = `mandatory_${suffix}_${index % 2}`;
      body.source = "Synthetic isolated mandatory acceptance";
      body.capacity.volunteers = { state: "value", value: 10 };
      body.booking.auto_approve = true;
      body.terms.version_id = terms;
      body.daily_limits = global
        ? [
            {
              key: `global_${suffix}`,
              tiers: ["regular"],
              maximum: { state: "value", value: 5 },
              scope: "all_shelters_day",
              count_mode: "distinct_people",
              include_group_visitors: false,
            },
          ]
        : [];
      expect(
        (await pc({ action: "save", template_key: body.template_key, expected_revision: 0, body }))
          .kind,
      ).toBe("saved");
      const preview = await pc({
        action: "preview",
        template_key: body.template_key,
        expected_revision: 1,
        effective_from: day + "T00:00:00+08:00",
        effective_until: null,
        activity_ids: [],
      });
      expect(preview.kind).toBe("preview");
      expect(
        (
          await pc({
            action: "publish",
            preview_id: preview.preview_id,
            idempotency_key: uuid(),
            reason: "Synthetic acceptance",
          })
        ).kind,
      ).toBe("published");
      return body.template_key;
    };
    const generate = async (template_key: string, date: string) => {
      const result = await pc({ action: "generate", template_key, date, idempotency_key: uuid() });
      expect(result.kind).toBe("generated");
      return result.activity_id;
    };
    try {
      for (const id of [admin, ...actors])
        await db`insert into auth.users(id,email,email_confirmed_at)values(${id}::uuid,${id + "@example.invalid"},now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status)values(${admin}::uuid,${admin + "@example.invalid"},'admin','active')`;
      for (let i = 0; i < 2; i++)
        await db`insert into public.volunteer_shelter_definition(key,label,timezone,location)values(${`mandatory_${suffix}_${i}`},'Synthetic mandatory shelter','Asia/Hong_Kong','Synthetic')`;
      for (const id of actors)
        await db`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at)values(${id}::uuid,'Synthetic mandatory actor','1990-01-01','regular','active',${admin}::uuid,now())`;
      const capacity = await generate(await publish(2, false), day);
      for (const actor of actors.slice(0, 9))
        expect((await book(actor, capacity)).kind).toBe("booked");
      const race = await Promise.all([
        book(actors[9], capacity),
        book(actors[10], capacity, other),
      ]);
      expect(race.filter((r) => r.kind === "booked")).toHaveLength(1);
      expect(race.filter((r) => r.reason === "capacity_full")).toHaveLength(1);
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_registration where activity_id=${capacity}::uuid and status='approved'`
          )[0].n,
        ),
      ).toBe(10);
      const revoked = await bulk({
        action: "preview",
        operation: "edit",
        selection_id: (await select([capacity])).operation.id,
        input: { changes: { description: "MUST NOT APPLY" } },
        idempotency_key: uuid(),
      });
      await db`update public.admin_user set role='treasurer' where auth_user_id=${admin}::uuid`;
      let forbidden = false;
      try {
        await bulk({ action: "apply", operation_id: revoked.operation.id, group_index: 0 });
      } catch (error) {
        forbidden = error instanceof Error && error.message.includes("volunteer_forbidden");
      }
      expect(forbidden).toBe(true);
      expect(
        (await db`select description from public.volunteer_activity where id=${capacity}::uuid`)[0]
          .description,
      ).not.toBe("MUST NOT APPLY");
      expect(
        (await db`select status from public.admin_user where auth_user_id=${admin}::uuid`)[0]
          .status,
      ).toBe("active");
      await db`update public.admin_user set role='admin' where auth_user_id=${admin}::uuid`;
      const templates = [await publish(0, true), await publish(1, true)];
      const ids: string[] = [];
      for (let n = 1; n <= 52; n++)
        for (const template of templates) ids.push(await generate(template, addHkDays(day, n)));
      for (let n = 0; n < 4; n++) expect((await book(actors[n], ids[n % 2])).kind).toBe("booked");
      const dailyRace = await Promise.all([
        book(actors[4], ids[0]),
        book(actors[5], ids[1], other),
      ]);
      expect(dailyRace.filter((r) => r.kind === "booked")).toHaveLength(1);
      expect(dailyRace.filter((r) => r.reason === "daily_quota_full")).toHaveLength(1);
      const preview = await bulk({
        action: "preview",
        operation: "edit",
        selection_id: (await select(ids)).operation.id,
        input: { changes: { description: "Synthetic global-day batch" } },
        idempotency_key: uuid(),
      });
      expect(preview.operation.groups).toHaveLength(52);
      expect(preview.operation.groups.every((g) => g.items.length === 2)).toBe(true);
      for (const group of preview.operation.groups)
        expect(
          (
            await bulk({
              action: "apply",
              operation_id: preview.operation.id,
              group_index: group.index,
            })
          ).operation.groups[group.index].state,
        ).toBe("applied");
      expect((await book(actors[6], ids[1])).reason).toBe("daily_quota_full");
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_registration where activity_id in (${ids[0]}::uuid,${ids[1]}::uuid) and status='approved'`
          )[0].n,
        ),
      ).toBe(5);
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_activity where template_key in (${templates[0]},${templates[1]}) and policy_version_id is not null and description='Synthetic global-day batch'`
          )[0].n,
        ),
      ).toBe(104);
    } finally {
      await other.close();
      await db.close();
    }
  },
  120000,
);
