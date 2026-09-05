import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.CMS_EDITOR_TEST_BASE_URL;
const state = process.env.CMS_EDITOR_TEST_STORAGE_STATE;
const id = process.env.CMS_EDITOR_TEST_CONTENT_ID;
if (!base || !state || !id || process.env.CMS_EDITOR_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error(
    "Requires explicit loopback app, disposable staff storage state, seeded content ID and opt-in",
  );
const target = new URL(base);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !["http:", "https:"].includes(target.protocol) ||
  target.search ||
  target.hash ||
  target.username ||
  target.password ||
  !/^[-a-f0-9]{36}$/.test(id)
)
  throw new Error("Only explicit loopback disposable CMS targets are permitted");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ storageState: state });
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([
    a.goto(`${target.origin}/admin/content/${id}`),
    b.goto(`${target.origin}/admin/content/${id}`),
  ]);
  const main = (page) =>
    page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "基本內容", exact: true }) });
  const title = (page) => main(page).getByLabel("標題", { exact: true });
  await title(a).waitFor();
  await title(b).waitFor();
  const local = `Unsaved A ${Date.now()}`;
  await title(a).fill(local);
  assert.equal(await a.getByRole("button", { name: "發布", exact: true }).isDisabled(), true);
  await title(b).fill(`Saved B ${Date.now()}`);
  const bSaved = b.waitForResponse(
    (r) => r.url().endsWith(`/api/admin/content/${id}`) && r.request().method() === "PATCH",
  );
  await main(b).getByRole("button", { name: "儲存草稿", exact: true }).click();
  assert.equal((await bSaved).status(), 200);
  const conflict = a.waitForResponse(
    (r) => r.url().endsWith(`/api/admin/content/${id}`) && r.request().method() === "PATCH",
  );
  await main(a).getByRole("button", { name: "儲存草稿", exact: true }).click();
  assert.equal((await conflict).status(), 409);
  assert.equal(await title(a).inputValue(), local);
  await a.getByRole("button", { name: "比較最新內容", exact: true }).click();
  assert.equal(await title(a).inputValue(), local);
  a.once("dialog", (dialog) => dialog.dismiss());
  await a.getByRole("button", { name: "重新整理", exact: true }).click();
  assert.equal(await title(a).inputValue(), local);
  const profile = b.getByLabel("救援地區", { exact: true });
  if (await profile.count()) {
    await profile.fill("Unsaved profile");
    assert.equal(await b.getByRole("button", { name: "發布", exact: true }).isDisabled(), true);
  }
  console.log(
    JSON.stringify({
      result: "passed",
      checks: [
        "dirty publish disabled",
        "two-tab stale409",
        "local text retained",
        "comparison non-destructive",
        "dirty refresh cancellable",
        "nested dirty guard",
      ],
    }),
  );
} finally {
  await browser.close();
}
