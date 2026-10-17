import { expect, test } from "bun:test";
import { resolve } from "node:path";

for (const mode of ["delayed-404", "delayed-503", "delayed-success", "cross-scope", "legacy"]) {
  test(`original URL attendance remains recoverable during ${mode}`, async () => {
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
      other = "90000000-0000-4000-8000-000000000101",
      opId = "90000000-0000-4000-8000-000000000200",
      id = "90000000-0000-4000-8000-000000000001";
    const stamp = "2026-10-16T00:00:00.123456Z";
    const before = {
      registration_status: "approved",
      attendance_status: "not_marked",
      updated_at: stamp,
    };
    const target = {
      registration_id: id,
      expected_updated_at: stamp,
      attendance_status: "attended",
      command: "record",
    };
    const operation = {
      id: opId,
      action: "roster_attendance",
      created_at: stamp,
      expires_at: stamp,
      activity_id: activity,
      activity_title: "Original synthetic session",
      scope: {
        kind: "page",
        page: mode === "cross-scope" ? 2 : 1,
        page_size: 25,
        selected_count: 1,
      },
      state: mode === "cross-scope" ? "completed" : "previewed",
      rows: [
        {
          registration_id: id,
          contact_name: "Synthetic",
          participant_count: 1,
          before,
          target,
          decision: "ready",
          reason: null,
        },
      ],
      results:
        mode === "cross-scope"
          ? [
              {
                registration_id: id,
                kind: "applied",
                reason: null,
                before,
                current: before,
                after: { ...before, attendance_status: "attended" },
                event_id: id,
                audit_id: opId,
              },
            ]
          : null,
      notifications: [],
    };
    let release = () => {},
      statusCount = 0;
    const actions: string[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/fixture.js")
          return new Response(bundle.outputs[0], {
            headers: { "content-type": "text/javascript" },
          });
        if (path === "/release") {
          release();
          return Response.json({ ok: true });
        }
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
          if (body.action === "status") {
            if (statusCount++ === 0 && mode !== "cross-scope" && mode !== "legacy") {
              await new Promise<void>((done) => (release = done));
              if (mode !== "delayed-success")
                return Response.json(
                  { kind: "not_found" },
                  { status: mode === "delayed-404" ? 404 : 503 },
                );
            }
            return Response.json({
              kind: "ready",
              operation:
                mode === "legacy"
                  ? {
                      id: opId,
                      action: "select",
                      created_at: stamp,
                      expires_at: stamp,
                      input: {},
                      selection: [],
                      groups: [],
                    }
                  : operation,
            });
          }
          if (body.action === "detail") {
            if (body.activity_id === other)
              return Response.json(
                { error: "Synthetic other-session read failure" },
                { status: 503 },
              );
            return Response.json({
              kind: "detail",
              attendance_contract: 1,
              asOf: stamp,
              activity: {
                id: activity,
                title: "Original synthetic session",
                starts_at: stamp,
                ends_at: stamp,
                updated_at: stamp,
                location: "Synthetic",
                status: "published",
                capacity: 100,
                approved: 1,
                waitlisted: 0,
                template_key: null,
                shelter_key: null,
                policy_version_id: null,
                policy_revision: 0,
                scenario: null,
                shortages: [],
                registrations_closed_at: null,
                description: null,
              },
              registrations: [
                {
                  id,
                  contact_name: "Synthetic",
                  status: "approved",
                  attendance_status: "not_marked",
                  updated_at: stamp,
                  participant_count: 1,
                  attendance_actions: [
                    {
                      command: "record",
                      attendance_status: "attended",
                      allowed: true,
                      reason: null,
                      requires_reason: false,
                    },
                  ],
                },
              ],
              total: 26,
              history_total: 0,
              history: [],
            });
          }
          return Response.json({ error: "Unexpected write" }, { status: 400 });
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
import {chromium} from "playwright";import assert from "node:assert/strict";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
 const page=await browser.newPage();page.setDefaultTimeout(5000);
 const origin=process.env.FIXTURE_ORIGIN;
 await page.goto(origin+"/?date_scope=all&selected="+${JSON.stringify(mode === "cross-scope" ? other : activity)}+"&operation="+${JSON.stringify(opId)}+"&attendance_intent=apply");
 const dialog=page.getByRole("dialog");
 if(${JSON.stringify(mode)}==="legacy"){
  await page.waitForFunction(()=>{const checkbox=document.querySelector("[data-attendance-panel] article input[type=checkbox]");return checkbox&&!checkbox.disabled;});
  assert.equal(new URL(page.url()).searchParams.get("operation"),${JSON.stringify(opId)});
 } else if(${JSON.stringify(mode)}==="cross-scope"){
  await dialog.getByText("Original session: Original synthetic session",{exact:true}).waitFor();
  await dialog.getByText("Original roster page 2",{exact:true}).waitFor();
  await dialog.getByText("This receipt belongs to another session or roster page. Return to its original session to review it.",{exact:true}).waitFor();
  await dialog.getByRole("button",{name:"Return to original session",exact:true}).click();
  await page.waitForFunction(()=>new URLSearchParams(location.search).get("selected")===${JSON.stringify(activity)}&&new URLSearchParams(location.search).get("detail_page")==="2");
  await page.locator("[data-attendance-panel]").waitFor();
 } else {
  const panel=page.locator("[data-attendance-panel]");await panel.waitFor();
  assert.equal(await panel.getByRole("button",{name:"Preview selected attendance",exact:true}).isDisabled(),true,"pending original status must freeze replacement previews");
  assert.equal(await panel.locator("article input[type=checkbox]").first().isDisabled(),true);
  const response=page.waitForResponse(r=>r.url().endsWith("/bulk")&&r.request().postDataJSON()?.action==="status");
  await fetch(origin+"/release");await response;
  if(${JSON.stringify(mode)}!=="delayed-success"){
   await panel.getByRole("button",{name:"Check original operation",exact:true}).waitFor();
   assert.equal(await panel.getByRole("button",{name:"Preview selected attendance",exact:true}).isDisabled(),true,"failed original status must stay locked");
   await panel.getByRole("button",{name:"Check original operation",exact:true}).click();
  }
  await panel.getByRole("heading",{name:"Per-person change preview",exact:true}).waitFor();
  assert.equal(await panel.getByRole("button",{name:"Preview selected attendance",exact:true}).isDisabled(),true,"original apply intent survives previewed status");
  assert.equal(new URL(page.url()).searchParams.get("operation"),${JSON.stringify(opId)});
 }
 console.log(JSON.stringify({passed:true}));
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
      expect(JSON.parse(out.trim().split("\n").at(-1)!).passed).toBe(true);
      expect(actions).not.toContain("attendance_preview");
      expect(actions).not.toContain("attendance_apply");
    } finally {
      release();
      server.stop(true);
    }
  });
}
