import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("group enquiry search debounces IME, cancels stale reads and recovers from failure", async () => {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/groupEnquirySearch.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "group-enquiry-synthetic-auth",
        setup(build) {
          build.onResolve({ filter: /supabase$/ }, (args) =>
            resolve(args.resolveDir, args.path) === resolve(import.meta.dir, "../supabase")
              ? { path: "group-enquiry-auth-fixture", namespace: "fixture" }
              : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents:
              'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"fixture-token",user:{id:"fixture-actor"}}},error:null})}};',
          }));
        },
      },
    ],
  });
  expect(bundle.success).toBe(true);

  type Recorded = { q: string; aborted: boolean };
  const requests: Recorded[] = [];
  let failErrorQuery = true;
  const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
  const summary = (q: string) => ({
    id: "enquiry-" + encodeURIComponent(q || "initial"),
    organisationName: `${q || "初始"}結果`,
    contactPerson: "Synthetic",
    activityType: "school_talk",
    participantCount: 1,
    status: "new",
    notificationStatus: "sent",
    assignedTo: null,
    createdAt: "2026-10-17T00:00:00.000Z",
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/fixture.js")
        return new Response(bundle.outputs[0], {
          headers: { "content-type": "text/javascript" },
        });
      if (url.pathname === "/control") {
        if (url.searchParams.get("recover") === "1") failErrorQuery = false;
        return Response.json({ requests });
      }
      if (url.pathname === "/api/admin/volunteers/group-enquiries" && request.method === "POST") {
        const body = (await request.json()) as { action: string; query?: { q?: string } };
        const q = body.query?.q ?? "";
        const record: Recorded = { q, aborted: false };
        requests.push(record);
        request.signal.addEventListener("abort", () => {
          record.aborted = true;
        });
        if (q === "舊") await delay(1200);
        if (q === "錯誤" && failErrorQuery)
          return Response.json({ error: "Synthetic enquiry failure" }, { status: 503 });
        return Response.json({ enquiries: [summary(q)], total: 1 });
      }
      return new Response(
        '<div id="root"></div><script type="module" src="/fixture.js"></script>',
        {
          headers: { "content-type": "text/html" },
        },
      );
    },
  });

  const child = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "-e",
      `
import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  await context.route(/^https?:\\/\\/(?!127\\.0\\.0\\.1:${server.port}(?:\\/|$))/, (route) =>
    route.abort("blockedbyclient")
  );
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const origin = process.env.GROUP_ENQUIRY_FIXTURE_ORIGIN;
  const search = page.getByRole("textbox", { name: "搜尋", exact: true });

  try {
    await page.goto(origin + "/");
    await page.getByText("初始結果", { exact: true }).waitFor();
  } catch (error) {
    console.error("GROUP_ENQUIRY_FIXTURE_DEBUG", JSON.stringify({
      body: await page.textContent("body").catch(() => null),
      pageErrors
    }));
    throw error;
  }

  await search.fill("團");
  await page.waitForTimeout(80);
  await search.fill("團體");
  await page.getByText("團體結果", { exact: true }).waitFor();
  const firstState = await (await page.request.get(origin + "/control")).json();
  assert.equal(firstState.requests.filter((row) => row.q === "團").length, 0);
  assert.equal(firstState.requests.filter((row) => row.q === "團體").length, 1);

  await search.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }))
  );
  await search.fill("中文");
  await page.waitForTimeout(450);
  const composingState = await (await page.request.get(origin + "/control")).json();
  assert.equal(composingState.requests.filter((row) => row.q === "中文").length, 0);
  await search.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中文" }))
  );
  await page.getByText("中文結果", { exact: true }).waitFor();

  await search.fill("舊");
  await page.waitForTimeout(350);
  await search.fill("新");
  await page.getByText("新結果", { exact: true }).waitFor();
  await page.waitForTimeout(300);
  const raceState = await (await page.request.get(origin + "/control")).json();
  assert.equal(raceState.requests.find((row) => row.q === "舊").aborted, true);
  assert.equal(await page.getByText("舊結果", { exact: true }).count(), 0);

  await search.fill("");
  await page.getByText("初始結果", { exact: true }).waitFor();
  const clearedState = await (await page.request.get(origin + "/control")).json();
  assert.equal(clearedState.requests.filter((row) => row.q === "").length, 1);

  await search.fill("錯誤");
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByText("沒有符合條件的團體查詢。", { exact: true }).count(), 0);
  await page.request.get(origin + "/control?recover=1");
  await page.getByRole("button", { name: "重試", exact: true }).click();
  await page.getByText("錯誤結果", { exact: true }).waitFor();

  const finalState = await (await page.request.get(origin + "/control")).json();
  for (const q of ["團體", "中文", "舊", "新"]) {
    const count = finalState.requests.filter((row) => row.q === q).length;
    if (count !== 1) console.error("GROUP_ENQUIRY_FINAL_STATE", q, JSON.stringify(finalState));
    assert.equal(count, 1, q);
  }
  console.log(JSON.stringify({ requests: finalState.requests }));
} finally {
  await browser.close();
}`,
    ],
    {
      env: { ...process.env, GROUP_ENQUIRY_FIXTURE_ORIGIN: `http://127.0.0.1:${server.port}` },
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
    const result = JSON.parse(output) as { requests: Recorded[] };
    expect(result.requests.find((row) => row.q === "舊")?.aborted).toBe(true);
  } finally {
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}, 30_000);
