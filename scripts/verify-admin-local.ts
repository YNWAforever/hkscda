import { SQL } from "bun";
import { createClient } from "@supabase/supabase-js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { benchmarkScenario } from "./verify-admin-performance.mjs";
if (process.env.COMPLETION_LOCAL_BENCHMARK !== "1")
  throw new Error("Explicit disposable fixture opt-in required");
const baseURL = "http://127.0.0.1:55430";
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:55322/postgres");
const lines = (await readFile("supabase/.temp/completion-local/start.raw.log", "utf8"))
  .trim()
  .split(/\r?\n/);
const local = JSON.parse(lines.at(-1)!);
if (local.API_URL !== "http://127.0.0.1:55321") throw new Error("Unexpected local stack");
const client = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const marker = `local-perf-${crypto.randomUUID()}`;
const password = crypto.randomUUID() + "aA1!";
let actor: string | undefined;
const report: any = {
  schemaVersion: 1,
  fixtureId: "hkscda-admin-local-v2",
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  origin: baseURL,
  environment: "Vite development server and isolated local Supabase; not production latency",
  startedAt: new Date().toISOString(),
  sizes: [],
};
const output = "docs/evidence/admin-local/performance.json";
await mkdir("docs/evidence/admin-local", { recursive: true });
async function cleanData() {
  await db`delete from public.content_item where title like ${marker + "%"}`;
  await db`delete from public.donation where supporter_id in (select id from public.supporter where source=${marker})`;
  await db`delete from public.supporter where source=${marker}`;
}
try {
  const created = await client.auth.admin.createUser({
    email: marker + "@example.invalid",
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  actor = created.data.user.id;
  await db`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${marker + "@example.invalid"},'admin','active')`;
  const loginClient = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await loginClient.auth.signInWithPassword({
    email: marker + "@example.invalid",
    password,
  });
  if (login.error) throw login.error;
  const token = login.data.session!.access_token;
  for (const count of [1000, 10000, 50000]) {
    await db.begin(async (tx) => {
      await tx`insert into public.supporter(name,email,language,tags,source) select ${marker}||'-'||n,n::text||'@'||${marker}||'.invalid','en',array[${marker}],${marker} from generate_series(1,${count}) n`;
      await tx`insert into public.supporter_role(supporter_id,role) select id,'donor' from public.supporter where source=${marker}`;
      await tx`insert into public.donation(supporter_id,amount_cents,purpose,type,status,method,receipt_requested) select s.id,10000,'medical','one_time','succeeded','manual',true from public.supporter s cross join generate_series(1,3) n where s.source=${marker}`;
      await tx`insert into public.consent(supporter_id,channel,status,source) select id,'email','opt_out',${marker} from public.supporter where source=${marker}`;
      await tx`insert into public.content_item(slug,type,title,summary) select ${marker}||'-'||n,'rescue_story',${marker}||'-'||n,'Synthetic benchmark summary' from generate_series(1,${count}) n`;
      await tx`insert into public.rescue_story_profile(content_item_id,animal_type,public_status,rescue_region) select id,'cat','rescued',${marker} from public.content_item where title like ${marker + "%"}`;
      await tx`insert into public.story_update(content_item_id,kind,title,body,occurred_at) select c.id,'general','Synthetic update',repeat('Synthetic history ',100),now()-n*interval '1 minute' from public.content_item c cross join generate_series(1,3) n where c.title like ${marker + "%"}`;
    });
    await db.unsafe(
      "analyze public.supporter; analyze public.donation; analyze public.consent; analyze public.content_item; analyze public.story_update; analyze public.rescue_story_profile",
    );
    const [supporter] =
      await db`select id from public.supporter where source=${marker} order by id limit 1`;
    const [content] =
      await db`select id,version from public.content_item where title like ${marker + "%"} order by id limit 1`;
    const scenarios = [
      {
        name: "supporter-list-first-50",
        path: `/api/admin/supporters?page=1&pageSize=50&tag=${marker}`,
        kind: "list",
        routeTemplate: "/api/admin/supporters",
      },
      {
        name: "supporter-detail",
        path: `/api/admin/supporters/${supporter.id}`,
        kind: "detail",
        routeTemplate: "/api/admin/supporters/:id",
      },
      {
        name: "content-list-first-50",
        path: `/api/admin/content?page=1&pageSize=50&rescueRegion=${marker}`,
        kind: "list",
        routeTemplate: "/api/admin/content",
      },
      {
        name: "content-detail",
        path: `/api/admin/content/${content.id}`,
        kind: "detail",
        routeTemplate: "/api/admin/content/:id",
      },
      {
        name: "content-save-atomic-audit",
        path: `/api/admin/content/${content.id}`,
        method: "PATCH",
        kind: "mutation",
        routeTemplate: "/api/admin/content/:id",
        requestBodies: Array.from({ length: 31 }, (_, i) => ({
          expectedVersion: content.version + i,
          summary: `Synthetic benchmark revision ${i}`,
        })),
      },
    ];
    const entry: any = {
      supporterCount: count,
      contentCount: count,
      donationsPerSupporter: 3,
      updatesPerContent: 3,
      scenarios: [],
    };
    report.sizes.push(entry);
    for (const scenario of scenarios) {
      const [beforeCalls] =
        await db`select coalesce(sum(calls),0)::bigint as total from pg_stat_statements`;
      const result = await benchmarkScenario({
        baseURL,
        scenario,
        headers: { authorization: `Bearer ${token}` },
        allowMutations: true,
      });
      const [afterCalls] =
        await db`select coalesce(sum(calls),0)::bigint as total from pg_stat_statements`;
      (result as any).observedDatabaseStatementCalls =
        Number(afterCalls.total) - Number(beforeCalls.total);
      (result as any).queryCountDefinition =
        "pg_stat_statements call delta for31 HTTP requests; includes authentication and possible local background work, not an exact per-request trace";
      entry.scenarios.push(result);
      await writeFile(output, JSON.stringify(report, null, 2));
      console.log(
        JSON.stringify({
          count,
          name: result.name,
          p95Ms: result.p95Ms,
          maxGzipBytes: result.maxGzipBytes,
          targetMet: result.targetMet,
        }),
      );
    }
    const [crmPlan] =
      await db`explain(analyze,buffers,format json) select public.crm_read_supporters(${{ tag: marker }}::jsonb,0,50,false)`;
    const [cmsPlan] =
      await db`explain(analyze,buffers,format json) select public.read_content_admin_summaries(${{ rescueRegion: marker, page: 1, pageSize: 50 }}::jsonb)`;
    entry.sqlPlans = { crm: crmPlan, cms: cmsPlan };
    await cleanData();
  }
  report.status = "complete";
} finally {
  await cleanData();
  if (actor) {
    await db`delete from public.audit_log where actor_user_id=${actor}::uuid`;
    await db`delete from public.admin_user where auth_user_id=${actor}::uuid`;
    const removed = await client.auth.admin.deleteUser(actor);
    if (removed.error) throw removed.error;
  }
  await db.close();
  report.completedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2));
}
