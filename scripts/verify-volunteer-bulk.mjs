import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin = process.env.BULK_TEST_ORIGIN ?? "http://127.0.0.1:56549";
if (new URL(origin).hostname !== "127.0.0.1") throw Error("Loopback required");
const browser = await chromium.launch();
const id = "11111111-1111-4111-8111-111111111111",
  version = "22222222-2222-4222-8222-222222222222";
function fixture() {
  return {
    id,
    action: "generate",
    selection: [],
    created_at: "2026-09-30T00:00:00Z",
    expires_at: "2099-10-01T00:00:00Z",
    groups: [0, 1].map((index) => ({
      index,
      date: "2099-10-0" + (index + 1),
      state: "pending",
      items: [
        {
          date: "2099-10-0" + (index + 1),
          template_key: "synthetic_cat",
          policy_version_id: version,
          item_key: "synthetic-" + index,
          state: "ready",
          preview: {
            kind: "generated",
            after: {
              title: "合成草稿",
              starts_at: "2099-10-01T01:30:00Z",
              shelter_key: "cat",
              capacity: 10,
            },
          },
        },
      ],
    })),
  };
}
try {
  for (const width of [390, 768, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(10000);
    let operation = fixture();
    const calls = [];
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/admin/volunteers/bulk", async (route) => {
      const body = route.request().postDataJSON();
      calls.push(body);
      let data;
      if (body.action === "list") data = { activities: [], total: 0 };
      else if (body.action === "templates")
        data = {
          templates: [
            {
              template_key: "synthetic_cat",
              name: "貓舍上午服務",
              version_id: version,
              shelter: "cat",
              start_time: "09:30",
              end_time: "12:30",
            },
          ],
        };
      else if (body.action === "status") data = { kind: "ok", operation };
      else if (body.action === "apply") {
        operation = structuredClone(operation);
        operation.groups[body.group_index].state = "failed";
        data = { kind: "ok", operation };
      } else throw Error("Unexpected mutation: " + body.action);
      await route.fulfill({ json: data });
    });
    await page.goto(origin + "/scripts/fixtures/volunteer-bulk.html?operation=" + id, {
      waitUntil: "networkidle",
    });
    await page.getByText("3. 執行結果", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "八星期", exact: true }).count(), 1);
    const sequence = page.getByRole("button", { name: "順序執行已審閱組", exact: true });
    assert.equal(await sequence.isDisabled(), true);
    await page.getByLabel(/已檢查餘下/).check();
    assert.equal(await sequence.isEnabled(), true);
    await page.getByLabel("已檢查本組每個日期及影響", { exact: true }).first().check();
    await page.getByRole("button", { name: "執行此組", exact: true }).first().click();
    await page.getByRole("button", { name: "以原操作重試", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "以原操作重試", exact: true }).isDisabled(),
      true,
      "A failed group requires fresh review before retry",
    );
    assert.deepEqual(
      calls.filter((c) => c.action === "apply").map((c) => c.group_index),
      [0],
    );
    const measure = () =>
      page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    let m = await measure();
    assert.ok(m.scroll <= m.viewport + 1);
    await page.screenshot({
      path: "docs/evidence/audit-remediation-20260927/ui/t17-bulk-sequential-" + width + ".png",
      fullPage: true,
    });
    if (width === 768) {
      await page.evaluate(() => (document.body.style.zoom = "200%"));
      m = await measure();
      assert.ok(m.scroll <= m.viewport + 1);
      await page.screenshot({
        path: "docs/evidence/audit-remediation-20260927/ui/t17-bulk-sequential-768-zoom200.png",
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({ width, reviewRequiredAfterFailure: true, noOverflow: true, errors: 0 }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
