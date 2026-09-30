import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const before = process.argv.includes("--before"),
  browser = await chromium.launch(),
  results = [];
const base = "crm-assignment-bulk-operation",
  A = "aaaaaaaa-1111-4111-8111-111111111111",
  B = "bbbbbbbb-2222-4222-8222-222222222222",
  assignee = "dddddddd-4444-4444-8444-444444444444";
const op = (operationId, count) => ({
  operationId,
  assigneeUserId: assignee,
  filterHash: "a".repeat(64),
  expiresAt: "2099-01-01T00:00:00Z",
  state: "queued",
  items: Array.from({ length: count }, (_, i) => ({
    entityId: "22222222-2222-4222-8222-" + String(i + 1).padStart(12, "0"),
    status: "pending",
    reasonCode: null,
    beforeAssignee: null,
    afterAssignee: assignee,
    expectedVersion: 1,
  })),
});
try {
  for (const width of [390, 768, 1366])
    for (const mode of before ? ["mount"] : ["mount", "retry", "lost", "actor"]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      let reads = 0,
        previews = 0,
        applies = 0,
        release;
      const held = new Promise((r) => (release = r));
      let saved = op(A, 25);
      if (mode !== "lost")
        await context.addInitScript(
          ({ base, A }) => {
            sessionStorage.setItem(base, A);
            sessionStorage.setItem(base + ":finance-A", A);
          },
          { base, A },
        );
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url()),
          method = route.request().method();
        if (url.hostname !== "127.0.0.1") return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        if (url.pathname.endsWith("assignment-assignees"))
          return route.fulfill({
            json: {
              assignees: [
                { authUserId: assignee, email: "finance@example.invalid", role: "admin" },
              ],
            },
          });
        assert.equal(url.pathname, "/api/admin/supporters/assignment-bulk");
        if (method === "GET") {
          reads++;
          if (mode === "mount" && reads === 1) {
            const original = op(A, 25);
            await held;
            return route.fulfill({ json: original });
          }
          if ((mode === "retry" && reads === 1) || (mode === "lost" && reads === 1))
            return route.fulfill({ status: 503, json: { error: "合成暫時中斷" } });
          return route.fulfill({ json: saved });
        }
        const command = route.request().postDataJSON();
        if (command.action === "preview") {
          previews++;
          saved = op(B, command.ids.length);
          return route.fulfill({ json: saved });
        }
        applies++;
        for (const item of saved.items.filter((i) => i.status === "pending").slice(0, 25))
          item.status = "succeeded";
        saved.state = "partial";
        if (mode === "lost" && applies === 1)
          return route.fulfill({ status: 503, json: { error: "合成回應遺失" } });
        return route.fulfill({ json: saved });
      });
      await page.goto(
        "http://127.0.0.1:56575/scripts/fixtures/crm-assignment.html" +
          (mode === "actor" ? "?actor=finance-B" : ""),
      );
      const select = page.getByRole("combobox", { name: "批量跟進負責人" });
      await page
        .getByRole("option", { name: "finance@example.invalid（admin）" })
        .waitFor({ state: "attached" });
      let mountBlocked = true;
      if (mode === "mount") {
        mountBlocked = await select.isDisabled();
        if (!mountBlocked) {
          await select.selectOption(assignee);
          await page.getByRole("button", { name: "建立預覽", exact: true }).click();
          await page.getByRole("heading", { name: /1000 筆/ }).waitFor();
        }
        release();
        await page.waitForLoadState("networkidle");
        if (!before) {
          await select.selectOption(assignee);
          await page.getByRole("button", { name: "建立預覽", exact: true }).click();
        }
      } else if (mode === "retry") {
        await page.getByRole("alert").waitFor();
        assert.equal(
          await page.evaluate(({ base }) => sessionStorage.getItem(base + ":finance-A"), { base }),
          A,
        );
        await page.getByRole("button", { name: "重新讀取結果", exact: true }).click();
        await page.getByRole("heading", { name: /25 筆/ }).waitFor();
        await select.selectOption(assignee);
        await page.getByRole("button", { name: "建立預覽", exact: true }).click();
      } else {
        await select.selectOption(assignee);
        await page.getByRole("button", { name: "建立預覽", exact: true }).click();
      }
      await page.waitForLoadState("networkidle");
      if (!before) await page.getByRole("heading", { name: /1000 筆/ }).waitFor();
      const visibleB = await page.getByRole("heading", { name: /1000 筆/ }).count();
      if (!before) {
        await page.getByRole("heading", { name: /1000 筆/ }).waitFor();
        assert.equal(await page.locator("tbody tr").count(), 25);
        await page.getByRole("button", { name: "下一頁", exact: true }).focus();
        await page.keyboard.press("Enter");
        await page.getByText("2 / 40").waitFor();
        if (mode === "lost") {
          await page.getByRole("checkbox").check();
          await page.getByRole("button", { name: "套用下一批 25 筆", exact: true }).click();
          await page.getByRole("alert").waitFor();
          await page.waitForLoadState("networkidle");
          assert.equal(
            await page.getByRole("button", { name: "建立預覽", exact: true }).isDisabled(),
            true,
          );
          assert.equal(
            await page.getByRole("button", { name: "處理中…", exact: true }).isDisabled(),
            true,
          );
          await page.getByRole("button", { name: "重新讀取結果", exact: true }).click();
          await page.getByText(/待處理 975 · 成功 25/).waitFor();
          await page.getByRole("button", { name: "套用下一批 25 筆", exact: true }).click();
          await page.getByText(/待處理 950 · 成功 50/).waitFor();
          assert.equal(applies, 2);
          const download = page.waitForEvent("download");
          await page.getByRole("button", { name: "下載逐筆結果 CSV" }).click();
          const csv = await readFile(await (await download).path(), "utf8");
          assert.equal(csv.trim().split(/\r?\n/).length, 1001);
        }
        if (mode === "actor") {
          assert.equal(reads, 0);
          assert.equal(
            await page.evaluate(({ base }) => sessionStorage.getItem(base + ":finance-A"), {
              base,
            }),
            A,
          );
          assert.equal(
            await page.evaluate(({ base }) => sessionStorage.getItem(base + ":finance-B"), {
              base,
            }),
            B,
          );
        }
      }
      const axe = await new AxeBuilder({ page }).analyze(),
        overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (mode === "mount")
        await page.screenshot({
          path: `docs/evidence/audit-remediation-20260927/ui/t23-crm-assignment-${before ? "before" : "after"}-${width}.png`,
          fullPage: true,
        });
      results.push({
        width,
        mode,
        mountBlocked,
        visibleB,
        reads,
        previews,
        applies,
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
        r.mountBlocked &&
        r.visibleB === 1 &&
        r.axe.length === 0 &&
        !r.overflow &&
        r.errors.length === 0,
    ),
  );
} finally {
  await browser.close();
}
