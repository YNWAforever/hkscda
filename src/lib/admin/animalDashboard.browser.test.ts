import { expect, test } from "bun:test";
import { resolve } from "node:path";

async function runDashboard(script: string) {
  const stubs = new Map(
    [
      ["components/admin/AdminLayout", "AdminLayout"],
      ["components/admin/MediaRepairQueue", "MediaRepairQueue"],
      ["components/admin/donations/PaymentsReconcile", "PaymentsReconcile"],
      ["components/admin/sponsorship/PledgeReviewLane", "PledgeReviewLane"],
    ].map(([path, name]) => [resolve(import.meta.dir, "../../", path), name]),
  );
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/animalDashboard.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "isolated-animal-dashboard",
        setup(build) {
          build.onResolve({ filter: /^\./ }, (args) => {
            const path = resolve(args.resolveDir, args.path);
            // Bun 1.3 drops the barrel binding in the session/identity cycle; resolve
            // the barrel to the same real implementation for this browser fixture.
            if (path === resolve(import.meta.dir, "http"))
              return { path: resolve(import.meta.dir, "session.ts") };
            if (path === resolve(import.meta.dir, "../supabase"))
              return { path: "auth", namespace: "fixture" };
            const name = stubs.get(path);
            return name ? { path: name, namespace: "fixture" } : undefined;
          });
          build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            loader: "js",
            contents:
              path === "auth"
                ? 'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"synthetic-only",user:{id:"synthetic-user"}}}})}};'
                : `export const ${path}=()=>null;`,
          }));
        },
      },
    ],
  });
  expect(bundle.success, JSON.stringify(bundle.logs)).toBe(true);
  const fixtureId = crypto.randomUUID();
  const calls: string[] = [];
  let fail = true;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/__fixture/identity")
        return Response.json({ fixtureId, backend: "memory", externalAuth: false, database: null });
      if (url.pathname === "/__fixture/recover") {
        fail = false;
        return Response.json({ fixtureId });
      }
      if (url.pathname === "/fixture.js")
        return new Response(bundle.outputs[0], { headers: { "content-type": "text/javascript" } });
      if (url.pathname === "/api/admin/animals/list") {
        calls.push(url.search);
        const q = url.searchParams.get("q") ?? "";
        if (q === "slow") await new Promise((done) => setTimeout(done, 1500));
        if (q === "fail" && fail)
          return Response.json({ error: "synthetic outage" }, { status: 503 });
        const archived = url.searchParams.get("archived") === "true";
        const animals =
          q === "empty" && !archived
            ? []
            : [
                {
                  id: "00000000-0000-4000-8000-000000000001",
                  type: "cat",
                  name: archived ? "Archived cat" : `Result ${q || "initial"}`,
                  name_en: archived ? "Archived cat" : `Result ${q || "initial"}`,
                  gender: "female",
                  age: "2",
                  status: "available",
                  publication_state: "published",
                  image_url: null,
                  retired_at: archived ? "2026-10-01T00:00:00Z" : null,
                },
              ];
        return Response.json({ animals, total: animals.length, page: 1 });
      }
      if (url.pathname === "/")
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
    externalAuth: false,
    database: null,
  });
  const child = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "-e",
      `
import assert from "node:assert/strict";
import {chromium} from "playwright";
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:"chrome"}),headless:true});
try {
 const page=await browser.newPage();page.setDefaultTimeout(5000);
 const origin=process.env.ANIMAL_DASHBOARD_ORIGIN;const errors=[],external=[],requests=[],aborted=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("request",r=>{if(r.url().includes("/animals/list"))requests.push(new URL(r.url()).searchParams.get("q"));});
 page.on("requestfailed",r=>{if(r.url().includes("/animals/list"))aborted.push(new URL(r.url()).searchParams.get("q"));});
 await page.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():(external.push(r.request().url()),r.abort()));
 const input=page.getByRole("textbox",{name:"Search name or reference number"});
 const settle=q=>page.waitForFunction(q=>[...document.querySelectorAll("td,span")].some(e=>e.textContent==="Result "+q),q);
 const hold=()=>page.evaluate(()=>window.dispatchEvent(new Event("fixture:hold-navigation")));
 const release=()=>page.evaluate(()=>window.dispatchEvent(new Event("fixture:release-navigation")));
 const pending=()=>page.evaluate(()=>JSON.parse(document.documentElement.dataset.pendingSearch||"null"));
 await page.goto(origin);try {await settle("initial");}catch(e){console.error({errors,requests,body:await page.locator("body").innerText()});throw e;}
 ${script}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
} finally {await browser.close();}
`,
    ],
    { env: { ...process.env, ANIMAL_DASHBOARD_ORIGIN: origin }, stdout: "pipe", stderr: "pipe" },
  );
  try {
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, err || out).toBe(0);
    return calls;
  } finally {
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}

test("animal dashboard exposes archived records from ordinary and empty pages", async () => {
  const calls = await runDashboard(`
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:900});
  const archived=page.getByRole("checkbox",{name:"Include archived records"});
  assert.equal(await archived.count(),1,"archive inclusion must be reachable on an ordinary page");
  await input.fill("empty");await page.getByText("No animals match these filters.",{exact:true}).first().waitFor();
  await archived.check();await page.getByText("Archived cat",{exact:true}).first().waitFor();
  await archived.uncheck();await input.fill("");await settle("initial");
 }
 `);
  expect(calls.some((search) => new URLSearchParams(search).get("archived") === "true")).toBe(true);
}, 30_000);

test("animal dashboard retains focus, debounces IME, cancels reads and recovers with its filters", async () => {
  await runDashboard(`
 await input.focus();await input.pressSequentially("kittens",{delay:25});
 assert.equal(await input.count(),1,"typing must not unmount the input");
 assert.equal(await input.inputValue(),"kittens");assert.equal(await input.evaluate(e=>e===document.activeElement),true);
 await settle("kittens");assert.deepEqual(requests,["","kittens"]);
 await input.dispatchEvent("compositionstart");await input.fill("貓");
 await page.waitForTimeout(400);assert.deepEqual(requests,["","kittens"],"no requests during composition");
 await input.fill("貓貓");await input.dispatchEvent("compositionend");await settle("貓貓");
 assert.equal(requests.filter(q=>q==="貓").length,0);
 await input.fill("slow");await page.waitForRequest(r=>new URL(r.url()).searchParams.get("q")==="slow");
 assert.equal(await input.evaluate(e=>e===document.activeElement),true);
 assert.equal(await page.getByRole("link",{name:"Edit",exact:true}).count(),0,"obsolete actions hidden during load");
 await input.fill("latest");await settle("latest");
 await page.waitForFunction(()=>true);assert.ok(aborted.includes("slow"),"superseded read was aborted");
 await input.fill("fail");await page.getByRole("alert").waitFor();
 assert.equal(await input.inputValue(),"fail");assert.equal(await page.getByRole("link",{name:"Edit",exact:true}).count(),0);
 assert.equal(await page.getByRole("checkbox",{name:"Include archived records"}).count(),1);
 await page.request.post(origin+"/__fixture/recover");await page.getByRole("button",{name:"Retry",exact:true}).click();await settle("fail");
 await input.fill("cleared-before-debounce");await page.getByRole("button",{name:"Clear filters",exact:true}).click();
 await settle("initial");await page.waitForTimeout(400);assert.ok(!requests.includes("cleared-before-debounce"));
 await input.fill("fail");await settle("fail");
 await input.fill("pending");await page.getByRole("button",{name:"Restore bookmarked search"}).click();
 await settle("restored");await page.waitForTimeout(400);
 assert.equal(await input.inputValue(),"restored");assert.ok(!requests.includes("pending"),"navigation cancels pending draft");
 await page.goBack();await settle("fail");assert.equal(await input.inputValue(),"fail");
 await input.fill("discarded");await page.getByRole("link",{name:"Dogs",exact:true}).click();
 await settle("initial");await page.waitForTimeout(400);assert.equal(await input.inputValue(),"");assert.ok(!requests.includes("discarded"));
 `);
}, 30_000);

test("animal dashboard discards archive confirmations when the list changes", async () => {
  await runDashboard(`
 await input.fill("next");
 await page.getByRole("button",{name:"Archive",exact:true}).first().click();
 await settle("next");
 assert.equal(await page.getByRole("alertdialog").count(),0,"old confirmation must not reopen after loading");
 await page.getByRole("button",{name:"Archive",exact:true}).first().click();
 await page.goBack();await settle("initial");
 assert.equal(await page.getByRole("alertdialog").count(),0,"cached navigation must discard the old confirmation");
 await input.fill("discard-on-back");await page.goForward();await settle("next");
 await page.waitForTimeout(400);assert.equal(await input.inputValue(),"next");
 assert.ok(!requests.includes("discard-on-back"),"Back/forward supersedes pending text");
 `);
}, 20_000);

test("delayed search commits preserve newer draft text", async () => {
  await runDashboard(`
 await hold();await input.fill("committed");
 await page.waitForFunction(()=>JSON.parse(document.documentElement.dataset.pendingSearch||"null")?.q==="committed");
 await input.fill("newer draft");await release();await settle("committed");
 assert.equal(await input.inputValue(),"newer draft","the committed URL must not replace newer typing");
 await settle("newer draft");
 `);
}, 15_000);

test("delayed search commits preserve active IME composition", async () => {
  await runDashboard(`
 await hold();await input.fill("committed");
 await page.waitForFunction(()=>JSON.parse(document.documentElement.dataset.pendingSearch||"null")?.q==="committed");
 await input.dispatchEvent("compositionstart");await input.fill("貓");
 await release();await settle("committed");await page.waitForTimeout(400);
 assert.equal(await input.inputValue(),"貓","the committed URL must not replace IME input");
 assert.deepEqual(requests,["","committed"],"URL sync must not end composition");
 await input.fill("貓貓");await input.dispatchEvent("compositionend");await settle("貓貓");
 `);
}, 15_000);

for (const filter of ["status", "archived"]) {
  test(`animal ${filter} changes cancel debounce before delayed navigation`, async () => {
    await runDashboard(`
 await hold();await input.fill("discarded draft");
 ${filter === "status" ? 'await page.getByRole("combobox").selectOption("adopted");' : 'await page.getByRole("checkbox",{name:"Include archived records"}).click();'}
 await page.waitForFunction(()=>Boolean(document.documentElement.dataset.pendingSearch));
 await page.waitForTimeout(400);
 const next=await pending();
 assert.equal(next.q,"","a pending debounce must not replace the filter navigation");
 assert.equal(next.${filter},${filter === "status" ? '"adopted"' : "true"});
 assert.equal(await input.inputValue(),"");
 await input.fill("after filter");await page.waitForTimeout(400);
 assert.deepEqual(await pending(),next,"new typing must wait for the selected filter");
 await release();
 await page.waitForFunction(({key,value})=>new URLSearchParams(location.search).get(key)===value,{key:"${filter}",value:"${filter === "status" ? "adopted" : "true"}"});
 assert.equal(await input.inputValue(),"after filter","filter acknowledgement must preserve newer typing");
 await page.waitForFunction(()=>new URLSearchParams(location.search).get("q")==="after filter");
 assert.equal(new URL(page.url()).searchParams.get("${filter}"),"${filter === "status" ? "adopted" : "true"}");
 assert.ok(!requests.includes("discarded draft"));
 `);
  }, 15_000);
}

test("Back cancels a pending filter navigation without blocking later search", async () => {
  await runDashboard(`
 await input.fill("previous");await settle("previous");
 await hold();await page.getByRole("combobox").selectOption("adopted");
 await page.waitForFunction(()=>Boolean(document.documentElement.dataset.pendingSearch));
 await page.goBack();await release();
 await page.waitForFunction(()=>new URLSearchParams(location.search).get("status")!=="adopted");
 await input.fill("after back");await settle("after back");
 `);
}, 15_000);
