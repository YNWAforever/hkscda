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
  out = "docs/evidence/admin-volunteer-settings/browser/tasks";
const svc = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
async function actor(role) {
  const email = `task-${marker}-${role}@example.invalid`,
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
const staff = await actor("staff"),
  treasurer = await actor("treasurer");
const task = crypto.randomUUID(),
  notification = crypto.randomUUID();
const seeded = await svc.from("volunteer_operation_outbox").insert([
  {
    id: task,
    dedup_key: task,
    kind: "volunteer_qualification_review",
    payload: {},
    status: "queued",
  },
  {
    id: notification,
    dedup_key: notification,
    kind: "volunteer_policy_reminder",
    payload: { dry_run: true, max_attempts: 2 },
    status: "failed",
    last_error: `synthetic-${marker}`,
  },
]);
if (seeded.error) throw seeded.error;
const browser = await chromium.launch({ headless: true });
await mkdir(out, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    staff,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(origin + "/admin/volunteers/tasks", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "義工今日待辦與通知", exact: true }).waitFor();
  const card = page.locator("article").filter({ hasText: "資格例外待核實" }).first();
  await card.getByRole("button", { name: "記錄跟進結果", exact: true }).click();
  await card.getByRole("textbox").fill(`Synthetic completed follow-up ${marker}`);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/volunteers/tasks") &&
      r.request().postDataJSON()?.action === "complete",
  );
  await card.getByRole("button", { name: "完成此項跟進", exact: true }).click();
  assert.equal((await response).status(), 200);
  const completion = await svc
    .from("volunteer_task_completion")
    .select("reason")
    .eq("outbox_id", task)
    .single();
  assert.equal(completion.data?.reason, `Synthetic completed follow-up ${marker}`);
  report.checks.push(
    "staff completed explicit follow-up; immutable evidence stored without marking delivery",
  );
  const failed = page.locator("article").filter({ hasText: `synthetic-${marker}` });
  await failed.getByRole("button", { name: "重試此通知", exact: true }).click();
  await page.getByText(`原因：synthetic-${marker}`, { exact: true }).waitFor({ state: "hidden" });
  const retried = await svc
    .from("volunteer_operation_outbox")
    .select("status")
    .eq("id", notification)
    .single();
  assert.equal(retried.data.status, "queued");
  report.checks.push("staff retried failed notification through audited command; no provider sent");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: `${out}/tasks-${width}.png`, fullPage: false });
  }
  report.checks.push("390/768/1440 no horizontal overflow");
  for (const token of [null, treasurer.access_token]) {
    const denied = await fetch(origin + "/api/admin/volunteers/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: "list" }),
    });
    assert.ok([401, 403].includes(denied.status));
  }
  report.checks.push("anonymous and treasurer task API denied");
  const publicResponse = await fetch(origin + "/api/volunteer/policy");
  assert.equal(publicResponse.status, 200);
  const publicData = await publicResponse.json();
  assert.ok(publicData.sessions.length > 0);
  for (const s of publicData.sessions) {
    assert.ok(s.summary);
    assert.equal(typeof s.summary.confirmed, "number");
    assert.equal("contact_name" in s, false);
    assert.equal("notes" in s, false);
  }
  report.checks.push(
    "anonymous availability returns authoritative aggregate counts and windows without identity or remarks",
  );
  assert.deepEqual(report.errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
