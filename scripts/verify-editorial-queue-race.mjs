import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch();
const results = [];
try {
  for (const kind of process.env.EDITORIAL_RACE_KIND === "animal"
    ? ["animal"]
    : ["content", "animal"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const endpoint = kind === "content" ? "content" : "animals",
      key = kind === "content" ? "cms-review-bulk-operation" : "animal-review-bulk-operation";
    const firstId = "33333333-3333-4333-8333-333333333333",
      secondId = "44444444-4444-4444-8444-444444444444";
    let started, release;
    const firstStarted = new Promise((resolve) => {
      started = resolve;
    });
    await page.route("**/api/admin/content-review?*", (route) => {
      const k = new URL(route.request().url()).searchParams.get("kind");
      return route.fulfill({
        json: {
          total: 1,
          items: [
            {
              entity_id: "11111111-1111-4111-8111-111111111111",
              entity_kind: k,
              title: "Synthetic queue row",
              publication_state: "draft",
              revision_key: "1",
              classification: "needs_review",
              evidence: null,
            },
          ],
        },
      });
    });
    const make = (id, body) => ({
      operationId: id,
      evidence: body.evidence,
      filterHash: body.filterHash,
      createdAt: "2026-09-27",
      expiresAt: "2099-01-01",
      state: "queued",
      items: [],
    });
    await page.route(`**/api/admin/${endpoint}/review-bulk*`, async (route) => {
      const body = route.request().postDataJSON();
      if (body.evidence === "Old snapshot A") {
        const response = make(firstId, body);
        started();
        await new Promise((resolve) => {
          release = resolve;
        });
        return route.fulfill({ json: response });
      }
      return route.fulfill({ json: make(secondId, body) });
    });
    await page.goto(
      (process.env.EDITORIAL_RACE_BASE_URL || "http://127.0.0.1:56562") +
        "/scripts/fixtures/editorial-queue-race.html",
      { waitUntil: "networkidle" },
    );
    await page.getByText("內容來源審核佇列", { exact: true }).click();
    await page.getByRole("combobox", { name: "資料類型" }).selectOption(kind);
    await page.getByRole("button", { name: "選取本頁", exact: true }).click();
    await page.getByRole("textbox", { name: "送審來源及理由" }).fill("Old snapshot A");
    await page.getByRole("button", { name: "建立送審預覽", exact: true }).click();
    await firstStarted;
    await page
      .getByRole("combobox", { name: "資料類型" })
      .selectOption(kind === "content" ? "animal" : "content");
    await page.getByRole("combobox", { name: "資料類型" }).selectOption(kind);
    await page.getByRole("button", { name: "選取本頁", exact: true }).click();
    await page.getByRole("textbox", { name: "送審來源及理由" }).fill("New snapshot B");
    await page.getByRole("button", { name: "建立送審預覽", exact: true }).click();
    await page.getByText("本次理由：New snapshot B", { exact: true }).waitFor();
    const oldResponse = page.waitForResponse(
      async (response) =>
        response.url().includes(`/${endpoint}/review-bulk`) &&
        (await response.json()).operationId === firstId,
    );
    release();
    await oldResponse;
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const recoveryMatchesLatest = await page.evaluate(
      ({ key, id }) => sessionStorage.getItem(key) === id,
      { key, id: secondId },
    );
    results.push({
      kind,
      recoveryMatchesLatest,
      visibleLatest: await page.getByText("本次理由：New snapshot B", { exact: true }).isVisible(),
      pageErrors: errors,
    });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
  assert.ok(
    results.every((r) => r.recoveryMatchesLatest && r.visibleLatest && r.pageErrors.length === 0),
    "Unmounted preview must not replace latest recovery snapshot",
  );
} finally {
  await browser.close();
}
