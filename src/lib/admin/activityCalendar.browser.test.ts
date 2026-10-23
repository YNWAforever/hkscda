import { expect, test } from "bun:test";
import { resolve } from "node:path";

async function runFixture<T>(script: string) {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/workspaceUrl.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "calendar-local-auth",
        setup(build) {
          build.onResolve({ filter: /supabase$/ }, (args) =>
            resolve(args.resolveDir, args.path) === resolve(import.meta.dir, "../supabase")
              ? { path: "auth-fixture", namespace: "fixture" }
              : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents:
              'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"fixture-token",user:{id:"fixture"}}}})}};',
          }));
        },
      },
    ],
  });
  expect(bundle.success).toBe(true);
  const rows = Array.from({ length: 26 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `Calendar session ${String(index + 1).padStart(2, "0")}`,
    starts_at: index === 25 ? "2026-10-18T16:00:00Z" : "2026-10-18T01:00:00Z",
    ends_at: null,
    location: "Isolated fixture",
    status: "published",
    capacity: 1,
    template_key: null,
    shelter_key: null,
    policy_version_id: null,
    policy_revision: 0,
    updated_at: "2026-10-17T00:00:00Z",
    scenario: null,
    approved: 0,
    waitlisted: 0,
    shortages: [],
    registrations_closed_at: null,
  }));
  const calls: { page: number; from?: string; until?: string }[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/fixture.js")
        return new Response(bundle.outputs[0], { headers: { "content-type": "text/javascript" } });
      if (path === "/api/admin/volunteers/bulk" && request.method === "POST") {
        const body = (await request.json()) as {
          action: string;
          page?: number;
          filter?: { from?: string; until?: string };
        };
        if (body.action === "templates") return Response.json({ templates: [] });
        if (body.action === "list") {
          const page = body.page ?? 1;
          calls.push({ page, from: body.filter?.from, until: body.filter?.until });
          const day = body.filter?.from;
          if (day === "2026-10-25" && page === 2)
            return Response.json({ error: "Isolated read failure" }, { status: 503 });
          if (day === "2026-10-26") await new Promise((done) => setTimeout(done, 250));
          const total =
            day === "2026-10-20"
              ? 0
              : day === "2026-10-21" || day === "2026-10-27"
                ? 1
                : day === "2026-10-22"
                  ? 25
                  : 26;
          const results = rows.slice(0, total).map((row) => ({
            ...row,
            ...(day !== "2026-10-18"
              ? { starts_at: `${day}T01:00:00Z`, title: `${day} ${row.title}` }
              : {}),
          }));
          return Response.json({ activities: results.slice((page - 1) * 25, page * 25), total });
        }
        if (body.action === "detail") {
          return Response.json({
            activity: rows[0],
            registrations: [],
            total: 0,
            history: [],
            history_total: 0,
          });
        }
        return Response.json({ error: "Read-only fixture" }, { status: 400 });
      }
      if (path === "/")
        return new Response(
          '<div id="root"></div><script type="module" src="/fixture.js"></script>',
          { headers: { "content-type": "text/html" } },
        );
      return new Response(null, { status: 404 });
    },
  });
  const child = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "-e",
      `
import{chromium}from"playwright";
import assert from"node:assert/strict";
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 // Match the service date of this synthetic calendar fixture.
 await page.clock.setFixedTime(new Date("2026-10-18T02:00:00Z"));
 page.setDefaultTimeout(8000);
 const origin=process.env.CALENDAR_FIXTURE_ORIGIN;
 const url=(from,until=from,extra="")=>origin+"/?view=calendar&date_scope=custom&from="+from+"&until="+until+extra;
 ${script}
}finally{await browser.close();}`,
    ],
    {
      env: { ...process.env, CALENDAR_FIXTURE_ORIGIN: `http://127.0.0.1:${server.port}` },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  try {
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(err).toBe("");
    expect(code).toBe(0);
    return { result: JSON.parse(out) as T, calls };
  } finally {
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}
test("calendar retains every loaded date page instead of replacing the first 25 sessions", async () => {
  const { result, calls } = await runFixture<{
    firstStillVisible: number;
    lastVisible: number;
    search: string;
    errors: string[];
  }>(`
 await page.goto(url("2026-10-18","2026-10-19"));
 await page.getByRole("button",{name:"Calendar session 01",exact:true}).waitFor();
 await page.getByRole("button",{name:"Next page",exact:true}).click();
 await page.getByRole("button",{name:"Calendar session 26",exact:true}).waitFor();
 await page.getByText("All 26 sessions in this range are loaded.",{exact:true}).waitFor();
 assert.equal(await page.getByRole("button",{name:"Select page 2 (1)",exact:true}).count(),1);
 await page.getByRole("button",{name:"Select page 2 (1)",exact:true}).click();
 assert.equal(await page.locator("section[aria-label='Hong Kong date calendar'] input:checked").count(),1);
 console.log(JSON.stringify({
  firstStillVisible:await page.getByRole("button",{name:"Calendar session 01",exact:true}).count(),
  lastVisible:await page.getByRole("button",{name:"Calendar session 26",exact:true}).count(),
  search:await page.evaluate(()=>location.search),errors}));
`);
  expect(result.errors).toEqual([]);
  expect(result.lastVisible).toBe(1);
  expect(result.firstStillVisible).toBe(1);
  expect(new URLSearchParams(result.search).get("page")).toBe("2");
  expect(calls.map((c) => c.page)).toEqual([1, 2]);
  expect(calls.every((c) => c.from === "2026-10-18" && c.until === "2026-10-19")).toBe(true);
}, 25_000);

test("calendar reports zero, one, 25, page failures and unbounded ranges truthfully", async () => {
  const { result, calls } = await runFixture<{ errors: string[] }>(`
 for(const [day,total]of[["20",0],["21",1],["22",25]]){
  await page.goto(url("2026-10-"+day));
  await page.getByText("All "+total+" sessions in this range are loaded.",{exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:/^2026-10-.* Calendar session/}).count(),total);
 }
 await page.goto(url("2026-10-25"));
 await page.getByRole("button",{name:"2026-10-25 Calendar session 01",exact:true}).waitFor();
 await page.getByRole("button",{name:"Next page",exact:true}).click();
 await page.getByText(/Loading failed. 25 loaded sessions are retained/).waitFor();
 assert.equal(await page.getByRole("button",{name:/^2026-10-25 Calendar session/}).count(),25);
 assert.equal(await page.getByText("No activities match the filters. Change the filters.",{exact:true}).count(),0);
 await page.goto(origin+"/?view=calendar&date_scope=all");
 await page.getByText("Choose both dates. The calendar reads at most 93 days at a time.",{exact:true}).waitFor();
 await page.goto(url("2026-01-01","2026-04-04"));
 await page.getByText("This range exceeds 93 days. Choose a shorter range.",{exact:true}).waitFor();
 assert.equal(await page.getByRole("button",{name:/^Calendar session/}).count(),0);
 console.log(JSON.stringify({errors}));
`);
  expect(result.errors).toEqual([]);
  expect(calls.filter((c) => c.from === undefined || c.from === "2026-01-01")).toEqual([]);
}, 30_000);

test("calendar date changes ignore old reads and retain URL selection through reload and Back", async () => {
  const { result } = await runFixture<{ errors: string[] }>(`
 await page.goto(url("2026-10-18","2026-10-19","&page=2"));
 await page.getByText(/Partial data: 1 \\/ 26/).waitFor();
 await page.getByRole("button",{name:"Previous page",exact:true}).click();
 await page.getByText("All 26 sessions in this range are loaded.",{exact:true}).waitFor();
 await page.getByRole("button",{name:"Calendar session 01",exact:true}).click();
 await page.getByRole("dialog").waitFor();
 const selected=new URL(page.url()).searchParams.get("selected");assert.ok(selected);
 await page.reload();
 await page.getByRole("dialog").waitFor();
 assert.equal(new URL(page.url()).searchParams.get("selected"),selected);
 await page.getByRole("button",{name:"Close",exact:true}).click();
 assert.equal(new URL(page.url()).searchParams.get("from"),"2026-10-18");
 await page.getByLabel("From",{exact:true}).fill("2026-10-26");
 const pending=page.waitForRequest(r=>r.url().endsWith("/bulk")&&r.postDataJSON()?.action==="list"&&r.postDataJSON()?.filter?.from==="2026-10-26");
 await page.getByLabel("To",{exact:true}).fill("2026-10-27");
 await pending;
 await page.getByLabel("From",{exact:true}).fill("2026-10-27");
 await page.getByRole("button",{name:"2026-10-27 Calendar session 01",exact:true}).waitFor();
 await page.waitForTimeout(300);
 assert.equal(await page.getByRole("button",{name:/^2026-10-26 Calendar session/}).count(),0);
 await page.reload();
 await page.getByRole("button",{name:"2026-10-27 Calendar session 01",exact:true}).waitFor();
 await page.getByRole("button",{name:"Today's sessions",exact:true}).click();
 await page.getByRole("button",{name:"Calendar session 01",exact:true}).waitFor();
 await page.goBack();
 await page.getByRole("button",{name:"2026-10-27 Calendar session 01",exact:true}).waitFor();
 console.log(JSON.stringify({errors}));
`);
  expect(result.errors).toEqual([]);
}, 30_000);

test("calendar route default respects an explicitly bookmarked table view", async () => {
  const { result } = await runFixture<{ errors: string[] }>(`
 await page.goto(origin+"/?calendar_route=1&view=table&date_scope=all");
 await page.getByRole("table").waitFor();
 await page.reload();
 await page.getByRole("table").waitFor();
 assert.equal(await page.getByRole("region",{name:"Hong Kong date calendar",exact:true}).count(),0);
 console.log(JSON.stringify({errors}));
`);
  expect(result.errors).toEqual([]);
}, 25_000);
