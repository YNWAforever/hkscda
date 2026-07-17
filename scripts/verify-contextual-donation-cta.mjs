import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const artifactsDir = join(process.cwd(), "artifacts");
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];
const shortlistValue = JSON.stringify([
  {
    id: "cta-layout-cat",
    name: "CTA layout cat",
    animalType: "cat",
    imageUrl: null,
    intent: "adoption",
    rank: 1,
  },
]);

function fail(message) {
  throw new Error(`[contextual-donation-cta] ${message}`);
}

function rectanglesOverlap(left, right) {
  const leftRight = left.x + left.width;
  const leftBottom = left.y + left.height;
  const rightRight = right.x + right.width;
  const rightBottom = right.y + right.height;

  return !(
    leftRight <= right.x ||
    rightRight <= left.x ||
    leftBottom <= right.y ||
    rightBottom <= left.y
  );
}

async function assertNoOverlap(page, selectors) {
  const boxes = await page.evaluate((requestedSelectors) => {
    return requestedSelectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;

      const box = element.getBoundingClientRect();
      return {
        selector,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    });
  }, selectors);

  for (const [index, box] of boxes.entries()) {
    if (!box) fail("missing bounding box for " + selectors[index]);
  }

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex];
      const right = boxes[rightIndex];
      if (left && right && rectanglesOverlap(left, right)) {
        fail("overlap between " + left.selector + " and " + right.selector);
      }
    }
  }
}

async function waitForPageUrl(page, predicate, description) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const url = page.url();
    if (predicate(url)) return url;
    await page.waitForTimeout(100);
  }

  fail("timed out waiting for " + description + " (current URL: " + page.url() + ")");
}

async function waitForDonationPrompt(page) {
  const prompt = page.locator("[data-donation-prompt]");
  await prompt.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const promptElement = document.querySelector("[data-donation-prompt]");
      const shortlistElement = document.querySelector('aside[aria-live="polite"]');
      if (!promptElement || !shortlistElement) return true;

      const promptBox = promptElement.getBoundingClientRect();
      const shortlistBox = shortlistElement.getBoundingClientRect();
      return promptBox.bottom <= shortlistBox.top || shortlistBox.bottom <= promptBox.top;
    },
    { timeout: 5_000 },
  );
  return prompt;
}

async function seedShortlist(context) {
  await context.addInitScript((value) => {
    localStorage.setItem("hkscda-public-shortlist-v1", value);
  }, shortlistValue);
}

async function verifyLayoutViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  await seedShortlist(context);
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/about`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_500);
    const prompt = await waitForDonationPrompt(page);
    await page.screenshot({
      path: join(artifactsDir, `donation-prompt-${viewport.name}.png`),
      fullPage: true,
    });
    await page.locator("[data-donation-prompt] button").click();
    await page.goto(`${baseUrl}/help`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_500);
    await prompt.waitFor({ state: "detached", timeout: 5_000 });
  } finally {
    await context.close();
  }
}

async function verifyRoutesAndHelp(browser) {
  const context = await browser.newContext({ viewport: viewports[0] });
  await seedShortlist(context);
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/donate`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_000);
    if ((await page.locator("[data-donation-prompt]").count()) !== 0) {
      fail("donation prompt rendered on /donate");
    }

    await page.goto(`${baseUrl}/stories`, { waitUntil: "domcontentloaded" });
    await page.locator("main").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("Public Stories", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Rescue Map", { exact: true }).waitFor({ state: "visible" });

    await page.goto(`${baseUrl}/about`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_500);
    const prompt = await waitForDonationPrompt(page);
    const shortlist = page.locator('aside[aria-live="polite"]');
    const helpButton = page.locator('button[aria-controls="help-widget-panel"]');
    await shortlist.waitFor({ state: "visible" });
    await helpButton.waitFor({ state: "visible" });
    await assertNoOverlap(page, [
      '[aria-live="polite"]',
      "[data-donation-prompt]",
      'button[aria-controls="help-widget-panel"]',
    ]);

    await helpButton.click();
    await page.locator("#help-widget-panel").waitFor({ state: "visible" });
    await prompt.waitFor({ state: "detached" });
    await helpButton.click();
    await waitForDonationPrompt(page);
  } finally {
    await context.close();
  }
}

async function verifyDonationAnalytics(browser) {
  const context = await browser.newContext({ viewport: viewports[1] });
  await seedShortlist(context);
  await context.addInitScript(() => {
    const key = "hkscda:verification:donation-events";
    window.gtag = (...args) => {
      const current = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (args[0] === "event" && typeof args[1] === "string") {
        current.push([args[1], args[2] ?? {}]);
        localStorage.setItem(key, JSON.stringify(current));
      }
    };
  });
  const page = await context.newPage();

  const donationId = "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a";
  let statusCalls = 0;

  await context.route("**/api/donations**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "redirect",
        donationId,
        url: `${baseUrl}/donate?status=success&donation=${donationId}`,
      }),
    });
  });
  await context.route(`**/api/donations/${donationId}/status`, async (route) => {
    statusCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: statusCalls === 1 ? "pending" : "succeeded" }),
    });
  });

  try {
    await page.goto(`${baseUrl}/about`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_500);
    await waitForDonationPrompt(page);
    await page.locator("[data-donation-prompt] a").click();
    await waitForPageUrl(page, (url) => new URL(url).pathname === "/donate", "donate route");
    await page.locator("#donor-name").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);
    await page.locator("#donor-name").fill("Verification Donor");
    await page.locator("#donor-email").fill("verification@example.com");
    await page.locator('button[type="submit"]').click();

    await waitForPageUrl(
      page,
      (url) => new URL(url).searchParams.get("status") === "success",
      "successful donation route",
    );
    await page.waitForLoadState("domcontentloaded");

    const firstStatusDeadline = Date.now() + 30_000;
    while (statusCalls < 1 && Date.now() < firstStatusDeadline) {
      await page.waitForTimeout(100);
    }
    if (statusCalls < 1) fail("donation status polling did not start");
    await page.waitForTimeout(500);

    let events = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hkscda:verification:donation-events") ?? "[]"),
    );
    if (events.some(([name]) => name === "donation_success")) {
      fail("donation_success emitted before server success confirmation");
    }

    const successStatusDeadline = Date.now() + 10_000;
    while (statusCalls < 2 && Date.now() < successStatusDeadline) {
      await page.waitForTimeout(100);
    }
    if (statusCalls < 2) fail("donation status polling did not confirm success");
    await page.waitForTimeout(250);
    events = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hkscda:verification:donation-events") ?? "[]"),
    );
    const names = events.map(([name]) => name);
    for (const required of [
      "donation_cta_impression",
      "donation_cta_click",
      "donation_form_view",
      "begin_checkout",
      "donation_success",
    ]) {
      if (!names.includes(required)) fail(`missing analytics event ${required}`);
    }

    const serializedEvents = JSON.stringify(events);
    for (const forbidden of [
      "name",
      "email",
      "phone",
      "donation_id",
      "page_path",
      "location",
      "query",
      "message",
    ]) {
      if (serializedEvents.includes(`"${forbidden}"`)) {
        fail(`analytics payload contains forbidden key ${forbidden}`);
      }
    }
  } finally {
    await context.close();
  }
}

async function main() {
  mkdirSync(artifactsDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      await verifyLayoutViewport(browser, viewport);
    }
    await verifyRoutesAndHelp(browser);
    await verifyDonationAnalytics(browser);
    console.log("Contextual donation CTA verification passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
