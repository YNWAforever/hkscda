import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const origin = "http://127.0.0.1:56336";
const actors = JSON.parse(await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"));
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
async function sessionFor(role) {
  const stored = actors[role];
  const user = await service.auth.admin.getUserById(stored.id);
  assert.ok(user.data.user.email.endsWith("@example.invalid"));
  const auth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
  const link = await service.auth.admin.generateLink({
    type: "magiclink",
    email: user.data.user.email,
  });
  if (link.error) throw link.error;
  const result = await auth.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.data.properties.hashed_token,
  });
  if (result.error) throw result.error;
  return result.data.session;
}
const session = await sessionFor("admin");
const marker = "Synthetic browser bulk " + crypto.randomUUID().slice(0, 8);
const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const report = { origin, marker, checks: [], errors: [], requests: [] };
await mkdir(".local-policy-test/bulk-browser", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Los_Angeles",
  });
  await context.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    session,
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", async (response) => {
    if (response.url().includes("/api/admin/volunteers/bulk"))
      report.requests.push({
        status: response.status(),
        serverTiming: response.headers()["server-timing"] ?? null,
      });
  });
  await page.goto(origin + "/admin/volunteers/activities", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "義工活動工作台" }).waitFor();
  await page.getByLabel("搜尋名稱或地點", { exact: true }).fill(marker);
  await page.getByRole("button", { name: "建立草稿", exact: true }).click();
  await page.getByLabel("活動名稱", { exact: true }).fill(marker);
  await page.getByLabel("地點", { exact: true }).fill("Synthetic local test room");
  await page.getByLabel("開始時間（香港）", { exact: true }).fill(day + "T09:30");
  await page.getByLabel("結束時間（香港）", { exact: true }).fill(day + "T12:30");
  await page.getByLabel("預計人數", { exact: true }).fill("5");
  await page.getByRole("button", { name: "儲存草稿", exact: true }).click();
  await page.getByRole("button", { name: marker, exact: true }).waitFor();
  report.checks.push(
    "audited draft created through real HTTP; Los Angeles device displays Hong Kong09:30",
  );
  assert.ok((await page.getByRole("table").innerText()).includes("09:30"));
  await page.getByRole("checkbox", { name: new RegExp("選取 .*" + marker) }).check();
  await page.getByRole("button", { name: /鎖定已選跨頁項目/ }).click();
  await page.getByText("已鎖定 1 場活動；新增符合條件的活動不會加入。", { exact: true }).waitFor();
  await page.getByLabel("操作", { exact: true }).selectOption("edit");
  await page.getByLabel("新標題", { exact: true }).fill(marker + " revised");
  await page.getByRole("button", { name: "預覽影響", exact: true }).click();
  await page.getByLabel("已檢查本組每個日期及影響").first().waitFor();
  await page.getByLabel("已檢查本組每個日期及影響").first().check();
  await page.getByRole("button", { name: "執行此組", exact: true }).first().click();
  await page.getByRole("button", { name: marker + " revised", exact: true }).waitFor();
  report.checks.push("exact selection and preview/apply edit UI changes real persisted row");
  await page.getByRole("button", { name: marker + " revised", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("heading", { name: "報名及出席（0）" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.ok(page.url().includes("q="));
  report.checks.push("drawer loads detail only and Escape preserves search");
  await page.getByRole("button", { name: "月曆檢視", exact: true }).click();
  await page.getByRole("region", { name: "香港日期月曆" }).waitFor();
  await page.screenshot({
    path: ".local-policy-test/bulk-browser/desktop-calendar.png",
    fullPage: true,
  });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  report.axe = axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  await page.setViewportSize({ width: 390, height: 844 });
  const moreFilters = page.getByRole("button", { name: /更多篩選/ });
  assert.equal(await moreFilters.getAttribute("aria-expanded"), "false");
  assert.equal(await page.getByLabel("收容所", { exact: true }).isVisible(), false);
  await moreFilters.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: /^狀態/ }).selectOption("draft");
  await page.waitForURL(/status=draft/);
  assert.ok((await moreFilters.innerText()).includes("1 項已啟用"));
  await moreFilters.focus();
  await page.keyboard.press("Space");
  assert.equal(await moreFilters.getAttribute("aria-expanded"), "false");
  assert.equal(
    await page.locator("#advanced-activity-filters select").nth(1).inputValue(),
    "draft",
  );
  assert.ok(page.url().includes("status=draft"));
  report.checks.push(
    "mobile advanced filters toggle with Enter/Space, preserve URL/state and show active count",
  );
  await page.screenshot({
    path: ".local-policy-test/bulk-browser/mobile-calendar.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  report.checks.push(
    "mobile calendar has no page overflow; desktop calendar and keyboard drawer checked",
  );
  await page.goto(origin + "/admin/volunteers/calendar", { waitUntil: "networkidle" });
  await page.getByRole("region", { name: "香港日期月曆" }).waitFor();
  report.checks.push("standalone calendar route shares bounded workspace");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const navigationSamples = [],
    filterSamples = [],
    datasetCounts = [];
  for (let sample = 0; sample < 5; sample++) {
    const started = performance.now();
    await page.goto(origin + "/admin/volunteers/activities", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^選取本頁（[1-9]/ }).waitFor();
    navigationSamples.push(performance.now() - started);
    datasetCounts.push(await page.getByRole("heading", { name: /^活動（/ }).innerText());
    const filtering = performance.now();
    await page.getByLabel("搜尋名稱或地點", { exact: true }).fill(marker);
    await page.getByRole("heading", { name: "活動（1）", exact: true }).waitFor();
    await page.getByRole("button", { name: marker + " revised", exact: true }).waitFor();
    filterSamples.push(performance.now() - filtering);
  }
  const summary = (samples) => {
    const sorted = [...samples].sort((a, b) => a - b);
    return { samples_ms: samples, p50_ms: sorted[2], p95_ms: sorted[4] };
  };
  report.browserTimings = {
    environment:
      "local development server; synthetic authenticated admin; desktop 1440x1000; no before/after speedup claim",
    dataset_counts: datasetCounts,
    navigation_to_rendered_nonempty_list: summary(navigationSamples),
    search_change_to_rendered_single_matching_result: summary(filterSamples),
  };

  const deniedSession = await sessionFor("treasurer");
  const denied = await fetch(origin + "/api/admin/volunteers/bulk", {
    method: "POST",
    headers: {
      authorization: "Bearer " + deniedSession.access_token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "list", filter: { sort: "asc" }, page: 1 }),
  });
  assert.equal(denied.status, 403);
  report.checks.push("treasurer real API denied403");
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  await writeFile(".local-policy-test/bulk-browser/report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ checks: report.checks, errors: report.errors, axe: report.axe }));
