import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "../policy/catalogue";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url) {
  const t = new URL(url);
  if (
    t.hostname !== "127.0.0.1" ||
    t.port !== "56322" ||
    t.pathname !== "/postgres" ||
    t.search ||
    t.hash
  )
    throw Error("Dedicated disposable database required");
}
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "generation uses effective policy timezone and horizon rather than a future version",
  async () => {
    const db = new SQL(url!, { max: 1 });
    const actor = crypto.randomUUID(),
      first = crypto.randomUUID(),
      future = crypto.randomUUID(),
      template = "generation-" + crypto.randomUUID();
    try {
      await db`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      const zone = (
        await db`select zone from unnest(array['Etc/GMT+12','Pacific/Kiritimati']) zone where (clock_timestamp() at time zone zone)::date<>(clock_timestamp() at time zone 'Asia/Hong_Kong')::date limit 1`
      )[0].zone;
      const body = structuredClone(initialPolicyCatalogue[0]);
      body.template_key = template;
      body.timezone = zone;
      body.schedule.generation_days = 1;
      body.schedule.start_time = "12:00";
      body.schedule.end_time = "13:00";
      await db`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason) values(${first}::uuid,${template},${body}::jsonb,'generation-first',now()-interval '1 day',${actor}::uuid,'Synthetic effective timezone')`;
      await db`insert into public.volunteer_policy_schedule(template_key,effective_from,effective_until,version_id) values(${template},now()-interval '1 day',now()+interval '10 days',${first}::uuid)`;
      body.schedule.generation_days = 5;
      await db`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason) values(${future}::uuid,${template},${body}::jsonb,'generation-future',now()+interval '10 days',${actor}::uuid,'Synthetic future version')`;
      await db`insert into public.volunteer_policy_schedule(template_key,effective_from,version_id) values(${template},now()+interval '10 days',${future}::uuid)`;
      await db`select public.generate_due_volunteer_sessions(${actor}::uuid)`;
      const [counts] =
        await db`select count(*) filter(where (starts_at at time zone ${zone})::date=(clock_timestamp() at time zone ${zone})::date+1)::int next_day,count(*) filter(where (starts_at at time zone ${zone})::date>(clock_timestamp() at time zone ${zone})::date+1)::int beyond_horizon,count(*) filter(where policy_version_id<>${first}::uuid)::int wrong_version from public.volunteer_activity where template_key=${template}`;
      expect(counts.next_day).toBe(1);
      expect(counts.beyond_horizon).toBe(0);
      expect(counts.wrong_version).toBe(0);
      await db`select public.generate_due_volunteer_sessions(${actor}::uuid)`;
      expect(
        (
          await db`select count(*)::int n from public.volunteer_activity where template_key=${template} and (starts_at at time zone ${zone})::date=(clock_timestamp() at time zone ${zone})::date+1`
        )[0].n,
      ).toBe(1);
    } finally {
      await db.close();
    }
  },
);
