import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const before = process.argv.includes("--before"),
  browser = await chromium.launch(),
  results = [];
const definitions = JSON.parse(
  execFileSync(
    "bun",
    [
      "-e",
      `import {selectTaskDefinitions} from './src/lib/operations/taskOverview.server';console.log(JSON.stringify(Object.fromEntries(['staff','treasurer','admin'].map(role=>[role,selectTaskDefinitions(role)]))));`,
    ],
    { encoding: "utf8" },
  ),
);
if (before) {
  const source = execFileSync(
    "git",
    ["show", "b3907319:src/lib/operations/taskOverview.server.ts"],
    { encoding: "utf8" },
  );
  definitions.treasurer.find((c) => c.key === "sponsorship_followup").guidance = source.match(
    /sponsorship_followup:\s*\{[\s\S]*?guidance:\s*"([^"]+)"/,
  )[1];
}
try {
  for (const width of [390, 768, 1366])
    for (const role of before ? ["treasurer"] : ["staff", "treasurer", "admin"]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }),
        page = await context.newPage(),
        errors = [];
      let taskReads = 0;
      page.on("pageerror", (e) => errors.push(e.message));
      await context.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.hostname !== "127.0.0.1") return route.abort();
        if (!u.pathname.startsWith("/api/")) return route.continue();
        if (u.pathname === "/api/admin/me")
          return route.fulfill({
            json: {
              admin: {
                id: role,
                authUserId: role,
                role,
                status: "active",
                email: role + "@example.invalid",
              },
            },
          });
        if (u.pathname === "/api/admin/task-overview") {
          taskReads++;
          return route.fulfill({
            json: {
              cards: definitions[role].map((c, i) => ({
                ...c,
                metric:
                  i === 1
                    ? { state: "unavailable" }
                    : { state: "ready", count: i === 0 ? 0 : 2, oldestAt: null },
              })),
            },
          });
        }
        return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
      });
      await page.goto(`http://127.0.0.1:56572/scripts/fixtures/task-guidance.html?role=${role}`, {
        waitUntil: "networkidle",
      });
      await page.getByRole("heading", { name: definitions[role][0].label, exact: true }).waitFor();
      const cards = await page.locator("ol > li").count(),
        text = await page.locator("main").innerText(),
        links = await page
          .getByRole("link", { name: "開啟工作區" })
          .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
      assert.deepEqual(
        links,
        definitions[role].map((c) => c.href),
      );
      const first = page.getByRole("link", { name: "開啟工作區" }).first();
      await first.focus();
      assert.equal(await first.evaluate((n) => n === document.activeElement), true);
      const guidanceAllowed =
          role !== "treasurer" || (text.includes("職員／管理員") && !text.includes("指派負責人")),
        axe = await new AxeBuilder({ page }).analyze();
      await page.screenshot({
        path: `docs/evidence/audit-remediation-20260927/ui/t23-guidance-${before ? "before" : "after"}-${role}-${width}.png`,
        fullPage: true,
      });
      if (width === 768) await page.evaluate(() => (document.body.style.zoom = "200%"));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const oldReads = taskReads;
      await page.getByRole("button", { name: "停權", exact: true }).click();
      await page.getByRole("alert").waitFor();
      const hidden = (await page.getByRole("link", { name: "開啟工作區" }).count()) === 0;
      results.push({
        width,
        role,
        cards,
        guidanceAllowed,
        zeroAndUnavailable: text.includes("0") && text.includes("未能讀取"),
        suspendedHidden: hidden,
        noSuspendedRead: taskReads === oldReads,
        axe: axe.violations.map((v) => v.id),
        overflow,
        errors,
      });
      await context.close();
    }
  console.log(JSON.stringify(results));
  assert.ok(
    results.every(
      (r) =>
        r.guidanceAllowed &&
        r.zeroAndUnavailable &&
        r.suspendedHidden &&
        r.noSuspendedRead &&
        r.axe.length === 0 &&
        !r.overflow &&
        r.errors.length === 0,
    ),
  );
} finally {
  await browser.close();
}
