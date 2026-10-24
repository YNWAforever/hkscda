import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createOverviewHandler } from "../volunteers/overview";
import { volunteerJobHealth } from "../volunteers/jobs/health";

test("overview keeps available counts through optional timeouts and recovers partial data on retry", async () => {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/volunteerOverview.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "synthetic-overview-auth",
        setup(build) {
          build.onResolve({ filter: /supabase$/ }, (args) =>
            resolve(args.resolveDir, args.path) === resolve(import.meta.dir, "../supabase")
              ? { path: "auth", namespace: "fixture" }
              : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents:
              'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"synthetic-overview-only",user:{id:"synthetic-admin"}}}})}};',
          }));
        },
      },
    ],
  });
  expect(bundle.success, JSON.stringify(bundle.logs)).toBe(true);
  const fixtureId = crypto.randomUUID();
  let mode = "healthy";
  let cancelled = false;
  const now = new Date("2026-10-25T03:00:00Z");
  const handler = createOverviewHandler(
    {
      authorize: async () => {},
      read: async () => ({
        pendingProfiles: 7,
        pendingRegistrations: mode === "partial" ? null : 11,
        todayActivities: 3,
      }),
      readCoverage: async ({ signal }) => {
        if (mode === "stalled")
          return new Promise(() => {
            signal?.addEventListener(
              "abort",
              () => {
                cancelled = true;
              },
              { once: true },
            );
          });
        throw new Error("Synthetic coverage unavailable");
      },
      readHealth: async () =>
        volunteerJobHealth(
          mode === "partial"
            ? [
                { status: "failed", finished_at: "2026-10-25T02:15:00Z" },
                { status: "failed", finished_at: "2026-10-25T01:15:00Z" },
              ]
            : [{ status: "complete", finished_at: "2026-10-25T02:15:00Z" }],
          now,
        ),
    },
    () => now,
    50,
  );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/__fixture/identity")
        return Response.json({ fixtureId, backend: "memory", database: null, externalAuth: false });
      if (url.pathname === "/__fixture/mode") {
        const value = (await request.json()) as { mode: string };
        if (!["healthy", "partial", "stalled"].includes(value.mode))
          return new Response(null, { status: 400 });
        mode = value.mode;
        return Response.json({ fixtureId });
      }
      if (url.pathname === "/fixture.js")
        return new Response(bundle.outputs[0], { headers: { "content-type": "text/javascript" } });
      if (url.pathname === "/api/admin/volunteers/overview") return handler(request);
      if (url.pathname === "/api/admin/volunteers/calendar")
        return Response.json({ activities: [] });
      if (url.pathname === "/")
        return new Response(
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
import {chromium} from "playwright";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
 const page=await browser.newPage();page.setDefaultTimeout(5000);const errors=[],external=[];
 const origin=process.env.OVERVIEW_FIXTURE_ORIGIN;
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():(external.push(r.request().url()),r.abort()));
 const mode=value=>page.request.post(origin+"/__fixture/mode",{data:{mode:value}});
 const card=label=>page.getByRole("link").filter({has:page.getByText(label,{exact:true})});
 await page.goto(origin);await page.getByText("最近工作正常",{exact:true}).waitFor();
 assert.equal(await page.getByRole("alert").count(),0);
 assert.match(await card("待核實義工").innerText(),/7/);
 await mode("partial");await page.reload();await page.getByRole("button",{name:"重試統計",exact:true}).waitFor();
 await page.getByText("工作受阻，請聯絡管理員跟進",{exact:true}).waitFor();
 assert.match(await card("待核實義工").innerText(),/7/);assert.match(await card("今日開始的場次").innerText(),/3/);
 assert.match(await card("待審批報名").innerText(),/此項暫未能讀取/);
 await mode("healthy");await page.getByRole("button",{name:"重試統計",exact:true}).click();
 await page.getByRole("button",{name:"重試統計",exact:true}).waitFor({state:"detached"});
 assert.match(await card("待審批報名").innerText(),/11/);
 await mode("stalled");await page.reload();await page.getByText("最近工作正常",{exact:true}).waitFor();
 assert.match(await card("待核實義工").innerText(),/7/);assert.match(await card("待審批報名").innerText(),/11/);
 assert.match(await card("今日開始的場次").innerText(),/3/);
 assert.equal(await page.getByRole("alert").count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
} finally {await browser.close();}
`,
    ],
    { env: { ...process.env, OVERVIEW_FIXTURE_ORIGIN: origin }, stdout: "pipe", stderr: "pipe" },
  );
  try {
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, err || out).toBe(0);
    expect(cancelled).toBe(true);
  } finally {
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}, 20_000);
