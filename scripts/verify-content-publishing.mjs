import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.CMS_EDITOR_TEST_BASE_URL;
const api = process.env.CMS_MEDIA_TEST_URL;
const serviceKey = process.env.CMS_MEDIA_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.CMS_EDITOR_TEST_ANON_KEY;
if (
  !base ||
  !api ||
  !serviceKey ||
  !anonKey ||
  process.env.CMS_EDITOR_TEST_ALLOW_LOCAL_FIXTURES !== "1"
)
  throw new Error("Explicit isolated app/API keys and fixture opt-in required");
for (const value of [base, api]) {
  const url = new URL(value);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("Only explicit loopback CMS targets are permitted");
}
if (base !== "http://127.0.0.1:55430" || api !== "http://127.0.0.1:55321")
  throw new Error("Document CSP transport adjustment requires the exact isolated ports");
async function allowLocalDocumentTransport(context) {
  await context.grantPermissions(["local-network-access"], { origin: base });
  await context.route(`${base}/**`, async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch({ maxRedirects: 0 });
    const headers = response.headers();
    const policy = headers["content-security-policy"];
    if (!policy) throw new Error("Expected document CSP missing");
    headers["content-security-policy"] = policy
      .split(";")
      .map((directive) => {
        const name = directive.trim().split(/\s+/)[0];
        return ["connect-src", "img-src"].includes(name) ? `${directive} ${api}` : directive;
      })
      .join(";");
    await route.fulfill({ response, headers });
  });
}
const admin = createClient(api, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = createClient(api, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const marker = `cms-browser-${crypto.randomUUID()}`;
const email = `${marker}@example.test`;
const password = `LocalOnly-${crypto.randomUUID()}!`;
const output = "docs/evidence/cms-wave1/browser";
await mkdir(output, { recursive: true });
const checks = [];
const errors = [];
let userId;
let contentId;
let browser;
let bearer;
function must(result, label) {
  if (result.error)
    throw new Error(`${label}: ${result.error.code ?? result.error.status ?? "failed"}`);
  return result.data;
}
function check(name) {
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function request(path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`CMS API ${method} ${path.split("?")[0]} status ${response.status}`);
  return data;
}
async function saved() {
  return (await request(`/api/admin/content/${contentId}`)).content;
}
async function publicStory() {
  const response = await fetch(`${base}/api/stories/${marker}`);
  return { status: response.status, data: await response.json() };
}
function main(page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "基本內容", exact: true }) });
}
function title(page) {
  return main(page).getByLabel("標題", { exact: true });
}
async function clickRequest(page, button, path, method = "POST", status) {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === path && r.request().method() === method,
  );
  await button.click();
  const actualStatus = (await response).status();
  if (status === undefined)
    assert(
      actualStatus >= 200 && actualStatus < 300,
      `Expected successful ${method}, got ${actualStatus}`,
    );
  else assert.equal(actualStatus, status);
}
async function waitClean(page) {
  await page.getByRole("status").filter({ hasText: "已儲存草稿" }).waitFor();
}
try {
  userId = must(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    "Create isolated user",
  ).user.id;
  must(
    await admin
      .from("admin_user")
      .insert({ auth_user_id: userId, email, role: "staff", status: "active" }),
    "Create isolated staff",
  );
  bearer = must(await auth.auth.signInWithPassword({ email, password }), "Synthetic staff login")
    .session.access_token;
  contentId = (
    await request("/api/admin/content", "POST", {
      type: "rescue_story",
      slug: marker,
      title: "Synthetic CMS initial",
      summary: "Disposable browser acceptance story",
      body: "Synthetic saved body",
      status: "draft",
    })
  ).id;
  browser = await chromium.launch();
  const context = await browser.newContext();
  await allowLocalDocumentTransport(context);
  context.setDefaultTimeout(45000);
  const a = await context.newPage();
  a.on("pageerror", (error) => errors.push(error.message));
  await a.goto(`${base}/admin/login`);
  await a.locator('button[type="submit"]:enabled').waitFor();
  a.on("response", (response) => {
    if (new URL(response.url()).pathname === "/auth/v1/token")
      console.log("Browser authentication HTTP", response.status());
  });
  console.log("Login form enabled after hydration");
  await a.locator('input[type="email"]').fill(email);
  await a.locator('input[type="password"]').fill(password);
  await a.locator('button[type="submit"]').click();
  await a.waitForURL((url) => /^\/admin\/?$/.test(url.pathname));
  await a.goto(`${base}/admin/content/${contentId}`);
  await title(a).waitFor();
  check("real staff UI login and authenticated draft editor");
  const profile = a
    .locator("section")
    .filter({ has: a.getByRole("heading", { name: "故事牆設定", exact: true }) })
    .last();
  await profile.getByLabel("救援地區", { exact: true }).fill("Synthetic district");
  assert.equal(await a.getByRole("button", { name: "發布", exact: true }).isDisabled(), true);
  await clickRequest(
    a,
    profile.getByRole("button", { name: "儲存故事設定", exact: true }),
    `/api/admin/content/${contentId}/story-profile`,
    "PUT",
  );
  await waitClean(a);
  check("nested profile dirty guard and versioned save");
  const media = a
    .locator("section")
    .filter({ has: a.getByRole("heading", { name: "媒體與相片", exact: true }) });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
    "base64",
  );
  const mediaPath = `/api/admin/content/${contentId}/media`;
  const mediaPattern = `**${mediaPath}`;
  let failFinalize = true;
  let uploadAllocations = 0;
  a.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/media-upload-target")) uploadAllocations++;
  });
  await a.route(mediaPattern, (route) =>
    failFinalize
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "synthetic_failure", message: "Synthetic interrupted finalization" },
          }),
        })
      : route.continue(),
  );
  await media
    .getByLabel("圖片檔案", { exact: true })
    .setInputFiles({ name: "synthetic-cover.png", mimeType: "image/png", buffer: png });
  await media.getByLabel("Alt text", { exact: true }).fill("Synthetic cover");
  await media.getByLabel("設為封面", { exact: true }).check();
  await clickRequest(
    a,
    media.getByRole("button", { name: "新增媒體", exact: true }),
    mediaPath,
    "POST",
    503,
  );
  failFinalize = false;
  await clickRequest(a, media.getByRole("button", { name: "新增媒體", exact: true }), mediaPath);
  await a.unroute(mediaPattern);
  await waitClean(a);
  assert.equal(uploadAllocations, 1);
  let detail = await saved();
  const cover = detail.media.find((row) => row.isCover);
  assert(cover);
  assert.equal(
    (await fetch(`${api}/storage/v1/object/public/${cover.storageBucket}/${cover.storagePath}`)).ok,
    false,
  );
  check("private cover upload survives finalization failure without duplicate upload");
  const b = await context.newPage();
  b.on("pageerror", (error) => errors.push(error.message));
  await b.goto(`${base}/admin/content/${contentId}`);
  await title(b).waitFor();
  const localTitle = "Synthetic unsaved editor A";
  await title(a).fill(localTitle);
  assert.equal(await a.getByRole("button", { name: "發布", exact: true }).isDisabled(), true);
  const liveTitle = "Synthetic published editor B";
  await title(b).fill(liveTitle);
  await clickRequest(
    b,
    main(b).getByRole("button", { name: "儲存草稿", exact: true }),
    `/api/admin/content/${contentId}`,
    "PATCH",
  );
  await waitClean(b);
  assert.equal((await publicStory()).status, 404);
  const reviewed = await saved();
  await clickRequest(
    b,
    b.getByRole("button", { name: "發布", exact: true }),
    `/api/admin/content/${contentId}/publish`,
  );
  await waitClean(b);
  let publicData = (await publicStory()).data;
  assert.equal(publicData.content.title, liveTitle);
  const oldPublicCover = publicData.content.coverImageUrl;
  check("explicit saved revision publication is the first public output");
  const publicContext = await browser.newContext();
  await allowLocalDocumentTransport(publicContext);
  const publicPage = await publicContext.newPage();
  publicPage.on("pageerror", (error) => errors.push(error.message));
  await publicPage.goto(`${base}/stories/${marker}`);
  await publicPage.getByRole("heading", { name: liveTitle, exact: true }).waitFor();
  check("anonymous public page renders the published saved title");
  const nextTitle = "Synthetic newer draft editor B";
  await title(b).fill(nextTitle);
  await clickRequest(
    b,
    main(b).getByRole("button", { name: "儲存草稿", exact: true }),
    `/api/admin/content/${contentId}`,
    "PATCH",
  );
  await waitClean(b);
  assert.equal((await publicStory()).data.content.title, liveTitle);
  check("draft save leaves existing public revision unchanged");
  await clickRequest(
    a,
    main(a).getByRole("button", { name: "儲存草稿", exact: true }),
    `/api/admin/content/${contentId}`,
    "PATCH",
    409,
  );
  assert.equal(await title(a).inputValue(), localTitle);
  await a.getByRole("button", { name: "比較最新內容", exact: true }).click();
  assert.equal(await title(a).inputValue(), localTitle);
  check("two editors produce real409 with retained local text and nondestructive comparison");
  const reloadPattern = `**/api/admin/content/${contentId}?historyPage=1`;
  await a.route(reloadPattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Synthetic reload failure" } }),
    }),
  );
  a.once("dialog", (dialog) => dialog.accept());
  await a.getByRole("button", { name: "重新整理", exact: true }).click();
  await a.getByRole("alert").filter({ hasText: "未能重新載入" }).waitFor();
  assert.equal(await title(a).inputValue(), localTitle);
  await a.unroute(reloadPattern);
  a.once("dialog", (dialog) => dialog.dismiss());
  await a.getByRole("button", { name: "重新整理", exact: true }).click();
  assert.equal(await title(a).inputValue(), localTitle);
  a.once("dialog", (dialog) => dialog.accept());
  await a.getByRole("button", { name: "重新整理", exact: true }).click();
  await title(a).filter({ visible: true }).waitFor();
  await a.waitForFunction(
    (expected) => [...document.querySelectorAll("input")].some((input) => input.value === expected),
    nextTitle,
  );
  check("failed reload and cancelled discard preserve work; explicit successful reload recovers");
  const update = a
    .locator("form")
    .filter({ has: a.getByRole("button", { name: "新增故事更新", exact: true }) });
  await update.getByLabel("標題", { exact: true }).fill("Synthetic internal update");
  await update.getByLabel("發生時間", { exact: true }).fill("2026-09-05T12:00");
  await update.getByLabel("可見度").selectOption("internal");
  await update
    .getByLabel("內容", { exact: true })
    .fill("Synthetic internal notes must stay private");
  await clickRequest(
    a,
    update.getByRole("button", { name: "新增故事更新", exact: true }),
    `/api/admin/content/${contentId}/updates`,
  );
  await waitClean(a);
  detail = await saved();
  const internal = detail.updates.find((row) => row.visibility === "internal");
  assert(internal);
  await media
    .getByLabel("圖片檔案", { exact: true })
    .setInputFiles({ name: "synthetic-internal.png", mimeType: "image/png", buffer: png });
  await media.getByLabel("關聯更新").selectOption(internal.id);
  await media.getByLabel("Alt text", { exact: true }).fill("Synthetic internal image");
  await clickRequest(a, media.getByRole("button", { name: "新增媒體", exact: true }), mediaPath);
  await waitClean(a);
  detail = await saved();
  const privateMedia = detail.media.find((row) => row.storyUpdateId === internal.id);
  assert(privateMedia);
  assert.equal(
    (
      await fetch(
        `${api}/storage/v1/object/public/${privateMedia.storageBucket}/${privateMedia.storagePath}`,
      )
    ).ok,
    false,
  );
  assert.equal((await fetch(privateMedia.url)).ok, true);
  const shortPreview = must(
    await admin.storage
      .from(privateMedia.storageBucket)
      .createSignedUrl(privateMedia.storagePath, 1),
    "Create one-second preview",
  );
  assert.equal((await fetch(shortPreview.signedUrl)).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert.equal((await fetch(shortPreview.signedUrl)).ok, false);
  check("signed private preview denied after actual expiration");
  await clickRequest(
    a,
    a.getByRole("button", { name: "發布", exact: true }),
    `/api/admin/content/${contentId}/publish`,
  );
  await waitClean(a);
  publicData = (await publicStory()).data;
  assert.equal(publicData.content.title, nextTitle);
  assert(!JSON.stringify(publicData).includes("Synthetic internal"));
  assert.equal((await fetch(oldPublicCover)).ok, true);
  check(
    "internal update/media remain private through publish; historical public copy remains valid",
  );
  const history = a.getByRole("region", { name: "版本紀錄與比較" });
  await history.getByRole("button", { name: new RegExp(`^版本 ${reviewed.version} ·`) }).click();
  await history.getByRole("button", { name: "還原為新草稿", exact: true }).waitFor();
  a.once("dialog", (dialog) => dialog.accept());
  await clickRequest(
    a,
    history.getByRole("button", { name: "還原為新草稿", exact: true }),
    `/api/admin/content/${contentId}/revisions/${reviewed.revisionId}/restore`,
  );
  await waitClean(a);
  assert.equal((await saved()).title, liveTitle);
  assert.equal((await publicStory()).data.content.title, nextTitle);
  check("revision comparison and restore create a draft without changing public output");
  await a.screenshot({ path: `${output}/restored-draft.png`, fullPage: true });
  await publicPage.reload();
  await publicPage.getByRole("heading", { name: nextTitle, exact: true }).waitFor();
  await publicPage.screenshot({ path: `${output}/published-story.png`, fullPage: true });
  assert.equal(errors.length, 0, `Unexpected browser runtime errors: ${errors.length}`);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        result: "passed",
        checks,
        browserErrors: errors.length,
        baseURL: base,
        apiURL: api,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages())
        console.log(
          "Visible error",
          await page
            .getByRole("alert")
            .allTextContents()
            .catch(() => []),
        );
  if (browser)
    console.log(
      "Failure page paths",
      browser
        .contexts()
        .flatMap((context) => context.pages().map((page) => new URL(page.url()).pathname)),
    );
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        result: "failed",
        checks,
        error: String(error.message).replaceAll(serviceKey, "[redacted]"),
        browserErrors: errors.map((value) => value.replaceAll(serviceKey, "[redacted]")),
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (browser) await browser.close();
  if (contentId) {
    const sessions = must(
      await admin
        .from("content_media_session")
        .select("storage_bucket,storage_path")
        .eq("content_item_id", contentId),
      "Read fixture sessions",
    );
    const assets = must(
      await admin
        .from("content_public_asset")
        .select("public_bucket,public_path")
        .eq("content_item_id", contentId),
      "Read fixture copies",
    );
    for (const row of sessions ?? [])
      must(
        await admin.storage.from(row.storage_bucket).remove([row.storage_path]),
        "Remove fixture private object",
      );
    for (const row of assets ?? [])
      must(
        await admin.storage.from(row.public_bucket).remove([row.public_path]),
        "Remove fixture public copy",
      );
    for (const table of [
      "content_publication_prepare",
      "content_public_asset",
      "content_publish_request",
    ])
      must(
        await admin.from(table).delete().eq("content_item_id", contentId),
        "Remove fixture publication state",
      );
    must(
      await admin
        .from("content_item")
        .update({
          status: "draft",
          published_slug: null,
          published_revision_id: null,
          draft_revision_id: null,
        })
        .eq("id", contentId),
      "Clear fixture pointers",
    );
    must(await admin.from("content_item").delete().eq("id", contentId), "Remove fixture content");
  }
  if (userId) {
    must(
      await admin.from("audit_log").delete().eq("actor_user_id", userId),
      "Remove fixture audit",
    );
    must(
      await admin.from("admin_user").delete().eq("auth_user_id", userId),
      "Remove fixture staff",
    );
    must(await admin.auth.admin.deleteUser(userId), "Remove fixture user");
  }
  console.log("Synthetic CMS fixtures cleaned");
}
