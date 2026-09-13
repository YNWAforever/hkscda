import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("Explicit isolated fixture flag required");
const origin = "http://127.0.0.1:56330";
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
if (local.API_URL !== "http://127.0.0.1:56321") throw new Error("Dedicated local Supabase only");
const actors = JSON.parse(await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"));
const client = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `claim-${crypto.randomUUID()}@example.invalid`,
  password = crypto.randomUUID() + "Aa1!";
const created = await client.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw created.error;
const auth = createClient(local.API_URL, local.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const login = await auth.auth.signInWithPassword({ email, password });
if (login.error) throw login.error;
const browser = await chromium.launch();
const output = "docs/evidence/admin-volunteer-settings/browser";
try {
  const context = await browser.newContext();
  await context.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    login.data.session,
  );
  const page = await context.newPage();
  await page.goto(`${origin}/volunteer`, { waitUntil: "networkidle" });
  const signup = page.getByRole("region", { name: "已核實義工場次" });
  await signup.getByLabel("姓名", { exact: true }).fill("Synthetic browser claimant");
  await signup.getByLabel("出生日期", { exact: true }).fill("1992-01-01");
  const claimResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/volunteer/policy") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.command?.action === "claim",
  );
  await signup.getByRole("button", { name: "提交核實", exact: true }).click();
  const claim = await (await claimResponse).json();
  assert.equal(claim.status, "pending");
  await signup.getByText("等待職員核實或處理，暫未能報名。", { exact: false }).waitFor();
  await page.screenshot({ path: `${output}/claim-pending.png`, fullPage: true });
  const staffContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await staffContext.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    actors.staff.session,
  );
  const staffPage = await staffContext.newPage();
  await staffPage.goto(`${origin}/admin/volunteers/qualifications`, { waitUntil: "networkidle" });
  await staffPage.getByRole("combobox").first().selectOption(claim.profile_id);
  await staffPage.getByRole("combobox").nth(1).selectOption("regular");
  await staffPage
    .getByLabel("核實／更正理由與證據來源")
    .fill("Synthetic local staff verification evidence");
  const verifyResponse = staffPage.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/volunteers/qualifications") &&
      response.request().postDataJSON()?.action === "verify",
  );
  await staffPage.getByRole("button", { name: "確認身份及級別", exact: true }).click();
  const verified = await (await verifyResponse).json();
  assert.equal(verified.status, "active");
  await staffPage.screenshot({ path: `${output}/claim-staff-verification.png`, fullPage: true });
  await signup.getByRole("button", { name: "重新確認身份及報名", exact: true }).click();
  await signup
    .getByText("Synthetic browser claimant · 恆常 · 身份已核實", { exact: true })
    .waitFor();
  await page.screenshot({ path: `${output}/claim-active.png`, fullPage: true });
  const report = {
    origin,
    profileId: claim.profile_id,
    checks: [
      "Public UI self-claim creates pending profile",
      "Real staff UI verifies profile with reason and reviewed revision",
      "Same public user refreshes to active regular profile",
    ],
    notificationsSent: false,
  };
  await writeFile(`${output}/claim-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
