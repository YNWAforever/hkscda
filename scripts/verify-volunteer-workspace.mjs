import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:56548";
const sessions = JSON.parse(
  await readFile(".local-policy-test/browser-sessions-private.json", "utf8"),
);
const fixture = JSON.parse(await readFile(".local-policy-test/daily-work-private.json", "utf8"));
const output = ".superpowers/sdd/volunteer-admin-20261013/browser-results.json";
const browser = await chromium.launch({ headless: true });
const results = [];
let activePage;
try {
  const context = await browser.newContext({
    storageState: sessions[0].path,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const requests = [];
  activePage = page;
  page.on("request", (request) => {
    if (request.url().startsWith(origin + "/api/admin/volunteers"))
      requests.push({
        url: new URL(request.url()).pathname,
        method: request.method(),
        body: request.postDataJSON(),
      });
  });
  const pages = [
    "",
    "tasks",
    "calendar",
    "activities",
    "operations",
    "group-enquiries",
    "people",
    "qualifications",
    "settings",
    "daily-settings",
    "assessments",
    "sources",
    "simulation",
  ];
  for (const leaf of pages) {
    await page.goto(origin + "/admin/volunteers" + (leaf ? "/" + leaf : ""));
    await page.locator("h1").waitFor();
    await page.waitForTimeout(700);
    const h1 = await page.locator("#volunteer-page-content h1").count();
    const heading = await page.locator("#volunteer-page-content .vw-page-header").count();
    assert.equal(h1, 1, `h1 ${leaf}`);
    assert.equal(heading, 1, `shared heading ${leaf}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    results.push({ check: "admin-primary-read", page: leaf || "overview", h1, heading, overflow });
  }
  await page.goto(origin + "/admin/volunteers/activities");
  await page.getByRole("button", { name: "所有日期", exact: true }).click();
  await page.waitForFunction(
    () => new URLSearchParams(location.search).get("date_scope") === "all",
  );
  await page.reload();
  await page.locator("h1").waitFor();
  await page.waitForTimeout(800);
  assert.equal(new URL(page.url()).searchParams.get("date_scope"), "all");
  results.push({ check: "all-date-reload", scope: "all" });
  const jobsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/admin/volunteers/jobs/" &&
      response.request().method() === "GET",
  );
  await page.goto(origin + "/admin/volunteers/assessments");
  const loadedJobs = (await (await jobsResponse).json()).jobs;
  assert.equal(
    fixture.cleanupManifest.outboxIds.filter((id) => loadedJobs.some((job) => job.id === id))
      .length,
    3,
  );
  await page
    .locator("#assessment-notifications")
    .locator("..")
    .locator("ul > li")
    .first()
    .waitFor();
  const jobs = await page
    .locator("#assessment-notifications")
    .locator("..")
    .locator("ul > li")
    .count();
  assert.equal(jobs, loadedJobs.length);
  results.push({
    check: "assessment-first-load",
    jobs,
    fixtureJobs: 3,
    statuses: loadedJobs
      .filter((job) => fixture.cleanupManifest.outboxIds.includes(job.id))
      .map((job) => job.status),
    requestSeen: requests.some((r) => r.url === "/api/admin/volunteers/jobs/"),
  });
  await page.route("**/api/admin/volunteers/jobs/", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"AUDIT local injected jobs failure"}',
    }),
  );
  await page.reload();
  await page.locator("#assessment-notifications").locator("..").getByRole("alert").waitFor();
  assert.equal((await page.getByRole("spinbutton").count()) > 0, true);
  results.push({ check: "assessment-jobs-only-500", settingsRemain: true });
  await page.unroute("**/api/admin/volunteers/jobs/");
  await page.goto(origin + "/admin/volunteers/group-enquiries");
  await page.locator("h1").waitFor();
  await page.waitForTimeout(700);
  const input = page.locator("input").first();
  const before = requests.filter(
    (r) => r.url === "/api/admin/volunteers/group-enquiries" && r.method === "POST",
  ).length;
  await input.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(element, "AUDIT 中文");
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(450);
  assert.equal(
    requests.filter((r) => r.url === "/api/admin/volunteers/group-enquiries" && r.method === "POST")
      .length,
    before,
  );
  await input.evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "AUDIT 中文" }),
    ),
  );
  await page.waitForTimeout(650);
  const after = requests.filter(
    (r) => r.url === "/api/admin/volunteers/group-enquiries" && r.method === "POST",
  ).length;
  assert.equal(after, before + 1);
  assert.equal(new URL(page.url()).searchParams.has("q"), false);
  results.push({
    check: "group-IME-debounce-body",
    duringIME: 0,
    afterComposition: 1,
    qAbsentFromUrl: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/admin/volunteers/people");
  await page.locator("h1").waitFor();
  await page.waitForTimeout(700);
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  assert.equal(mobileOverflow, false);
  results.push({ check: "mobile-directory-read", viewport: "390x844", overflow: mobileOverflow });
  await page.screenshot({
    path: ".superpowers/sdd/volunteer-admin-20261013/mobile-directory.png",
    fullPage: true,
  });
  await context.close();
  const staff = await browser.newContext({ storageState: sessions[1].path });
  const staffPage = await staff.newPage();
  for (const leaf of [
    "",
    "tasks",
    "calendar",
    "activities",
    "operations",
    "group-enquiries",
    "people",
    "qualifications",
  ]) {
    await staffPage.goto(origin + "/admin/volunteers" + (leaf ? "/" + leaf : ""));
    await staffPage.locator("h1").waitFor();
    results.push({
      check: "staff-primary-read",
      page: leaf || "overview",
      allowed: !staffPage.url().includes("login"),
    });
  }
  for (const leaf of ["settings", "daily-settings", "assessments", "sources", "simulation"]) {
    await staffPage.goto(origin + "/admin/volunteers/" + leaf);
    await staffPage.waitForTimeout(600);
    assert.notEqual(new URL(staffPage.url()).pathname, "/admin/volunteers/" + leaf);
    results.push({ check: "staff-policy-route-denied", page: leaf });
  }
  await staff.close();
} catch (error) {
  if (activePage) {
    await activePage.screenshot({
      path: ".superpowers/sdd/volunteer-admin-20261013/browser-failure.png",
      fullPage: true,
    });
    results.push({
      check: "failure-state",
      url: activePage.url(),
      body: (await activePage.locator("body").innerText()).slice(0, 1200),
    });
  }
  results.push({ check: "runner", status: "failed", error: String(error.message) });
  process.exitCode = 1;
} finally {
  await browser.close();
  await mkdir(".superpowers/sdd/volunteer-admin-20261013", { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        environment: "local real app+Auth+DB read journey; no business mutations or provider send",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
}
