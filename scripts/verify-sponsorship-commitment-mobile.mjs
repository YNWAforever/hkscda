import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.SPONSORSHIP_UAT_BASE_URL ?? "http://127.0.0.1:5184";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Sponsorship synthetic UAT must use loopback only");
const output = "docs/evidence/audit-remediation-20260927/sponsorship-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  if (location.hostname === "127.0.0.1") localStorage.setItem(
    "hkscda-public-shortlist-v1",
    JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", name: "合成助養動物", animalType: "sponsor", imageUrl: null, intent: "sponsorship", rank: 1 }]),
  );
});
let submissions = 0;
await context.route("**/api/sponsorships/terms?language=zh-HK", async (route) => {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, terms: { version: "a".repeat(64), title: "合成條款（僅供 UI 測試）", documentUrl: "https://example.invalid/synthetic-terms.pdf", documentDate: "2026-09-27T00:00:00Z" } }) });
});
await context.route("**/api/sponsorships/pledges", async (route) => {
  submissions++;
  await route.fulfill({ status: submissions === 1 ? 400 : 409, contentType: "application/json", body: JSON.stringify(submissions === 1 ? { error: "Invalid request", fields: [{ field: "contact.supporterName", reason: "Required" }] } : { error: "Terms changed", code: "TERMS_CHANGED" }) });
});
try {
  const page = await context.newPage();
  await page.goto(base + "/sponsors/pledge", { waitUntil: "domcontentloaded" });
  const later = page.getByRole("radio", { name: "稍後按核實安排付款" });
  const proof = page.getByRole("radio", { name: "已付款，上載證明" });
  await later.waitFor({ timeout: 15000 });
  assert.equal(await later.isChecked(), true);
  assert.equal(await proof.isChecked(), false);
  await page.getByRole("link", { name: /閱讀已發佈助養條款/ }).waitFor({ timeout: 15000 });
  const scrollWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  assert.ok(scrollWidth <= 390, `mobile document overflows viewport: ${scrollWidth}px`);
  await page.screenshot({ path: output + "/payment-choice-mobile.png", fullPage: true });
  await proof.focus();
  await page.keyboard.press("Space");
  assert.equal(await proof.isChecked(), true);
  await page.getByLabel("姓名", { exact: true }).fill("合成測試 Ada");
  await page.getByLabel("電郵", { exact: true }).fill("ada@example.test");
  await page.getByRole("checkbox", { name: /我同意條款及細則/ }).check();
  await page.getByRole("button", { name: "確認助養承諾" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator("#pledge-proof-file").getAttribute("aria-invalid"), "true");
  assert.equal(submissions, 0);
  await page.screenshot({ path: output + "/proof-errors-mobile.png", fullPage: true });
  await later.check();
  await page.getByRole("button", { name: "確認助養承諾" }).click();
  await page.getByText("contact.supporterName: Required").waitFor();
  assert.equal(await page.getByLabel("姓名", { exact: true }).inputValue(), "合成測試 Ada");
  await page.getByRole("button", { name: "確認助養承諾" }).click();
  await page.getByText(/條款已有更新/).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /我同意條款及細則/ }).isChecked(), false);
  assert.equal(await page.getByLabel("姓名", { exact: true }).inputValue(), "合成測試 Ada");
  assert.equal(submissions, 2);
  console.log(JSON.stringify({ viewport: "390x844", laterRadio: true, proofRadioKeyboard: true, proofValidationBeforeUpload: true, field400PreservesInput: true, staleTerms409PreservesInput: true, submissions, synthetic: true }));
} finally {
  await browser.close();
}
