import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.CMS_QUALITY_TEST_DATABASE_URL;
const enabled = Boolean(url) && process.env.CMS_QUALITY_ALLOW_LOCAL_FIXTURES === "1";
if (url) {
  const target = new URL(url);
  if (
    target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" ||
    target.search ||
    target.hash ||
    ![
      "57322/postgres",
      "52322/audit_pr135_20260929",
      ...(process.env.CI ? ["55322/postgres"] : []),
    ].includes(`${target.port}${target.pathname}`)
  )
    throw new Error("Dedicated disposable CMS quality database required");
}

test.skipIf(!enabled)(
  "CMS quality queue filters real catalog rows and rechecks actor",
  async () => {
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
        await db.unsafe("set local role service_role");
        const rows =
          await db`select public.editorial_quality_queue(${actor}::uuid,1,${quality}) result`;
        await db.unsafe("reset role");
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
      const deniedCall = async (sql: string, expected: string) => {
        await db.unsafe("savepoint quality_denied");
        let failure: unknown;
        try {
          await db.unsafe(sql, [actor]);
        } catch (error) {
          failure = error;
        }
        await db.unsafe("rollback to savepoint quality_denied");
        expect(failure).toHaveProperty("errno", expected);
      };
      for (const role of ["anon", "authenticated"]) {
        await db.unsafe("savepoint role_denied");
        await db.unsafe(`set local role ${role}`);
        await deniedCall("select public.editorial_quality_queue($1::uuid,1,'demo')", "42501");
        await db.unsafe("rollback to savepoint role_denied");
      }
      for (const query of [
        "select public.editorial_quality_queue($1::uuid,0,'demo')",
        "select public.editorial_quality_queue($1::uuid,1,'all')",
      ])
        await deniedCall(query, "22023");
      for (const role of ["treasurer"]) {
        await db.unsafe("update public.admin_user set role=$1 where auth_user_id=$2::uuid", [
          role,
          actor,
        ]);
        await deniedCall("select public.editorial_quality_queue($1::uuid,1,'demo')", "42501");
      }
      await db.unsafe("update public.admin_user set role='staff' where auth_user_id=$1::uuid", [
        actor,
      ]);
      await db.unsafe("set local role service_role");
      expect(
        (
          await db.unsafe("select public.editorial_quality_queue($1::uuid,1,'demo') result", [
            actor,
          ])
        )[0].result.total,
      ).toBeGreaterThan(0);
      await db.unsafe("reset role");
      await db.unsafe(
        "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
        [actor],
      );
      await deniedCall("select public.editorial_quality_queue($1::uuid,1,'demo')", "42501");
      await db.unsafe("update public.admin_user set status='active' where auth_user_id=$1::uuid", [
        actor,
      ]);
      await db.unsafe("update auth.users set email_confirmed_at=null where id=$1::uuid", [actor]);
      await deniedCall("select public.editorial_quality_queue($1::uuid,1,'demo')", "42501");
      await db.unsafe("update auth.users set email_confirmed_at=now() where id=$1::uuid", [actor]);
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

test.skipIf(!enabled)(
  "1000 CMS quality rows paginate deterministically without changing content or audit",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const actor = crypto.randomUUID(),
      admin = crypto.randomUUID();
    const stop = new Error("rollback1000quality");
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'staff','active')",
          [admin, actor, actor + "@example.invalid"],
        );
        const ids = Array.from({ length: 1000 }, () => crypto.randomUUID()),
          packed = "{" + ids.join(",") + "}";
        await tx.unsafe(
          "insert into public.content_item(id,slug,type,title,summary,status,content_class,source_reference,content_owner,effective_until,updated_at) select id,'synthetic-quality-'||id,'report','Synthetic quality '||n,'Synthetic',case when n>875 then 'archived' else 'draft' end,case when n%4=0 then 'demo' when n%4=3 then 'unreviewed' else 'verified' end,case when n%4 in (0,3) then null else 'Synthetic source' end,'Synthetic owner',case when n%4 in (0,1) then now()-interval '1 day' else now()+interval '1 day' end,timestamptz '2099-01-01' from unnest($1::uuid[]) with ordinality as t(id,n)",
          [packed],
        );
        const fingerprint = async () =>
          (
            await tx.unsafe(
              "select md5(string_agg(to_jsonb(c)::text,'|' order by c.id)) digest,(select count(*)::int from public.audit_log) audit_count from public.content_item c where c.id=any($1::uuid[])",
              [packed],
            )
          )[0];
        const before = await fingerprint();
        for (const quality of ["demo", "expired", "missing_source"] as const) {
          const wanted = ids
            .filter(
              (_, i) =>
                i < 875 &&
                (quality === "demo"
                  ? (i + 1) % 4 === 0
                  : quality === "expired"
                    ? [0, 1].includes((i + 1) % 4)
                    : [0, 3].includes((i + 1) % 4)),
            )
            .sort()
            .reverse();
          const found: string[] = [];
          const timings: number[] = [];
          await tx.unsafe("set local role service_role");
          for (let page = 1; page <= Math.ceil(wanted.length / 25) + 1; page++) {
            const start = performance.now();
            const result = (
              await tx.unsafe("select public.editorial_quality_queue($1::uuid,$2,$3) result", [
                actor,
                page,
                quality,
              ])
            )[0].result as { total: number; items: Array<{ entity_id: string }> };
            timings.push(performance.now() - start);
            expect(result.total).toBe(wanted.length);
            expect(result.items.length).toBeLessThanOrEqual(25);
            found.push(...result.items.map((r) => r.entity_id));
          }
          await tx.unsafe("reset role");
          expect(found).toEqual(wanted);
          expect(new Set(found).size).toBe(found.length);
          console.info(
            JSON.stringify({
              fixture: "1000 synthetic quality",
              quality,
              matches: wanted.length,
              pages: timings.length,
              p50ms: timings.slice().sort((a, b) => a - b)[Math.floor(timings.length * 0.5)],
              p95ms: timings.slice().sort((a, b) => a - b)[Math.floor(timings.length * 0.95)],
            }),
          );
        }
        expect(await fingerprint()).toEqual(before);
        throw stop;
      });
    } catch (error) {
      if (error !== stop) throw error;
    } finally {
      await db.close();
    }
  },
  30000,
);
