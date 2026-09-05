import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const target = new URL(baseURL);
if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
  throw new Error("Wave 2 verifier accepts local fixture previews only");
}
const outputDir = path.resolve(process.env.OUTPUT_DIR ?? "docs/evidence/frontend-wave2/browser");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const results = [];
const failures = [];
const fail = (message) => failures.push(message);

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const detailCases = [
    ["/animals/cat/00000000-0000-4000-8000-000000000001", 200, "測試貓 01", "valid cat"],
    ["/animals/cat/not-a-uuid", 404, "這隻動物目前不在公開領養名單", "malformed cat"],
    [
      "/animals/dog/ffffffff-ffff-4fff-8fff-ffffffffffff",
      404,
      "這隻動物目前不在公開領養名單",
      "unknown dog",
    ],
    [
      "/animals/cat/00000000-0000-4000-8000-000000000031",
      404,
      "這隻動物目前不在公開領養名單",
      "removed cat",
    ],
    ["/sponsors/not-a-uuid", 404, "此動物目前不在公開助養名單", "malformed sponsor"],
  ];
  for (const [route, expectedStatus, expectedText, label] of detailCases) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(new URL(route, baseURL).href, { waitUntil: "networkidle" });
    const status = response?.status() ?? null;
    const textPresent = await page.getByText(expectedText, { exact: false }).first().isVisible();
    if (status !== expectedStatus)
      fail(label + " returned " + status + ", expected " + expectedStatus);
    if (!textPresent) fail(label + " did not render its expected public state");
    if (errors.length) fail(label + " emitted page errors");
    results.push({
      scenario: "public-detail",
      label,
      route,
      status,
      textPresent,
      pageErrors: errors,
    });
    await page.screenshot({
      path: path.join(outputDir, label.replaceAll(" ", "-") + ".png"),
      fullPage: true,
    });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let scriptRequests = 0;
  const submittedBodies = [];
  await context.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    async (route) => {
      scriptRequests += 1;
      if (scriptRequests === 1) {
        await route.fulfill({ status: 503, contentType: "text/javascript", body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `window.__fixtureTurnstileCallbacks=[];window.turnstile={render:function(el,opts){window.__fixtureTurnstileCallbacks.push(opts.callback);el.innerHTML='<span data-fixture-turnstile>verified-ready</span>';return String(window.__fixtureTurnstileCallbacks.length)},remove:function(){},reset:function(){}};`,
      });
    },
  );
  await context.route("**/api/donations", async (route) => {
    submittedBodies.push(route.request().postDataJSON());
    if (submittedBodies.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"synthetic downstream failure"}',
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "manual",
        donationId: "fixture-donation",
        reference: "FIXTURE-REF",
        instructions: {
          method: "fps",
          label: "Fixture",
          payableTo: "Fixture",
          identifier: "Fixture",
          amountCents: 30000,
        },
      }),
    });
  });
  const page = await context.newPage();
  await page.goto(new URL("/donate", baseURL).href, { waitUntil: "networkidle" });
  const selectedPayPal = await page
    .getByRole("button", { name: "PayPal", exact: true })
    .getAttribute("aria-pressed");
  if (selectedPayPal !== "true") fail("PayPal-only fixture did not select PayPal");
  const retry = page.getByRole("button", { name: "重新載入人機驗證" });
  await retry.waitFor({ state: "visible" });
  await retry.click();
  await page.locator("[data-fixture-turnstile]").waitFor({ state: "visible" });
  await page.evaluate(() => window.__fixtureTurnstileCallbacks.at(-1)("token-A"));
  await page.getByLabel("姓名").fill("本機測試");
  await page.getByRole("textbox", { name: "電郵", exact: true }).fill("fixture@example.invalid");
  await page.getByRole("button", { name: "繼續捐款" }).click();
  await page.getByText("暫時未能建立捐款").waitFor({ state: "visible" });
  await page.waitForFunction(() => window.__fixtureTurnstileCallbacks.length >= 2);
  const disabledAfterFailure = await page.getByRole("button", { name: "繼續捐款" }).isDisabled();
  await page.evaluate(() => window.__fixtureTurnstileCallbacks.at(-1)("token-B"));
  await page.getByRole("button", { name: "繼續捐款" }).click();
  await page.getByText("FIXTURE-REF").waitFor({ state: "visible" });
  if (!disabledAfterFailure) fail("donation retry remained enabled with consumed token A");
  if (submittedBodies[0]?.turnstileToken !== "token-A") fail("first donation did not send token A");
  if (submittedBodies[1]?.turnstileToken !== "token-B") fail("retry did not send fresh token B");
  if (submittedBodies.some((body) => body.method !== "paypal"))
    fail("PayPal-only fixture submitted a hidden method");
  results.push({
    scenario: "turnstile-donation-retry",
    scriptRequests,
    submittedTokens: submittedBodies.map((body) => body.turnstileToken),
    submittedMethods: submittedBodies.map((body) => body.method),
    disabledAfterFailure,
  });
  await page.screenshot({
    path: path.join(outputDir, "turnstile-donation-retry.png"),
    fullPage: true,
  });
  await context.close();
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  fail("browser verifier stopped: " + message);
  results.push({ scenario: "diagnostic", error: message });
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(outputDir, "frontend-wave2.json"),
    JSON.stringify({ baseURL, results, failures }, null, 2) + "\n",
  );
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Verified " + results.length + " frontend Wave 2 scenarios");
}
