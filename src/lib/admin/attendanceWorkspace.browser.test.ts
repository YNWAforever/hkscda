import { expect, test } from "bun:test";
import { resolve } from "node:path";
test("changing roster page invalidates an unsubmitted preview atomically even while the panel unmounts", async () => {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/workspaceUrl.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "synthetic-auth",
        setup(build) {
          build.onResolve({ filter: /supabase$/ }, (args) =>
            resolve(args.resolveDir, args.path) === resolve(import.meta.dir, "../supabase")
              ? { path: "auth", namespace: "fixture" }
              : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents:
              'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"synthetic",user:{id:"fixture"}}}})}};',
          }));
        },
      },
    ],
  });
  expect(bundle.success).toBe(true);
  const activity = "90000000-0000-4000-8000-000000000100",
    opId = "90000000-0000-4000-8000-000000000200";
  const stamp = "2026-10-16T00:00:00.123456Z";
  const registrations = Array.from({ length: 26 }, (_, index) => ({
    id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    contact_name: `Synthetic ${index}`,
    status: "approved",
    attendance_status: "not_marked",
    participant_count: 1,
    updated_at: stamp,
    attendance_actions: [
      {
        command: "record",
        attendance_status: "attended",
        allowed: true,
        reason: null,
        requires_reason: false,
      },
    ],
  }));
  const row = {
    id: activity,
    title: "Synthetic session",
    starts_at: "2026-10-16T01:00:00Z",
    ends_at: "2026-10-16T02:00:00Z",
    updated_at: stamp,
    location: "Synthetic",
    status: "published",
    capacity: 100,
    template_key: null,
    shelter_key: null,
    policy_version_id: null,
    policy_revision: 0,
    scenario: null,
    approved: 26,
    waitlisted: 0,
    shortages: [],
    registrations_closed_at: null,
    description: null,
  };
  const actions: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/fixture.js")
        return new Response(bundle.outputs[0], { headers: { "content-type": "text/javascript" } });
      if (path === "/api/admin/me")
        return Response.json({
          admin: {
            id: "fixture",
            authUserId: "fixture",
            role: "admin",
            status: "active",
            email: "synthetic@example.invalid",
          },
        });
      if (path === "/api/admin/volunteers/bulk") {
        const body = await request.json();
        actions.push(body.action);
        if (body.action === "list") return Response.json({ activities: [], total: 0 });
        if (body.action === "templates") return Response.json({ templates: [] });
        if (body.action === "detail") {
          if (body.page === 2) await new Promise((resolve) => setTimeout(resolve, 150));
          return Response.json({
            kind: "detail",
            attendance_contract: 1,
            asOf: "2026-10-16T03:00:00Z",
            activity: row,
            registrations: body.page === 2 ? registrations.slice(25) : registrations.slice(0, 25),
            total: 26,
            history_total: 0,
            history: [],
          });
        }
        if (body.action === "attendance_preview")
          return Response.json({
            kind: "ready",
            operation: {
              id: opId,
              action: "roster_attendance",
              created_at: stamp,
              expires_at: "2026-10-16T00:30:00Z",
              activity_id: activity,
              activity_title: row.title,
              scope: {
                kind: "page",
                page: body.page,
                page_size: 25,
                selected_count: body.entries.length,
              },
              state: "previewed",
              rows: body.entries.map((target: { registration_id: string }) => ({
                registration_id: target.registration_id,
                contact_name: "Synthetic",
                participant_count: 1,
                before: {
                  registration_status: "approved",
                  attendance_status: "not_marked",
                  updated_at: stamp,
                },
                target,
                decision: "ready",
                reason: null,
              })),
              results: null,
              notifications: [],
            },
          });
        return Response.json({ error: "Unsupported synthetic request" }, { status: 400 });
      }
      return new Response(
        '<div id="root"></div><script type="module" src="/fixture.js"></script>',
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  const child = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "-e",
      `
import {chromium} from "playwright";
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.addInitScript(()=>{window.__urlWrites=[];for(const method of ["replaceState","pushState"]){
  const original=history[method].bind(history);history[method]=(...args)=>{const before=location.search;const value=original(...args);if(location.search!==before)window.__urlWrites.push(location.search);return value;};
 }});
 await page.goto(process.env.FIXTURE_ORIGIN+"/?date_scope=all&selected="+${JSON.stringify(activity)});
 const panel=page.locator("[data-attendance-panel]");await panel.waitFor();
 await panel.locator("article").first().getByRole("checkbox").check();
 await panel.getByRole("button",{name:"Preview selected attendance",exact:true}).click();
 await panel.getByRole("heading",{name:"Per-person change preview",exact:true}).waitFor();
 const before=await page.evaluate(()=>window.__urlWrites.length);
 await page.getByRole("button",{name:"Next registrations",exact:true}).click();
 await page.waitForFunction(()=>new URLSearchParams(location.search).get("detail_page")==="2");
 await page.locator("#registration-"+${JSON.stringify(registrations[25].id)}).waitFor();
 const result={operation:new URL(page.url()).searchParams.get("operation"),errors,writes:await page.evaluate(()=>window.__urlWrites.length)-before};
 console.log(JSON.stringify(result));
}finally{await browser.close();}
`,
    ],
    {
      env: { ...process.env, FIXTURE_ORIGIN: `http://127.0.0.1:${server.port}` },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  try {
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, err).toBe(0);
    const result = JSON.parse(out.trim().split("\n").at(-1)!);
    expect(result.errors).toEqual([]);
    expect(result.operation).toBeNull();
    expect(result.writes).toBe(1);
    expect(actions.filter((action) => action === "attendance_preview")).toHaveLength(1);
    expect(actions).not.toContain("attendance_apply");
  } finally {
    server.stop(true);
  }
});
