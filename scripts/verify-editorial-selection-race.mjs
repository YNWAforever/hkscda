import assert from "node:assert/strict";
import { chromium } from "playwright";
const targetKind = process.env.EDITORIAL_SELECTION_KIND ?? "animal";
const otherKind = targetKind === "animal" ? "content" : "animal";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let hold = false,
    release,
    started;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  await page.route("**/api/admin/content-review?*", async (route) => {
    const url = new URL(route.request().url()),
      kind = url.searchParams.get("kind"),
      pageNumber = Number(url.searchParams.get("page"));
    if (hold && kind === targetKind && pageNumber === 2) {
      started();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    return route.fulfill({
      json: {
        total: 1000,
        items: Array.from({ length: 25 }, (_, i) => ({
          entity_id: `11111111-1111-4111-8111-${String((pageNumber - 1) * 25 + i + 1).padStart(12, "0")}`,
          entity_kind: kind,
          revision_key: "synthetic-revision",
          title: `Synthetic ${kind} ${(pageNumber - 1) * 25 + i + 1}`,
          publication_state: "draft",
          classification: "needs_review",
          evidence: null,
        })),
      },
    });
  });
  await page.goto(
    (process.env.EDITORIAL_SELECTION_BASE_URL ?? "http://127.0.0.1:56561") +
      "/scripts/fixtures/editorial-queue-race.html",
    { waitUntil: "networkidle" },
  );
  await page.locator("summary").filter({ hasText: "內容來源審核佇列" }).click();
  const kind = page.getByLabel("資料類型");
  await kind.selectOption(targetKind);
  const all = page.getByRole("button", {
    name: new RegExp("選取全部.*" + (targetKind === "animal" ? "動物資料" : "宣傳內容")),
  });
  await all.waitFor();
  hold = true;
  await all.click();
  await began;
  await kind.selectOption(otherKind);
  await page.getByText(`Synthetic ${otherKind} 1`, { exact: false }).first().waitFor();
  await kind.selectOption(targetKind);
  release();
  hold = false;
  await page
    .getByRole("status")
    .filter({ hasText: "正在固定選取範圍" })
    .waitFor({ state: "hidden" });
  const retained = await page.locator('input[type="checkbox"]:checked').count();
  console.log(
    JSON.stringify({
      environment: "actual ContentReviewQueue; synthetic delayed page",
      retainedAfterKindCycle: retained,
      pageErrors: errors,
    }),
  );
  assert.equal(retained, 0);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
