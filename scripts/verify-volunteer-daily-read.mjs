import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { activityWorkspaceCopy } from "../src/components/admin/volunteers/activityWorkspaceCopy";
import { activityOperationCopy } from "../src/components/admin/volunteers/activityOperationCopy";
import { volunteerRegistrationCopy } from "../src/components/admin/volunteers/volunteerRegistrationCopy";
import { bulkCommandSchema } from "../src/lib/volunteers/bulk/service";

// This exercises real UI/router/session helpers with an in-memory HTTP transport.
// No DB/Auth server, provider credentials, jobs, notifications or fixture writes exist here.
const phase = process.argv[2];
assert.ok(["baseline", "candidate"].includes(phase));
const attempt = process.argv[3] ?? "run-1";
assert.match(attempt, /^[a-z0-9-]+$/);
const onlyCase = process.argv[4];
if (onlyCase) assert.match(onlyCase, /^journey-(?:admin|staff)-(?:zh|en)-(?:1440|390)$/);
const root = process.cwd();
assert.ok(existsSync(resolve(root, "scripts/fixtures/volunteer-daily-read.html")));
const out = resolve(
  root,
  ".local-policy-test/volunteer-daily-read-20261020",
  `browser-${phase}-${attempt}`,
);
assert.ok(!existsSync(out), "Preserve every prior attempt; choose a new named phase before rerun");
mkdirSync(out, { recursive: true });
const origin = "http://127.0.0.1:56578";
const actorId = "90000000-0000-4000-8000-000000000001";
const activityId = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const registrationId = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const selectedActivity = activityId(26);
const selectedRegistration = registrationId(26);
const fixedNow = "2026-10-20T00:00:00.000Z";
const targetDate = "2026-10-20";
const sourceFiles = [
  "src/components/admin/volunteers/VolunteerRegistrationDetail.tsx",
  "src/components/admin/volunteers/VolunteerActivityWorkspace.tsx",
  "src/components/admin/volunteers/VolunteerDailyRead.test.tsx",
  "src/lib/volunteers/dailyReadAccess.test.ts",
  "scripts/fixtures/volunteer-daily-read.tsx",
  "scripts/fixtures/volunteer-daily-read.vite.ts",
  "scripts/verify-volunteer-daily-read.mjs",
];
const sources = sourceFiles.map((path) => ({
  path,
  sha256: createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex"),
}));
writeFileSync(resolve(out, "bootstrap.json"), JSON.stringify({ phase, state: "before-head" }));
const head =
  process.env.OFFLINE_DAILY_READ_HEAD ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
assert.match(head, /^[0-9a-f]{40}$/);
const row = (n, template = "morning", status = "published", starts = "2026-10-20T02:15:00Z") => ({
  id: activityId(n),
  title: `Offline ${template} ${String(n).padStart(2, "0")}`,
  starts_at: starts,
  ends_at: "2026-10-20T04:15:00Z",
  location: "Offline fixture venue",
  status,
  capacity: 30,
  template_key: template,
  shelter_key: "offline",
  policy_version_id: "c0000000-0000-4000-8000-000000000001",
  policy_revision: 1,
  updated_at: "2026-10-19T00:00:00.123456Z",
  scenario: "no_confirmed_group",
  approved: 5,
  waitlisted: 5,
  shortages: [],
  registrations_closed_at: null,
});
const activities = [
  ...Array.from({ length: 27 }, (_, i) => row(i + 1)),
  ...Array.from({ length: 8 }, (_, i) =>
    row(i + 28, "afternoon", "published", "2026-10-20T06:45:00Z"),
  ),
  row(36, "morning", "draft"),
  row(37, "morning", "closed"),
  row(38, "morning", "published", "2026-10-19T15:59:59.999Z"),
  row(39, "morning", "published", "2026-10-20T16:00:00.000Z"),
];
const roster = Array.from({ length: 26 }, (_, i) => ({
  id: registrationId(i + 1),
  contact_name: `Offline volunteer ${i + 1}`,
  status: ["pending", "approved", "waitlisted", "cancelled", "rejected"][i % 5],
  attendance_status: "not_marked",
}));
function registration(n = 26) {
  return {
    id: registrationId(n),
    profileId: null,
    activityId: selectedActivity,
    supporterId: null,
    registrationType: "individual",
    status: roster[n - 1].status,
    statusReason: "manual_review",
    attendanceStatus: "not_marked",
    participantCount: 1,
    contactName: `Offline volunteer ${n}`,
    contactEmail: `volunteer${n}@example.invalid`,
    contactPhone: "",
    language: "zh-HK",
    organizationName: null,
    declaredAge: 30,
    youngestAge: null,
    guardianName: null,
    guardianPhone: null,
    notes: null,
    internalNotes: null,
    volunteerHours: null,
    statusToken: null,
    createdAt: "2026-10-19T00:00:00Z",
    updatedAt: "2026-10-19T00:00:00.123456Z",
    activity: {
      id: selectedActivity,
      type: "volunteer_shift",
      title: "Offline morning 26",
      description: null,
      startsAt: "2026-10-20T02:15:00Z",
      endsAt: "2026-10-20T04:15:00Z",
      location: "Offline fixture venue",
      capacity: 30,
      approvedParticipants: 5,
      pendingParticipants: 6,
      waitlistedParticipants: 5,
      remainingCapacity: 25,
      allowWaitlist: true,
      autoApprove: false,
      minAge: 21,
      underagePolicy: "block",
      registrationModes: ["individual"],
      status: "published",
      createdAt: "2026-10-19T00:00:00Z",
      updatedAt: "2026-10-19T00:00:00.123456Z",
    },
    review: { state: "unavailable", asOf: fixedNow },
  };
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const results = [];
const summary = () =>
  writeFileSync(
    resolve(out, "results.json"),
    JSON.stringify(
      {
        phase,
        head,
        sources,
        onlyCase: onlyCase ?? null,
        baselineOverride:
          phase === "baseline"
            ? {
                commit: "843adac61285d92c2e1056715d6601ed83fedb12",
                module: "src/components/admin/volunteers/VolunteerRegistrationDetail.tsx",
                sha256: createHash("sha256")
                  .update(
                    readFileSync(
                      resolve(
                        root,
                        ".local-policy-test/volunteer-daily-read-20261020/baseline-detail.tsx",
                      ),
                    ),
                  )
                  .digest("hex"),
              }
            : null,
        environment: "OFFLINE MOCK UI/CONTRACT ONLY; NOT real Auth/DB/RLS/staff UAT",
        clock: fixedNow,
        viewportNote: "390px is a browser viewport, not a physical iOS/Android device",
        inMemoryCounts: { activities: activities.length, registrations: roster.length },
        results,
      },
      null,
      2,
    ),
  );
const executable = chromium.executablePath();
writeFileSync(
  resolve(out, "bootstrap.json"),
  JSON.stringify({ phase, head, state: "before-browser" }),
);
const browser = await chromium.launch(
  existsSync(executable) ? { headless: true } : { channel: "msedge", headless: true },
);
writeFileSync(
  resolve(out, "bootstrap.json"),
  JSON.stringify({ phase, head, state: "browser-ready" }),
);

async function runCase(name, role, language, width, scenario, work) {
  if (onlyCase && name !== onlyCase) return;
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    locale: language === "zh" ? "zh-HK" : "en-GB",
    serviceWorkers: "block",
  });
  await context.addInitScript((locale) => {
    localStorage.setItem("hkscda-admin-language", locale);
  }, language);
  const reads = [],
    forbiddenRequests = [],
    externalRequests = [],
    pageErrors = [];
  let releasePending;
  const pending = new Promise((done) => {
    releasePending = done;
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      externalRequests.push(url.origin);
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const method = request.method();
    const body = method === "POST" ? request.postDataJSON() : null;
    const command = body?.action;
    const allowedRead =
      (method === "GET" &&
        (url.pathname === "/api/admin/me" ||
          /^\/api\/admin\/volunteers\/registrations\/[0-9a-f-]+$/.test(url.pathname))) ||
      (method === "POST" &&
        url.pathname === "/api/admin/volunteers/bulk" &&
        ["list", "templates", "detail"].includes(command) &&
        bulkCommandSchema.safeParse(body).success);
    if (!allowedRead) {
      forbiddenRequests.push({ method, path: url.pathname, action: command });
      return route.fulfill({
        status: 599,
        json: { error: "Offline write/unknown endpoint blocked" },
      });
    }
    reads.push({ method, path: url.pathname, body });
    if (url.pathname === "/api/admin/me")
      return route.fulfill({
        json: {
          admin: {
            id: actorId,
            authUserId: actorId,
            email: "actor@example.invalid",
            role,
            status: "active",
          },
        },
      });
    if (command === "templates")
      return route.fulfill({
        json: {
          templates: ["morning", "afternoon"].map((key) => ({
            template_key: key,
            name: `Offline ${key}`,
            version_id: "c0000000-0000-4000-8000-000000000001",
            shelter: "offline",
            start_time: key === "morning" ? "10:15" : "14:45",
            end_time: key === "morning" ? "12:15" : "16:45",
          })),
        },
      });
    if (command === "list") {
      if (scenario === "list-failure")
        return route.fulfill({ status: 500, json: { error: "Offline list read failed" } });
      const f = body.filter;
      if (scenario === "race" && f.q === "SLOW") await pending;
      if (scenario === "list-loading" || (scenario === "empty-then-pending" && f.q === "Offline"))
        await pending;
      const rows =
        scenario === "empty" || scenario === "empty-then-pending"
          ? []
          : activities.filter((item) => {
              const at = Date.parse(item.starts_at);
              return (
                (!f.from || at >= Date.parse(f.from + "T00:00:00+08:00")) &&
                (!f.until || at < Date.parse(f.until + "T00:00:00+08:00") + 86400000) &&
                (!f.template || f.template === item.template_key) &&
                (!f.status || f.status === item.status) &&
                (!f.q || `${item.title} ${item.location}`.toLowerCase().includes(f.q.toLowerCase()))
              );
            });
      rows.sort(
        (a, b) =>
          (f.sort === "desc" ? -1 : 1) * a.starts_at.localeCompare(b.starts_at) ||
          a.id.localeCompare(b.id),
      );
      try {
        return await route.fulfill({
          json: {
            activities: rows.slice((body.page - 1) * 25, body.page * 25),
            total: rows.length,
          },
        });
      } catch (error) {
        if (!["race", "list-loading", "empty-then-pending"].includes(scenario)) throw error;
        return; // A stale read cancelled by Query must not be replayed.
      }
    }
    if (command === "detail")
      return route.fulfill({
        json: {
          activity: { ...row(26), description: "Offline read-only session" },
          registrations: roster.slice((body.page - 1) * 25, body.page * 25),
          total: roster.length,
          history: [],
          history_total: 0,
        },
      });
    if (scenario === "loading") {
      await pending;
      try {
        return await route.fulfill({ json: { registration: registration() } });
      } catch {
        return; // The pending read can be cancelled by leaving the detail.
      }
    }
    const status = { missing: 404, forbidden: 403, expired: 401, failure: 500 }[scenario];
    if (status)
      return route.fulfill({
        status,
        json: {
          error: {
            code: status === 404 ? "registration_not_found" : "offline_read_denied",
            message: "Offline registration unavailable",
          },
        },
      });
    return route.fulfill({ json: { registration: registration() } });
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(fixedNow));
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const started = performance.now();
  const result = { name, role, language, width, scenario, evidenceLayer: "mock UI", passed: false };
  try {
    await work(page, reads, name);
    assert.deepEqual(forbiddenRequests, [], "Read journey must issue zero write/unknown requests");
    assert.deepEqual(externalRequests, [], "Fixture must not attempt external network");
    assert.deepEqual(pageErrors, [], "No uncaught browser errors");
    result.passed = true;
  } catch (error) {
    result.error = String(error);
    result.url = page.url();
    await page
      .screenshot({ path: resolve(out, name + "-failure.png"), fullPage: true })
      .catch(() => {});
  } finally {
    releasePending();
    result.queryDiagnostics = await page
      .evaluate(() => globalThis.__OFFLINE_DAILY_READ_DIAGNOSTICS__?.())
      .catch(() => null);
    result.durationMs = Number((performance.now() - started).toFixed(2));
    result.requests = reads;
    result.forbiddenRequests = forbiddenRequests;
    result.externalRequests = externalRequests;
    result.pageErrors = pageErrors;
    results.push(result);
    summary();
    await context.close();
    console.log(
      `${result.passed ? "PASS" : "FAIL"} ${name}${result.error ? ": " + result.error : ""}`,
    );
  }
}
const initial =
  "/admin/volunteers/activities?date_scope=custom&from=2026-10-20&until=2026-10-20" +
  "&template=morning&status=published&sort=desc&page=2&view=table";
const detailUrl =
  `/admin/volunteers/registrations/${selectedRegistration}?return_from=activities` +
  "&date_scope=custom&from=2026-10-20&until=2026-10-20&template=morning" +
  `&status=published&sort=desc&page=2&detail_page=2&selected=${selectedActivity}`;
async function ready(page, path) {
  await page.goto(origin + path);
  await page.locator('[data-offline-daily-read="1"]').waitFor({ timeout: 15_000 });
}
async function assertReturn(page) {
  await page.waitForURL((url) => url.pathname === "/admin/volunteers/activities");
  const search = new URL(page.url()).searchParams;
  for (const [key, value] of Object.entries({
    date_scope: "custom",
    from: targetDate,
    until: targetDate,
    template: "morning",
    status: "published",
    sort: "desc",
    page: "2",
    detail_page: "2",
    selected: selectedActivity,
  }))
    assert.equal(search.get(key), value, "restored " + key);
  assert.equal(search.has("q"), false, "Private search stays out of the URL");
  await page.getByRole("dialog").waitFor();
  await page.getByRole("link", { name: /Offline volunteer 26/ }).waitFor();
}
try {
  for (const language of ["zh", "en"]) {
    for (const width of [1440, 390]) {
      const copy = activityWorkspaceCopy[language];
      const detail = activityOperationCopy[language].detail;
      const backLabel = volunteerRegistrationCopy[language].detail.back;
      if (phase === "baseline") {
        await runCase(
          `baseline-missing-${language}-${width}`,
          "staff",
          language,
          width,
          "missing",
          async (page, _reads, name) => {
            await ready(page, detailUrl);
            await page.getByRole("alert").waitFor();
            await page.screenshot({ path: resolve(out, name + ".png"), fullPage: true });
            assert.equal(
              await page.getByRole("link", { name: backLabel, exact: true }).count(),
              1,
              "A missing registration must retain the safe return control",
            );
          },
        );
        continue;
      }
      for (const role of ["admin", "staff"]) {
        await runCase(
          `journey-${role}-${language}-${width}`,
          role,
          language,
          width,
          "normal",
          async (page, reads, name) => {
            await ready(page, "/admin/volunteers/activities");
            await page.getByRole("button", { name: copy.filters.today, exact: true }).click();
            if (width === 390)
              await page.getByRole("button", { name: copy.filters.more(0), exact: true }).click();
            const filters = page.getByRole("region", { name: copy.filters.label, exact: true });
            await filters
              .getByLabel(new RegExp("^" + copy.filters.template))
              .selectOption("morning");
            await filters
              .getByLabel(new RegExp("^" + copy.filters.status))
              .selectOption("published");
            await page.getByLabel(new RegExp("^" + copy.filters.sort)).selectOption("desc");
            await page.getByLabel(copy.filters.search, { exact: true }).fill("Offline");
            await page.waitForFunction(() => {
              const q = new URLSearchParams(location.search);
              return (
                q.get("template") === "morning" &&
                q.get("status") === "published" &&
                q.get("from") === "2026-10-20" &&
                q.get("until") === "2026-10-20" &&
                q.get("sort") === "desc"
              );
            });
            await sleep(350); // Protect the existing 300ms debounce, without extending any timeout.
            await page.getByRole("button", { name: copy.list.next, exact: true }).click();
            await page.getByRole("button", { name: "Offline morning 26", exact: true }).click();
            await page.getByRole("button", { name: detail.nextRegistrations, exact: true }).click();
            const open = page.getByRole("link", { name: /Offline volunteer 26/ });
            await open.waitFor();
            await open.click();
            await page
              .getByRole("heading", { name: "Offline volunteer 26", exact: true })
              .waitFor();
            assert.ok((await page.locator("body").innerText()).includes("Offline fixture venue"));
            assert.equal(new URL(page.url()).searchParams.has("q"), false);
            await page.screenshot({ path: resolve(out, name + "-detail.png"), fullPage: true });
            const back = page.getByRole("link", { name: backLabel, exact: true });
            await back.focus();
            await page.keyboard.press("Enter");
            await assertReturn(page);
            await page.waitForFunction(
              (id) => document.activeElement?.id === `registration-${id}`,
              selectedRegistration,
            );
            assert.equal(
              await page.getByLabel(copy.filters.search, { exact: true }).inputValue(),
              "Offline",
            );
            assert.equal(reads.filter((r) => r.path === "/api/admin/me").length, 1);
            const lastList = reads.filter((r) => r.body?.action === "list").at(-1).body;
            assert.equal(lastList.filter.from, targetDate);
            assert.equal(lastList.filter.until, targetDate);
            assert.equal(lastList.filter.template, "morning");
            assert.equal(lastList.filter.status, "published");
            assert.equal(lastList.page, 2);
            await page.screenshot({ path: resolve(out, name + "-returned.png"), fullPage: true });
            await page.reload();
            await assertReturn(page);
            await page.getByRole("link", { name: /Offline volunteer 26/ }).click();
            await page
              .getByRole("heading", { name: "Offline volunteer 26", exact: true })
              .waitFor();
            await page.goBack();
            await assertReturn(page);
            await page.waitForFunction(
              (id) => document.activeElement?.id === `registration-${id}`,
              selectedRegistration,
            );
          },
        );
      }
      for (const scenario of ["missing", "failure", "forbidden", "expired", "loading"]) {
        await runCase(
          `recover-${scenario}-${language}-${width}`,
          "staff",
          language,
          width,
          scenario,
          async (page, _reads, name) => {
            await ready(page, detailUrl);
            const back = page.getByRole("link", { name: backLabel, exact: true });
            await back.waitFor();
            assert.equal(
              await page.getByRole("heading", { name: "Offline volunteer 26" }).count(),
              0,
            );
            assert.ok(
              !(await page.locator("body").innerText()).includes("volunteer26@example.invalid"),
            );
            assert.ok((await back.boundingBox()).height >= 44);
            if (scenario !== "loading") await page.getByRole("alert").waitFor();
            if (scenario === "missing")
              await page
                .getByText(volunteerRegistrationCopy[language].detail.notFound, { exact: true })
                .waitFor();
            await page.screenshot({ path: resolve(out, name + ".png"), fullPage: true });
            await back.focus();
            await page.keyboard.press("Enter");
            await assertReturn(page);
          },
        );
      }
      for (const scenario of ["empty", "list-failure"]) {
        await runCase(
          `${scenario}-${language}-${width}`,
          "admin",
          language,
          width,
          scenario,
          async (page) => {
            await ready(page, initial);
            if (scenario === "empty")
              await page.getByText(copy.list.noMatch, { exact: true }).waitFor();
            else {
              await page.getByRole("alert").waitFor();
              await page.getByText(copy.list.unavailable, { exact: true }).waitFor();
              assert.equal(await page.getByText(copy.list.empty, { exact: true }).count(), 0);
              assert.equal(await page.getByText(copy.list.noMatch, { exact: true }).count(), 0);
              assert.ok((await page.locator("body").innerText()).includes(copy.list.heading(null)));
            }
          },
        );
      }
      await runCase(
        `denied-role-${language}-${width}`,
        "treasurer",
        language,
        width,
        "normal",
        async (page, reads) => {
          await ready(page, initial);
          await page.waitForURL((url) => url.pathname === "/admin/access-denied");
          assert.equal(reads.length, 1);
          assert.equal(reads[0].path, "/api/admin/me");
          assert.ok(!(await page.locator("body").innerText()).includes("Offline volunteer"));
        },
      );
      await runCase(
        `invalid-filter-${language}-${width}`,
        "staff",
        language,
        width,
        "normal",
        async (page, reads) => {
          await ready(
            page,
            "/admin/volunteers/activities?date_scope=custom&from=2026-02-30&until=2026-10-20&status=invalid&page=-2",
          );
          await page.getByRole("button", { name: "Offline morning 01", exact: true }).waitFor();
          assert.equal(
            await page.getByLabel(copy.filters.from, { exact: true }).inputValue(),
            targetDate,
          );
          assert.equal(
            await page.getByLabel(copy.filters.until, { exact: true }).inputValue(),
            "2026-11-19",
          );
          const latest = reads.filter((r) => r.body?.action === "list").at(-1).body;
          assert.equal(latest.page, 1);
          assert.equal(latest.filter.from, targetDate);
          assert.equal(latest.filter.until, "2026-11-19");
          assert.equal(latest.filter.status, undefined);
        },
      );
      await runCase(
        `direct-entry-${language}-${width}`,
        "staff",
        language,
        width,
        "missing",
        async (page) => {
          await ready(
            page,
            `/admin/volunteers/registrations/${selectedRegistration}?return_from=https://outside.invalid&return_url=//outside.invalid&q=private@example.invalid`,
          );
          const back = page.getByRole("link", { name: backLabel, exact: true });
          await back.waitFor();
          assert.equal(await back.getAttribute("href"), "/admin/volunteers/activities");
          await back.click();
          await page.waitForURL((url) => url.pathname === "/admin/volunteers/activities");
          assert.equal(new URL(page.url()).searchParams.has("q"), false);
        },
      );
      for (const scenario of ["list-loading", "empty-then-pending"]) {
        await runCase(
          `${scenario}-${language}-${width}`,
          "staff",
          language,
          width,
          scenario,
          async (page, _reads, name) => {
            await ready(page, initial);
            if (scenario === "empty-then-pending") {
              await page.getByText(copy.list.noMatch, { exact: true }).waitFor();
              const next = page.waitForRequest(
                (request) => request.postDataJSON()?.filter?.q === "Offline",
              );
              await page.getByLabel(copy.filters.search, { exact: true }).fill("Offline");
              await next;
            }
            await page.getByText(copy.list.loading, { exact: true }).waitFor();
            await page
              .getByRole("heading", { name: copy.list.heading(null), exact: true })
              .waitFor();
            assert.equal(
              await page.getByRole("heading", { name: copy.list.heading(0), exact: true }).count(),
              0,
            );
            assert.equal(await page.getByText(copy.list.empty, { exact: true }).count(), 0);
            assert.equal(await page.getByText(copy.list.noMatch, { exact: true }).count(), 0);
            await page.screenshot({ path: resolve(out, name + ".png"), fullPage: true });
          },
        );
      }
    }
  }
  if (phase === "candidate" && !onlyCase) {
    const searchLabel = activityWorkspaceCopy.zh.filters.search;
    await runCase("ime-debounce-zh-390", "staff", "zh", 390, "normal", async (page, reads) => {
      await ready(page, initial);
      await page.getByRole("button", { name: "Offline morning 26", exact: true }).waitFor();
      const input = page.getByLabel(searchLabel, { exact: true });
      const before = reads.filter((r) => r.body?.action === "list").length;
      await input.dispatchEvent("compositionstart");
      await input.fill("離線");
      await sleep(350);
      assert.equal(reads.filter((r) => r.body?.action === "list").length, before);
      await input.fill("Offline");
      const completed = page.waitForResponse(
        (r) => r.request().postDataJSON()?.filter?.q === "Offline",
      );
      await input.dispatchEvent("compositionend", { data: "Offline" });
      await completed;
      assert.equal(reads.filter((r) => r.body?.filter?.q === "Offline").length, 1);
      const cleared = page.waitForResponse((r) => r.request().postDataJSON()?.filter?.q === "");
      await input.fill("");
      await cleared;
      assert.equal(new URL(page.url()).searchParams.has("q"), false);
    });
    await runCase("cancel-stale-read-zh-390", "staff", "zh", 390, "race", async (page, reads) => {
      await ready(page, initial);
      await page.getByRole("button", { name: "Offline morning 26", exact: true }).waitFor();
      const input = page.getByLabel(searchLabel, { exact: true });
      const slow = page.waitForRequest((r) => r.postDataJSON()?.filter?.q === "SLOW");
      await input.fill("SLOW");
      await slow;
      const cancelled = page.waitForEvent("requestfailed", {
        predicate: (request) =>
          request.postDataJSON()?.filter?.q === "SLOW" &&
          /ERR_ABORTED/.test(request.failure()?.errorText ?? ""),
      });
      const latest = page.waitForResponse(
        (r) => r.request().postDataJSON()?.filter?.q === "Offline",
      );
      await input.fill("Offline");
      await latest;
      await cancelled;
      await page.getByRole("button", { name: "Offline morning 01", exact: true }).waitFor();
      assert.equal(await input.inputValue(), "Offline");
      assert.equal(reads.filter((r) => r.body?.filter?.q === "SLOW").length, 1);
      assert.equal(reads.filter((r) => r.body?.filter?.q === "Offline").length, 1);
      assert.equal(new URL(page.url()).searchParams.has("q"), false);
    });
  }
} finally {
  await browser.close();
  summary();
}
console.log(
  JSON.stringify({
    phase,
    head,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    out,
  }),
);
assert.equal(results.length, onlyCase ? 1 : phase === "baseline" ? 4 : 58);
process.exitCode = results.length > 0 && results.every((r) => r.passed) ? 0 : 1;
