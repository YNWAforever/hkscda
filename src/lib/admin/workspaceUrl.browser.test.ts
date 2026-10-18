import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("the workspace restores filters and view in one URL update and keeps paging history", async () => {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/workspaceUrl.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "local-auth-fixture",
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
      if (path === "/api/admin/volunteers/bulk" && request.method === "POST") {
        const body: unknown = await request.json();
        const action =
          body && typeof body === "object" && "action" in body ? String(body.action) : "";
        actions.push(action);
        if (action === "list") return Response.json({ activities: [], total: 0 });
        if (action === "templates") return Response.json({ templates: [] });
        return Response.json({ error: "Unsupported fixture command" }, { status: 400 });
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
      `import {chromium} from "playwright";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__urlWrites=[];
  for(const method of ["replaceState","pushState"]){
   const original=history[method].bind(history);
   history[method]=(...args)=>{const before=location.search;const result=original(...args);if(location.search!==before)window.__urlWrites.push({method,search:location.search});return result;};
  }
 });
 await page.goto(process.env.WORKSPACE_FIXTURE_ORIGIN+"/?date_scope=all&page=2&q=private-fixture");
 await page.getByRole("heading",{name:"Activities and registrations",exact:true}).waitFor();
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const mounted=await page.evaluate(()=>({writes:[...window.__urlWrites],search:location.search}));
 await page.getByRole("button",{name:"Calendar view",exact:true}).click();
 await page.waitForFunction(()=>new URLSearchParams(location.search).get("view")==="calendar");
 await page.getByRole("button",{name:"Previous page",exact:true}).click();
 await page.waitForFunction(()=>new URLSearchParams(location.search).get("page")==="1");
 const paged=await page.evaluate(()=>({writes:[...window.__urlWrites],search:location.search}));
 await page.goBack();await page.waitForFunction(()=>new URLSearchParams(location.search).get("page")==="2");
 if(errors.length)throw new Error(JSON.stringify(errors));
 console.log(JSON.stringify({mounted,paged,back:await page.evaluate(()=>location.search)}));
}finally{await browser.close();}`,
    ],
    {
      env: { ...process.env, WORKSPACE_FIXTURE_ORIGIN: `http://127.0.0.1:${server.port}` },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  try {
    const [output, errors, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(errors).toBe("");
    expect(exitCode).toBe(0);
    type Phase = { writes: { method: string; search: string }[]; search: string };
    const result: { mounted: Phase; paged: Phase; back: string } = JSON.parse(output);
    expect(result.mounted.writes).toHaveLength(1);
    expect(result.mounted.writes[0].method).toBe("replaceState");
    const mounted = new URLSearchParams(result.mounted.search);
    expect(mounted.get("date_scope")).toBe("all");
    expect(mounted.get("page")).toBe("2");
    expect(mounted.get("view")).toBe("table");
    expect(mounted.has("q")).toBe(false);
    expect(result.paged.writes.map((write) => write.method)).toEqual([
      "replaceState",
      "replaceState",
      "pushState",
    ]);
    expect(new URLSearchParams(result.back).get("page")).toBe("2");
    expect(new URLSearchParams(result.back).get("view")).toBe("calendar");
    expect(actions.every((action) => ["list", "templates"].includes(action))).toBe(true);
  } finally {
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}, 20_000);
