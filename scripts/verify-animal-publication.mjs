import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("isolated fixtures required");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const origin = "http://127.0.0.1:56330",
  marker = "animal-browser-" + crypto.randomUUID();
const svc = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function actor(role) {
  const email = marker + "-" + role + "@example.invalid",
    password = crypto.randomUUID() + "Aa1!";
  const made = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  if (role === "admin") {
    const x = await svc
      .from("admin_user")
      .insert({ auth_user_id: made.data.user.id, email, role: "admin", status: "active" });
    if (x.error) throw x.error;
  }
  const auth = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await auth.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: made.data.user.id, session: login.data.session, client: auth };
}
const admin = await actor("admin"),
  ordinary = await actor("ordinary");
const selected = await svc.from("animals").select("*").limit(1).maybeSingle();
if (selected.error) throw selected.error;
if (!selected.data) throw new Error("isolated animal fixture missing");
const animal = selected.data,
  originalNotes = animal.notes,
  draftNotes = "內部草稿 " + marker;
const galleryPath = animal.id + "/drafts/" + crypto.randomUUID() + ".png";
const fixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);
const uploaded = await svc.storage
  .from("animal-draft-images")
  .upload(galleryPath, fixture, { contentType: "image/png" });
if (uploaded.error) throw uploaded.error;
const priorDraft = await svc
  .from("animal_draft")
  .select("revision")
  .eq("id", animal.id)
  .maybeSingle();
const seeded = await svc.rpc("animal_publication_command", {
  p_actor: admin.id,
  p_command: {
    kind: "save",
    animal_id: animal.id,
    expected_revision: priorDraft.data?.revision ?? 0,
    body: {
      ...animal,
      notes: draftNotes,
      gallery: [
        {
          id: crypto.randomUUID(),
          url: null,
          draft_path: galleryPath,
          alt_zh: "待填",
          alt_en: null,
          source: "待填",
          focal_x: 50,
          focal_y: 50,
          review_status: "pending",
          sort_order: 0,
        },
      ],
    },
  },
});
if (seeded.error) throw seeded.error;
const deniedRead = await ordinary.client
  .from("animals")
  .select("id,notes")
  .eq("id", animal.id)
  .maybeSingle();
assert.ok(deniedRead.error);
const deniedWrite = await ordinary.client
  .from("animals")
  .update({ notes: "bypass" })
  .eq("id", animal.id)
  .select();
assert.ok(deniedWrite.error || deniedWrite.data.length === 0);
const deniedStaffBypass = await admin.client
  .from("animals")
  .update({ notes: "staff bypass" })
  .eq("id", animal.id)
  .select();
assert.ok(deniedStaffBypass.error || deniedStaffBypass.data.length === 0);
const browser = await chromium.launch({ headless: true });
const report = { animalId: animal.id, checks: [], errors: [] };
report.checks.push(
  "ordinary and staff browser sessions cannot read internal notes or bypass publication with direct writes",
);
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addInitScript(
    (s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)),
    admin.session,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/api/admin/animals")) console.log(r.status(), r.url());
  });
  await page.goto(origin + "/admin/animals/" + animal.id + "/edit", { waitUntil: "networkidle" });
  await page.locator('input[name="notes"]').fill(draftNotes);
  await page.getByLabel("中文替代文字", { exact: true }).fill("待領養動物正面相片");
  await page.getByLabel("英文替代文字", { exact: true }).fill("Front portrait of animal");
  await page.getByLabel("相片來源", { exact: true }).fill("HKSCDA staff");
  await page.locator("article").last().locator('input[type="range"]').nth(0).fill("25");
  await page.locator("article").last().locator('input[type="range"]').nth(1).fill("75");
  await page.locator("article").last().locator("select").selectOption("approved");
  const saveResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/admin/animals/publication/") &&
      r.request().postDataJSON()?.kind === "save",
  );
  await page.locator('button[type="submit"]').click();
  const savedResponse = await saveResponse;
  if (savedResponse.status() !== 200)
    throw new Error("gallery save " + savedResponse.status() + " " + (await savedResponse.text()));
  await page
    .getByText("草稿已儲存。請在發布前先預覽；公開資料尚未改動。", { exact: true })
    .waitFor();
  const unchanged = await svc.from("animals").select("notes").eq("id", animal.id).single();
  assert.equal(unchanged.data.notes, originalNotes);
  report.checks.push("draft save did not mutate canonical animal");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator('input[name="notes"]').inputValue(), draftNotes);
  report.checks.push("saved draft hydrated after leaving and reopening");
  await page.getByRole("button", { name: "建立發布預覽", exact: true }).click();
  await page.getByText("預覽已建立；如再儲存草稿，必須重新預覽。", { exact: true }).waitFor();
  await page.getByLabel("發布原因", { exact: true }).fill("isolated browser publication");
  await page.getByRole("button", { name: "發布此版本", exact: true }).click();
  await page.waitForURL(origin + "/admin?section=cat");
  const published = await svc.from("animals").select("notes,gallery").eq("id", animal.id).single();
  assert.equal(published.data.notes, draftNotes);
  assert.equal(published.data.gallery.length, 1);
  assert.equal(published.data.gallery[0].review_status, "approved");
  assert.equal(published.data.gallery[0].draft_path, null);
  assert.match(published.data.gallery[0].url, /animal-images/);
  report.checks.push(
    "preview and publish updated canonical row and approved ordered gallery only after confirmation",
  );
  const publicPage = await context.newPage();
  await publicPage.goto(origin + "/animals/" + animal.type + "/" + animal.id, {
    waitUntil: "networkidle",
  });
  await publicPage.getByAltText("待領養動物正面相片", { exact: true }).waitFor();
  assert.equal(
    await publicPage
      .getByAltText("待領養動物正面相片", { exact: true })
      .evaluate((node) => getComputedStyle(node).objectPosition),
    "25% 75%",
  );
  await publicPage.getByText("相片來源：HKSCDA staff", { exact: true }).waitFor();
  await publicPage.screenshot({
    path: "docs/evidence/admin-volunteer-settings/browser/animals/public-detail-gallery.png",
    fullPage: true,
  });
  report.checks.push(
    "public detail rendered approved gallery alt, source and focal point while retaining original hero",
  );
  await page.goto(origin + "/admin/animals/" + animal.id + "/edit", { waitUntil: "networkidle" });
  const copy = page.getByRole("button", { name: /版本 .* 複製為草稿/ }).first();
  await copy.waitFor();
  const copyResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/admin/animals/publication/") &&
      r.request().postDataJSON()?.kind === "copy",
  );
  await copy.click();
  const copied = await copyResponse;
  assert.equal(copied.status(), 200);
  await page.waitForLoadState("networkidle");
  await new Promise((resolve) => setTimeout(resolve, 250));
  const draft = await svc.from("animal_draft").select("revision,body").eq("id", animal.id).single();
  assert.equal(draft.data.body.notes, draftNotes);
  assert.ok(draft.data.revision > 1);
  report.checks.push("published immutable version copied back to a new draft revision");
  assert.deepEqual(report.errors, []);
  await mkdir("docs/evidence/admin-volunteer-settings/browser/animals", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/admin-volunteer-settings/browser/animals/publication.png",
    fullPage: true,
  });
  await writeFile(
    "docs/evidence/admin-volunteer-settings/browser/animals/report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
