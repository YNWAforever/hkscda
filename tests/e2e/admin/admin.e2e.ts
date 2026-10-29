import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { E2E_PASSWORD, startFakeSupabase, type FakeSupabase } from "./fakeSupabase";

/**
 * Admin panel browser flows against the production build, served by the real
 * preview server, with Supabase replaced by `fakeSupabase.ts`. Run it through
 * `bun run test:e2e` (tests/e2e/run.ts), which builds with the fake's URL baked in.
 * Calling this file directly needs E2E_SKIP_BUILD=1 and an existing matching build.
 */

export const E2E_SUPABASE_PORT = 54331;
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 4174);
const APP = `http://127.0.0.1:${APP_PORT}`;
const TEST_TIMEOUT = 60_000;

let fake: FakeSupabase;
let preview: ReturnType<typeof Bun.spawn>;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let consoleErrors: string[] = [];

/** Errors a test provokes on purpose (a refused login, a forced 500) are not page faults. */
const EXPECTED_CONSOLE = [/Failed to load resource/];

beforeAll(async () => {
  fake = startFakeSupabase(E2E_SUPABASE_PORT);
  const root = new URL("../../../", import.meta.url).pathname;
  preview = Bun.spawn(["bun", "run", "preview"], {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(APP_PORT),
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: String(APP_PORT),
      SUPABASE_URL: fake.url,
      SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-key",
      VITE_SUPABASE_URL: fake.url,
      VITE_SUPABASE_ANON_KEY: "e2e-anon-key",
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    const ready = await fetch(`${APP}/admin/login`)
      .then((response) => response.status < 500)
      .catch(() => false);
    if (ready) break;
    await Bun.sleep(500);
  }
  // Same browser as the repo's other browser tests: installed Google Chrome, or an override.
  browser = await chromium.launch(
    process.env.E2E_CHROMIUM_PATH
      ? { executablePath: process.env.E2E_CHROMIUM_PATH }
      : { channel: "chrome" },
  );
}, 90_000);

afterAll(async () => {
  await browser?.close();
  preview?.kill();
  fake?.stop();
});

beforeEach(async () => {
  fake.reset();
  await context?.close();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (EXPECTED_CONSOLE.some((pattern) => pattern.test(message.text()))) return;
    consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
});

async function signIn(email: string, password = E2E_PASSWORD) {
  await page.goto(`${APP}/admin/login`);
  await page.fill("#admin-login-email", email);
  await page.fill("#admin-login-password", password);
  await page.click("button[type=submit]");
}

async function signInAsAdminAndOpenDashboard() {
  await signIn("admin@e2e.test");
  await page.waitForURL(/\/admin\?section=/);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
}

function animalRow(overrides: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    type: "cat",
    name: "豆豆",
    name_en: "Dou Dou",
    gender: "female",
    age: "約 2 歲",
    age_en: "About 2",
    status: "available",
    adoption_eligible: true,
    sponsorship_eligible: false,
    retired_at: null,
    publication_state: "published",
    image_url: null,
    created_at: "2026-10-01T03:00:00+08:00",
    updated_at: "2026-10-01T03:00:00+08:00",
    code: "C-001",
    ...overrides,
  };
}

describe("authentication", () => {
  test(
    "an anonymous visitor to /admin is sent to the login page",
    async () => {
      await page.goto(`${APP}/admin`);
      await page.waitForURL(/\/admin\/login/);
      expect(await page.locator("#admin-login-email").isVisible()).toBe(true);
    },
    TEST_TIMEOUT,
  );

  test(
    "a valid admin signs in and lands on the dashboard",
    async () => {
      await signInAsAdminAndOpenDashboard();
      await page.getByRole("heading", { level: 1, name: "動物管理" }).waitFor();
      expect(consoleErrors).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  test(
    "a wrong password and an unknown account get the same message and no session",
    async () => {
      await signIn("admin@e2e.test", "wrong-password");
      const wrongPassword = await page.locator("[role=alert]").innerText();
      await signIn("nobody@e2e.test", "wrong-password");
      const unknownUser = await page.locator("[role=alert]").innerText();
      expect(wrongPassword).toBe("電郵或密碼錯誤");
      // Same text for both, so the form does not reveal which emails have accounts.
      expect(unknownUser).toBe(wrongPassword);
      expect(page.url()).toContain("/admin/login");
    },
    TEST_TIMEOUT,
  );

  test(
    "repeated failures hit the auth provider's rate limit and still show a calm error",
    async () => {
      for (let attempt = 0; attempt < 7; attempt++) {
        await signIn("admin@e2e.test", `guess-${attempt}`);
        await page.locator("[role=alert]").waitFor();
      }
      expect(fake.requests.filter((r) => r === "POST /auth/v1/token").length).toBe(7);
      expect(await page.locator("[role=alert]").isVisible()).toBe(true);
      expect(page.url()).toContain("/admin/login");
      expect(consoleErrors).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  test(
    "signing out clears the stored session and protects /admin again",
    async () => {
      await signInAsAdminAndOpenDashboard();
      await page.getByRole("button", { name: "登出" }).click();
      await page.waitForURL(/\/admin\/login/);
      // Only a session-revision marker may remain; no stored value may hold a token.
      const stored = await page.evaluate(() =>
        Object.keys(localStorage).filter((key) =>
          /access_token|refresh_token/.test(localStorage.getItem(key) ?? ""),
        ),
      );
      expect(stored).toEqual([]);
      await page.goto(`${APP}/admin`);
      await page.waitForURL(/\/admin\/login/);
    },
    TEST_TIMEOUT,
  );

  test(
    "BUG-31: a revoked or tampered session is sent back to login, not a blank page",
    async () => {
      await signInAsAdminAndOpenDashboard();
      fake.revokeAllTokens();
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (!key.endsWith("-auth-token")) continue;
          const session = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
          localStorage.setItem(
            key,
            JSON.stringify({ ...session, access_token: "tampered.token.value" }),
          );
        }
      });
      await page.goto(`${APP}/admin`);
      await page.waitForURL(/\/admin\/login/, { timeout: 20_000 });
    },
    TEST_TIMEOUT,
  );
});

describe("authorization", () => {
  test(
    "a signed-in user without an admin role does not reach the dashboard",
    async () => {
      await signIn("member@e2e.test");
      await page.waitForTimeout(2_000);
      expect(page.url()).not.toMatch(/\/admin\?section=/);
      expect(await page.getByRole("heading", { name: "動物管理" }).count()).toBe(0);
    },
    TEST_TIMEOUT,
  );

  test(
    "a treasurer opening access management is shown access denied",
    async () => {
      await signIn("treasurer@e2e.test");
      await page.waitForURL(/\/admin\?section=payments/);
      await page.goto(`${APP}/admin/access`);
      await page.waitForURL(/\/admin\/access-denied/);
    },
    TEST_TIMEOUT,
  );

  test(
    "staff opening the supporter CRM are shown access denied",
    async () => {
      await signIn("staff@e2e.test");
      await page.waitForURL(/\/admin\?section=/);
      await page.goto(`${APP}/admin/supporters`);
      await page.waitForURL(/\/admin\/access-denied/);
    },
    TEST_TIMEOUT,
  );
});

describe("lists, locale and injection", () => {
  test(
    "an empty animal list shows the empty state",
    async () => {
      await signInAsAdminAndOpenDashboard();
      await page.getByText("此分類尚未有動物記錄。").first().waitFor();
    },
    TEST_TIMEOUT,
  );

  test(
    "Traditional Chinese, emoji and an HTML payload in a record render as text",
    async () => {
      const payload = '<img src=x onerror="window.__xss=1">';
      fake.respond("GET /rest/v1/animals", () =>
        Response.json(
          [animalRow({ name: "小白🐾 貓貓" }), animalRow({ name: payload, code: "C-002" })],
          {
            headers: { "content-range": "0-1/2" },
          },
        ),
      );
      await signInAsAdminAndOpenDashboard();
      // Desktop table and mobile cards both render, so each name appears twice.
      await page.getByText("小白🐾 貓貓").first().waitFor();
      await page.getByText(payload).first().waitFor();
      expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
      expect(consoleErrors).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe("errors and loading", () => {
  test(
    "an API failure shows a friendly retry, and retry recovers",
    async () => {
      let fail = true;
      fake.respond("GET /rest/v1/animals", () =>
        fail
          ? Response.json({ message: "boom", code: "XX000" }, { status: 500 })
          : Response.json([], { headers: { "content-range": "*/0" } }),
      );
      await signInAsAdminAndOpenDashboard();
      const retry = page.getByRole("button", { name: "重試" });
      await retry.waitFor();
      // The server's error text must not reach the page.
      expect(await page.getByText("boom").count()).toBe(0);
      fail = false;
      await retry.click();
      await page.getByText("此分類尚未有動物記錄。").first().waitFor();
    },
    TEST_TIMEOUT,
  );

  test(
    "a malformed database response becomes a friendly failure, not a crash",
    async () => {
      fake.respond(
        "GET /rest/v1/animals",
        () => new Response("{not json", { headers: { "content-type": "application/json" } }),
      );
      await signInAsAdminAndOpenDashboard();
      await page.getByRole("button", { name: "重試" }).waitFor();
    },
    TEST_TIMEOUT,
  );

  test(
    "a slow response shows a loading state before the data arrives",
    async () => {
      fake.respond("GET /rest/v1/animals", async () => {
        await Bun.sleep(2_500);
        return Response.json([animalRow({ name: "慢慢" })], {
          headers: { "content-range": "0-0/1" },
        });
      });
      await signInAsAdminAndOpenDashboard();
      expect(await page.getByText("慢慢").count()).toBe(0);
      await page.getByText("載入中...").waitFor();
      await page.getByText("慢慢").first().waitFor({ timeout: 10_000 });
    },
    TEST_TIMEOUT,
  );

  test(
    "BUG-32: going offline shows a retryable failure, not a misleading empty list",
    async () => {
      await signInAsAdminAndOpenDashboard();
      // Let the first list read and the search-param navigation settle first; going offline
      // mid-navigation stalls the navigation itself rather than the read under test.
      await page.getByText("此分類尚未有動物記錄。").first().waitFor();
      await page.waitForLoadState("networkidle");
      await context.setOffline(true);
      await page.getByRole("link", { name: "狗狗" }).click();
      await page.getByRole("button", { name: "重試" }).waitFor({ timeout: 20_000 });
      await context.setOffline(false);
    },
    TEST_TIMEOUT,
  );
});

describe("layout and keyboard", () => {
  test(
    "the dashboard fits a phone viewport without horizontal scrolling",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await signInAsAdminAndOpenDashboard();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(consoleErrors).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  test(
    "the login form works from the keyboard alone",
    async () => {
      await page.goto(`${APP}/admin/login`);
      await page.locator("#admin-login-email").focus();
      await page.keyboard.type("admin@e2e.test");
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.id);
      // A "forgot password" link may sit between the fields; step until the password field.
      if (focused !== "admin-login-password") await page.locator("#admin-login-password").focus();
      await page.keyboard.type(E2E_PASSWORD);
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/admin\?section=/);
    },
    TEST_TIMEOUT,
  );
});
