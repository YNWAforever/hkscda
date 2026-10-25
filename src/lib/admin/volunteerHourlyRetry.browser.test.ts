import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { requireAdmin } from "./session.server";
import { createOverviewHandler } from "../volunteers/overview";
import { volunteerJobHealth } from "../volunteers/jobs/health";
import { createHourlyRetryHandler, runHourlyRetry } from "../volunteers/jobs/hourlyRetry.server";
import type { VolunteerJobRepository } from "../volunteers/jobs/service";

// required-reason: volunteer_runtime_job.retry
test("hourly retry requires a reason and preserves the confirmed revision through refresh and errors", async () => {
  // Real UI/guard/handler/service; only Auth, data and transactional RPC boundaries are synthetic.
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/volunteerOverview.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "synthetic-hourly-auth",
        setup(build) {
          build.onResolve({ filter: /supabase$/ }, (args) =>
            resolve(args.resolveDir, args.path) === resolve(import.meta.dir, "../supabase")
              ? { path: "auth", namespace: "fixture" }
              : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents:
              'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"synthetic-hourly-only",user:{id:"00000000-0000-4000-8000-000000000001"}}}})}};',
          }));
        },
      },
    ],
  });
  expect(bundle.success, JSON.stringify(bundle.logs)).toBe(true);
  const fixtureId = crypto.randomUUID();
  const assetRoot = resolve(import.meta.dir, "../../../.vercel/output/static");
  const css = process.env.HOURLY_EVIDENCE_DIR
    ? [...new Bun.Glob("assets/*.css").scanSync({ cwd: assetRoot })].filter((path) =>
        /(?:styles-|fonts-|VolunteerAdminShell-)/.test(path),
      )
    : [];
  const actor = "00000000-0000-4000-8000-000000000001";
  const now = () => new Date("2026-10-25T03:20:00Z");
  let role = "admin",
    mode = "complete",
    status = "failed";
  let revision = "2026-10-25T03:15:00.123456+00:00";
  let posts = 0,
    audits = 0,
    work = 0,
    waiting = false;
  let release = () => {};
  const commands: unknown[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: actor, email: "synthetic@example.invalid" } },
        error: null,
      }),
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: {
            id: actor,
            auth_user_id: actor,
            email: "synthetic@example.invalid",
            role,
            status: "active",
          },
          error: null,
        }),
      };
      return query;
    },
  };
  const repo: VolunteerJobRepository = {
    claim: async () => {
      throw new Error("Unaudited claim forbidden");
    },
    preflight: async () => {},
    generate: async () => {
      work++;
      return 0;
    },
    persistReleases: async () => 0,
    promote: async () => 0,
    assess: async () => false,
    deferNotifications: async () => 0,
    finish: async (_bucket, _owner, outcome) => {
      status = outcome;
    },
  };
  const retry = createHourlyRetryHandler(
    {
      authorize: (request) => requireAdmin(request, ["admin"], client as never),
      run: (input, actorId) =>
        runHourlyRetry(
          repo,
          async (command) => {
            commands.push(command);
            if (mode === "unavailable") throw { code: "PGRST202" };
            if (mode === "held") {
              waiting = true;
              await new Promise<void>((resolve) => {
                release = resolve;
              });
              waiting = false;
            }
            // This in-memory boundary is not proof of SQL atomicity.
            if (status !== "failed" || command.expectedUpdatedAt !== revision) return false;
            status = "running";
            audits++;
            return true;
          },
          actorId,
          input,
          now,
        ),
    },
    now,
  );
  const overview = createOverviewHandler(
    {
      authorize: (request) =>
        requireAdmin(request, ["staff", "admin"], client as never).then(() => {}),
      read: async () => {
        if (mode === "refresh-fail" && status === "complete")
          throw new Error("Synthetic refresh failed");
        return { pendingProfiles: 7, pendingRegistrations: 11, todayActivities: 3 };
      },
      readHealth: async () =>
        volunteerJobHealth(
          [
            {
              status,
              bucket: "2026-10-25T03:00:00+00:00",
              finished_at: revision,
              lease_until: null,
            },
            {
              status: "failed",
              bucket: "2026-10-25T02:00:00Z",
              finished_at: "2026-10-25T02:15:00Z",
              lease_until: null,
            },
          ],
          now(),
          undefined,
          role === "admin",
        ),
    },
    now,
  );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/__fixture/identity")
        return Response.json({ fixtureId, backend: "memory", database: null, externalAuth: false });
      if (url.pathname === "/__fixture/report")
        return Response.json({ posts, audits, work, waiting, commands });
      if (url.pathname === "/__fixture/release") {
        release();
        return Response.json({ fixtureId });
      }
      if (url.pathname === "/__fixture/state") {
        const input = await request.json();
        role = input.role ?? role;
        mode = input.mode ?? mode;
        status = input.status ?? status;
        revision = input.revision ?? revision;
        return Response.json({ fixtureId });
      }
      if (url.pathname === "/api/admin/me")
        return Response.json({ admin: { id: actor, authUserId: actor, role, status: "active" } });
      if (url.pathname === "/api/admin/volunteers/overview") return overview(request);
      if (url.pathname === "/api/admin/volunteers/calendar")
        return Response.json({ activities: [] });
      if (url.pathname === "/api/admin/volunteers/runtime/retry") {
        posts++;
        return retry(request);
      }
      if (url.pathname === "/fixture.js")
        return new Response(bundle.outputs[0], { headers: { "content-type": "text/javascript" } });
      if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
        const file = Bun.file(assetRoot + url.pathname);
        return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 });
      }
      if (url.pathname === "/")
        return new Response(
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            css.map((path) => `<link rel="stylesheet" href="/${path}">`).join("") +
            '<div id="root"></div><script type="module" src="/fixture.js"></script>',
          { headers: { "content-type": "text/html" } },
        );
      return new Response(null, { status: 404 });
    },
  });
  const origin = `http://127.0.0.1:${server.port}`;
  expect(await (await fetch(origin + "/__fixture/identity")).json()).toEqual({
    fixtureId,
    backend: "memory",
    database: null,
    externalAuth: false,
  });
  const child = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "-e",
      `
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
const origin=process.env.HOURLY_FIXTURE_ORIGIN;
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
 const page=await browser.newPage();page.setDefaultTimeout(5000);const errors=[],external=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():(external.push(r.request().url()),r.abort()));
 const state=data=>page.request.post(origin+"/__fixture/state",{data});
 const report=async()=>(await page.request.get(origin+"/__fixture/report")).json();
 const open=()=>page.getByRole("button",{name:"重跑本時段工作",exact:true});
 const dialog=()=>page.getByRole("alertdialog");
 const confirm=()=>dialog().getByRole("button",{name:"確認重跑",exact:true});
 const reason=()=>dialog().getByRole("textbox",{name:"原因",exact:true});
 await page.goto(origin);await open().waitFor();
 assert.equal((await report()).posts,0);
 await open().click();assert.equal(await confirm().isDisabled(),true);
 await reason().fill("   ");assert.equal(await confirm().isDisabled(),true);
 if(process.env.HOURLY_EVIDENCE_DIR){
  await fs.mkdir(process.env.HOURLY_EVIDENCE_DIR,{recursive:true});
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   const box=await dialog().evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.ok(box.scroll<=box.width);assert.ok(box.page<=box.viewport);
   await page.screenshot({path:process.env.HOURLY_EVIDENCE_DIR+"/confirm-"+width+".png",fullPage:true});
   console.log(JSON.stringify({layout:width,...box}));
  }
 }
 await dialog().getByRole("button",{name:"取消",exact:true}).click();assert.equal((await report()).posts,0);
 await state({mode:"unavailable"});await open().click();await reason().fill("Synthetic reason retained");await confirm().click();
 await dialog().getByText("重跑功能暫未可用，請聯絡管理員。",{exact:true}).waitFor();
 assert.equal(await reason().inputValue(),"Synthetic reason retained");assert.equal((await report()).work,0);assert.equal((await report()).audits,0);
 await state({mode:"complete",revision:"2026-10-25T03:16:00.654321+00:00"});
 const refresh=page.waitForResponse(r=>r.url().includes("/api/admin/volunteers/overview"));
 await page.locator("button").filter({hasText:"Simulate a newer overview refresh"}).evaluate(e=>e.click());await refresh;
 await confirm().click();await dialog().getByText("工作狀態已變，請取消並重新整理後再確認。",{exact:true}).waitFor();
 assert.equal((await report()).work,0);assert.equal((await report()).commands.at(-1).expectedUpdatedAt,"2026-10-25T03:15:00.123456+00:00");
 await dialog().getByRole("button",{name:"取消",exact:true}).click();
 await state({mode:"held"});await open().click();await reason().fill("  Synthetic final reason  ");
 await confirm().click();await page.waitForFunction(async()=> (await (await fetch("/__fixture/report")).json()).waiting);
 const working=dialog().getByRole("button",{name:"處理中…",exact:true});assert.equal(await working.isDisabled(),true);
 await working.evaluate(e=>{e.click();e.click();});
 const held=await report();assert.equal(held.posts,3);assert.equal(held.work,0);
 await page.request.post(origin+"/__fixture/release");await dialog().waitFor({state:"detached"});
 await page.getByText("本時段工作已完成；已重新載入狀態。",{exact:true}).waitFor();await open().waitFor({state:"detached"});
 const done=await report();assert.equal(done.audits,1);assert.equal(done.work,1);assert.equal(done.commands.at(-1).reason,"Synthetic final reason");
 await state({mode:"refresh-fail",status:"failed",revision:"2026-10-25T03:17:00.000001+00:00"});await page.reload();await open().waitFor();
 await open().click();await reason().fill("Synthetic acknowledged job");await confirm().click();await dialog().waitFor({state:"detached"});
 await page.getByText("工作已完成，但未能刷新狀態，請重新整理。",{exact:true}).waitFor();
 assert.equal(await open().isDisabled(),true);
 for(const role of ["staff","treasurer"]){
  await state({mode:"complete"});
  await state({role,status:"failed"});await page.reload();
  await page.getByRole("heading",{name:"義工營運總覽",exact:true}).waitFor();
  assert.equal(await open().count(),0);
  const denied=await page.request.post(origin+"/api/admin/volunteers/runtime/retry",{headers:{authorization:"Bearer synthetic-hourly-only"},data:{bucket:"2026-10-25T03:00:00Z",expectedUpdatedAt:"2026-10-25T03:16:00.654321+00:00",confirmed:true,reason:"Synthetic denied reason"}});
  assert.equal(denied.status(),403);
 }
 assert.equal((await report()).audits,2);assert.equal((await report()).work,2);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({checks:["cancel/no POST","required reason","missing RPC fail-closed","stale confirmed revision","pending double submit","finish then refresh","staff/treasurer denied"],counts:await report()}));
} finally {await browser.close();}
`,
    ],
    { env: { ...process.env, HOURLY_FIXTURE_ORIGIN: origin }, stdout: "pipe", stderr: "pipe" },
  );
  try {
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, err || out).toBe(0);
    console.info(out.trim());
    expect(commands).toHaveLength(4);
    expect(commands.at(-1)).toMatchObject({ reason: "Synthetic acknowledged job" });
  } finally {
    release();
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}, 25_000);
