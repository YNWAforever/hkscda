import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { join } from "node:path";
import { context, type Fixture, type Role } from "./context";
export async function browserContext() {
  const c = await context();
  const f = await c.read<Fixture>("fixture-state.json");
  const privateData = await c.read<{ accountPasswords: Record<Role, string> }>("private.json");
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    env: { ...process.env, FONTCONFIG_FILE: join(c.root, "fontconfig.xml") },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const blockedExternal: string[] = [];
  const pageErrors: string[] = [];
  const origins = new Set(["http://127.0.0.1:59330", "http://127.0.0.1:59321"]);
  async function login(role: Role) {
    const b = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await b.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (origins.has(u.origin)) await route.continue();
      else {
        blockedExternal.push(u.origin);
        await route.abort("blockedbyclient");
      }
    });
    const page = await b.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    const responses: { path: string; status: number }[] = [];
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/auth/"))
        responses.push({ path: u.pathname, status: r.status() });
    });
    await page.goto("http://127.0.0.1:59330/admin/login", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    // SSR inputs exist before React hydration; wait for the real ready flag first.
    await page.locator('button[type="submit"]').click({ trial: true });
    await page.locator('input[type="email"]').fill(f.accounts[role]!.email);
    await page.locator('input[type="password"]').fill(privateData.accountPasswords[role]);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL((u) => !u.pathname.includes("login"), {
        timeout: 30000,
        waitUntil: "domcontentloaded",
      });
    } catch (e) {
      console.info(
        JSON.stringify({
          stage: "login_failed",
          role,
          responses,
          alerts: await page.getByRole("alert").allTextContents(),
          pageErrors,
        }),
      );
      throw e;
    }
    return { page, b };
  }
  async function screenshot(page: Page, name: string) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const a of document.getAnimations())
        if (a.effect?.getComputedTiming().iterations !== Infinity)
          try {
            a.finish();
          } catch {
            /* A finished or detached animation needs no further action. */
          }
    });
    await page.screenshot({
      path: join(c.root, name + ".png"),
      fullPage: true,
      animations: "disabled",
    });
  }
  async function token(page: Page) {
    return page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
          const s = JSON.parse(localStorage.getItem(key)!);
          if (s.access_token) return s.access_token as string;
        }
      }
      throw new Error("Synthetic browser session missing");
    });
  }
  async function api(page: Page, path: string, body?: unknown) {
    const session = await token(page);
    return page.request.fetch("http://127.0.0.1:59330" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: "Bearer " + session },
      data: body,
    });
  }
  return { ...c, f, browser, login, screenshot, api, token, blockedExternal, pageErrors };
}
