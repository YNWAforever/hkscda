import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import assert from "node:assert/strict";

assert.equal(
  process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES,
  "1",
  "Explicit local fixture permission required",
);
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321", "Dedicated local Supabase only");
const origin = "http://127.0.0.1:56336";
const out = "docs/evidence/volunteer-admin-centre";
const requestedPages = process.env.VOLUNTEER_AUDIT_PAGES?.split(",");
const screenshotOut = ".local-policy-test/browser/volunteer-admin-centre";
const actors = JSON.parse(await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"));
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const report = {
  generatedAt: new Date().toISOString(),
  origin,
  database: "dedicated local Supabase API 56321 / database 56322",
  mode: "Real local API/DB page and role checks; policy preview writes an isolated preview snapshot. Explicitly authorized synthetic pending-profile setup if missing and local auth session refresh. No policy publication, attendance or booking mutations. No email.",
  checks: [],
  permissions: [],
  journeys: [],
  blockedRequests: [],
};
if (requestedPages) {
  const previous = JSON.parse(await readFile(`${out}/browser.json`, "utf8"));
  report.fixtureSetup = previous.fixtureSetup;
  report.checks = previous.checks.filter((check) => !requestedPages.includes(check.page));
}
await mkdir(out, { recursive: true });
await mkdir(screenshotOut, { recursive: true });

async function sessionFor(key) {
  const stored = actors[key];
  assert.ok(stored?.id, `Missing synthetic ${key}`);
  const user = await service.auth.admin.getUserById(stored.id);
  assert.ok(
    user.data.user?.email?.endsWith("@example.invalid"),
    "Only an existing synthetic identity can log in",
  );
  const valid = await service.auth.getUser(stored.session.access_token);
  if (!valid.error) return stored.session;
  // generateLink returns a local token directly; it sends no email and changes no password.
  const link = await service.auth.admin.generateLink({
    type: "magiclink",
    email: user.data.user.email,
  });
  if (link.error) throw new Error(`Local ${key} session refresh failed`);
  const auth = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await auth.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error) throw new Error(`Local ${key} login failed`);
  return verified.data.session;
}
const sessions = {};
for (const role of ["admin", "staff", "treasurer", "volunteer1"])
  sessions[role] = await sessionFor(role);
const request = (path, role, options = {}) =>
  fetch(origin + path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(role ? { Authorization: `Bearer ${sessions[role].access_token}` } : {}),
    },
  });
for (const role of ["admin", "staff"]) {
  const identity = await request("/api/admin/me", role);
  assert.equal(identity.status, 200, `Application must recognize isolated ${role}`);
  assert.equal((await identity.json()).admin.role, role);
}
const pendingFixtureResponse = await request(
  "/api/admin/volunteers/people?status=pending&limit=50",
  "admin",
);
const pendingFixtureList = await pendingFixtureResponse.json();
if (
  !(pendingFixtureList.profiles ?? []).some(
    (p) => p.email_verified && p.linked_email?.endsWith("@example.invalid"),
  )
) {
  const marker = `admin-centre-zero-${crypto.randomUUID()}`;
  const created = await service.auth.admin.createUser({
    email: `${marker}@example.invalid`,
    password: crypto.randomUUID() + "Aa1!",
    email_confirm: true,
  });
  if (created.error) throw new Error("Local zero-booking fixture creation failed");
  const claimed = await service.rpc("volunteer_profile_command", {
    p_actor: created.data.user.id,
    p_command: {
      action: "claim",
      display_name: "Synthetic pending zero-booking volunteer",
      birth_date: "1990-01-01",
    },
  });
  if (claimed.error)
    throw new Error(`Local zero-booking fixture claim failed: ${claimed.error.code}`);
  report.fixtureSetup = {
    marker,
    authUserId: created.data.user.id,
    profileId: claimed.data.profile_id,
    purpose:
      "Isolated email-confirmed pending zero-booking identity; no email sent; existing identities unchanged",
  };
}
const storedPolicyResponse = await request("/api/admin/volunteers/settings", "admin", {
  method: "POST",
  body: JSON.stringify({ action: "list" }),
});
const storedPolicyList = await storedPolicyResponse.json();
const comparisonTemplate = storedPolicyList.drafts.find((draft) =>
  draft.template_key.startsWith("a-"),
)?.template_key;
const profile = await service
  .from("volunteer_profile")
  .select("id")
  .eq("auth_user_id", actors.volunteer1.id)
  .limit(1)
  .single();
if (profile.error) throw new Error("Existing synthetic profile missing");
const registration = await service
  .from("volunteer_registration")
  .select("id")
  .eq("profile_id", profile.data.id)
  .limit(1)
  .maybeSingle();
const operational = [
  "",
  "people",
  "activities",
  "calendar",
  "tasks",
  "group-enquiries",
  "operations",
  "qualifications",
  `people/${profile.data.id}`,
];
if (registration.data?.id) operational.push(`registrations/${registration.data.id}`);
else
  report.checks.push({
    page: "registrations/detail",
    skipped: "No existing registration for selected synthetic profile",
  });
const settings = ["settings", "daily-settings", "assessments", "sources", "simulation"];
const browser = await chromium.launch({ headless: true });
try {
  for (const role of ["admin", "staff"]) {
    const context = await browser.newContext();
    await context.addInitScript(
      (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
      sessions[role],
    );
    await context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (![origin, local.API_URL].includes(url.origin)) {
        report.blockedRequests.push({
          kind: "external",
          origin: url.origin,
          pathname: url.pathname,
        });
        return route.abort();
      }
      if (
        url.origin === origin &&
        url.pathname.startsWith("/api/") &&
        !["GET", "HEAD", "OPTIONS"].includes(req.method())
      ) {
        let body;
        try {
          body = req.postDataJSON();
        } catch {
          /* Non-JSON mutation stays blocked. */
        }
        if (
          !(
            req.method() === "POST" &&
            (["list", "list_legacy", "resolve", "preview"].includes(body?.action) ||
              body?.kind === "list")
          )
        ) {
          report.blockedRequests.push({
            kind: "mutation",
            pathname: url.pathname,
            method: req.method(),
          });
          return route.abort();
        }
      }
      return route.continue();
    });
    for (const width of [1440, 390]) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 950 });
      page.setDefaultTimeout(18000);
      for (const path of [...operational, ...(role === "admin" ? settings : [])]) {
        if (requestedPages && !requestedPages.includes(path || "overview")) continue;
        const errors = [],
          apiFailures = [];
        const onError = (error) => errors.push(error.message);
        const onResponse = (res) => {
          const url = new URL(res.url());
          if (url.pathname.startsWith("/api/") && res.status() >= 400)
            apiFailures.push({ path: url.pathname, status: res.status() });
        };
        page.on("pageerror", onError);
        page.on("response", onResponse);
        const check = { role, width, page: path || "overview", errors, apiFailures };
        try {
          await page.goto(
            `${origin}/admin/volunteers${path ? "/" + path : ""}${path === "qualifications" ? "?profile_id=" + profile.data.id : ""}`,
            {
              waitUntil: "networkidle",
              timeout: 45000,
            },
          );
          await page.locator(".volunteer-workspace").waitFor();
          if (path === "settings") {
            const preview = page.getByRole("button", { name: "建立預覽", exact: true });
            if (comparisonTemplate)
              await page.getByLabel("政策模板", { exact: true }).selectOption(comparisonTemplate);
            await page
              .getByLabel("生效日期", { exact: true })
              .fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
            if (await preview.isEnabled()) {
              await page.screenshot({
                path: `${screenshotOut}/${role}-${width}-settings-before-preview.jpg`,
                fullPage: true,
                quality: 65,
              });
              const previewResponsePromise = page.waitForResponse(
                (response) =>
                  response.url().endsWith("/api/admin/volunteers/settings") &&
                  response.request().postDataJSON()?.action === "preview",
              );
              await preview.click();
              const previewResponse = await previewResponsePromise;
              if (!previewResponse.ok()) {
                check.previewFailure = {
                  command: previewResponse.request().postDataJSON(),
                  status: previewResponse.status(),
                  body: await previewResponse.json(),
                };
                throw Error(JSON.stringify(check.previewFailure));
              }
              await page.getByText("預覽：", { exact: false }).first().waitFor();
              check.policyComparison =
                "Read-only preview of existing stored draft; no draft saved or policy published";
            } else
              check.policyComparison = "Unavailable: no saved eligible draft; no mutation made";
          }
          check.shellCount = await page.locator(".volunteer-workspace").count();
          check.mainCount = await page.locator("main").count();
          check.h1Count = await page.locator("h1").count();
          check.overflow = await page.evaluate(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            overflowing: [...document.querySelectorAll(".vw-content *")]
              .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
              .slice(0, 8)
              .map((el) => ({ tag: el.tagName, classes: el.className })),
          }));
          if (width === 390) {
            await page.getByRole("button", { name: /工作區導覽/ }).click();
            check.mobileNavigationVisible = await page
              .getByRole("navigation", { name: "義工工作區" })
              .isVisible();
          }
          check.settingsLinks = await page
            .locator('.vw-navigation a[href="/admin/volunteers/settings"]')
            .count();
          check.activeLinks = await page.locator('.vw-navigation a[aria-current="page"]').count();
          const audit = await new AxeBuilder({ page }).analyze();
          check.violations = audit.violations
            .filter((v) => ["serious", "critical"].includes(v.impact))
            .map((v) => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
            }));
          if (width === 390) await page.getByRole("button", { name: /工作區導覽/ }).click();
          const filename = `${role}-${width}-${path.replaceAll("/", "-") || "overview"}.jpg`;
          await page.screenshot({
            path: `${screenshotOut}/${filename}`,
            fullPage: true,
            quality: 65,
          });
          check.screenshot = filename;
        } catch (error) {
          check.failure = error.message;
        }
        page.off("pageerror", onError);
        page.off("response", onResponse);
        report.checks.push(check);
        console.log(
          JSON.stringify({
            role,
            width,
            page: check.page,
            failure: Boolean(check.failure),
            apiFailures,
            overflow: check.overflow?.document > width + 1,
            violations: check.violations?.map((v) => v.id),
            errors,
          }),
        );
        await writeFile(`${out}/browser.json`, JSON.stringify(report, null, 2) + "\n");
      }
      await page.close();
    }
    if (role === "staff") {
      const deniedPage = await context.newPage();
      for (const path of settings) {
        await deniedPage.goto(`${origin}/admin/volunteers/${path}`, { waitUntil: "networkidle" });
        report.permissions.push({
          role,
          page: path,
          status: await deniedPage.locator(".volunteer-workspace").count(),
          expected: 0,
          redirected: new URL(deniedPage.url()).pathname !== `/admin/volunteers/${path}`,
        });
      }
      await deniedPage.close();
    }
    const journey = await context.newPage();
    await journey.setViewportSize({ width: 390, height: 950 });
    try {
      await journey.goto(`${origin}/admin/volunteers`, { waitUntil: "networkidle" });
      await journey
        .locator('a[href="/admin/volunteers/activities?registration_status=pending"]')
        .click();
      await journey.getByLabel("按狀態篩選", { exact: true }).waitFor();
      assert.equal(await journey.getByLabel("按狀態篩選", { exact: true }).inputValue(), "pending");
      report.journeys.push({
        role,
        check: "Overview pending card opens activities with pending filter",
        passed: true,
      });
      const pendingResponse = await request(
        "/api/admin/volunteers/people?status=pending&limit=50",
        role,
      );
      const pending = await pendingResponse.json();
      let zero;
      for (const candidate of pending.profiles ?? []) {
        if (!candidate.email_verified || !candidate.linked_email?.endsWith("@example.invalid"))
          continue;
        const response = await request(
          `/api/admin/volunteers/people?profile_id=${candidate.id}`,
          role,
        );
        const detail = await response.json();
        if (detail.coverage?.registration_total === 0) {
          zero = candidate;
          break;
        }
      }
      assert.ok(
        zero,
        "An existing synthetic email-verified pending zero-booking identity is required",
      );
      report.fixtureSetup ??= {
        marker: zero.linked_email.split("@")[0],
        profileId: zero.id,
        reused: true,
        purpose: "Isolated email-confirmed pending zero-booking identity; no email sent",
      };
      for (const term of [
        zero.linked_email,
        zero.linked_email.split("@")[0].slice(0, 16),
        zero.display_name,
      ]) {
        await journey.goto(`${origin}/admin/volunteers/people`, { waitUntil: "networkidle" });
        await journey.getByRole("searchbox").fill(term);
        await journey.getByRole("button", { name: "搜尋", exact: true }).click();
        await journey.locator("li").filter({ hasText: zero.id }).waitFor();
      }
      await journey.screenshot({
        path: `${screenshotOut}/${role}-390-zero-booking-search.jpg`,
        fullPage: true,
        quality: 65,
      });
      await journey.locator("li").filter({ hasText: zero.id }).getByRole("link").click();
      await journey.locator(`a[href*="qualifications?profile_id=${zero.id}"]`).click();
      await journey.waitForLoadState("networkidle");
      assert.equal(new URL(journey.url()).searchParams.get("profile_id"), zero.id);
      await journey.locator(`select:has(option[value="${zero.id}"])`).waitFor();
      assert.equal(
        await journey.locator(`select:has(option[value="${zero.id}"])`).inputValue(),
        zero.id,
      );
      await journey.screenshot({
        path: `${screenshotOut}/${role}-390-selected-qualification.jpg`,
        fullPage: true,
        quality: 65,
      });
      report.journeys.push({
        role,
        check:
          "Full and partial linked email plus name locate email-verified pending zero-booking identity; detail opens canonical qualification",
        passed: true,
        profileId: zero.id,
      });
      if (role === "admin") {
        await journey.goto(`${origin}/admin/volunteers/settings`, { waitUntil: "networkidle" });
        const name = journey.getByLabel("名稱", { exact: true });
        const original = await name.inputValue();
        await name.fill(original + " browser unsaved check");
        await journey.getByRole("button", { name: /工作區導覽/ }).click();
        journey.once("dialog", (dialog) => dialog.dismiss());
        await journey.locator('.vw-navigation a[href="/admin/volunteers/people"]').click();
        assert.equal(await name.inputValue(), original + " browser unsaved check");
        journey.once("dialog", (dialog) => dialog.accept());
        await journey.getByRole("button", { name: /工作區導覽/ }).click();
        await journey.locator('.vw-navigation a[href="/admin/volunteers/people"]').click();
        await journey.waitForURL(
          (url) => url.pathname.replace(/\/$/, "") === "/admin/volunteers/people",
          { waitUntil: "domcontentloaded" },
        );
        report.journeys.push({
          role,
          check:
            "Unsaved policy edit: dismissed navigation retains input; accepted navigation leaves without saving",
          passed: true,
        });
      }
    } catch (error) {
      report.journeys.push({
        role,
        passed: false,
        error: error.message,
        visibleContent: await journey
          .locator(".vw-content")
          .innerText()
          .catch(() => "Not rendered"),
      });
    }
    await journey.close();
    await context.close();
  }
  for (const role of [null, "treasurer", "volunteer1", "staff"]) {
    for (const [path, body] of [
      ["/api/admin/volunteers/people", undefined],
      ["/api/admin/volunteers/settings", { action: "list" }],
      ["/api/admin/volunteers/daily-settings/", { action: "list" }],
      ["/api/admin/volunteers/assessments/", { kind: "list" }],
      ["/api/admin/volunteers/sources/", { action: "list" }],
      ["/api/admin/volunteers/simulation/", { action: "list" }],
    ]) {
      const res = await request(
        path,
        role,
        body ? { method: "POST", body: JSON.stringify(body) } : {},
      );
      report.permissions.push({
        role: role ?? "anonymous",
        path,
        status: res.status,
        expected: role === "staff" && path.endsWith("/people") ? 200 : role ? 403 : 401,
      });
    }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/browser.json`, JSON.stringify(report, null, 2) + "\n");
}
const representatives = [
  "admin-1440-overview.jpg",
  "admin-390-people.jpg",
  "admin-1440-settings-before-preview.jpg",
  "admin-1440-settings.jpg",
  "admin-390-assessments.jpg",
  "staff-390-zero-booking-search.jpg",
  "staff-390-selected-qualification.jpg",
  `admin-1440-people-${profile.data.id}.jpg`,
];
report.representativeScreenshots = [];
for (const filename of representatives) {
  try {
    await copyFile(`${screenshotOut}/${filename}`, `${out}/${filename}`);
    report.representativeScreenshots.push(filename);
  } catch {
    /* Missing captures remain recorded as failures or unavailable checks above. */
  }
}
report.fullScreenshotDirectory = screenshotOut;
await writeFile(`${out}/browser.json`, JSON.stringify(report, null, 2) + "\n");
const failures = report.checks.filter(
  (c) =>
    c.failure ||
    c.skipped ||
    c.errors?.length ||
    c.apiFailures?.length ||
    c.violations?.length ||
    c.overflow?.document > c.width + 1 ||
    c.shellCount !== 1 ||
    c.mainCount !== 1 ||
    c.activeLinks !== 1 ||
    c.settingsLinks !== (c.role === "admin" ? 1 : 0),
);
console.log(
  JSON.stringify({
    checked: report.checks.length,
    findings: failures.length,
    permissionFailures: report.permissions.filter((p) => p.status !== p.expected).length,
    report: `${out}/browser.json`,
  }),
);
process.exitCode =
  failures.length ||
  report.permissions.some((p) => p.status !== p.expected) ||
  report.journeys.some((j) => !j.passed)
    ? 1
    : 0;
