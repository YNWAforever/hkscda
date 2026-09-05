import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname)) {
  throw new Error("Empty-method verifier accepts local fixture previews only");
}
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
);
const result = { baseURL, postCount: 0, buttonDisabled: false, providerLabels: [] };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("**/api/donations", async (route) => {
    result.postCount += 1;
    await route.fulfill({ status: 500, body: "{}" });
  });
  const page = await context.newPage();
  await page.goto(new URL("/donate", baseURL).href, { waitUntil: "networkidle" });
  const submit = page.getByRole("button", { name: "繼續捐款" });
  result.buttonDisabled = await submit.isDisabled();
  for (const label of ["信用卡", "AlipayHK", "轉數快 FPS", "PayMe", "PayPal"]) {
    if (await page.getByRole("button", { name: label, exact: true }).count())
      result.providerLabels.push(label);
  }
  await page
    .locator("form")
    .first()
    .evaluate((form) => form.requestSubmit());
  await page.waitForTimeout(250);
  if (!result.buttonDisabled || result.providerLabels.length || result.postCount)
    process.exitCode = 1;
  await fs.writeFile(
    "docs/evidence/frontend-wave2/browser/donation-empty.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  await context.close();
} finally {
  await browser.close();
}
