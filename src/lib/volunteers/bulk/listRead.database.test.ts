import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "../policy/catalogue";

const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
if (url) {
  const target = new URL(url);
  const ports = process.env.CI === "true" ? ["56322", "55322"] : ["56322"];
  if (target.hostname !== "127.0.0.1" || !ports.includes(target.port))
    throw new Error("Dedicated isolated volunteer database required");
}

type Listing = {
  kind: string;
  total: number;
  page_size: number;
  activities: { title: string }[];
};

test.skipIf(!enabled)(
  "workspace list evaluates eligibility once per read while retaining totals and page ordering",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback isolated list fixture");
    try {
      await db.begin(async (tx) => {
        await tx`set local track_functions = 'all'`;
        const actor = crypto.randomUUID();
        const marker = "list-read-" + actor;
        await tx`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
          values(${actor}::uuid,${actor + "@example.invalid"},now(),now(),now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status)
          values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        await tx`insert into public.volunteer_activity(type,title,starts_at,location,capacity,status)
          select 'volunteer_shift',${marker} || '-' || lpad(n::text,2,'0'),
            '2099-01-01T00:00:00Z'::timestamptz + n * interval '1 day',
            'Synthetic list read fixture',5,'draft'
          from generate_series(0,26) n`;
        const titles = (from: number, count: number, step = 1) =>
          Array.from(
            { length: count },
            (_, index) => `${marker}-${String(from + index * step).padStart(2, "0")}`,
          );
        const read = async (page: number, sort: "asc" | "desc") => {
          const command = { action: "list", filter: { q: marker, sort }, page };
          const [row] =
            await tx`select public.volunteer_bulk_command(${actor}::uuid,${JSON.stringify(command)}::jsonb) as result`;
          const result = row.result as Listing;
          expect(result.kind).toBe("listed");
          expect(result.total).toBe(27);
          expect(result.page_size).toBe(25);
          return result.activities.map((item) => item.title);
        };
        expect(await read(1, "asc")).toEqual(titles(0, 25));
        expect(await read(2, "asc")).toEqual(titles(25, 2));
        expect(await read(1, "desc")).toEqual(titles(26, 25, -1));
        expect(await read(99, "asc")).toEqual([]);
        const [stats] = await tx`
          select calls from pg_stat_xact_user_functions
          where funcid=coalesce(
            to_regprocedure('public.volunteer_activity_workspace_project(uuid[],jsonb)'),
            'public.volunteer_activity_workspace_rows(jsonb)'::regprocedure)`;
        // Count the real eligibility projection, rather than relying on timing or source text.
        // The paged schema keeps workspace_rows as a full-set compatibility adapter.
        expect(Number(stats.calls)).toBe(4);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!enabled)(
  "pagination without shortage filtering skips off-page staffing while shortage filtering remains complete",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback isolated staffing page fixture");
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID();
        const member = crypto.randomUUID();
        const version = crypto.randomUUID();
        const marker = "staffing-page-" + actor;
        for (const id of [actor, member])
          await tx`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
            values(${id}::uuid,${id + "@example.invalid"},now(),now(),now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status)
          values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        await tx`insert into public.volunteer_profile
          (auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at)
          values(${member}::uuid,'Synthetic staffing page member','1990-01-01','regular',
            'active',${actor}::uuid,now())`;
        // Synthetic transaction-only rules; this does not approve an operational policy.
        const body = structuredClone(
          initialPolicyCatalogue.find((policy) => policy.template_key === "cat-cleaning-a")!,
        );
        body.template_key = "page-" + actor.replaceAll("-", "");
        body.name = "Synthetic staffing pagination policy";
        body.source = "Synthetic isolated read regression";
        body.booking.scenario = "no_confirmed_group";
        body.booking.individual_open = { mode: "unrestricted" };
        body.booking.auto_approve = true;
        body.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
        body.capacity.role_count_model = "leader_separate";
        body.release_rules = [];
        body.daily_limits = [];
        body.tier_quotas = [];
        body.eligibility.credentials = { mode: "all", keys: [] };
        body.roles = [structuredClone(body.roles.find((role) => role.key === "assistant")!)];
        body.roles[0].minimum = 1;
        body.roles[0].reserved = 0;
        body.roles[0].maximum = { state: "unlimited" };
        body.roles[0].allowed_tiers = ["regular"];
        body.roles[0].credentials = { mode: "all", keys: [] };
        await tx`insert into public.volunteer_policy_version
          (id,template_key,body,content_hash,effective_from,published_by,reason)
          values(${version}::uuid,${body.template_key},${JSON.stringify(body)}::jsonb,
            'synthetic-page',now(),${actor}::uuid,'Synthetic staffing page regression')`;
        const activities: { id: string; title: string }[] =
          await tx`insert into public.volunteer_activity
          (type,title,starts_at,ends_at,location,capacity,status,policy_version_id,template_key,shelter_key)
          select 'volunteer_shift',${marker} || '-' || lpad(n::text,2,'0'),
            '2099-01-01T00:00:00Z'::timestamptz + n * interval '1 day',
            '2099-01-01T03:00:00Z'::timestamptz + n * interval '1 day',
            'Synthetic page location',5,'published',${version}::uuid,${body.template_key},'cat'
          from generate_series(0,26) n returning id,title`;
        for (const item of activities.filter((a) => /-(25|26)$/.test(a.title))) {
          const command = {
            action: "book",
            activity_id: item.id,
            role: "assistant",
            accept_terms: true,
            terms_version_id: body.terms.version_id,
            idempotency_key: crypto.randomUUID(),
          };
          const [booked] = await tx`select public.volunteer_booking_command
            (${member}::uuid,${JSON.stringify(command)}::jsonb) as result`;
          expect(booked.result.kind).toBe("booked");
        }
        await tx`set local track_functions='all'`;
        const calls = async () => {
          const [row] = await tx`select coalesce(sum(calls),0)::int as count
            from pg_stat_xact_user_functions
            where funcid='public.volunteer_policy_evaluate(uuid,uuid,text,timestamptz,uuid)'::regprocedure`;
          return Number(row.count);
        };
        const read = async (page: number, filter: Record<string, unknown> = {}) => {
          const command = { action: "list", filter: { q: marker, sort: "asc", ...filter }, page };
          const [row] = await tx`select public.volunteer_bulk_command
            (${actor}::uuid,${JSON.stringify(command)}::jsonb) as result`;
          return row.result as Omit<Listing, "activities"> & {
            activities: { title: string; approved: number; shortages: unknown[] }[];
          };
        };
        const before = await calls();
        const first = await read(1);
        expect(first.total).toBe(27);
        expect(first.activities.map((item) => item.title)).toEqual(
          Array.from({ length: 25 }, (_, n) => `${marker}-${String(n).padStart(2, "0")}`),
        );
        expect((await calls()) - before).toBe(0);
        const second = await read(2);
        expect(second.total).toBe(27);
        expect(second.activities.map((item) => item.title)).toEqual([
          marker + "-25",
          marker + "-26",
        ]);
        expect(second.activities.map((item) => item.approved)).toEqual([1, 1]);
        expect(second.activities.map((item) => item.shortages)).toEqual([[], []]);
        expect((await calls()) - before).toBe(2);
        const shortage = await read(1, { shortage: true });
        expect(shortage.total).toBe(25);
        expect(shortage.activities).toHaveLength(25);
        expect((await calls()) - before).toBe(4);
        const empty = await read(99);
        expect(empty.total).toBe(27);
        expect(empty.activities).toEqual([]);
        expect((await calls()) - before).toBe(4);
        for (const role of ["anon", "authenticated", "service_role"]) {
          for (const statement of [
            "select * from public.volunteer_activity_workspace_candidates('{}'::jsonb)",
            "select * from public.volunteer_activity_workspace_project('{}'::uuid[],'{}'::jsonb)",
          ]) {
            await tx.unsafe("savepoint internal_workspace_acl");
            let deniedCode: string | undefined;
            try {
              await tx.unsafe("set local role " + role);
              await tx.unsafe(statement);
            } catch (error) {
              if (error && typeof error === "object" && "errno" in error)
                deniedCode = String(error.errno);
            }
            await tx.unsafe("rollback to savepoint internal_workspace_acl");
            await tx.unsafe("release savepoint internal_workspace_acl");
            expect(deniedCode).toBe("42501");
          }
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);
