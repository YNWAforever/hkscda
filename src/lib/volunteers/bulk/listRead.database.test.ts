import { SQL } from "bun";
import { expect, test } from "bun:test";

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
          where funcid='public.volunteer_activity_workspace_rows(jsonb)'::regprocedure`;
        // Count the real eligibility projection, rather than relying on timing or source text.
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
