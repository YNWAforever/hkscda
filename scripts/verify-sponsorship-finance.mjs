import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.SPONSORSHIP_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Explicit isolated fixture flag required");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
if (local.API_URL !== "http://127.0.0.1:56321") throw Error("Isolated only");
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const actors = {};
for (const key of ["staff", "treasurer", "inactive"]) {
  const password = crypto.randomUUID() + "Aa1!",
    email = "finance-" + crypto.randomUUID() + "@example.invalid";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  const role = key === "inactive" ? "staff" : key;
  const saved = await admin
    .from("admin_user")
    .insert({ auth_user_id: id, email, role, status: key === "inactive" ? "disabled" : "active" });
  if (saved.error) throw saved.error;
  const auth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
  const login = await auth.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  actors[key] = { id, session: login.data.session };
}
await mkdir(".local-policy-test/browser", { recursive: true });
await writeFile(".local-policy-test/browser/finance-auth.json", JSON.stringify(actors));
const marker = "finance-browser-" + crypto.randomUUID();
const supporter = crypto.randomUUID(),
  pledge = crypto.randomUUID();
for (const [table, row] of [
  [
    "supporter",
    {
      id: supporter,
      name: marker,
      email: marker + "@example.invalid",
      language: "zh-HK",
      source: "manual",
    },
  ],
  [
    "sponsorship_pledge",
    {
      id: pledge,
      supporter_id: supporter,
      monthly_tier: "300",
      amount_cents: 30000,
      language: "zh-HK",
      status: "pending_payment",
    },
  ],
]) {
  const r = await admin.from(table).insert(row);
  if (r.error) throw r.error;
}
const output = "docs/evidence/admin-volunteer-settings/finance-browser";
await mkdir(output, { recursive: true });
const report = { marker, checks: [], pageErrors: [] };
const browser = await chromium.launch({ headless: true });
async function pageFor(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    actors[role].session,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  await page.goto("http://127.0.0.1:56330/admin/sponsorships", { waitUntil: "networkidle" });
  await page.getByText(marker, { exact: true }).first().click();
  return page;
}
async function api(role, path, body) {
  return fetch("http://127.0.0.1:56330/api/admin/sponsorships/pledges/" + pledge + path, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: "Bearer " + actors[role].session.access_token,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
try {
  const staff = await pageFor("staff");
  await staff.locator("#pledge-reference").fill(marker);
  await staff.locator("#pledge-amount").fill("300");
  await staff.locator("#pledge-payment-date").fill(new Date().toISOString().slice(0, 10));
  await staff.getByRole("button", { name: "儲存付款記錄", exact: true }).click();
  await staff.getByText(marker, { exact: true }).last().waitFor();
  await staff.waitForTimeout(700);
  assert.equal(await staff.getByRole("button", { name: "核實通過", exact: true }).count(), 0);
  report.checks.push("staff recorded payment through UI; finance review hidden");
  const proof = (
    await admin
      .from("sponsorship_payment_proof")
      .select("id,revision")
      .eq("pledge_id", pledge)
      .single()
  ).data;
  assert.ok(proof);
  assert.equal(
    (
      await api("staff", "/review", {
        proofId: proof.id,
        expectedRevision: proof.revision,
        idempotencyKey: crypto.randomUUID(),
        decision: "approve",
      })
    ).status,
    403,
  );
  report.checks.push("staff review API denied 403");
  await staff.screenshot({ path: output + "/staff-recorded.png", fullPage: true });
  const treasury = await pageFor("treasurer");
  await treasury.getByRole("button", { name: "核實通過", exact: true }).click();
  await treasury.getByLabel(/^已核實付款/).selectOption(proof.id);
  await treasury.getByLabel("調整原因", { exact: true }).fill("Synthetic verified partial refund");
  await treasury.getByLabel("已完成退款的銀行參考編號", { exact: true }).fill(marker + "-refund");
  await treasury.getByLabel(/^退款金額/).fill("100");
  await treasury.getByRole("button", { name: "記錄已完成退款", exact: true }).click();
  await treasury.getByText(/已退款 HK\$100/).waitFor();
  report.checks.push(
    "treasurer approved exact proof and recorded HK$100 partial refund through UI",
  );
  const source = (
    await admin
      .from("sponsorship_payment_source")
      .select("payment_id")
      .eq("proof_id", proof.id)
      .single()
  ).data;
  const money = (
    await admin
      .from("payment")
      .select("amount_cents,refunded_cents,status")
      .eq("id", source.payment_id)
      .single()
  ).data;
  assert.deepEqual(money, { amount_cents: 30000, refunded_cents: 10000, status: "succeeded" });
  report.checks.push("canonical gross HK$300, refunded HK$100, retained HK$200");
  for (const width of [390, 768, 1440]) {
    await treasury.setViewportSize({ width, height: 1100 });
    await treasury.screenshot({
      path: output + "/treasurer-refund-" + width + ".png",
      fullPage: true,
    });
  }
  assert.equal((await api("inactive", "/finance")).status, 403);
  report.checks.push("inactive finance API denied403");
  assert.deepEqual(report.pageErrors, []);
} catch (error) {
  report.error = error.message;
  for (const ctx of browser.contexts()) {
    for (const page of ctx.pages())
      await writeFile(output + "/last-page.txt", await page.locator("body").innerText());
  }
  throw error;
} finally {
  await writeFile(output + "/report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ checks: report.checks, pageErrors: report.pageErrors }));
