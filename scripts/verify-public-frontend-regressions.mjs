import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const target = new URL(baseURL);
if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
  throw new Error("Frontend regression verifier accepts local fixture previews only");
}
const outputDir = path.resolve(process.env.OUTPUT_DIR ?? "docs/evidence/frontend-wave1/browser");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const failures = [];
const results = [];

function fail(message) {
  failures.push(message);
}

async function waitForHydratedDrawer(page) {
  const trigger = page.getByRole("button", { name: "開啟選單" });
  await trigger.waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  await trigger.click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-controls="mobile-drawer"]')?.getAttribute("aria-expanded") ===
      "true",
    undefined,
    { timeout: 5000 },
  );
  await page.locator("#mobile-drawer").waitFor({ state: "visible" });
}

async function verifyHelp(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto(new URL("/help", baseURL).href, {
    waitUntil: "domcontentloaded",
  });
  const initialSummary = await page
    .locator("main p")
    .filter({ hasText: /條已審批答案|approved answers/ })
    .first()
    .textContent();
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  const hydratedSummary = await page
    .locator("main p")
    .filter({ hasText: /條已審批答案|approved answers/ })
    .first()
    .textContent();
  const hydrationErrors = consoleErrors.filter(
    (message) => message.includes("418") || /hydrat/i.test(message),
  );

  if (response?.status() !== 200) fail(`help ${viewport.width}px returned ${response?.status()}`);
  if (initialSummary !== hydratedSummary) {
    fail(`help ${viewport.width}px changed summary from ${initialSummary} to ${hydratedSummary}`);
  }
  if (hydrationErrors.length > 0 || pageErrors.length > 0) {
    fail(`help ${viewport.width}px emitted hydration/page errors`);
  }
  results.push({
    scenario: "help",
    viewport,
    status: response?.status() ?? null,
    initialSummary,
    hydratedSummary,
    hydrationErrors,
    pageErrors,
  });
  await context.close();
}

async function verifyDrawerCta(browser, { label, destination }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(new URL("/", baseURL).href, { waitUntil: "domcontentloaded" });
  await waitForHydratedDrawer(page);
  await page.locator("#mobile-drawer").getByRole("link", { name: label, exact: true }).click();
  await page.waitForURL((url) => url.pathname === destination, { timeout: 5000 });
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => ({
    pathname: location.pathname,
    dialogPresent: Boolean(document.querySelector('#mobile-drawer[role="dialog"]')),
    mainInert: Boolean(document.querySelector("[data-site-content][inert]")),
    bodyOverflow: document.body.style.overflow,
    activeElement:
      document.activeElement?.getAttribute("aria-label") ??
      document.activeElement?.textContent?.trim() ??
      null,
  }));
  if (state.dialogPresent) fail(`${label} left the mobile drawer mounted`);
  if (state.mainInert) fail(`${label} left the destination content inert`);
  if (state.bodyOverflow === "hidden") fail(`${label} left body scrolling locked`);
  if (consoleErrors.length || pageErrors.length) fail(`${label} emitted console/page errors`);
  results.push({ scenario: "drawer-cta", label, destination, state, consoleErrors, pageErrors });
  await page.screenshot({
    path: path.join(outputDir, `drawer-${destination.slice(1).replaceAll("/", "-")}.png`),
    fullPage: true,
  });
  await context.close();
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  await verifyHelp(browser, { width: 390, height: 844 });
  await verifyHelp(browser, { width: 1440, height: 900 });
  await verifyDrawerCta(browser, { label: "查看待領養動物", destination: "/animals/cat" });
  await verifyDrawerCta(browser, { label: "立即捐助", destination: "/donate" });
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(outputDir, "frontend-wave1.json"),
    JSON.stringify({ baseURL, results, failures }, null, 2) + "\n",
    "utf8",
  );
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Verified ${results.length} frontend Wave 1 scenarios`);
}
