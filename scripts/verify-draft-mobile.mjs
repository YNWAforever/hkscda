import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const output = "docs/evidence/audit-remediation-20260927/draft-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
await context.addInitScript(() => {
  if (location.hostname === "127.0.0.1")
    localStorage.setItem(
      "hkscda-public-shortlist-v1",
      JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "合成助養動物",
          animalType: "sponsor",
          imageUrl: null,
          intent: "sponsorship",
          rank: 1,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "合成領養動物",
          animalType: "cat",
          imageUrl: null,
          intent: "adoption",
          rank: 1,
        },
      ]),
    );
});
const base = process.env.DRAFT_UAT_BASE_URL ?? "http://127.0.0.1:5183";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Draft browser UAT must use loopback only");
try {
  const sponsor = await context.newPage();
  await sponsor.goto(base + "/sponsors/pledge", { waitUntil: "domcontentloaded" });
  const sponsorChoice = sponsor.getByRole("checkbox", { name: "在此裝置保存草稿" });
  await sponsorChoice.waitFor({ timeout: 15000 });
  assert.equal(await sponsorChoice.isChecked(), false);
  assert.equal(
    await sponsor.evaluate(() => localStorage.getItem("hkscda-sponsorship-pledge-draft-v1")),
    null,
  );
  await sponsor.screenshot({ path: output + "/sponsor-before-mobile.png", fullPage: true });
  await sponsorChoice.check();
  await sponsor.getByLabel("姓名", { exact: true }).fill("合成測試 Ada");
  await sponsor.waitForFunction(
    () => {
      const raw = localStorage.getItem("hkscda-sponsorship-pledge-draft-v1");
      return raw && JSON.parse(raw).data.supporterName === "合成測試 Ada";
    },
    undefined,
    { timeout: 10000 },
  );
  const saved = JSON.parse(
    await sponsor.evaluate(() => localStorage.getItem("hkscda-sponsorship-pledge-draft-v1")),
  );
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.data.supporterName, "合成測試 Ada");
  assert.equal("termsAgreed" in saved.data, false);
  assert.equal("statusToken" in saved.data, false);
  await sponsor.reload({ waitUntil: "domcontentloaded" });
  await sponsor.getByRole("button", { name: "恢復草稿並繼續儲存" }).waitFor({ timeout: 15000 });
  assert.equal(await sponsor.getByLabel("姓名", { exact: true }).inputValue(), "");
  await sponsor.getByRole("button", { name: "恢復草稿並繼續儲存" }).click();
  assert.equal(await sponsor.getByLabel("姓名", { exact: true }).inputValue(), "合成測試 Ada");
  assert.equal(await sponsorChoice.isChecked(), true);
  await sponsor.screenshot({ path: output + "/sponsor-restored-mobile.png", fullPage: true });
  await sponsorChoice.uncheck();
  assert.equal(
    await sponsor.evaluate(() => localStorage.getItem("hkscda-sponsorship-pledge-draft-v1")),
    null,
  );
  console.log(
    JSON.stringify({
      route: "sponsor",
      viewport: "390x844",
      optInDefault: false,
      storedSchema: saved.schemaVersion,
      restore: true,
      optOutClears: true,
      errors: [],
    }),
  );
  await sponsor.close();
  const adoption = await context.newPage();
  await adoption.goto(base + "/adoption/apply", { waitUntil: "domcontentloaded" });
  const adoptionChoice = adoption.getByRole("checkbox", { name: "在此裝置保存領養草稿" });
  await adoptionChoice.waitFor({ timeout: 15000 });
  assert.equal(await adoptionChoice.isChecked(), false);
  assert.equal(
    await adoption.evaluate(() => localStorage.getItem("hkscda-adoption-application-draft-v1")),
    null,
  );
  await adoption.screenshot({ path: output + "/adoption-before-mobile.png", fullPage: true });
  await adoptionChoice.focus();
  await adoption.keyboard.press("Space");
  assert.equal(await adoptionChoice.isChecked(), true);
  await adoption.waitForFunction(
    () => {
      const raw = localStorage.getItem("hkscda-adoption-application-draft-v1");
      return raw && JSON.parse(raw).schemaVersion === 2;
    },
    undefined,
    { timeout: 10000 },
  );
  const first = JSON.parse(
    await adoption.evaluate(() => localStorage.getItem("hkscda-adoption-application-draft-v1")),
  );
  assert.equal("terms" in first.data, false);
  assert.equal("photos" in first.data, false);
  assert.equal("statusToken" in first.data, false);
  await adoption.evaluate(() => {
    const key = "hkscda-adoption-application-draft-v1";
    const now = Date.now();
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 2,
        savedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 7 * 86400000).toISOString(),
        step: 6,
        data: {
          contact: { applicantName: "合成測試 Ada" },
          terms: { agreed: true },
          photos: [{ name: "do-not-restore.jpg" }],
        },
      }),
    );
  });
  await adoption.reload({ waitUntil: "domcontentloaded" });
  const resume = adoption.getByRole("button", { name: "恢復草稿並在此裝置繼續儲存" });
  await resume.waitFor({ timeout: 15000 });
  await resume.click();
  assert.equal(await adoptionChoice.isChecked(), true);
  assert.equal(await adoption.locator('[aria-current="step"]').count(), 1);
  assert.match(await adoption.locator('[aria-current="step"]').innerText(), /環境相片/);
  await adoption.screenshot({
    path: output + "/adoption-restored-photo-mobile.png",
    fullPage: true,
  });
  await adoptionChoice.uncheck();
  assert.equal(
    await adoption.evaluate(() => localStorage.getItem("hkscda-adoption-application-draft-v1")),
    null,
  );
  console.log(
    JSON.stringify({
      route: "adoption",
      viewport: "390x844",
      optInDefault: false,
      keyboardToggle: true,
      storedSchema: first.schemaVersion,
      photoReselect: true,
      optOutClears: true,
      errors: [],
    }),
  );
  await adoption.close();
} finally {
  await browser.close();
}
