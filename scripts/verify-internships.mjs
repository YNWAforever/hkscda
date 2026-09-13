import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("Explicit disposable fixtures required");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
if (local.API_URL !== "http://127.0.0.1:56321") throw new Error("Dedicated local stack required");
const origin = "http://127.0.0.1:56330",
  marker = `intern-${crypto.randomUUID()}`;
const db = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const report = { marker, checks: [], errors: [] };
const output = "docs/evidence/admin-volunteer-settings/browser/internships";
await mkdir(output, { recursive: true });
async function actor(role) {
  const email = `${marker}-${role}@example.invalid`,
    password = crypto.randomUUID() + "Aa1!";
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  if (["admin", "staff", "treasurer"].includes(role)) {
    const inserted = await db
      .from("admin_user")
      .insert({ auth_user_id: created.data.user.id, email, role, status: "active" });
    if (inserted.error) throw inserted.error;
  }
  const auth = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await auth.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: created.data.user.id, session: login.data.session };
}
const actors = {
  admin: await actor("admin"),
  staff: await actor("staff"),
  student: await actor("student"),
  other: await actor("other"),
  treasurer: await actor("treasurer"),
};
await mkdir(".local-policy-test/browser", { recursive: true });
await writeFile(".local-policy-test/browser/internship-auth.json", JSON.stringify(actors));
const browser = await chromium.launch({ headless: true });
const pageFor = async (who) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(
    (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    actors[who].session,
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  return page;
};
const post = async (who, path, body) => {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${actors[who].session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.startsWith("{") ? JSON.parse(text) : { error: text },
  };
};
try {
  const admin = await pageFor("admin");
  await admin.goto(origin + "/admin/internships", { waitUntil: "networkidle" });
  await admin.getByText("管理員收生設定與版本", { exact: true }).click();
  await admin.getByLabel("接受新申請", { exact: true }).check();
  await admin
    .getByRole("textbox", { name: "申請指引", exact: true })
    .fill("請提供所屬院校、獸醫課程及在學證明供職員核實。");
  await admin.getByRole("button", { name: "儲存草稿", exact: true }).click();
  await admin.getByText("草稿已儲存，未影響目前申請。", { exact: true }).waitFor();
  await admin.getByRole("button", { name: "預覽發布", exact: true }).click();
  await admin
    .getByRole("textbox", { name: "發布理由", exact: true })
    .fill("Synthetic browser intake acceptance");
  await admin.getByRole("button", { name: "確認發布新版本", exact: true }).click();
  await admin.getByText("新版本已發布；既有申請及核實證據保留。", { exact: true }).waitFor();
  report.checks.push("Actual admin browser saved, previewed and published intake");
  const student = await pageFor("student");
  await student.goto(origin + "/internships", { waitUntil: "networkidle" });
  await student.getByLabel("姓名", { exact: true }).fill("Synthetic Veterinary Student");
  await student.getByLabel("院校", { exact: true }).fill("Synthetic University");
  await student.getByLabel("獸醫課程", { exact: true }).fill("Veterinary Medicine");
  await student.getByRole("checkbox").check();
  await student.getByRole("button", { name: "提交獨立實習申請", exact: true }).click();
  await student.getByText("Synthetic Veterinary Student · 待審核", { exact: true }).waitFor();
  await student
    .locator('input[type="file"]')
    .setInputFiles({
      name: "synthetic-enrolment.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nSynthetic isolated student enrolment fixture\n%%EOF"),
    });
  await student.getByRole("button", { name: "synthetic-enrolment.pdf", exact: true }).waitFor();
  report.checks.push("Verified student submitted and uploaded private evidence through actual UI");
  const list = await post("student", "/api/internships", { action: "mine" });
  assert.equal(list.status, 200);
  const app = list.body.applications[0];
  assert.equal(app.attachments.length, 1);
  const other = await post("other", "/api/internships", { action: "mine" });
  assert.equal(other.body.applications.length, 0);
  const denied = await fetch(origin + `/api/internships/attachment?id=${app.attachments[0].id}`, {
    headers: { authorization: `Bearer ${actors.other.session.access_token}` },
  });
  assert.equal(denied.status, 403);
  const anon = await fetch(
    local.API_URL +
      "/storage/v1/object/public/internship-private/" +
      app.attachments[0].object_path,
  );
  assert.notEqual(anon.status, 200);
  assert.equal((await post("treasurer", "/api/admin/internships", { action: "list" })).status, 403);
  report.checks.push("Other applicant, anonymous storage and treasurer access denied");
  const staff = await pageFor("staff");
  await staff.goto(origin + "/admin/internships", { waitUntil: "networkidle" });
  await staff.getByRole("combobox", { name: "申請人", exact: true }).selectOption(app.id);
  await staff.getByRole("combobox", { name: "處理結果", exact: true }).selectOption("approved");
  assert.equal(
    await staff.getByRole("button", { name: "保存審核決定", exact: true }).isDisabled(),
    true,
  );
  await staff
    .getByRole("textbox", { name: "審核理由", exact: true })
    .fill("Synthetic student eligibility verified");
  await staff.getByRole("checkbox").check();
  await staff
    .getByRole("textbox", { name: "核實證據來源", exact: true })
    .fill("Synthetic enrolment evidence reviewed");
  await staff.getByRole("button", { name: "保存審核決定", exact: true }).click();
  await staff
    .getByRole("heading", { name: "Synthetic Veterinary Student · 已批准", exact: true })
    .waitFor();
  await staff.screenshot({ path: output + "/staff-review.png", fullPage: true });
  report.checks.push("Staff approval required student evidence and preserved review history");
  await student.reload({ waitUntil: "networkidle" });
  await student.getByText("Synthetic Veterinary Student · 已批准", { exact: true }).waitFor();
  for (const width of [390, 768, 1440]) {
    await student.setViewportSize({ width, height: 1000 });
    await student.screenshot({ path: `${output}/student-${width}.png`, fullPage: true });
    assert.equal(
      await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  }
  report.checks.push("Applicant sees approved result; 390/768/1440 no document overflow");
  assert.deepEqual(report.errors, []);
  await writeFile(output + "/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
