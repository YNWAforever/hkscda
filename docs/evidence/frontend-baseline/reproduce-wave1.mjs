import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = path.resolve(
  process.env.OUTPUT_DIR ?? "docs/evidence/frontend-baseline/artifacts",
);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const evidence = {
  generatedAt: new Date().toISOString(),
  baseURL,
  help: {},
  mobileDrawer: [],
};

async function captureHelp() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});

  const bodyText = await page.locator("body").innerText();
  const summary = bodyText.match(/(\d+)\s*(?:個已核准答案|approved answers)/i)?.[0] ?? null;
  await page.screenshot({ path: path.join(outputDir, "help-mobile.png"), fullPage: true });

  evidence.help = {
    status: response?.status() ?? null,
    url: page.url(),
    summary,
    hydrationErrors: consoleErrors.filter(
      (message) => message.includes("418") || /hydrat/i.test(message),
    ),
    consoleErrors,
    pageErrors,
  };
  await context.close();
}

async function captureDrawerCta({ name, destination }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(new URL("/", baseURL).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "開啟選單" }).click();
  const drawer = page.locator("#mobile-drawer");
  await drawer.waitFor({ state: "visible" });
  await drawer.getByRole("link", { name, exact: true }).click();
  await page.waitForURL((url) => url.pathname === destination, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => ({
    pathname: window.location.pathname,
    drawerPresent: Boolean(document.querySelector("#mobile-drawer")),
    bodyOverflow: document.body.style.overflow,
    inertElements: document.querySelectorAll("[inert]").length,
    activeTag: document.activeElement?.tagName ?? null,
    activeText: document.activeElement?.textContent?.trim() ?? null,
  }));
  await page.screenshot({
    path: path.join(outputDir, `mobile-drawer-${destination.slice(1).replaceAll("/", "-")}.png`),
    fullPage: true,
  });

  evidence.mobileDrawer.push({ name, destination, state, consoleErrors });
  await context.close();
}

try {
  await captureHelp();
  await captureDrawerCta({ name: "查看待領養動物", destination: "/animals/cat" });
  await captureDrawerCta({ name: "立即捐助", destination: "/donate" });
  await fs.writeFile(
    path.join(outputDir, "wave1-reproduction.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    "utf8",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
