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
  throw new Error("Isolated56322 required");
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "CFG01 dog B10→12 snapshots, calendar/evaluator counts, custom shelter daily isolation and empty group date guards",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    let complete = false;
    try {
      await db.begin(async (tx) => {
        const admin = crypto.randomUUID(),
          suffix = admin.replaceAll("-", ""),
          terms = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
        await tx`insert into auth.users(id,email,email_confirmed_at)values(${admin}::uuid,${admin + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role)values(${admin}::uuid,${admin + "@example.invalid"},'admin')`;
        const pc = async (command: object) =>
          (
            await tx`select public.volunteer_policy_command(${admin}::uuid,${JSON.stringify(command)}::jsonb) r`
          )[0].r;
        const date = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10),
          next = new Date(Date.now() + 41 * 86400000).toISOString().slice(0, 10);
        const body = structuredClone(
          initialPolicyCatalogue.find((p) => p.template_key === "dog-cleaning-b")!,
        );
        body.template_key = "dog-cfg01-" + suffix;
        body.booking.group_open = { mode: "disabled" };
        body.booking.group_close = { mode: "unrestricted" };
        body.booking.individual_open = { mode: "unrestricted" };
        body.booking.auto_approve = true;
        body.terms.version_id = terms;
        body.release_rules = [];
        body.daily_limits = [];
        const publish = async (revision: number) => {
          expect(
            (
              await pc({
                action: "save",
                template_key: body.template_key,
                expected_revision: revision - 1,
                body,
              })
            ).kind,
          ).toBe("saved");
          const p = await pc({
            action: "preview",
            template_key: body.template_key,
            expected_revision: revision,
            effective_from: date + "T00:00:00Z",
            effective_until: null,
            activity_ids: [],
          });
          expect(p.kind).toBe("preview");
          expect(
            (
              await pc({
                action: "publish",
                preview_id: p.preview_id,
                idempotency_key: crypto.randomUUID(),
                reason: "Synthetic CFG01 explicit policy change",
              })
            ).kind,
          ).toBe("published");
        };
        const generate = async (day: string) => {
          const a = await pc({
            action: "generate",
            template_key: body.template_key,
            date: day,
            idempotency_key: crypto.randomUUID(),
          });
          expect(a.kind).toBe("generated");
          return a.activity_id as string;
        };
        await publish(1);
        const old = await generate(date);
        body.capacity.volunteers = { state: "value", value: 12 };
        await publish(2);
        const current = await generate(next);
        const activities =
          await tx`select a.id,a.capacity,v.body from public.volunteer_activity a join public.volunteer_policy_version v on v.id=a.policy_version_id where a.id in(${old}::uuid,${current}::uuid)`;
        expect(activities.find((a: { id: string }) => a.id === old)?.capacity).toBe(10);
        expect(
          activities.find((a: { id: string }) => a.id === current)?.body.capacity.volunteers.value,
        ).toBe(12);
        let lastProfile = "";
        for (let i = 0; i < 13; i++) {
          const actor = crypto.randomUUID();
          await tx`insert into auth.users(id,email,email_confirmed_at)values(${actor}::uuid,${actor + "@example.invalid"},now())`;
          lastProfile = (
            await tx`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at)values(${actor}::uuid,'Synthetic dog CFG01','1990-01-01','regular','active',${admin}::uuid,now())returning id`
          )[0].id;
          const r = (
            await tx`select public.volunteer_booking_command(${actor}::uuid,${JSON.stringify({ action: "book", activity_id: current, role: "volunteer", remarks: "Synthetic", accept_terms: true, terms_version_id: terms, idempotency_key: crypto.randomUUID() })}::jsonb) r`
          )[0].r;
          expect(r.kind).toBe(i < 12 ? "booked" : "denied");
        }
        const summary = (
          await tx`select public.volunteer_public_session_summary(array[${old}::uuid,${current}::uuid]) r`
        )[0].r;
        expect(summary[old].remaining).toBe(10);
        expect(summary[current].confirmed).toBe(12);
        expect(summary[current].remaining).toBe(0);
        const evaluation = (
          await tx`select public.volunteer_policy_evaluate(${current}::uuid,${lastProfile}::uuid,'volunteer',clock_timestamp()) r`
        )[0].r;
        expect(evaluation.capacity).toBe(12);
        expect(evaluation.confirmed).toBe(12);
        expect(evaluation.allowed).toBe(false);
        const a = (await tx`select * from public.volunteer_activity where id=${old}::uuid`)[0];
        for (const [kind, expected] of [
          ["disabled", "activity_closed"],
          ["excluded", "date_closed"],
          ["weekday", "date_closed"],
          ["range", "date_closed"],
        ]) {
          const candidate = structuredClone(body);
          candidate.capacity.volunteers = { state: "value", value: 10 };
          if (kind === "disabled") candidate.schedule.enabled = false;
          if (kind === "excluded") candidate.schedule.excluded_dates = [date];
          if (kind === "weekday")
            candidate.schedule.weekdays = [(new Date(date + "T00:00:00Z").getUTCDay() + 1) % 7];
          if (kind === "range") candidate.schedule.effective_from = next;
          const version = (
            await tx`insert into public.volunteer_policy_version(template_key,content_hash,effective_from,body,published_by,reason)values(${body.template_key},${crypto.randomUUID()},clock_timestamp(),${JSON.stringify(candidate)}::jsonb,${admin}::uuid,'Synthetic unavailable paired policy')returning id`
          )[0].id;
          const result = (
            await tx`select public.volunteer_group_candidate(${old}::uuid,${version}::uuid,0,clock_timestamp()) r`
          )[0].r;
          expect(result.issues).toContain(expected);
        }
        for (const [index, maximum] of [5, 8].entries()) {
          const shelter = "custom-" + index + "-" + suffix;
          await tx`insert into public.volunteer_shelter_definition(key,label,timezone,location)values(${shelter},'Synthetic daily shelter','Asia/Hong_Kong','Synthetic')`;
          const site = structuredClone(body);
          site.shelter = shelter;
          site.daily_limits = [
            {
              key: "shared_name",
              tiers: ["regular"],
              maximum: { state: "value", value: maximum },
              scope: "shelter_day",
              count_mode: "attendances",
              include_group_visitors: false,
            },
          ];
          await tx`select public.volunteer_bind_daily_policy(${JSON.stringify(site)}::jsonb,${date}::date)`;
          const state = (
            await tx`select public.volunteer_daily_state(${shelter + ":shared_name"},${date}::date,${lastProfile}::uuid,clock_timestamp()) r`
          )[0].r;
          expect(state.maximum).toBe(maximum);
          expect(state.used).toBe(0);
        }
        expect(a.capacity).toBe(10);
        complete = true;
        throw new Error("rollback CFG01");
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "rollback CFG01") throw e;
    } finally {
      await db.close({ timeout: 1 });
    }
    expect(complete).toBe(true);
  },
);
