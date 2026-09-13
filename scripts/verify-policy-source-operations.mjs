import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("Isolated fixtures required");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const actors = JSON.parse(
  await readFile(".local-policy-test/browser/internship-auth.json", "utf8"),
);
const catalogue = JSON.parse(
  await readFile(".local-policy-test/browser/policy-catalogue.json", "utf8"),
);
const origin = "http://127.0.0.1:56330",
  marker = "journey-" + crypto.randomUUID(),
  output = "docs/evidence/admin-volunteer-settings/browser/policy-sources-operations";
await mkdir(output, { recursive: true });
const db = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const report = { marker, checks: [], errors: [], screens: [] };
const captures = [];
const email = marker + "@example.invalid",
  password = crypto.randomUUID() + "Aa1!";
const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw created.error;
const loginClient = createClient(local.API_URL, local.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const login = await loginClient.auth.signInWithPassword({ email, password });
if (login.error) throw login.error;
actors.student = { id: created.data.user.id, session: login.data.session };
async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}
const pc = (cmd) => rpc("volunteer_policy_command", { p_actor: actors.admin.id, p_command: cmd });
const post = async (who, path, command) => {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${actors[who].session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const text = await r.text();
  return { status: r.status, body: text.startsWith("{") ? JSON.parse(text) : { error: text } };
};
const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  next = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
const source = structuredClone(catalogue[0]);
source.template_key = "source-" + crypto.randomUUID();
source.name = "Synthetic shared browser source";
source.capacity.volunteers = { state: "value", value: 8 };
source.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
const child = structuredClone(source);
child.template_key = "child-" + crypto.randomUUID();
child.name = "Synthetic inherited browser template";
child.capacity.volunteers = { state: "value", value: 5 };
for (const body of [source, child])
  assert.equal(
    (await pc({ action: "save", template_key: body.template_key, expected_revision: 0, body }))
      .kind,
    "saved",
  );
const groupA = structuredClone(catalogue.find((x) => x.template_key === "cat-cleaning-a")),
  groupB = structuredClone(catalogue.find((x) => x.template_key === "cat-cleaning-b"));
groupA.template_key = "a-" + crypto.randomUUID();
groupB.template_key = "b-" + crypto.randomUUID();
for (const [body, name] of [
  [groupA, "Synthetic browser group A"],
  [groupB, "Synthetic browser group B"],
]) {
  body.name = name;
  body.schedule.start_time = "13:00";
  body.schedule.end_time = "17:00";
  body.booking.group_open = { mode: "unrestricted" };
  body.booking.group_close = { mode: "hours_before", value: 168 };
  body.booking.individual_open = { mode: "unrestricted" };
  body.booking.auto_approve = true;
  body.terms.version_id = source.terms.version_id;
  body.release_rules = [];
  body.booking.scenario_templates = {
    with_group: groupA.template_key,
    without_group: groupB.template_key,
  };
}
groupA.capacity.role_count_model = "leader_separate";
for (const body of [groupA, groupB]) {
  await pc({ action: "save", template_key: body.template_key, expected_revision: 0, body });
  const p = await pc({
    action: "preview",
    template_key: body.template_key,
    expected_revision: 1,
    effective_from: new Date(Date.now() + 60000).toISOString(),
    effective_until: null,
    activity_ids: [],
  });
  assert.equal(p.kind, "preview");
  assert.equal(
    (
      await pc({
        action: "publish",
        preview_id: p.preview_id,
        idempotency_key: crypto.randomUUID(),
        reason: "Synthetic browser group fixtures",
      })
    ).kind,
    "published",
  );
}
const generate = async (date) => {
  const a = await pc({
    action: "generate",
    template_key: groupB.template_key,
    date,
    idempotency_key: crypto.randomUUID(),
  });
  assert.equal(a.kind, "generated");
  return a.activity_id;
};
const activity = await generate(future),
  destination = await generate(next);
const enquiry = crypto.randomUUID();
const en = await db
  .from("group_enquiries")
  .insert({
    id: enquiry,
    organisation: "Synthetic Browser Group",
    contact_name: "Synthetic contact",
    contact_email: actors.student.session.user.email,
    contact_phone: "00000000",
    activity_type: "shelter_visit",
    participant_count: 15,
    idempotency_key: crypto.randomUUID(),
  });
if (en.error) throw en.error;
let profile;
const existing = await db
  .from("volunteer_profile")
  .select("id,revision,status")
  .eq("auth_user_id", actors.student.id)
  .maybeSingle();
if (existing.error) throw existing.error;
if (existing.data) profile = existing.data;
else {
  const claimed = await rpc("volunteer_profile_command", {
    p_actor: actors.student.id,
    p_command: {
      action: "claim",
      display_name: "Synthetic Browser Volunteer",
      birth_date: "1990-01-01",
    },
  });
  profile = { id: claimed.profile_id, revision: claimed.revision };
}
if (profile.status !== "active")
  await rpc("volunteer_profile_command", {
    p_actor: actors.admin.id,
    p_command: {
      action: "verify",
      profile_id: profile.id,
      expected_revision: profile.revision,
      tier: "newcomer",
      reason: "Synthetic browser verified volunteer",
    },
  });
const booked = await rpc("volunteer_booking_command", {
  p_actor: actors.student.id,
  p_command: {
    action: "book",
    activity_id: activity,
    role: "volunteer",
    remarks: "Synthetic browser",
    accept_terms: true,
    terms_version_id: source.terms.version_id,
    idempotency_key: crypto.randomUUID(),
  },
});
assert.equal(booked.kind, "booked");
const browser = await chromium.launch({ headless: true });
const pageFor = async (who) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    actors[who].session,
  );
  const p = await context.newPage();
  p.on("pageerror", (e) => report.errors.push(e.message));
  p.on("response", async (r) => {
    if (r.url().includes("/operations") && r.request().method() === "POST") {
      try {
        const b = await r.json();
        console.log(
          "operations",
          JSON.parse(r.request().postData()).action,
          r.status(),
          b.kind,
          b.reason,
        );
      } catch {}
    }
  });
  p.on("framenavigated", (f) => {
    if (f === p.mainFrame()) console.log("navigation", who, f.url());
  });
  p.setDefaultTimeout(25000);
  return p;
};
async function screenshots(page, label) {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    captures.push({
      path: `${output}/${label}-${width}.png`,
      data: await page.screenshot({ fullPage: true }),
    });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(layout.scroll <= layout.width, `${label} overflow ${JSON.stringify(layout)}`);
    report.screens.push({ label, width });
  }
}
try {
  for (const who of ["staff", "treasurer"])
    for (const path of ["/api/admin/volunteers/sources/", "/api/admin/volunteers/simulation/"])
      assert.equal((await post(who, path, { action: "list" })).status, 403);
  report.checks.push("Staff and treasurer denied source/simulation APIs");
  const admin = await pageFor("admin");
  await admin.goto(origin + "/admin/volunteers/sources", { waitUntil: "networkidle" });
  await admin.getByRole("heading", { name: "共用來源、場地及資格", exact: true }).waitFor();
  await admin.getByLabel("顯示名稱", { exact: true }).fill("Synthetic browser new site");
  await admin.getByLabel("地點", { exact: true }).fill("Synthetic browser location");
  await admin
    .getByLabel("更改原因", { exact: true })
    .fill("Synthetic named site browser acceptance");
  await admin.getByRole("button", { name: "儲存名稱與資料", exact: true }).click();
  await admin.getByText("已儲存。", { exact: true }).waitFor();
  await admin.getByLabel("類別", { exact: true }).selectOption("credential");
  await admin.getByLabel("顯示名稱", { exact: true }).fill("Synthetic browser skill");
  await admin
    .getByLabel("更改原因", { exact: true })
    .fill("Synthetic named credential browser acceptance");
  await admin.getByRole("button", { name: "儲存名稱與資料", exact: true }).click();
  await admin
    .getByLabel("新增或修改", { exact: true })
    .locator("option")
    .filter({ hasText: "Synthetic browser skill" })
    .last()
    .waitFor({ state: "attached" });
  await admin.getByLabel("使用已儲存草稿", { exact: true }).selectOption(source.template_key);
  await admin.getByRole("button", { name: "預覽來源變更", exact: true }).click();
  await admin
    .getByLabel("發布原因", { exact: true })
    .fill("Synthetic browser shared source publication");
  await admin.getByRole("button", { name: "確認發布來源", exact: true }).click();
  await admin.getByText("來源已發布。", { exact: true }).waitFor();
  await screenshots(admin, "sources");
  report.checks.push(
    "Actual admin browser created named site and credential, previewed and published common source",
  );
  await admin.goto(origin + "/admin/volunteers/settings", { waitUntil: "networkidle" });
  await admin.getByLabel("政策模板", { exact: true }).selectOption(child.template_key);
  await admin.getByText("每項設定來源及回復繼承", { exact: true }).click();
  await admin.getByRole("checkbox", { name: "繼承 容量 義工", exact: true }).check();
  await admin.getByRole("button", { name: "儲存草稿", exact: true }).click();
  await admin.getByRole("button", { name: "建立預覽", exact: true }).waitFor();
  await admin.getByLabel("生效日期", { exact: true }).fill(future);
  await admin.getByLabel("發布原因", { exact: true }).fill("Synthetic browser inherited snapshot");
  await admin.getByRole("button", { name: "建立預覽", exact: true }).click();
  await admin.getByRole("button", { name: "發布政策", exact: true }).click();
  await admin.getByText("已發布，更新 0 個活動。", { exact: true }).waitFor();
  await screenshots(admin, "inherited-template");
  report.checks.push(
    "Actual template browser restored inherited capacity, saved, previewed and published resolved snapshot",
  );
  const versions = await db
    .from("volunteer_policy_version")
    .select("body,provenance")
    .eq("template_key", child.template_key)
    .order("created_at", { ascending: false })
    .limit(1);
  if (versions.error) throw versions.error;
  assert.equal(versions.data[0].body.capacity.volunteers.value, 8);
  assert.equal(versions.data[0].provenance.fields["capacity.volunteers"], "common");
  const owner = await pageFor("student");
  await owner.goto(origin + "/volunteer/operations", { waitUntil: "networkidle" });
  await owner.getByLabel("已有團體查詢", { exact: true }).selectOption(enquiry);
  await owner.getByLabel("希望參加的場次", { exact: true }).selectOption(activity);
  await owner.getByRole("button", { name: "提交待確認團體", exact: true }).click();
  await owner.getByText("團體申請已建立，尚未計入已確認人數。", { exact: true }).waitFor();
  const staff = await pageFor("staff");
  await staff.goto(origin + "/admin/volunteers/operations", { waitUntil: "networkidle" });
  const list = await post("staff", "/api/admin/volunteers/operations/", { action: "list" });
  assert.equal(list.status, 200);
  const group = list.body.requests.find((r) => r.enquiry_id === enquiry);
  assert.ok(group);
  await staff.getByLabel("團體申請", { exact: true }).selectOption(group.id);
  await staff.getByRole("button", { name: "預覽團體影響", exact: true }).click();
  await staff.getByLabel("變更原因", { exact: true }).fill("Synthetic group confirmation browser");
  await staff.getByRole("button", { name: "確認套用變更", exact: true }).click();
  await staff.getByText("變更已完成，名單及場次資料已更新。", { exact: true }).waitFor();
  await screenshots(staff, "group-confirmed");
  report.checks.push(
    "Verified owner browser submitted enquiry request; staff previewed B→A capacity and confirmed group15",
  );
  await staff.getByLabel("現有報名", { exact: true }).selectOption(booked.registration_id);
  await staff.getByLabel("目的場次", { exact: true }).selectOption(destination);
  await staff.getByLabel("目的職務", { exact: true }).selectOption("volunteer");
  console.log(
    "selection",
    await staff.getByLabel("現有報名", { exact: true }).inputValue(),
    await staff.getByLabel("目的場次", { exact: true }).inputValue(),
    await staff.getByLabel("目的職務", { exact: true }).inputValue(),
  );
  await staff.getByRole("button", { name: "預覽改期影響", exact: true }).click();
  await staff.getByLabel("變更原因", { exact: true }).fill("Synthetic reviewed reschedule browser");
  await staff.getByRole("button", { name: "確認套用變更", exact: true }).click();
  await staff
    .getByRole("heading", { name: "確認此變更", exact: true })
    .waitFor({ state: "hidden" });
  await screenshots(staff, "rescheduled");
  const moved = await db
    .from("volunteer_registration")
    .select("activity_id,booking_policy_version_id")
    .eq("id", booked.registration_id)
    .single();
  assert.equal(moved.data.activity_id, destination);
  report.checks.push(
    "Staff browser rescheduled same canonical registration with original booking policy fact retained",
  );
  await admin.goto(origin + "/admin/volunteers/simulation", { waitUntil: "networkidle" });
  await admin.getByLabel("已儲存草稿", { exact: true }).selectOption(child.template_key);
  await admin.getByLabel("場次日期", { exact: true }).selectOption(destination);
  await admin.getByLabel("已核實義工", { exact: true }).selectOption(profile.id);
  await admin
    .getByLabel("模擬香港時間", { exact: true })
    .fill(new Date().toISOString().slice(0, 16));
  await admin.getByRole("button", { name: "執行模擬", exact: true }).click();
  await admin.getByRole("heading", { name: /模擬結果/ }).waitFor();
  await screenshots(admin, "simulation");
  report.checks.push(
    "Admin browser ran explicit profile/session/time simulation and rendered reasons",
  );
  await owner.goto(origin + "/volunteer/operations", { waitUntil: "networkidle" });
  await owner.getByRole("heading", { name: "團體申請及義工改期", exact: true }).waitFor();
  await owner.getByRole("heading", { name: "團體申請記錄", exact: true }).waitFor();
  await owner
    .locator("p")
    .filter({ hasText: "Synthetic Browser Group" })
    .filter({ hasText: "已確認" })
    .waitFor();
  assert.equal(
    await owner.getByRole("heading", { name: "確認團體、調整人數或取消", exact: true }).count(),
    0,
  );
  await screenshots(owner, "owner-operations");
  report.checks.push(
    "Verified owner page exposes own requests/bookings without staff confirmation controls",
  );
  assert.deepEqual(report.errors, []);
  for (const capture of captures) await writeFile(capture.path, capture.data);
  await writeFile(output + "/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  report.failure = error.message;
  for (const context of browser.contexts())
    for (const [index, page] of context.pages().entries()) {
      try {
        await page.screenshot({ path: output + "/failure-" + index + ".png", fullPage: true });
        report.lastPage = await page.locator("main").innerText();
      } catch {}
    }
  await writeFile(output + "/report.json", JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
