import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("Explicit isolated fixture flag required");
const origin = "http://127.0.0.1:56330";
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
if (local.API_URL !== "http://127.0.0.1:56321")
  throw new Error("Only dedicated local Supabase is allowed");
const adminClient = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const output = ".local-policy-test/browser";
await mkdir(output, { recursive: true });
const marker = `browser-${crypto.randomUUID()}`;
const report = { marker, origin, checks: [], consoleErrors: [] };
const actors = {};
async function actor(key, role) {
  const password = crypto.randomUUID() + "Aa1!";
  const email = `${marker}-${key}@example.invalid`;
  const created = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  if (role) {
    const inserted = await adminClient.from("admin_user").insert({
      auth_user_id: id,
      email,
      role,
      status: key === "inactive" ? "disabled" : "active",
    });
    if (inserted.error) throw inserted.error;
  }
  const auth = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await auth.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  actors[key] = { id, session: login.data.session };
  return actors[key];
}
let browser;
try {
  let validStored = false;
  try {
    Object.assign(actors, JSON.parse(await readFile(`${output}/synthetic-auth.json`, "utf8")));
    const checked = await adminClient.auth.getUser(actors.admin.session.access_token);
    validStored = !checked.error;
  } catch {
    /* A fresh isolated stack needs new synthetic identities. */
  }
  if (!validStored) {
    await actor("admin", "admin");
    await actor("staff", "staff");
    await actor("treasurer", "treasurer");
    await actor("inactive", "admin");
    for (let n = 1; n <= 7; n++) {
      const user = await actor(`volunteer${n}`);
      const claim = await adminClient.rpc("volunteer_profile_command", {
        p_actor: user.id,
        p_command: {
          action: "claim",
          display_name: `Synthetic volunteer ${n}`,
          birth_date: "1990-01-01",
        },
      });
      if (claim.error) throw claim.error;
      const verify = await adminClient.rpc("volunteer_profile_command", {
        p_actor: actors.admin.id,
        p_command: {
          action: "verify",
          profile_id: claim.data.profile_id,
          expected_revision: claim.data.revision,
          tier: "regular",
          reason: "Isolated browser acceptance fixture",
        },
      });
      if (verify.error) throw verify.error;
    }
    await writeFile(`${output}/synthetic-auth.json`, JSON.stringify(actors));
  }
  console.log("Local synthetic role sessions ready");
  for (const key of ["staff", "treasurer", "inactive"]) {
    const denied = await fetch(`${origin}/api/admin/volunteers/settings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${actors[key].session.access_token}`,
      },
      body: JSON.stringify({ action: "list" }),
    });
    assert.equal(denied.status, 403);
  }
  const staffList = await fetch(`${origin}/api/admin/volunteers/registrations`, {
    headers: { Authorization: `Bearer ${actors.staff.session.access_token}` },
  });
  assert.equal(staffList.status, 200);
  report.checks.push(
    "Real staff/treasurer/inactive sessions cannot administer policy; staff registration list remains available",
  );
  browser = await chromium.launch({ headless: true });
  console.log("Browser launched");
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(
    ({ session }) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    { session: actors.admin.session },
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => report.consoleErrors.push(error.message));
  await page.goto(`${origin}/admin/volunteers/settings`, { waitUntil: "networkidle" });
  console.log("Settings navigation complete");
  await page
    .getByRole("heading", { name: "義工政策設定", exact: true })
    .waitFor({ timeout: 30000 });
  await page.getByRole("combobox").first().selectOption("cat-afternoon-chores");
  const date = (offset) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const existing = await adminClient
    .from("volunteer_activity")
    .select("starts_at")
    .eq("template_key", "cat-afternoon-chores");
  if (existing.error) throw existing.error;
  const occupied = new Set(existing.data.map((row) => row.starts_at.slice(0, 10)));
  let offset = 2;
  while (occupied.has(date(offset)) || occupied.has(date(offset + 1))) offset++;
  const firstDate = date(offset),
    secondDate = date(offset + 1),
    endDate = date(offset + 2);
  async function publish(capacity, from, until) {
    console.log("Starting browser publication", capacity);
    await page.getByLabel("名稱", { exact: true }).fill(`${marker} afternoon`);
    await page.getByRole("spinbutton").first().fill(String(capacity));
    await page.getByLabel("自動批准", { exact: true }).check();
    const save = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/volunteers/settings") &&
        response.request().postDataJSON()?.action === "save",
    );
    await page.getByRole("button", { name: "儲存草稿", exact: true }).click();
    assert.equal((await save).status(), 200);
    await page.getByLabel("生效日期", { exact: true }).fill(from);
    await page.getByLabel("結束日期", { exact: true }).fill(until);
    await page
      .getByLabel("發布原因", { exact: true })
      .fill(`Synthetic browser capacity ${capacity}`);
    const pre = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/volunteers/settings") &&
        response.request().postDataJSON()?.action === "preview",
    );
    await page.getByRole("button", { name: "建立預覽", exact: true }).click();
    const preview = await (await pre).json();
    assert.ok(preview.preview_id);
    assert.deepEqual(preview.issues, []);
    const published = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/volunteers/settings") &&
        response.request().postDataJSON()?.action === "publish",
    );
    await page.getByRole("button", { name: "發布政策", exact: true }).click();
    assert.equal((await published).status(), 200);
    const generation = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/volunteers/settings") &&
        response.request().postDataJSON()?.action === "generate",
    );
    await page.locator('input[type="date"]').last().fill(from);
    await page.getByRole("button", { name: "建立當日活動", exact: true }).click();
    const generated = await (await generation).json();
    assert.equal(generated.kind, "generated");
    await page.screenshot({ path: `${output}/settings-${capacity}.png`, fullPage: true });
    return generated;
  }
  const old = await publish(5, firstDate, secondDate);
  const revised = await publish(6, secondDate, endDate);
  report.checks.push("Browser saved, previewed, published and generated capacity5 then6");
  const oldRead = await adminClient
    .from("volunteer_activity")
    .select("id,capacity,policy_version_id")
    .eq("template_key", "cat-afternoon-chores")
    .gte("starts_at", firstDate + "T00:00:00+08:00")
    .lt("starts_at", secondDate + "T00:00:00+08:00");
  if (oldRead.error) throw oldRead.error;
  const oldActivity = oldRead.data[0];
  const newRead = await adminClient
    .from("volunteer_activity")
    .select("id,capacity,policy_version_id")
    .eq("template_key", "cat-afternoon-chores")
    .gte("starts_at", secondDate + "T00:00:00+08:00")
    .lt("starts_at", endDate + "T00:00:00+08:00");
  if (newRead.error) throw newRead.error;
  const newActivity = newRead.data[0];
  assert.equal(oldActivity.capacity, 5);
  assert.equal(newActivity.capacity, 6);
  assert.notEqual(oldActivity.policy_version_id, newActivity.policy_version_id);
  const terms = await (await fetch(`${origin}/api/volunteer/policy?view=terms`)).json();
  for (let n = 1; n <= 7; n++) {
    const response = await fetch(`${origin}/api/volunteer/policy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${actors[`volunteer${n}`].session.access_token}`,
      },
      body: JSON.stringify({
        command: {
          action: "book",
          activity_id: newActivity.id,
          role: "volunteer",
          remarks: "Synthetic acceptance",
          accept_terms: true,
          terms_version_id: terms.terms[0].id,
          idempotency_key: crypto.randomUUID(),
        },
      }),
    });
    const result = await response.json();
    if (n <= 6) {
      assert.equal(response.status, 200);
      assert.equal(result.status, "approved");
    } else {
      assert.equal(response.status, 409);
      assert.equal(result.reason, "capacity_full");
    }
  }
  report.checks.push(
    "Real API accepted six verified volunteers and rejected seventh; old session remains5",
  );
  report.activities = { old: oldActivity.id, current: newActivity.id };
  report.generations = { old, revised };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  const volunteerContext = await browser.newContext();
  await volunteerContext.addInitScript(
    ({ session }) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    { session: actors.volunteer1.session },
  );
  const volunteerPage = await volunteerContext.newPage();
  await volunteerPage.goto(`${origin}/volunteer`, { waitUntil: "networkidle" });
  await volunteerPage
    .getByRole("region", { name: "已核實義工場次" })
    .getByRole("combobox")
    .first()
    .selectOption(newActivity.id);
  await volunteerPage.getByText("我已閱讀並同意以上義工條款", { exact: true }).waitFor();
  assert.equal(
    await volunteerPage.getByRole("checkbox", { name: "我已閱讀並同意以上義工條款" }).isChecked(),
    false,
  );
  await volunteerPage.screenshot({ path: `${output}/signup.png`, fullPage: true });
  report.checks.push("Verified volunteer UI displays session, own booking and unchecked terms");
  await page.goto(`${origin}/admin/volunteers/calendar`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "義工營運月曆", exact: true }).waitFor();
  await page.getByLabel("顯示日期").fill(secondDate);
  for (const view of ["月", "週", "日", "列表"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await page.getByText("6/6 義工 · 候補 0", { exact: true }).first().waitFor();
  }
  report.checks.push("Calendar month/week/day/list all show the real6/6 roster");
  report.viewportChecks = [];
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({ path: `${output}/calendar-${width}.png`, fullPage: true });
    report.viewportChecks.push({
      width,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    });
  }
  const evidence = "docs/evidence/admin-volunteer-settings/browser";
  await mkdir(evidence, { recursive: true });
  for (const name of [
    "settings-5.png",
    "settings-6.png",
    "signup.png",
    "calendar-390.png",
    "calendar-768.png",
    "calendar-1440.png",
  ])
    await copyFile(`${output}/${name}`, `${evidence}/${name}`);
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2));
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      checks: report.checks,
      activities: report.activities,
      consoleErrors: report.consoleErrors,
    }),
  );
} catch (error) {
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify(
      { message: error instanceof Error ? error.message : String(error), checks: report.checks },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser?.close();
}
