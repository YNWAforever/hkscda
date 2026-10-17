import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("assessment jobs expose first-load, error, empty and switched-actor states", async () => {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/assessmentJobs.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "assessment-synthetic-auth",
        setup(build) {
          build.onResolve({ filter: /supabase$/ }, (args) =>
            resolve(args.resolveDir, args.path) === resolve(import.meta.dir, "../supabase")
              ? { path: "assessment-auth-fixture", namespace: "fixture" }
              : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents: `
              export const supabase = {
                auth: {
                  getSession: async () => ({
                    data: {
                      session: {
                        access_token: "token-" + (localStorage.getItem("fixture-assessment-actor") || "a"),
                        user: { id: localStorage.getItem("fixture-assessment-actor") || "a" }
                      }
                    },
                    error: null
                  })
                }
              };`,
          }));
        },
      },
    ],
  });
  expect(bundle.success).toBe(true);

  let mode: "pending" | "success" | "empty" | "error" = "pending";
  let releasePending = () => {};
  const jobRequests: string[] = [];
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
        mode = url.searchParams.get("mode") as typeof mode;
        if (url.searchParams.get("release") === "1") releasePending();
        return Response.json({ mode, jobs: jobRequests });
      }
      if (url.pathname === "/api/admin/volunteers/assessments/")
        return Response.json({ available_channels: [] });
      if (url.pathname === "/api/admin/volunteers/jobs/") {
        const actor = request.headers.get("authorization")?.replace(/^Bearer token-/, "") || "a";
        jobRequests.push(actor);
        if (mode === "pending")
          await new Promise<void>((resolvePending) => {
            releasePending = resolvePending;
          });
        if (mode === "error")
          return Response.json({ error: "Synthetic jobs failure" }, { status: 503 });
        if (mode === "empty") return Response.json({ jobs: [] });
        return Response.json({
          jobs: [
            {
              id: `fixture-job-${actor}`,
              kind: `fixture-job-${actor}`,
              status: "queued",
              attempts: 1,
              available_at: "2026-10-17T00:00:00.000Z",
              last_error: null,
            },
          ],
        });
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
  const origin = process.env.ASSESSMENT_FIXTURE_ORIGIN;
  const notifications = () => page.getByRole("heading", { name: "通知工作", exact: true }).locator("..");

  try {
    await page.goto(origin + "/");
    await notifications().getByText("載入中…", { exact: true }).waitFor();
  } catch (error) {
    console.error("ASSESSMENT_FIXTURE_DEBUG", JSON.stringify({
      body: await page.textContent("body").catch(() => null),
      pageErrors
    }));
    throw error;
  }
  await page.request.get(origin + "/control?mode=success&release=1");
  await notifications().getByText(/fixture-job-a/).waitFor();

  await page.request.get(origin + "/control?mode=empty");
  await page.reload();
  await notifications().getByText("目前沒有通知工作。", { exact: true }).waitFor();

  await page.request.get(origin + "/control?mode=error");
  await page.reload();
  await notifications().getByRole("alert").waitFor();
  await notifications().getByText("無法載入", { exact: true }).waitFor();
  assert.equal(
    await notifications().getByText("目前沒有通知工作。", { exact: true }).count(),
    0
  );
  await page.request.get(origin + "/control?mode=success");
  await notifications().getByRole("button", { name: "重試", exact: true }).click();
  await notifications().getByText(/fixture-job-a/).waitFor();

  await page.evaluate(() => window.switchAssessmentActor());
  await notifications().getByText(/fixture-job-b/).waitFor();
  assert.equal(await notifications().getByText(/fixture-job-a/).count(), 0);

  const beforeInitial = await (await page.request.get(origin + "/control?mode=success")).json();
  await page.goto(origin + "/?initial=1");
  await notifications().getByText(/fixture-initial/).waitFor();
  const afterInitial = await (await page.request.get(origin + "/control?mode=success")).json();
  assert.deepEqual(afterInitial.jobs, beforeInitial.jobs);
  console.log(JSON.stringify({ jobs: afterInitial.jobs }));
} finally {
  await browser.close();
}`,
    ],
    {
      env: { ...process.env, ASSESSMENT_FIXTURE_ORIGIN: `http://127.0.0.1:${server.port}` },
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
    expect(JSON.parse(output)).toEqual({ jobs: ["a", "a", "a", "a", "b"] });
  } finally {
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}, 30_000);
