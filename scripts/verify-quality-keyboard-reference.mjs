import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
assert.equal(process.env.QUALITY_BROWSER, "1");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const origin = "http://127.0.0.1:56336",
  output = "docs/evidence/operations-release-20260915/quality-browser";
await mkdir(output, { recursive: true });
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const fixture = JSON.parse(
  await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"),
).admin;
const user = await service.auth.admin.getUserById(fixture.id);
assert.ok(user.data.user.email.endsWith("@example.invalid"));
const link = await service.auth.admin.generateLink({
  type: "magiclink",
  email: user.data.user.email,
});
if (link.error) throw Error("Local auth setup failed");
const auth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
const verified = await auth.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: "magiclink",
});
if (verified.error) throw Error("Local auth failed");
const session = verified.data.session;
const report = { checks: [], errors: [], screenshots: [] };
async function post(path, body) {
  const result = await fetch(origin + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await result.json();
  assert.equal(result.status, 200, JSON.stringify(data));
  return data;
}
const rows = await service
  .from("sponsorship_pledge")
  .select("id,supporter:supporter_id(name,email)")
  .limit(1000);
if (rows.error) throw rows.error;
const pledge = rows.data.find((x) => x.supporter?.email?.endsWith("@example.invalid"));
assert.ok(pledge, "existing synthetic pledge required");
const marker = "quality-doc-" + crypto.randomUUID().slice(0, 8);
const docs = Array.from({ length: 51 }, (_, n) => ({
  kind: "adoption_guide",
  title: `${marker}-${String(n + 1).padStart(2, "0")}`,
  language: "zh-HK",
  object_path: `synthetic/${marker}/${n}.pdf`,
  byte_size: 10,
  is_published: true,
  sort_order: n,
}));
const inserted = await service.from("document_assets").insert(docs);
if (inserted.error) throw inserted.error;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.addInitScript(
    (value) => localStorage.setItem("sb-127-auth-token", JSON.stringify(value)),
    session,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(origin + "/admin/?section=sponsor", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "承諾審核", exact: true }).click();
  const review = page
    .getByRole("button", { name: `審核 ${pledge.supporter.name}`, exact: true })
    .first();
  await review.waitFor();
  for (const key of ["Enter", "Space"]) {
    await review.focus();
    await page.keyboard.press(key);
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.textContent?.includes("審核"));
    assert.equal(await review.evaluate((e) => e === document.activeElement), true);
  }
  report.checks.push(
    "Existing synthetic pledge: Enter and Space open review drawer, Escape closes and restores trigger focus; no financial mutation",
  );
  await page.goto(origin + "/admin/content/knowledge", { waitUntil: "networkidle" });
  await page.getByLabel("搜尋文件", { exact: true }).fill(marker);
  const nav = page.getByRole("navigation", { name: "參考文件分頁", exact: true });
  await nav.getByText(/共 51 項/).waitFor();
  await page
    .locator("label")
    .filter({ hasText: "連結方式" })
    .locator("select")
    .first()
    .selectOption("document");
  await nav.getByRole("button", { name: "下一頁", exact: true }).click();
  const picker = page
    .locator("label")
    .filter({ hasText: /^\s*PDF 文件/ })
    .locator("select")
    .first();
  await picker.locator("option").nth(1).waitFor({ state: "attached" });
  const option = picker.locator("option").nth(1);
  assert.ok((await option.textContent()).includes(marker + "-51"));
  const value = await option.getAttribute("value");
  await picker.selectOption(value);
  await nav.getByRole("button", { name: "上一頁", exact: true }).click();
  await nav.getByText(/1 \/ 2/).waitFor();
  assert.equal(await picker.inputValue(), value);
  report.checks.push(
    "51 published synthetic PDF references: page2 record51 selectable, selection retained after returning to page1",
  );
  await page.screenshot({ path: output + "/reference-picker-late-page.png", fullPage: true });
  const imageFixture = JSON.parse(
    await readFile(".local-policy-test/quality-image-transfer.json", "utf8"),
  );
  let releaseRead;
  let readCount = 0;
  const delayedRead = new Promise((resolve) => {
    releaseRead = resolve;
  });
  await page.route("**/api/admin/animals/publication/", async (route) => {
    const body = route.request().postDataJSON();
    if (body.kind === "read" && ++readCount >= 2) await delayedRead;
    await route.continue();
  });
  await page.goto(origin + `/admin/animals/${imageFixture.animal_id}/edit`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByText("正在載入已儲存草稿…", { exact: true }).waitFor();
  assert.equal(await page.locator('input[name="name"]').count(), 0);
  releaseRead();
  const nameField = page.locator('input[name="name"]');
  await nameField.waitFor();
  await page.waitForLoadState("networkidle");
  await nameField.fill("Synthetic image text-only second publication");
  const savedResponse = page.waitForResponse(
    (r) => r.url().includes("/animals/publication/") && r.request().postDataJSON()?.kind === "save",
  );
  await page.locator('button[type="submit"]').click();
  const saved = await (await savedResponse).json();
  assert.equal(saved.kind, "saved");
  report.checks.push(
    "Delayed existing draft response: editor unavailable until hydrated; subsequent user edit saves without overwrite or revision0 conflict",
  );
  await page.unroute("**/api/admin/animals/publication/");
  await post("/api/admin/content-review", {
    entity_kind: "animal",
    entity_id: imageFixture.animal_id,
    revision_key: String(saved.revision),
    classification: "approved",
    evidence: "Explicit synthetic image continuation test",
  });
  const secondPreview = await post("/api/admin/animals/publication/", {
    kind: "preview",
    animal_id: imageFixture.animal_id,
  });
  const imageResponse = await fetch(secondPreview.body.preview_image_url);
  assert.equal(imageResponse.status, 200);
  await post("/api/admin/animals/publication/", {
    kind: "publish",
    animal_id: imageFixture.animal_id,
    preview_id: secondPreview.preview_id,
    reason: "Synthetic image text-only second publish",
  });
  report.checks.push(
    "Image publish then reopen/text-only save/preview/publish succeeds with retained referenced private main and gallery objects",
  );
  assert.equal(report.errors.length, 0);
} finally {
  await writeFile(output + "/keyboard-reference-report.json", JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report));
}
