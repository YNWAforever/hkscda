import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Local fixture permission required");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const origin = "http://127.0.0.1:56336";
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const prior = JSON.parse(await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"));
const marker = "centre-" + crypto.randomUUID();
const email = marker + "@example.invalid";
const password = crypto.randomUUID() + "Aa1!";
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw created.error;
const auth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
const login = await auth.auth.signInWithPassword({ email, password });
if (login.error) throw login.error;
const session = login.data.session;
const report = { marker, origin, checks: [], errors: [] };
const dir = "docs/evidence/volunteer-member-centre";
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.route("**/auth/v1/otp**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/auth/v1/verify**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }),
  );
  await page.goto(origin + "/volunteer", { waitUntil: "networkidle" });
  await page.getByLabel("電郵地址", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("電郵驗證碼", { exact: true }).count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "送出義工報名", exact: true })
      .isVisible()
      .catch(() => false),
    false,
  );
  await page.screenshot({ path: dir + "/mobile-login.png", fullPage: true });
  await page.getByLabel("電郵地址", { exact: true }).fill(email);
  await page.getByRole("button", { name: "取得登入電郵", exact: true }).click();
  await page.getByLabel("電郵驗證碼", { exact: true }).waitFor();
  assert.ok(await page.getByRole("button", { name: /重新發送/ }).isDisabled());
  await page.getByLabel("電郵驗證碼", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "驗證並登入", exact: true }).click();
  await page.getByLabel("出生日期", { exact: true }).waitFor();
  await page.getByLabel("姓名", { exact: true }).fill("Synthetic member centre");
  await page.getByLabel("出生日期", { exact: true }).fill("1990-01-01");
  await page.getByRole("button", { name: "提交核實", exact: true }).click();
  await page.getByText("資料已收到，待職員核實", { exact: true }).waitFor();
  report.checks.push(
    "Mobile progressive OTP UI (intercepted locally; no email), actual authenticated profile claim and pending verification",
  );
  const profile = await admin
    .from("volunteer_profile")
    .select("id,revision")
    .eq("auth_user_id", created.data.user.id)
    .single();
  if (profile.error) throw profile.error;
  const verified = await admin.rpc("volunteer_profile_command", {
    p_actor: prior.admin.id,
    p_command: {
      action: "verify",
      profile_id: profile.data.id,
      expected_revision: profile.data.revision,
      tier: "regular",
      reason: "Isolated member centre browser fixture",
    },
  });
  if (verified.error) throw verified.error;
  await page.getByRole("button", { name: "查看最新核實狀態", exact: true }).click();
  await page.getByText("恆常義工 · 身份已核實", { exact: true }).waitFor();
  const sessions = (await (await fetch(origin + "/api/volunteer/policy")).json()).sessions;
  let chosen;
  for (const s of sessions) {
    const response = await fetch(origin + "/api/volunteer/policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({
        command: {
          action: "availability",
          activity_id: s.id,
          role: s.policy.roles[0]?.key ?? "volunteer",
        },
      }),
    });
    const result = await response.json();
    if (result.allowed) {
      chosen = s;
      break;
    }
  }
  assert.ok(chosen, "An isolated published eligible session is required");
  await page.getByRole("searchbox", { name: "搜尋場次" }).fill(chosen.title);
  await page.locator(`[data-session-id="${chosen.id}"]`).click();
  await page.getByRole("heading", { name: "確認預約 · " + chosen.title, exact: true }).waitFor();
  const remarks = page.locator(".volunteer-booking-form textarea");
  if (await remarks.count()) await remarks.fill("Synthetic member browser");
  await page.getByRole("checkbox", { name: "我已閱讀並同意以上義工條款" }).check();
  await page.getByRole("button", { name: "確認並提交預約", exact: true }).click();
  await page.getByRole("heading", { name: "我的預約", exact: true }).waitFor();
  await page.locator(".volunteer-record-card").filter({ hasText: chosen.title }).waitFor();
  assert.ok((await page.locator(".volunteer-record-card").innerText()).includes("—"));
  await page.screenshot({ path: dir + "/mobile-booked.png", fullPage: true });
  report.checks.push(
    "Verified member selects a real policy session, accepts terms, books through actual API/DB and sees full activity metadata",
  );
  await page.getByRole("button", { name: "服務紀錄", exact: true }).click();
  await page.getByRole("heading", { name: "我的服務紀錄", exact: true }).waitFor();
  assert.ok(
    (await page.locator(".volunteer-records").innerText()).includes("預約獲批不代表已出席"),
  );
  await page.getByRole("button", { name: /我的預約/ }).click();
  await page.getByRole("button", { name: "取消預約", exact: true }).click();
  await page.getByRole("button", { name: "保留預約", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "確認取消", exact: true }).count(), 0);
  await page.getByRole("button", { name: "取消預約", exact: true }).click();
  await page.getByRole("button", { name: "確認取消", exact: true }).click();
  await page.getByRole("button", { name: "已取消／未獲批准", exact: true }).click();
  await page.locator(".volunteer-record-card").filter({ hasText: "已取消" }).waitFor();
  report.checks.push(
    "Service record distinguishes verified attendance; cancellation requires confirmation and persists via current policy command",
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "預約場次", exact: true }).click();
    await page.getByRole("searchbox", { name: "搜尋場次" }).fill("");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const audit = await new AxeBuilder({ page }).analyze();
    const serious = audit.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    assert.deepEqual(
      serious.map((v) => v.id),
      [],
    );
    report.checks.push(
      `Member centre ${width}px: no horizontal overflow or serious/critical axe violations`,
    );
    await page.screenshot({ path: dir + `/member-${width}.png`, fullPage: true });
  }
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const visitorPage = await visitor.newPage();
  await visitorPage.route("**/api/volunteer/policy", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  await visitorPage.route("**/auth/v1/otp**", (r) =>
    r.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "over_email_send_rate_limit", msg: "local simulated failure" }),
    }),
  );
  await visitorPage.goto(origin + "/volunteer", { waitUntil: "networkidle" });
  await visitorPage.getByText("下一次相遇，值得期待", { exact: true }).waitFor();
  await visitorPage.getByLabel("電郵地址", { exact: true }).fill("failure@example.invalid");
  await visitorPage.getByRole("button", { name: "取得登入電郵", exact: true }).click();
  await visitorPage.getByText("暫時未能發送登入電郵，請稍後再試。", { exact: true }).waitFor();
  assert.equal(await visitorPage.getByLabel("電郵驗證碼", { exact: true }).count(), 0);
  await visitorPage.unroute("**/api/volunteer/policy");
  await visitorPage.route("**/api/volunteer/policy", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await visitorPage.reload({ waitUntil: "networkidle" });
  await visitorPage.getByText("暫時未能載入場次，請稍後再試。", { exact: true }).waitFor();
  assert.equal(await visitorPage.getByText("下一次相遇，值得期待", { exact: true }).count(), 0);
  await visitor.close();
  report.checks.push(
    "Anonymous empty-session onboarding remains available; simulated mail failure never advances to code entry; session service failure is distinct from empty state",
  );
  assert.deepEqual(report.errors, []);
  await writeFile(dir + "/browser.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
