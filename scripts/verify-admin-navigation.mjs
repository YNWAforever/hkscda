import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

assert.equal(
  process.env.ADMIN_NAV_LOCAL_VERIFY,
  "1",
  "Explicit isolated verification flag required",
);
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const origin = "http://127.0.0.1:56336";
const actors = JSON.parse(await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"));
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const out = "docs/evidence/admin-navigation-groups";
await mkdir(out, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  origin,
  mode: "Dedicated local DB56322; synthetic actors only; browser mutations/external traffic blocked. Local auth session refresh sends no email.",
  pages: [],
  journeys: [],
  blocked: [],
};
async function sessionFor(role) {
  const stored = actors[role];
  const user = await service.auth.admin.getUserById(stored.id);
  assert.ok(user.data.user?.email?.endsWith("@example.invalid"));
  if (!(await service.auth.getUser(stored.session.access_token)).error) return stored.session;
  const link = await service.auth.admin.generateLink({
    type: "magiclink",
    email: user.data.user.email,
  });
  if (link.error) throw Error("Synthetic local session generation failed");
  const auth = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await auth.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error) throw Error("Synthetic local session verification failed");
  return verified.data.session;
}
const common = ["/admin?section=payments", "/admin/sponsorships", "/admin/payment-methods"];
const operations = [
  "/admin?section=cat",
  "/admin?section=dog",
  "/admin?section=sponsor",
  "/admin/animals/new",
  "/admin/applications",
  "/admin/coordinator/inbox",
  "/admin/coordinator/intake",
  "/admin/coordinator/tasks",
  "/admin/coordinator/adopters",
  "/admin/coordinator/reports",
  "/admin/volunteers",
  "/admin/volunteers/people",
  "/admin/volunteers/calendar",
  "/admin/volunteers/group-enquiries",
  "/admin/internships",
  "/admin/content",
  "/admin/content/adoption",
  "/admin/content/knowledge",
  "/admin/content/about",
  "/admin/faq",
];
const adminOnly = [
  "/admin/access",
  "/admin/coordinator/statuses",
  "/admin/governance",
  "/admin/volunteers/settings",
];
const browser = await chromium.launch({ headless: true });
try {
  for (const role of ["admin", "staff", "treasurer"]) {
    const context = await browser.newContext();
    await context.addInitScript(
      (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
      await sessionFor(role),
    );
    await context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (![origin, local.API_URL].includes(url.origin)) {
        report.blocked.push({ kind: "external", origin: url.origin });
        return route.abort();
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
        let body;
        try {
          body = req.postDataJSON();
        } catch {}
        const readCommand =
          url.origin === origin &&
          req.method() === "POST" &&
          (["list", "list_legacy", "resolve"].includes(body?.action) || body?.kind === "list");
        if (!readCommand) {
          report.blocked.push({ kind: "mutation", path: url.pathname });
          return route.abort();
        }
      }
      await route.continue();
    });
    for (const width of [1440, 390]) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 950 });
      page.setDefaultTimeout(12000);
      const paths = [
        ...common,
        ...(role !== "treasurer" ? operations : []),
        ...(role === "admin" ? adminOnly : []),
        ...(role !== "staff" ? ["/admin/supporters"] : []),
      ];
      for (const path of paths) {
        if (
          process.env.ADMIN_NAV_PATH &&
          !process.env.ADMIN_NAV_PATH.split(",").some((part) => path.includes(part))
        )
          continue;
        const check = { role, width, path, errors: [], apiFailures: [] };
        const onError = (error) => check.errors.push(error.message);
        const onResponse = (res) => {
          if (
            (new URL(res.url()).pathname.startsWith("/api/") ||
              new URL(res.url()).pathname.startsWith("/rest/v1/")) &&
            res.status() >= 400
          )
            check.apiFailures.push({ path: new URL(res.url()).pathname, status: res.status() });
        };
        page.on("pageerror", onError);
        page.on("response", onResponse);
        try {
          await page.goto(origin + path, { waitUntil: "networkidle", timeout: 45000 });
          await page.locator("main").waitFor();
          if (/section=(cat|dog|sponsor)/.test(path))
            await page.getByRole("textbox", { name: "搜尋名稱或編號", exact: true }).waitFor();
          assert.ok(!page.url().includes("/login"), "Authenticated page required");
          check.primaryCount = await page.locator("aside").first().locator("nav a").count();
          check.primaryActive = await page
            .locator("aside")
            .first()
            .locator('nav a[aria-current="page"]')
            .count();
          assert.equal(check.primaryCount, role === "treasurer" ? 2 : 6);
          assert.equal(check.primaryActive, 1);
          check.overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          );
          assert.equal(check.overflow, false, "No document horizontal overflow");
          const audit = await new AxeBuilder({ page }).analyze();
          check.violations = audit.violations
            .filter((v) => ["serious", "critical"].includes(v.impact))
            .map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
            }));
          if (role === "admin" && ["/admin?section=cat", "/admin/volunteers"].includes(path)) {
            const filename = `${width}-${path
              .split("/")
              .pop()
              .replaceAll(/[^a-z0-9]/gi, "-")}.jpg`;
            await page.screenshot({ path: `${out}/${filename}`, fullPage: true, quality: 65 });
            check.screenshot = filename;
          }
        } catch (error) {
          check.failure = error.message;
        }
        page.off("pageerror", onError);
        page.off("response", onResponse);
        report.pages.push(check);
        console.log(
          JSON.stringify({
            role,
            width,
            path,
            failure: check.failure,
            violations: check.violations?.map((v) => v.id),
            errors: check.errors.length,
            apiFailures: check.apiFailures.length,
          }),
        );
        await writeFile(
          `${out}/${process.env.ADMIN_NAV_PATH ? "browser-targeted" : "browser"}.json`,
          JSON.stringify(report, null, 2) + "\n",
        );
      }
      await page.close();
    }
    if (
      (!process.env.ADMIN_NAV_PATH ||
        process.env.ADMIN_NAV_PATH.split(",").includes("journeys-only")) &&
      role !== "treasurer"
    ) {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await page.setViewportSize({ width: 390, height: 950 });
      const journey = { role, name: "Animal filters, independent tabs and browser history" };
      try {
        await page.goto(origin + "/admin?section=cat", { waitUntil: "networkidle" });
        const search = page.getByRole("textbox", { name: "搜尋名稱或編號", exact: true });
        await search.fill("synthetic-cat-no-match");
        await page.waitForURL((url) => url.searchParams.get("q") === "synthetic-cat-no-match");
        await page.getByRole("link", { name: "狗狗", exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("section") === "dog");
        assert.equal(await search.inputValue(), "");
        await search.fill("synthetic-dog-no-match");
        await page.waitForURL((url) => url.searchParams.get("q") === "synthetic-dog-no-match");
        await page.getByRole("link", { name: "貓貓", exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("section") === "cat");
        assert.equal(await search.inputValue(), "synthetic-cat-no-match");
        await page.goBack({ waitUntil: "networkidle" });
        assert.equal(new URL(page.url()).searchParams.get("section"), "dog");
        assert.equal(await search.inputValue(), "synthetic-dog-no-match");
        await page.goForward({ waitUntil: "networkidle" });
        assert.equal(await search.inputValue(), "synthetic-cat-no-match");
        await page.getByRole("button", { name: "清除篩選", exact: true }).first().click();
        await page.waitForURL((url) => !url.searchParams.get("q"));
        assert.equal(await search.inputValue(), "");
        await page.getByRole("link", { name: "助養", exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("section") === "sponsor");
        journey.passed = true;
      } catch (error) {
        journey.failure = error.message;
      }
      report.journeys.push(journey);
      const mobile = {
        role,
        name: "Mobile global menu closes and focuses heading; keyboard tabs; language toggle",
      };
      try {
        await page.goto(origin + "/admin?section=cat", { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "開啟選單", exact: true }).click();
        const drawer = page.getByRole("dialog");
        await drawer.getByRole("link", { name: "領養管理", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/admin/applications");
        await drawer.waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.tagName === "H1");
        await page.getByRole("button", { name: "開啟選單", exact: true }).click();
        await page.getByRole("dialog").getByRole("link", { name: "動物管理", exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("section") === "cat");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        const dog = page.getByRole("link", { name: "狗狗", exact: true });
        await dog.focus();
        await page.keyboard.press("Enter");
        await page.waitForURL((url) => url.searchParams.get("section") === "dog");
        await page.getByRole("button", { name: "開啟選單", exact: true }).click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "English", exact: true })
          .click();
        assert.ok(
          await page
            .getByRole("dialog")
            .getByRole("link", { name: "Animal management", exact: true })
            .isVisible(),
        );
        await page.getByRole("dialog").getByRole("button", { name: "中文", exact: true }).click();
        await page.keyboard.press("Escape");
        mobile.passed = true;
      } catch (error) {
        mobile.failure = error.message;
      }
      report.journeys.push(mobile);
      if (role === "admin") {
        const draft = {
          role,
          name: "Global navigation preserves cancelled volunteer draft and accepts explicit discard",
        };
        try {
          await page.goto(origin + "/admin/volunteers/settings", { waitUntil: "networkidle" });
          const name = page.getByLabel("名稱", { exact: true });
          const original = await name.inputValue();
          await name.fill(original + " synthetic unsaved navigation check");
          await page.getByRole("button", { name: "開啟選單", exact: true }).click();
          page.once("dialog", (dialog) => dialog.dismiss());
          await page
            .getByRole("dialog")
            .getByRole("link", { name: "動物管理", exact: true })
            .click();
          assert.equal(await name.inputValue(), original + " synthetic unsaved navigation check");
          assert.ok(await page.getByRole("dialog").isVisible());
          page.once("dialog", (dialog) => dialog.accept());
          await page
            .getByRole("dialog")
            .getByRole("link", { name: "動物管理", exact: true })
            .click();
          await page.waitForURL(
            (url) => url.pathname === "/admin" && url.searchParams.get("section") === "cat",
          );
          await page.getByRole("dialog").waitFor({ state: "hidden" });
          draft.passed = true;
        } catch (error) {
          draft.failure = error.message;
        }
        report.journeys.push(draft);
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  `${out}/${process.env.ADMIN_NAV_PATH ? "browser-targeted" : "browser"}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
const failed = [
  ...report.pages.filter(
    (c) => c.failure || c.errors.length || c.apiFailures.length || c.violations?.length,
  ),
  ...report.journeys.filter((c) => c.failure),
];
console.log(JSON.stringify({ checks: report.pages.length, failures: failed.length }));
if (failed.length) process.exitCode = 1;
