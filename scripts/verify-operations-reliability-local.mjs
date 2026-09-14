import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
assert.equal(process.env.HKSCDA_LOCAL_BROWSER, "1");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
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
if (link.error) throw Error("Local auth failed");
const auth = createClient(local.API_URL, local.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const verified = await auth.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: "magiclink",
});
if (verified.error) throw Error("Local auth failed");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Los_Angeles",
});
await context.addInitScript(
  (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
  verified.data.session,
);
const origin = "http://127.0.0.1:56336";
const out = "docs/evidence/operations-release-20260915";
await mkdir(out, { recursive: true });
const report = {
  at: new Date().toISOString(),
  origin,
  timezone: "America/Los_Angeles",
  checks: [],
  errors: [],
};
const page = await context.newPage();
page.on("pageerror", (e) => report.errors.push(e.message));
// Guard all actual mutations: this checks local rendering and unsaved inputs only.
await context.route("**/api/**", async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.origin !== origin) return route.abort();
  if (req.method() === "GET") return route.continue();
  let a;
  try {
    a = req.postDataJSON()?.action;
  } catch {}
  if (["list", "list_legacy", "resolve"].includes(a)) return route.continue();
  return route.abort();
});
try {
  let legacy = 0,
    resolve = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") {
      let a;
      try {
        a = r.postDataJSON()?.action;
      } catch {}
      if (a === "list_legacy") legacy++;
      if (a === "resolve") resolve++;
    }
  });
  await page.goto(origin + "/admin/volunteers/qualifications", { waitUntil: "networkidle" });
  await page.getByText("舊報名身份核對", { exact: true }).waitFor();
  assert.equal(legacy, 0);
  await page.getByText("舊報名身份核對", { exact: true }).click();
  await page
    .waitForResponse((r) => {
      try {
        return r.request().postDataJSON()?.action === "list_legacy";
      } catch {
        return false;
      }
    })
    .catch(() => {});
  assert.equal(legacy, 1);
  report.checks.push({
    check: "legacy deferred until opened",
    before: 0,
    after: legacy,
    passed: true,
  });
  await page.screenshot({ path: out + "/legacy-deferred.jpg", quality: 65, fullPage: true });
  await page.goto(origin + "/admin/volunteers/settings", { waitUntil: "networkidle" });
  const name = page.getByLabel("名稱", { exact: true });
  await name.waitFor();
  const prior = await name.inputValue();
  await page.waitForTimeout(500);
  const start = resolve;
  await name.focus();
  await name.press("End");
  await name.pressSequentially("abcde", { delay: 40 });
  await page.waitForTimeout(700);
  assert.equal(resolve - start, 1);
  assert.equal(await name.inputValue(), prior + "abcde");
  report.checks.push({
    check: "five rapid keystrokes resolve once and retain unsaved input",
    requests: resolve - start,
    passed: true,
  });
  await page.screenshot({ path: out + "/settings-debounce.jpg", quality: 65, fullPage: true });
} catch (e) {
  report.failure = e.message;
  process.exitCode = 1;
} finally {
  await writeFile(out + "/reliability-browser.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  await browser.close();
}
