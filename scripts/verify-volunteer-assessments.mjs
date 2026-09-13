import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("Explicit isolated fixtures required");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
if (local.API_URL !== "http://127.0.0.1:56321") throw new Error("Dedicated stack only");
const origin = "http://127.0.0.1:56330",
  marker = crypto.randomUUID(),
  report = { marker, checks: [], errors: [] },
  out = "docs/evidence/admin-volunteer-settings/browser/assessments";
const svc = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
async function actor(role) {
  const email = "assessment-" + marker + "-" + role + "@example.invalid",
    password = crypto.randomUUID() + "Aa1!";
  const created = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const row = await svc
    .from("admin_user")
    .insert({ auth_user_id: created.data.user.id, email, role, status: "active" });
  if (row.error) throw row.error;
  const auth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
  const login = await auth.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return login.data.session;
}
const admin = await actor("admin"),
  staff = await actor("staff");
const browser = await chromium.launch({ headless: true });
await mkdir(out, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    admin,
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(origin + "/admin/volunteers/assessments", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "每月義工級別評核", exact: true }).waitFor();
  await page.getByLabel("晉升評核時點").selectOption("monthly_assessment");
  await page.getByLabel("出席計算").selectOption("once_per_day");
  await page.getByLabel("場地範圍").selectOption("combined");
  await page.getByLabel("資深恆常觀察月數").fill("12");
  await page.getByLabel("香港時間").fill("09:00");
  const dry = page.getByLabel("測試模式（只建立佇列，不會發送）");
  if (!(await dry.isChecked())) await dry.check();
  const email = page.getByLabel(/電郵/);
  if (!(await email.isChecked())) await email.check();
  await page.getByRole("button", { name: "儲存草稿", exact: true }).click();
  await page.getByText("草稿已儲存", { exact: true }).waitFor();
  await page.getByRole("button", { name: "預覽", exact: true }).click();
  await page.getByText("預覽通過，可以發布", { exact: true }).waitFor();
  await page.getByPlaceholder("發布原因").fill("隔離評核介面驗證 " + marker);
  const publish = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/volunteers/assessments/") &&
      r.request().postDataJSON()?.kind === "publish",
  );
  await page.getByRole("button", { name: "發布版本", exact: true }).click();
  assert.equal((await publish).status(), 200);
  await page.getByText("版本已發布", { exact: true }).waitFor();
  const latest = await svc
    .from("volunteer_assessment_policy_version")
    .select("body,reason")
    .eq("reason", "隔離評核介面驗證 " + marker)
    .single();
  if (latest.error) throw latest.error;
  assert.equal(latest.data.body.notifications.dry_run, true);
  assert.deepEqual(latest.data.body.notifications.channels, ["email"]);
  assert.equal(latest.data.body.timezone, "Asia/Hong_Kong");
  report.checks.push(
    "admin browser saved, previewed and published typed monthly assessment policy",
  );
  report.checks.push(
    "published notification remained dry-run email only and timezone Asia/Hong_Kong",
  );
  await page.screenshot({ path: out + "/assessment-published.png", fullPage: true });
  const denied = await fetch(origin + "/api/admin/volunteers/assessments/", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + staff.access_token },
    body: JSON.stringify({ kind: "list" }),
  });
  assert.equal(denied.status, 403);
  report.checks.push("staff browser token denied administrator assessment commands");
  assert.deepEqual(report.errors, []);
  await writeFile(out + "/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
