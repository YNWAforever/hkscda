import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Dedicated disposable stack only. This script does not read project/provider env files.
if (process.env.CRM_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("Explicit fixture opt-in required");
const base = "http://127.0.0.1:55430";
const api = "http://127.0.0.1:55321";
const lines = (await readFile("supabase/.temp/completion-local/start.raw.log", "utf8")).split(
  /\r?\n/,
);
let config;
for (let i = lines.length - 1; i >= 0; i--) {
  try {
    config = JSON.parse(lines.slice(i).join("\n"));
    break;
  } catch {
    /* Locate final JSON only. */
  }
}
assert.equal(config?.API_URL, api);
assert.equal(config?.DB_URL, "postgresql://postgres:postgres@127.0.0.1:55322/postgres");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(api, config.SERVICE_ROLE_KEY, options);
const marker = `crm-browser-${crypto.randomUUID()}`;
const email = `${marker}@example.test`;
const output = "docs/evidence/crm-package2/authenticated-browser";
await mkdir(output, { recursive: true });
const users = [];
const checks = [];
const errors = [];
let supporterId;
let browser;
let failure;
function must(result, label) {
  if (result.error)
    throw new Error(`${label}: ${result.error.code ?? result.error.status ?? "failed"}`);
  return result.data;
}
function check(name) {
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function user(role) {
  const login = { email: `${role}-${email}`, password: `Local-${crypto.randomUUID()}!` };
  const id = must(
    await service.auth.admin.createUser({ ...login, email_confirm: true }),
    "Create auth",
  ).user.id;
  users.push(id);
  must(
    await service
      .from("admin_user")
      .insert({ auth_user_id: id, email: login.email, role, status: "active" }),
    "Create role",
  );
  const auth = createClient(api, config.ANON_KEY, options);
  const token = must(await auth.auth.signInWithPassword(login), "Sign in").session.access_token;
  return { ...login, token };
}
async function localTransport(context) {
  assert.equal(base, "http://127.0.0.1:55430");
  await context.grantPermissions(["local-network-access"], { origin: base });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) &&
      !["data:", "blob:"].includes(url.protocol)
    )
      return route.abort();
    if (request.resourceType() !== "document" || url.origin !== base) return route.continue();
    const response = await route.fetch({ maxRedirects: 0 });
    const headers = response.headers();
    const csp = headers["content-security-policy"];
    assert.ok(csp?.includes("connect-src") && csp.includes("img-src"));
    headers["content-security-policy"] = csp.replace(
      /(connect-src|img-src)([^;]*)/g,
      (_, directive, sources) => `${directive}${sources} ${api}`,
    );
    return route.fulfill({ response, headers });
  });
}
async function login(page, account) {
  await page.goto(`${base}/admin/login`);
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled);
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await page
    .waitForURL((url) => url.pathname !== "/admin/login")
    .catch(async () => {
      const alert = await page.getByRole("alert").allTextContents();
      throw new Error(
        `Login did not navigate; alert=${alert.join(" ")}; path=${new URL(page.url()).pathname}`,
      );
    });
}
async function clickRequest(page, button, path, method = "POST", status = 200) {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === path && r.request().method() === method,
  );
  await button.click();
  const result = await response;
  assert.equal(result.status(), status, `${method} ${path}`);
  return result.json();
}
try {
  const treasurer = await user("treasurer");
  const staff = await user("staff");
  browser = await chromium.launch();
  const context = await browser.newContext();
  context.setDefaultTimeout(45000);
  await localTransport(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/auth/v1/token" || url.pathname === "/api/admin/me")
      console.log(`AUTH status ${response.status()} ${url.pathname}`);
  });
  await login(page, treasurer);
  check("Actual treasurer browser password login");
  await page.goto(`${base}/admin/supporters`);
  assert.equal(
    new URL(page.url()).pathname,
    "/admin/supporters",
    "Authenticated supporter deep link remains accessible",
  );
  await page.getByRole("button", { name: "新增支持者", exact: true }).click();
  await page.locator("#supporter-name").fill(marker);
  await page.locator("#supporter-email").fill(email);
  await page.locator("#supporter-phone").fill("91234567");
  await clickRequest(
    page,
    page.getByRole("button", { name: "儲存支持者", exact: true }),
    "/api/admin/supporters",
    "POST",
    201,
  );
  supporterId = must(
    await service.from("supporter").select("id").eq("email", email).single(),
    "Created supporter",
  ).id;
  await page.goto(`${base}/admin/supporters/${supporterId}`);
  await page.getByRole("button", { name: "編輯支持者", exact: true }).click();
  await page.locator("#supporter-name").fill(`${marker}-edited`);
  await page.locator("#supporter-tags").fill("synthetic, browser");
  await page.locator("#supporter-role-edit-volunteer").click();
  await clickRequest(
    page,
    page.getByRole("button", { name: "儲存支持者", exact: true }),
    `/api/admin/supporters/${supporterId}`,
    "PATCH",
  );
  const profile = must(
    await service.from("supporter").select("name,tags").eq("id", supporterId).single(),
    "Profile",
  );
  assert.equal(profile.name, `${marker}-edited`);
  assert.deepEqual(profile.tags, ["synthetic", "browser"]);
  assert.deepEqual(
    must(
      await service.from("supporter_role").select("role").eq("supporter_id", supporterId),
      "Roles",
    )
      .map((row) => row.role)
      .sort(),
    ["donor", "volunteer"],
  );
  check("Actual treasurer UI creates and edits supporter identity, roles and tags");
  await page.getByRole("switch", { name: "電郵通訊同意", exact: true }).click();
  await clickRequest(
    page,
    page.getByRole("button", { name: "儲存通訊同意設定" }),
    `/api/admin/supporters/${supporterId}/consents`,
    "POST",
    201,
  );
  await page.reload();
  await page.getByRole("switch", { name: "電郵通訊同意", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("switch", { name: "電郵通訊同意", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  check("Consent write survives actual backend reload");
  await page.getByRole("button", { name: "手動捐款", exact: true }).click();
  await page.locator("#manual-donation-amount").fill("123.45");
  await page.locator("#manual-donation-status").click();
  await page.getByRole("option", { name: "成功", exact: true }).click();
  await page.locator("#manual-donation-reference").fill(marker);
  // Exercise acknowledgement retry without issuing a receipt/PDF or advancing receipt sequence.
  await page.getByRole("switch", { name: "需要收據", exact: true }).click();
  const gift = await clickRequest(
    page,
    page.getByRole("button", { name: "儲存手動捐款", exact: true }),
    "/api/admin/donations/manual",
    "POST",
    201,
  );
  assert.ok(gift.deliveryJobId);
  assert.equal(gift.deliveryStatus, "retryable");
  await clickRequest(
    page,
    page.getByRole("button", { name: "重試收據及確認電郵", exact: true }),
    `/api/admin/donations/delivery/${gift.deliveryJobId}/retry`,
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.reload();
  await clickRequest(
    page,
    page.getByRole("button", { name: "重試收據及確認電郵", exact: true }),
    `/api/admin/donations/delivery/${gift.deliveryJobId}/retry`,
  );
  const donations = must(
    await service.from("donation").select("id,amount_cents").eq("supporter_id", supporterId),
    "Donation rows",
  );
  assert.equal(donations.length, 1);
  assert.equal(donations[0].amount_cents, 12345);
  assert.equal(
    must(await service.from("payment").select("id").eq("donation_id", gift.donationId), "Payments")
      .length,
    1,
  );
  assert.equal(
    must(
      await service.from("message").select("status").eq("supporter_id", supporterId),
      "Messages",
    ).some((row) => ["sent", "delivered"].includes(row.status)),
    false,
  );
  check(
    "Committed gift remains single after dialog and persistent-history retries; no message sent",
  );
  await page.screenshot({ path: `${output}/gift-pending.png`, fullPage: true });
  await page.goto(`${base}/admin/supporters`);
  assert.equal(
    new URL(page.url()).pathname,
    "/admin/supporters",
    "Authenticated supporter deep link remains accessible",
  );
  const filtered = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/admin/supporters" &&
      new URL(r.url()).searchParams.get("q") === marker,
  );
  await page.getByPlaceholder("搜尋姓名、電郵、電話、參考編號或收據").fill(marker);
  assert.equal((await filtered).status(), 200);
  for (const [name, id] of [
    ["支持者 CSV", supporterId],
    ["捐款 CSV", gift.donationId],
  ]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    const file = await download;
    const csv = await readFile(await file.path(), "utf8");
    assert.ok(csv.includes(id));
    assert.equal(csv.trim().split(/\r?\n/).length, 2);
  }
  check("Filtered supporter and donation CSV downloads contain exactly one synthetic data row");
  const denied = await fetch(`${base}/api/admin/donations/manual`, {
    method: "POST",
    headers: { authorization: `Bearer ${staff.token}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  const staffContext = await browser.newContext();
  await localTransport(staffContext);
  const staffPage = await staffContext.newPage();
  await login(staffPage, staff);
  await staffPage.goto(`${base}/admin/supporters`);
  await staffPage.waitForURL((url) => url.pathname === "/admin/access-denied");
  check("Actual staff session cannot open CRM page or create manual gifts");
  const audits = must(
    await service.from("audit_log").select("action").in("actor_user_id", users),
    "Audit rows",
  );
  assert.ok(audits.length >= 5, "Profile, consent, gift and retry mutations are audited");
  check("Actual mutation audit rows persisted");
  assert.deepEqual(errors, []);
} catch (error) {
  failure = error;
} finally {
  await browser?.close();
  // Restricted exact UUID cleanup on our disposable container. No wildcard deletions.
  if (!supporterId) {
    supporterId = must(
      await service.from("supporter").select("id").eq("email", email).maybeSingle(),
      "Cleanup lookup",
    )?.id;
  }
  for (const id of [...users, ...(supporterId ? [supporterId] : [])])
    assert.match(id, /^[0-9a-f-]{36}$/);
  let sql = "begin;";
  if (supporterId)
    sql += `
delete from public.manual_gift_request where donation_id in (select id from public.donation where supporter_id='${supporterId}');
delete from public.message where supporter_id='${supporterId}';
delete from public.receipt where supporter_id='${supporterId}';
delete from public.donation where supporter_id='${supporterId}';
delete from public.supporter where id='${supporterId}';`;
  for (const id of users)
    sql += `delete from public.audit_log where actor_user_id='${id}';delete from public.admin_user where auth_user_id='${id}';`;
  sql += "commit;";
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_hkscda-completion-20260905",
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "pipe", "pipe"] },
  );
  for (const id of users) must(await service.auth.admin.deleteUser(id), "Delete fixture auth");
  assert.equal(
    must(await service.from("supporter").select("id").eq("email", email), "Cleanup verify").length,
    0,
  );
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        adaptation:
          "Origin55430 local-network-access permission; document CSP only appends exact local API55321 to connect-src/img-src; all auth/API/DB responses real",
        checks,
        errors,
        cleanup: "Exact synthetic fixtures removed",
        ...(failure ? { failure: failure.message } : {}),
      },
      null,
      2,
    ),
  );
}
if (failure) throw failure;
