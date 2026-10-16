import { expect, test } from "bun:test";

test("a mounted list starts its restored query before its first frame, without reading default filters", async () => {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/listQueryMount.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  expect(bundle.success).toBe(true);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === "/fixture.js")
        return new Response(bundle.outputs[0], {
          headers: { "content-type": "text/javascript" },
        });
      return new Response(
        '<button>Mount list</button><div id="list"></div><output></output><script type="module" src="/fixture.js"></script>',
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  // Playwright's Windows process transport runs under Node, as the repository's
  // real-fixture browser collectors do. The hook and query execute in Chrome.
  const child = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "-e",
      `import {chromium} from "playwright";
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
 const page=await browser.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(process.env.LIST_FIXTURE_ORIGIN+"/?status=pending&page=3");
 await page.evaluate(()=>sessionStorage.setItem("hkscda.admin.list.query.mount-fixture"," saved query "));
 await page.getByRole("button",{name:"Mount list"}).click();
 await page.waitForFunction(()=>Boolean(document.querySelector("output")?.textContent),{},{timeout:5000}).catch(e=>{throw new Error(JSON.stringify(errors)+e.message);});
 if(errors.length)throw new Error(JSON.stringify(errors));
 console.log(await page.locator("output").textContent());
}finally{await browser.close();}`,
    ],
    {
      env: { ...process.env, LIST_FIXTURE_ORIGIN: `http://127.0.0.1:${server.port}` },
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
    const result: { frames: { reads: { q: string; status: string; page: number }[] }[] } =
      JSON.parse(output);
    expect(result.frames[0].reads).toEqual([{ q: "saved query", status: "pending", page: 3 }]);
  } finally {
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}, 20_000);
