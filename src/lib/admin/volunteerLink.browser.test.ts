import { expect, test } from "bun:test";
test("clicking a pending application preserves validated return context without a second query separator", async () => {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/volunteerLink.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  expect(bundle.success).toBe(true);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      return new URL(request.url).pathname === "/fixture.js"
        ? new Response(bundle.outputs[0], { headers: { "content-type": "text/javascript" } })
        : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', {
            headers: { "content-type": "text/html" },
          });
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
try {
 const page=await browser.newPage();
 await page.goto(process.env.FIXTURE_ORIGIN+"/admin/volunteers/tasks?pending_scope=upcoming&page=2");
 await page.getByRole("link",{name:"Process",exact:true}).click();
 await page.getByRole("heading",{name:"Application",exact:true}).waitFor();
 console.log(JSON.stringify({url:page.url()}));
} finally {await browser.close();}
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
    const { url } = JSON.parse(out.trim().split("\n").at(-1)!);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("return_from")).toBe("tasks");
    expect(parsed.searchParams.get("pending_scope")).toBe("upcoming");
    expect(parsed.searchParams.get("page")).toBe("2");
    expect(url.match(/\?/g)).toHaveLength(1);
  } finally {
    server.stop(true);
  }
});
