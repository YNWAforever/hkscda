import { expect, test } from "bun:test";
import { resolve } from "node:path";

async function runQualificationBrowser(program: string, conflict = false) {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/volunteerQualifications.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "qualification-synthetic-auth",
        setup(build) {
          build.onResolve({ filter: /supabase$/ }, (args) =>
            resolve(args.resolveDir, args.path) === resolve(import.meta.dir, "../supabase")
              ? { path: "qualification-auth-fixture", namespace: "fixture" }
              : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents:
              'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"synthetic-qualification-only",user:{id:"synthetic-staff"}}}})}};',
          }));
        },
      },
    ],
  });
  expect(bundle.success, JSON.stringify(bundle.logs)).toBe(true);
  const fixtureId = crypto.randomUUID();
  const profile = {
    id: "00000000-0000-4000-8000-000000000001",
    display_name: "Synthetic volunteer Alpha",
    birth_date: "1990-01-01",
    joined_on: "2025-01-01" as string | null,
    history_coverage_start: null as string | null,
    tier: "regular",
    status: "active",
    revision: 1,
  };
  const commands: Record<string, unknown>[] = [];
  const profiles = [
    profile,
    {
      ...profile,
      id: "00000000-0000-4000-8000-000000000002",
      display_name: "Synthetic volunteer Beta",
      tier: "newcomer",
      joined_on: "2022-01-01",
      revision: 8,
    },
  ];
  let failNext = false;
  let failNextRead = false;
  let holdWrite = false;
  let writeWaiting = false;
  let releaseWrite = () => {};
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/__fixture/identity")
        return Response.json({ fixtureId, backend: "memory", database: null, externalAuth: false });
      if (path === "/fixture.js")
        return new Response(bundle.outputs[0], { headers: { "content-type": "text/javascript" } });
      if (path === "/__fixture/advance" && request.method === "POST") {
        profile.tier = "newcomer";
        profile.joined_on = "2024-01-01";
        profile.revision++;
        return Response.json({ fixtureId });
      }
      if (path === "/api/admin/volunteers/qualifications" && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        if (body.action === "list" && failNextRead) {
          failNextRead = false;
          return Response.json({ error: "Synthetic refresh failure" }, { status: 503 });
        }
        if (body.action === "list")
          return Response.json({ profiles, credentials: [], credential_definitions: [] });
        commands.push(body);
        const row = profiles.find((item) => item.id === body.profile_id);
        if (!row) return Response.json({ kind: "not_found" }, { status: 404 });
        if (conflict || body.expected_revision !== row.revision)
          return Response.json({ kind: "conflict", current: row }, { status: 409 });
        if (failNext) {
          failNext = false;
          return Response.json({ error: "Synthetic write failure" }, { status: 503 });
        }
        if (holdWrite) {
          holdWrite = false;
          await new Promise<void>((release) => {
            writeWaiting = true;
            releaseWrite = release;
          });
          writeWaiting = false;
        }
        if (body.action === "verify") {
          row.tier = String(body.tier);
          row.joined_on = body.joined_on === null ? null : String(body.joined_on);
          row.history_coverage_start = body.history_coverage_start as string | null;
          row.status = "active";
        }
        if (body.action === "suspend") row.status = "suspended";
        row.revision++;
        return Response.json({ kind: "updated", profile_id: row.id, revision: row.revision });
      }
      if (path === "/__fixture/fail-next") {
        failNext = true;
        return Response.json({ fixtureId });
      }
      if (path === "/__fixture/fail-next-read") {
        failNextRead = true;
        return Response.json({ fixtureId });
      }
      if (path === "/__fixture/write-waiting") return Response.json({ writeWaiting });
      if (path === "/__fixture/hold-write") {
        holdWrite = true;
        return Response.json({ fixtureId });
      }
      if (path === "/__fixture/release-write") {
        releaseWrite();
        return Response.json({ fixtureId });
      }
      if (path === "/")
        return new Response(
          '<div id="root"></div><script type="module" src="/fixture.js"></script>',
          {
            headers: { "content-type": "text/html" },
          },
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
import {chromium} from "playwright";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
 const page=await browser.newPage(); page.setDefaultTimeout(5000);
 const errors=[]; const external=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/*",route=>{
  if(new URL(route.request().url()).origin===process.env.QUALIFICATION_FIXTURE_ORIGIN) return route.continue();
  external.push(route.request().url()); return route.abort();
 });
 await page.goto(process.env.QUALIFICATION_FIXTURE_ORIGIN);
 const tier=page.locator("label").filter({hasText:"Verified tier"}).locator("select");
 const joined=page.getByLabel("Verified joining date (leave blank if unknown)",{exact:true});
 const coverage=page.getByLabel("Start date of complete attendance records (leave blank if unknown)",{exact:true});
 const reason=page.getByLabel("Reason for verifying or correcting, and the source of the evidence",{exact:true});
 const save=page.getByRole("button",{name:"Confirm identity and tier",exact:true});
 const control=name=>page.request.post(process.env.QUALIFICATION_FIXTURE_ORIGIN+"/__fixture/"+name);
 const capture=async name=>{
  if(!process.env.VOLUNTEER_EVIDENCE_DIR) return;
  await fs.mkdir(process.env.VOLUNTEER_EVIDENCE_DIR,{recursive:true});
  await page.screenshot({path:process.env.VOLUNTEER_EVIDENCE_DIR+"/"+name+".png",fullPage:true});
 };
 await page.getByRole("heading",{name:"Synthetic volunteer Alpha · Identity verification",exact:true}).waitFor();
 assert.equal(await tier.inputValue(),"regular");
 ${program}
 assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
 console.log(JSON.stringify({errors,external}));
} finally {await browser.close();}
`,
    ],
    {
      env: { ...process.env, QUALIFICATION_FIXTURE_ORIGIN: origin },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  try {
    const [output, errors, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, errors || output).toBe(0);
    return commands;
  } finally {
    releaseWrite();
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}

test("qualification edits survive a background profile refresh and retain their original revision fence", async () => {
  const commands = await runQualificationBrowser(
    `
 await tier.selectOption("senior");
 await joined.fill("2023-01-01");
 await reason.fill("Synthetic evidence only");
 await Promise.all([
  page.waitForResponse(r=>r.url().endsWith("/qualifications") && r.request().postDataJSON().action==="list"),
  page.getByRole("button",{name:"Simulate another staff member updating the profile",exact:true}).click()
 ]);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert.equal(await tier.inputValue(),"senior","A background refresh must preserve the unsaved verified tier");
 assert.equal(await joined.inputValue(),"2023-01-01");
 await capture("qualification-draft-preserved");
 await save.click();
 await page.getByRole("alert").waitFor();
 await capture("qualification-revision-conflict");
 assert.equal(await tier.inputValue(),"senior");
 await page.reload();
 await page.getByRole("heading",{name:"Synthetic volunteer Alpha · Identity verification",exact:true}).waitFor();
 assert.equal(await tier.inputValue(),"newcomer");
 assert.equal(await joined.inputValue(),"2024-01-01");
 `,
    true,
  );
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({
    action: "verify",
    expected_revision: 1,
    tier: "senior",
    joined_on: "2023-01-01",
  });
}, 20_000);

test("qualification verification saves and reloads, retries a failed write and switches profile revisions", async () => {
  const commands = await runQualificationBrowser(`
 await tier.selectOption("senior");
 await joined.fill("2023-01-01");
 await reason.fill("Synthetic evidence only");
 await control("hold-write");
 await coverage.fill("2021-01-01");
 await save.click();
 await page.waitForFunction(()=>document.querySelector('textarea[required]').disabled);
 assert.equal(await tier.isDisabled(),true);
 assert.equal(await joined.isDisabled(),true);
 assert.equal(await page.getByRole("combobox",{name:"Choose a volunteer",exact:true}).isDisabled(),true);
 await page.waitForFunction(async()=>{
  const r=await fetch("/__fixture/write-waiting");return (await r.json()).writeWaiting;
 });
 await control("release-write");
 await page.getByText("The update is saved.",{exact:false}).waitFor();
 await page.reload();
 await page.getByRole("heading",{name:"Synthetic volunteer Alpha · Identity verification",exact:true}).waitFor();
 assert.equal(await tier.inputValue(),"senior");
 assert.equal(await joined.inputValue(),"2023-01-01");
 assert.equal(await coverage.inputValue(),"2021-01-01");
 await capture("qualification-saved-and-reloaded");
 await tier.selectOption("regular");
 await reason.fill("Synthetic correction only");
 await control("fail-next");
 await save.click();
 await page.getByRole("alert").waitFor();
 assert.equal(await tier.isDisabled(),false);
 assert.equal(await tier.inputValue(),"regular");
 await capture("qualification-write-error-recoverable");
 await save.click();
 await page.getByText("The update is saved.",{exact:false}).waitFor();
 await joined.fill("");
 await coverage.fill("");
 await save.click();
 await page.getByText("The update is saved.",{exact:false}).waitFor();
 await page.reload();
 await page.getByRole("heading",{name:"Synthetic volunteer Alpha · Identity verification",exact:true}).waitFor();
 assert.equal(await joined.inputValue(),"");
 assert.equal(await coverage.inputValue(),"");
 await page.getByRole("combobox",{name:"Choose a volunteer",exact:true}).selectOption("00000000-0000-4000-8000-000000000002");
 assert.equal(await tier.inputValue(),"newcomer");
 assert.equal(await joined.inputValue(),"2022-01-01");
 assert.equal(await reason.inputValue(),"");
 await tier.selectOption("senior");
 await reason.fill("Synthetic second profile evidence");
 await save.click();
 await page.getByText("The update is saved.",{exact:false}).waitFor();
 `);
  expect(commands.map((command) => command.expected_revision)).toEqual([1, 2, 2, 3, 8]);
  expect(commands[3]).toMatchObject({ joined_on: null, history_coverage_start: null });
  expect(commands.at(-1)).toMatchObject({
    profile_id: "00000000-0000-4000-8000-000000000002",
    tier: "senior",
  });
}, 25_000);

test("a successful suspension preserves a tier draft and advances its fence even when refresh fails", async () => {
  const commands = await runQualificationBrowser(`
 await tier.selectOption("senior");
 await joined.fill("2023-01-01");
 await reason.fill("Synthetic evidence only");
 await control("fail-next-read");
 await page.getByRole("button",{name:"Pause eligibility for new registrations",exact:true}).click();
 await page.getByText("The update is saved.",{exact:false}).waitFor();
 await page.getByRole("button",{name:"Reload",exact:true}).waitFor();
 assert.equal(await tier.inputValue(),"senior");
 assert.equal(await joined.inputValue(),"2023-01-01");
 await save.click();
 await page.getByText("The update is saved.",{exact:false}).waitFor();
 await page.reload();
 await page.getByRole("heading",{name:"Synthetic volunteer Alpha · Identity verification",exact:true}).waitFor();
 assert.equal(await tier.inputValue(),"senior");
 assert.equal(await joined.inputValue(),"2023-01-01");
 `);
  expect(commands.map(({ action, expected_revision }) => ({ action, expected_revision }))).toEqual([
    { action: "suspend", expected_revision: 1 },
    { action: "verify", expected_revision: 2 },
  ]);
}, 20_000);
