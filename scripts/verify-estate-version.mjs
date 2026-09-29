import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ESTATE_TEST_ORIGIN ?? "http://127.0.0.1:56542";
if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Loopback test origin required");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
const rows = [];
const createIds = [];
let failCreate = false;
let staleResponses = 0;
try {
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({ json: { admin: { role: "staff", authUserId: "synthetic" } } }),
  );
  await page.route("**/api/admin/adoption-information?**", (route) => {
    const resource = new URL(route.request().url()).searchParams.get("resource");
    return route.fulfill({ json: {
      resource, items: resource === "estates" ? rows.map((row) => ({ ...row })) : [],
      total: resource === "estates" ? rows.length : 0, page: 1, pageSize: 50,
    } });
  });
  await page.route("**/api/admin/adoption-information", (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({ status: 405, json: { error: "Synthetic method unsupported" } });
    const body = route.request().postDataJSON();
    if (body.resource !== "estate")
      return route.fulfill({ status: 400, json: { error: "Synthetic estate only" } });
    const { command, input } = body;
    if (command === "create") {
      createIds.push(input.id);
      if (failCreate) {
        failCreate = false;
        return route.fulfill({ status: 503, json: { error: "Synthetic create failure" } });
      }
      const prior = rows.find((row) => row.id === input.id);
      if (prior) return route.fulfill({ status: 201, json: { estate: prior } });
      const estate = { ...input, version: 1, isPublished: false };
      rows.push(estate);
      return route.fulfill({ status: 201, json: { estate } });
    }
    const index = rows.findIndex((row) => row.id === input.id);
    if (index < 0) return route.fulfill({ status: 404, json: { error: "Missing estate" } });
    if (rows[index].version !== input.expectedVersion) {
      staleResponses++;
      return route.fulfill({ status: 409, json: { error: "Estate version conflict; reload the latest row" } });
    }
    rows[index] = command === "update"
      ? { ...rows[index], ...input.fields, version: rows[index].version + 1 }
      : { ...rows[index], isPublished: input.isPublished, version: rows[index].version + 1 };
    return route.fulfill({ json: { estate: rows[index] } });
  });

  await page.goto(origin + "/scripts/fixtures/adoption-unsaved.html", {
    waitUntil: "domcontentloaded", timeout: 45000,
  });
  await page.getByRole("tab", { name: "可養狗屋苑" }).click();
  const createEditor = page.getByRole("heading", { name: "新增屋苑" }).locator("..");
  await createEditor.getByRole("textbox", { name: "屋苑名稱" }).fill("甲屋苑");
  await createEditor.getByRole("textbox", { name: "地區" }).fill("九龍");
  failCreate = true;
  await createEditor.getByRole("button", { name: "新增屋苑" }).click();
  await page.getByRole("alert", { name: "" }).filter({ hasText: "Synthetic create failure" }).waitFor();
  assert.equal(await createEditor.getByRole("textbox", { name: "屋苑名稱" }).inputValue(), "甲屋苑");
  await createEditor.getByRole("button", { name: "新增屋苑" }).click();
  await page.getByRole("heading", { name: "編輯屋苑" }).first().waitFor();
  assert.equal(await createEditor.getByRole("textbox", { name: "屋苑名稱" }).inputValue(), "");
  assert.equal(createIds[0], createIds[1]);

  await createEditor.getByRole("textbox", { name: "屋苑名稱" }).fill("乙屋苑");
  await createEditor.getByRole("textbox", { name: "地區" }).fill("新界");
  await createEditor.getByRole("button", { name: "新增屋苑" }).click();
  await page.getByRole("heading", { name: "編輯屋苑" }).nth(1).waitFor();
  assert.notEqual(createIds[1], createIds[2]);
  assert.deepEqual(rows.map((row) => row.estateName), ["甲屋苑", "乙屋苑"]);

  const first = page.getByRole("heading", { name: "編輯屋苑" }).first().locator("..");
  await first.getByRole("button", { name: "發佈", exact: true }).click();
  await first.getByRole("button", { name: "取消發佈" }).waitFor();
  await first.getByRole("textbox", { name: "屋苑名稱" }).fill("甲新名");
  await first.getByRole("button", { name: "編輯" }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="屋苑名稱"][value="甲新名"]') !== null);
  assert.equal(rows[0].isPublished, true);
  await first.getByRole("button", { name: "取消發佈" }).click();
  await first.getByRole("button", { name: "發佈", exact: true }).waitFor();
  assert.equal(rows[0].isPublished, false);

  await first.getByRole("textbox", { name: "屋苑名稱" }).fill("本機修改");
  rows[0] = { ...rows[0], estateName: "同事修改", version: rows[0].version + 1 };
  await page.evaluate(() =>
    window.__cmsQueryClient.invalidateQueries({ queryKey: ["admin-adoption-information"] }),
  );
  await first.getByRole("button", { name: "載入最新版本" }).waitFor();
  assert.equal(await first.getByRole("textbox", { name: "屋苑名稱" }).inputValue(), "本機修改");
  await first.getByRole("button", { name: "載入最新版本" }).click();
  assert.equal(await first.getByRole("textbox", { name: "屋苑名稱" }).inputValue(), "同事修改");

  await first.getByRole("textbox", { name: "屋苑名稱" }).fill("待儲存修改");
  rows[0] = { ...rows[0], estateName: "另一同事", version: rows[0].version + 1 };
  await first.getByRole("button", { name: "編輯" }).click();
  await first.getByRole("button", { name: "載入最新版本" }).waitFor();
  assert.equal(staleResponses, 1);
  assert.equal(rows[0].estateName, "另一同事");
  assert.equal(await first.getByRole("textbox", { name: "屋苑名稱" }).inputValue(), "待儲存修改");
  await page.screenshot({
    path: "docs/evidence/audit-remediation-20260927/ui/t12-estate-conflict-after.png",
    fullPage: true,
  });
  console.log("PASS T12 create retry identity, two rows, publish/edit/unpublish, refetch conflict, HTTP 409");
} finally {
  await browser.close();
}
