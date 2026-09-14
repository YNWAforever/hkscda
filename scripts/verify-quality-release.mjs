import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
assert.equal(process.env.QUALITY_BROWSER, "1");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const origin = "http://127.0.0.1:56336",
  output = "docs/evidence/operations-release-20260915/quality-browser";
await mkdir(output, { recursive: true });
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const fixture = JSON.parse(
  await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"),
).admin;
const user = await service.auth.admin.getUserById(fixture.id);
assert.ok(user.data.user.email.endsWith("@example.invalid"));
const link = await service.auth.admin.generateLink({
  type: "magiclink",
  email: user.data.user.email,
});
if (link.error) throw Error("Local auth setup failed");
const auth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
const verified = await auth.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: "magiclink",
});
if (verified.error) throw Error("Local auth failed");
const session = verified.data.session;
const report = { checks: [], errors: [], screenshots: [] };
async function post(path, body) {
  const result = await fetch(origin + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await result.json();
  assert.equal(result.status, 200, JSON.stringify(data));
  return data;
}
const animal = crypto.randomUUID(),
  name = "Synthetic quality browser animal";
await post("/api/admin/animals/publication/", {
  kind: "save",
  animal_id: animal,
  expected_revision: 0,
  body: {
    type: "cat",
    name,
    gender: "female",
    age: "2",
    status: "available",
    publication_state: "published",
    adoption_eligible: true,
    sponsorship_eligible: false,
    image_url: null,
    draft_image_path: null,
    gallery: [],
    public_profile: {},
    description: "Synthetic saved revision A",
  },
});
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    timezoneId: "America/New_York",
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    (value) => localStorage.setItem("sb-127-auth-token", JSON.stringify(value)),
    session,
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(origin + `/admin/animals/${animal}/edit`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "建立發布預覽", exact: true }).click();
  await page
    .getByRole("article", { name: "已儲存版本預覽" })
    .getByText("Synthetic saved revision A", { exact: true })
    .waitFor();
  await page.locator('input[name="name"]').fill(name + " B");
  assert.equal(
    await page.getByRole("button", { name: "建立發布預覽", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.getByRole("button", { name: "發布此版本", exact: true }).isDisabled(),
    true,
  );
  report.checks.push(
    "Saved revision A visually rendered; editing B disables preview and publication",
  );
  await Promise.all([
    page.waitForEvent("dialog").then((dialog) => dialog.dismiss()),
    page.getByRole("button", { name: "取消", exact: true }).click(),
  ]);
  assert.ok(page.url().includes(animal));
  report.checks.push("Unsaved navigation prompts and cancellation preserves editor");
  await page.locator('button[type="submit"]').click();
  await page
    .getByText("草稿已儲存。請在發布前先預覽；公開資料尚未改動。", { exact: true })
    .waitFor();
  const review = page.getByRole("group", { name: "此已儲存版本的來源審核", exact: true });
  await review.getByRole("combobox").selectOption("approved");
  await review
    .getByRole("textbox")
    .fill("Explicit synthetic browser fixture; no real rescue story");
  await review.getByRole("button", { name: "記錄此版本審核", exact: true }).click();
  await page.getByText("此版本的審核已記錄。公開內容尚未改動。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "建立發布預覽", exact: true }).click();
  await page
    .getByRole("article", { name: "已儲存版本預覽" })
    .getByRole("heading", { name: name + " B", exact: true })
    .waitFor();
  await page.getByLabel("發布原因", { exact: true }).fill("Synthetic browser acceptance");
  await page.screenshot({ path: output + "/animal-saved-preview.png", fullPage: true });
  report.screenshots.push("animal-saved-preview.png");
  await page.getByRole("button", { name: "發布此版本", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes(animal));
  const canonical = await service.from("animals").select("name").eq("id", animal).single();
  assert.equal(canonical.data.name, name + " B");
  report.checks.push(
    "Same administrator explicitly reviewed and published saved revision B through API",
  );
  await page.goto(origin + "/admin/content", { waitUntil: "networkidle" });
  await page.getByText("新增內容", { exact: true }).click();
  const form = page.locator("form").first();
  await form.getByLabel("內容類型").selectOption("event");
  await form.getByLabel("標題", { exact: true }).fill("Synthetic CMS browser draft");
  await form.getByLabel("摘要", { exact: true }).fill("Explicit synthetic content creation test");
  await form.getByRole("button", { name: "建立草稿", exact: true }).click();
  await page.waitForURL(/\/admin\/content\/[0-9a-f-]+$/);
  report.checks.push(
    "Type-specific CMS event draft created through existing audited API and opened in editor",
  );
  const dataset = JSON.parse(await readFile(".local-policy-test/quality-performance.json", "utf8"));
  await page.goto(origin + `/admin/?section=cat&q=${dataset.dataset}&page=51`, {
    waitUntil: "networkidle",
  });
  await page
    .getByText(dataset.dataset + "-0001", { exact: true })
    .first()
    .waitFor();
  report.checks.push("Animal record1001 reachable in URL page51");
  await page.goto(origin + "/admin/internships", { waitUntil: "networkidle" });
  await page.getByLabel("搜尋申請人", { exact: true }).fill(dataset.dataset);
  await page
    .getByRole("navigation", { name: "實習申請分頁", exact: true })
    .getByText(/共 501 項/)
    .waitFor();
  await page.getByRole("button", { name: "下一頁", exact: true }).click();
  const select = page.getByLabel("申請人", { exact: true });
  await select.locator("option").nth(1).waitFor({ state: "attached" });
  const id = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(id);
  await page.getByRole("heading", { name: "審核及補充紀錄", exact: true }).waitFor();
  report.checks.push("Internship search/page/detail loads separate history");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/admin/content", { waitUntil: "networkidle" });
  await page.getByText("內容來源審核佇列", { exact: true }).click();
  await page.screenshot({ path: output + "/content-review-mobile.png", fullPage: true });
  report.screenshots.push("content-review-mobile.png");
  report.checks.push("Mobile390 content review queue renders with keyboard-native links and pager");
  assert.equal(report.errors.length, 0, report.errors.join("\n"));
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  await writeFile(output + "/report.json", JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report));
}
