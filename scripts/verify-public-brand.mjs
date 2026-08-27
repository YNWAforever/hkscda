import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = path.resolve(process.env.OUTPUT_DIR ?? "artifacts/brand-redesign/after");
const mode = process.env.MODE ?? "brand";
const timeout = Number(process.env.BRAND_VERIFY_TIMEOUT ?? 45000);

const staticRoutes = [
  "/",
  "/about",
  "/about/cccp",
  "/about/tnr",
  "/about/team",
  "/about/privacy",
  "/animals/cat",
  "/animals/dog",
  "/adoption/instructions",
  "/adoption/apply",
  "/sponsors",
  "/sponsors/pledge",
  "/stories",
  "/volunteer",
  "/donate",
  "/report/adoption",
  "/report/audit",
  "/help",
];

const stateRoutes = [
  "/adoption/status/__brand-verification__",
  "/sponsors/status/__brand-verification__",
  "/volunteer/status/__brand-verification__",
  "/__brand-verification-missing__",
];

const reflowRoutes = [
  "/",
  "/about",
  "/animals/cat",
  "/sponsors",
  "/stories",
  "/donate",
  "/report/adoption",
  "/help",
];

const viewports = [
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
];

const failures = [];
const routesWithErrors = new Set();
const asset404s = [];
const assetTypes = new Set(["image", "stylesheet", "script", "font", "media"]);
const allowedExternalHosts = new Set([
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "www.facebook.com",
  "www.instagram.com",
  "challenges.cloudflare.com",
  "maps.googleapis.com",
  "maps.gstatic.com",
  "googletagmanager.com",
]);
const baseOrigin = new URL(baseURL).origin;

function isAllowedExternalRequest(requestURL) {
  const parsed = new URL(requestURL);
  return (
    parsed.origin === baseOrigin ||
    [...allowedExternalHosts].some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith("." + host),
    )
  );
}

function urlFor(route) {
  return new URL(route, baseURL).href;
}

function screenshotName(route, viewportName) {
  const safeRoute =
    route === "/" ? "home" : route.slice(1).replaceAll("/", "-").replaceAll("?", "-");
  return path.join(outputDir, safeRoute + "-" + viewportName + ".png");
}

function recordFailure(message) {
  failures.push(message);
}

async function gotoRoute(page, route) {
  const response = await page.goto(urlFor(route), {
    waitUntil: "domcontentloaded",
    timeout,
  });
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 1500) }).catch(() => {});
  return response;
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  if (overflow) {
    recordFailure(label + " overflows horizontally");
  }
}

async function assertBrandLogo(page, label) {
  const logo = page.locator('img[alt="香港拯救貓狗協會 HKSCDA"]').first();
  if ((await logo.count()) === 0) {
    recordFailure(label + " has no official logo");
    return;
  }

  const dimensions = await logo.evaluate((image) => {
    const rect = image.getBoundingClientRect();
    return {
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
    };
  });

  if (
    !dimensions.complete ||
    dimensions.naturalWidth === 0 ||
    dimensions.naturalHeight === 0 ||
    dimensions.renderedWidth === 0 ||
    dimensions.renderedHeight === 0
  ) {
    recordFailure(label + " has an unloaded or invisible official logo");
    return;
  }

  const naturalRatio = dimensions.naturalWidth / dimensions.naturalHeight;
  const renderedRatio = dimensions.renderedWidth / dimensions.renderedHeight;
  if (Math.abs(naturalRatio - 1) > 0.02 || Math.abs(renderedRatio - naturalRatio) > 0.02) {
    recordFailure(
      label +
        " distorts the official logo ratio: natural " +
        naturalRatio.toFixed(3) +
        ", rendered " +
        renderedRatio.toFixed(3),
    );
  }
}

async function assertOneHeading(page, label, response, route) {
  const syntheticMissingRoute = route === "/__brand-verification-missing__";
  const syntheticRoute = route.includes("__brand-verification__");
  if (syntheticMissingRoute || syntheticRoute || !response || response.status() >= 400) {
    return;
  }

  const headingCount = await page.locator("h1").count();
  if (headingCount !== 1) {
    recordFailure(label + " has " + headingCount + " h1 elements");
  }
}

async function assertRecoveryCopy(page, route) {
  if (!route.includes("/status/")) {
    return;
  }

  await page
    .locator('[role="alert"]')
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => {});
  const bodyText = await page.locator("body").innerText();
  if (bodyText.includes("__brand-verification__")) {
    recordFailure(route + " exposes the synthetic token in recovery copy");
  }

  const safePhrases = [
    "\u627e\u4e0d\u5230\u6b64\u7533\u8acb\u9023\u7d50",
    "\u627e\u4e0d\u5230\u6b64\u9023\u7d50",
    "\u627e\u4e0d\u5230\u6b64\u5831\u540d",
    "\u8acb\u806f\u7d61",
    "\u627e\u4e0d\u5230\u7fa9\u5de5\u767b\u8a18",
    "Volunteer registration not found",
  ];

  if (!safePhrases.some((phrase) => bodyText.includes(phrase))) {
    recordFailure(route + " has no privacy-safe recovery copy");
  }
}

async function checkHeaderFocus(page, label) {
  const headerControls = await page.locator("header a, header button").count();
  if (headerControls === 0) {
    recordFailure(label + " has no header actions to tab through");
    return;
  }

  await page.mouse.click(2, 2);
  let focusedHeaderControls = 0;
  const maxTabs = Math.max(headerControls + 4, 12);

  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    const focusState = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) {
        return { inHeader: false, focusVisible: false, hasRing: false };
      }

      const style = getComputedStyle(element);
      return {
        inHeader: Boolean(element.closest("header")),
        focusVisible: element.matches(":focus-visible"),
        hasRing:
          (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
          style.boxShadow !== "none",
      };
    });

    if (!focusState.inHeader) {
      continue;
    }

    focusedHeaderControls += 1;
    if (!focusState.focusVisible && !focusState.hasRing) {
      recordFailure(label + " has a header action without a visible focus indicator");
    }

    if (focusedHeaderControls >= Math.min(headerControls, 2)) {
      break;
    }
  }

  if (focusedHeaderControls === 0) {
    recordFailure(label + " did not reach a header action in tab order");
  }
}

async function checkHomepageMenu(page, label) {
  const menu = page.getByRole("button", { name: "開啟選單" });
  if ((await menu.count()) === 0 || !(await menu.first().isVisible())) {
    return;
  }

  await menu.first().click();
  const navigation = page.getByRole("navigation", { name: "主選單" });
  try {
    await navigation.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    recordFailure(label + " menu did not expose the named navigation");
  }
  await page.keyboard.press("Escape");
}

async function checkHelpSearch(page, label) {
  const search = page.getByRole("searchbox").first();
  if ((await search.count()) === 0) {
    recordFailure(label + " has no FAQ searchbox");
    return;
  }

  const accessibleLabel = await search.evaluate((input) => {
    if (!(input instanceof HTMLInputElement)) return "";
    return input.getAttribute("aria-label")?.trim() ?? input.labels?.[0]?.textContent?.trim() ?? "";
  });
  if (!accessibleLabel) {
    recordFailure(label + " has an unlabeled FAQ searchbox");
    return;
  }

  await search.fill("cat");
}

async function firstOrFallback(page, listingRoute, selector, fallback) {
  try {
    const response = await gotoRoute(page, listingRoute);
    if (!response || !response.ok()) {
      recordFailure(listingRoute + " discovery returned " + (response?.status() ?? "no response"));
      return fallback;
    }

    const link = page.locator(selector).first();
    if ((await link.count()) > 0) {
      const href = await link.getAttribute("href");
      if (href) {
        return href;
      }
    }
  } catch (error) {
    recordFailure(
      listingRoute +
        " discovery failed: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }

  return fallback;
}

async function runReflowCheck(browser, viewport) {
  const context = await browser.newContext({
    viewport: {
      width: Math.ceil(viewport.width / 2),
      height: viewport.height,
    },
  });
  const page = await context.newPage();
  let currentRoute = "reflow";

  page.on("pageerror", (error) => {
    recordFailure("reflow " + currentRoute + " page error: " + error.message);
  });
  page.on("requestfailed", (request) => {
    if (!isAllowedExternalRequest(request.url())) {
      recordFailure(
        "reflow " +
          currentRoute +
          " request failed: " +
          request.url() +
          " (" +
          (request.failure()?.errorText ?? "unknown") +
          ")",
      );
    }
  });

  try {
    for (const route of reflowRoutes) {
      currentRoute = route;
      try {
        const response = await gotoRoute(page, route);
        if (!response || (!response.ok() && response.status() !== 404)) {
          recordFailure("reflow " + route + " returned " + (response?.status() ?? "no response"));
        }
        await assertNoOverflow(page, "reflow " + route + " at " + viewport.name);
      } catch (error) {
        recordFailure(
          "reflow " +
            route +
            " failed at " +
            viewport.name +
            ": " +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }
  } finally {
    await context.close();
  }
}

async function runReducedMotionCheck(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  try {
    for (const route of ["/", "/about"]) {
      try {
        await gotoRoute(page, route);
        const reducedMotion = await page.evaluate(
          () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        );
        if (!reducedMotion) {
          recordFailure(route + " did not receive reduced-motion preference");
        }
      } catch (error) {
        recordFailure(
          "reduced-motion " +
            route +
            " failed: " +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }
  } finally {
    await context.close();
  }
}

await fs.mkdir(outputDir, { recursive: true });

// Lets a developer run the verifier against an already-installed Chromium
// instead of downloading one. Unset in CI, where playwright install provides it.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const discoveryPage = await browser.newPage();
  const detailRoutes = [
    await firstOrFallback(
      discoveryPage,
      "/animals/cat",
      'a[href^="/animals/cat/"]',
      "/animals/cat/__brand-verification__",
    ),
    await firstOrFallback(
      discoveryPage,
      "/animals/dog",
      'a[href^="/animals/dog/"]',
      "/animals/dog/__brand-verification__",
    ),
    await firstOrFallback(
      discoveryPage,
      "/sponsors",
      'a[href^="/sponsors/"]:not([href="/sponsors/pledge"])',
      "/sponsors/__brand-verification__",
    ),
    await firstOrFallback(
      discoveryPage,
      "/stories",
      'a[href^="/stories/"]',
      "/stories/__brand-verification__",
    ),
  ];
  await discoveryPage.close();

  const routes = [...staticRoutes, ...detailRoutes, ...stateRoutes];

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    let currentRoute = "initial";

    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
        recordFailure(viewport.name + " " + currentRoute + " console error: " + message.text());
      }
    });
    page.on("requestfailed", (request) => {
      if (!isAllowedExternalRequest(request.url())) {
        recordFailure(
          viewport.name +
            " " +
            currentRoute +
            " request failed: " +
            request.url() +
            " (" +
            (request.failure()?.errorText ?? "unknown") +
            ")",
        );
      }
    });
    page.on("pageerror", (error) => {
      recordFailure(viewport.name + " " + currentRoute + " page error: " + error.message);
    });
    page.on("response", (response) => {
      if (response.status() === 404 && assetTypes.has(response.request().resourceType())) {
        asset404s.push(viewport.name + " " + currentRoute + " " + response.url());
      }
    });

    try {
      for (const route of routes) {
        currentRoute = route;
        const label = viewport.name + " " + route;
        let response;

        try {
          response = await gotoRoute(page, route);
          const synthetic = route.includes("__brand-verification");
          if (!response || (!response.ok() && !(synthetic && response.status() === 404))) {
            recordFailure(route + " returned " + (response?.status() ?? "no response"));
            routesWithErrors.add(route);
          }

          await assertNoOverflow(page, label);
          if (mode === "brand") {
            await assertBrandLogo(page, label);
          }
          await assertOneHeading(page, label, response, route);
          await assertRecoveryCopy(page, route);
          await page.screenshot({ path: screenshotName(route, viewport.name), fullPage: true });

          if (route === "/") {
            await checkHomepageMenu(page, label);
            await checkHeaderFocus(page, label);
          }
          if (route === "/help") {
            await checkHelpSearch(page, label);
          }
        } catch (error) {
          routesWithErrors.add(route);
          recordFailure(
            label + " failed: " + (error instanceof Error ? error.message : String(error)),
          );
        }
      }
    } finally {
      await context.close();
    }

    await runReflowCheck(browser, viewport);
    await runReducedMotionCheck(browser, viewport);
  }

  if (asset404s.length > 0) {
    failures.push(...asset404s.map((asset) => "404 asset: " + asset));
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      "Verified " +
        (staticRoutes.length + 4 + stateRoutes.length) +
        " routes across " +
        viewports.length +
        " viewports in " +
        mode +
        " mode",
    );
  }
} finally {
  await browser.close();
}
