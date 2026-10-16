import { parseArgs } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { verifyVolunteerAttendanceTarget } from "./fixtures/volunteer-attendance-work.ts";

const { values } = parseArgs({
  options: { mode: { type: "string" }, manifest: { type: "string" }, out: { type: "string" } },
});
assert.ok(["baseline", "candidate"].includes(values.mode));
const lab = resolve(".local-policy-test/volunteer-daily-work-20261016");
assert.equal(resolve(values.manifest), resolve(lab, "manifest.json"));
assert.equal(resolve(values.out), resolve(lab, values.mode));
const target = verifyVolunteerAttendanceTarget(
  JSON.parse(await readFile(resolve(lab, "target-proof.json"), "utf8")),
);
const fixture = JSON.parse(await readFile(values.manifest, "utf8"));
assert.equal(fixture.fixtureId, target.runId);
assert.equal(fixture.state, "ready");
const local = JSON.parse(
  await readFile(".local-policy-test/volunteer-performance-20261015-credentials.json", "utf8"),
);
assert.equal(local.API_URL, target.apiOrigin);
const actors = JSON.parse(await readFile(resolve(lab, "actors-private.json"), "utf8"));
const origin = "http://127.0.0.1:56548";
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
await mkdir(values.out, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const actor of [
    actors.find((a) => a.role === "admin"),
    actors.find((a) => a.role === "staff"),
  ]) {
    assert.ok(actor);
    const auth = createClient(local.API_URL, local.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await auth.auth.signInWithPassword({
      email: actor.email,
      password: actor.password,
    });
    assert.ok(login.data.session && !login.error, "owned synthetic actor login");
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
      });
      await context.route(/^https?:\/\/(?!127\.0\.0\.1:(?:56321|56548)(?:\/|$))/, (route) =>
        route.abort("blockedbyclient"),
      );
      await context.addInitScript(
        ({ key, session }) => {
          localStorage.setItem(key, JSON.stringify(session));
          window.__dailyWorkClicks = 0;
          addEventListener("click", () => window.__dailyWorkClicks++);
        },
        { key: auth.auth.storageKey, session: login.data.session },
      );
      const page = await context.newPage();
      const requests = [];
      let documents = 0;
      let routeTransitions = 0;
      let previousPath = "";
      page.on("request", (request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
        if (request.url().startsWith(origin + "/api/admin/volunteers"))
          requests.push({
            path: new URL(request.url()).pathname,
            method: request.method(),
            action: request.postDataJSON()?.action,
          });
      });
      page.on("framenavigated", (frame) => {
        if (frame !== page.mainFrame()) return;
        const path = new URL(frame.url()).pathname;
        if (previousPath && previousPath !== path) routeTransitions++;
        previousPath = path;
      });
      const started = performance.now();
      await page.goto(origin + "/admin/volunteers/tasks?pending_scope=upcoming&page=2");
      await page.locator("#tasks-pending").waitFor();
      await page.locator("#tasks-pending").locator("..").getByRole("article").first().waitFor();
      const pending = page.locator("#tasks-pending").locator("..");
      const rowText = await pending.getByRole("article").first().innerText();
      const hasDecisionData = rowText.includes("Venue") && rowText.includes("Session");
      const taskA = {
        caseId: "DW-A",
        role: actor.role,
        viewport: { width },
        sha,
        status: hasDecisionData ? "partial" : "failed",
        reason: hasDecisionData
          ? "return journey still to verify"
          : "pending rows lack session/venue decision data",
        clicks: await page.evaluate(() => window.__dailyWorkClicks),
        routeTransitions,
        documentNavigations: documents,
        observedElapsedMs: performance.now() - started,
        completed: false,
      };
      await page.screenshot({
        path: resolve(values.out, `${actor.role}-${width}-DW-A.png`),
        fullPage: true,
      });
      results.push(taskA);
      await page.goto(
        origin +
          `/admin/volunteers/activities?date_scope=all&selected=${fixture.cases.rosterActivityId}`,
      );
      await page.getByRole("dialog").waitFor();
      await page.getByRole("dialog").getByRole("link").first().waitFor();
      const inline = await page.locator("[data-attendance-panel]").count();
      results.push({
        caseId: "DW-B",
        role: actor.role,
        viewport: { width },
        sha,
        status: inline ? "partial" : "failed",
        reason: inline
          ? "full attendance journey still to verify"
          : "no inline per-registration attendance workflow",
        completed: false,
      });
      await page.screenshot({
        path: resolve(values.out, `${actor.role}-${width}-DW-B.png`),
        fullPage: true,
      });
      for (const caseId of ["DW-C", "DW-D", "DW-E", "DW-F"])
        results.push({
          caseId,
          role: actor.role,
          viewport: { width },
          sha,
          status: "blocked",
          completed: false,
          reason: "scoped attendance workflow unavailable in baseline",
        });
      assert.ok(
        requests.every(
          (r) => !["apply", "attendance_apply", "attendance_preview"].includes(r.action),
        ),
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(
    resolve(values.out, "tasks.json"),
    JSON.stringify(
      {
        mode: values.mode,
        sha,
        fixtureId: fixture.fixtureId,
        scope: "Synthetic role browser task baseline; no attendance or application writes",
        results,
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify({
    mode: values.mode,
    checks: results.length,
    completed: results.filter((r) => r.completed).length,
  }),
);
process.exitCode = results.every((r) => r.completed) ? 0 : 1;
