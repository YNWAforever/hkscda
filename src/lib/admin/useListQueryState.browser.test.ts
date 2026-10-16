import { expect, test } from "bun:test";

async function mountedList(cached: boolean) {
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
        '<div id="list"></div><output></output><script type="module" src="/fixture.js"></script>',
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
 const cached=process.env.LIST_FIXTURE_CACHED==="1";
 await page.goto(process.env.LIST_FIXTURE_ORIGIN+"/?status=pending&page=3"+(cached?"&cached=1":""));
 if(!cached)await page.evaluate(()=>sessionStorage.setItem("hkscda.admin.list.query.mount-fixture"," saved query "));
 await page.getByRole("button",{name:"Mount list"}).click();
 await page.waitForFunction(()=>Boolean(document.querySelector("output")?.textContent),{},{timeout:5000}).catch(e=>{throw new Error(JSON.stringify(errors)+e.message);});
 if(errors.length)throw new Error(JSON.stringify(errors));
 console.log(await page.locator("output").textContent());
}finally{await browser.close();}`,
    ],
    {
      env: {
        ...process.env,
        LIST_FIXTURE_ORIGIN: `http://127.0.0.1:${server.port}`,
        LIST_FIXTURE_CACHED: cached ? "1" : "0",
      },
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
    type Reads = { q: string; status: string; page: number }[];
    const result: { frames: { reads: Reads }[]; phases: { reads: Reads }[] } = JSON.parse(output);
    return { frame: result.frames[0].reads, subscriptionPhase: result.phases[0].reads };
  } finally {
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}

test("a mounted list starts its restored query before its first frame, without reading default filters", async () => {
  expect((await mountedList(false)).frame).toEqual([
    { q: "saved query", status: "pending", page: 3 },
  ]);
}, 20_000);

test("a mounted list revalidates the unchanged cached query before its first frame", async () => {
  const result = await mountedList(true);
  expect(result.frame).toEqual([{ q: "", status: "pending", page: 3 }]);
  expect(result.subscriptionPhase).toEqual([{ q: "", status: "pending", page: 3 }]);
}, 20_000);
