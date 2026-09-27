import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.CMS_QUALITY_TEST_DATABASE_URL;
const enabled = Boolean(url) && process.env.CMS_QUALITY_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "CMS quality queue filters real catalog rows and rechecks actor",
  async () => {
    const address = new URL(url!);
    expect(address.hostname).toBe("127.0.0.1");
    expect(["55322", "57322"]).toContain(address.port);
    const db = new SQL(url!, { max: 1, prepare: false });
    const actor = crypto.randomUUID();
    const marker = crypto.randomUUID().slice(0, 8);
    const ids: Record<string, string> = {};
    await db`begin`;
    try {
      await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
      values(${actor}::uuid,${actor + "@example.invalid"},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status)
      values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      for (const quality of ["demo", "expired", "missing_source", "current"] as const) {
        const id = crypto.randomUUID();
        ids[quality] = id;
        const source = quality === "missing_source" ? "" : "synthetic test provenance";
        const contentClass =
          quality === "demo" ? "demo" : quality === "missing_source" ? "unreviewed" : "verified";
        await db`insert into public.content_item(
        id,slug,type,title,summary,status,content_class,source_reference,content_owner,effective_until,updated_at
      ) values (
        ${id}::uuid,${"cms-quality-" + marker + "-" + quality.replace("_", "-")},
        'rescue_story',${"Synthetic " + quality},'Synthetic test only','draft',
        ${contentClass},nullif(${source},''),nullif(${source},''),
        case when ${quality}='expired' then now()-interval '1 day' else null end,
        timestamptz '2099-01-01'
      )`;
      }
      for (const quality of ["demo", "expired", "missing_source"] as const) {
        const rows =
          await db`select public.editorial_quality_queue(${actor}::uuid,1,${quality}) result`;
        const result = rows[0].result as {
          total: number;
          items: Array<{ entity_id: string; quality_reason: string }>;
        };
        expect(result.total).toBeGreaterThanOrEqual(1);
        expect(result.items).toContainEqual(
          expect.objectContaining({
            entity_id: ids[quality],
            quality_reason: quality,
          }),
        );
        expect(result.items.some((item) => item.entity_id === ids.current)).toBe(false);
      }
      const access = await db`select
      has_function_privilege('anon','public.editorial_quality_queue(uuid,integer,text)','EXECUTE') anon,
      has_function_privilege('authenticated','public.editorial_quality_queue(uuid,integer,text)','EXECUTE') authenticated,
      has_function_privilege('service_role','public.editorial_quality_queue(uuid,integer,text)','EXECUTE') service`;
      expect(access[0]).toMatchObject({ anon: false, authenticated: false, service: true });
      await db`update auth.users set banned_until=now()+interval '1 day' where id=${actor}::uuid`;
      let denied: unknown;
      try {
        await db`select public.editorial_quality_queue(${actor}::uuid,1,'demo')`;
      } catch (error) {
        denied = error;
      }
      expect(denied).toHaveProperty("errno", "42501");
    } finally {
      await db`rollback`;
      await db.close({ timeout: 1 });
    }
  },
  30000,
);
