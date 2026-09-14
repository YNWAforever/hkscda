import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const origin = "http://127.0.0.1:56336";
const actors = JSON.parse(await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"));
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
async function sessionFor(role) {
  const stored = actors[role];
  const user = await service.auth.admin.getUserById(stored.id);
  assert.ok(user.data.user.email.endsWith("@example.invalid"));
  const auth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
  const link = await service.auth.admin.generateLink({
    type: "magiclink",
    email: user.data.user.email,
  });
  if (link.error) throw link.error;
  const result = await auth.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.data.properties.hashed_token,
  });
  if (result.error) throw result.error;
  return result.data.session;
}
const session = await sessionFor("admin");

const previous = JSON.parse(
  await readFile("docs/evidence/operations-release-20260915/bulk/browser.json", "utf8"),
);
const marker = previous.marker;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  timezoneId: "America/Los_Angeles",
});
await context.addInitScript(
  (session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
  session,
);
const page = await context.newPage();
try {
  await page.goto(
    origin +
      "/admin/volunteers/activities?view=calendar&status=draft&q=" +
      encodeURIComponent(marker),
    { waitUntil: "networkidle" },
  );
  await page.getByRole("heading", { name: "活動（1）", exact: true }).waitFor();
  await page.getByRole("region", { name: "香港日期月曆" }).waitFor();
  const more = page.getByRole("button", { name: /更多篩選/ });
  assert.equal(await more.getAttribute("aria-expanded"), "false");
  assert.ok((await more.innerText()).includes("1 項已啟用"));
  await more.focus();
  await page.keyboard.press("Enter");
  assert.equal(await more.getAttribute("aria-expanded"), "true");
  await more.focus();
  await page.keyboard.press("Space");
  assert.equal(await more.getAttribute("aria-expanded"), "false");
  assert.ok(page.url().includes("status=draft"));
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  await page.screenshot({
    path: "docs/evidence/operations-release-20260915/bulk/mobile-calendar.png",
    fullPage: true,
  });
  console.log(
    "read-only mobile calendar ready; keyboard, active count, preserved URL, overflow and screenshot passed",
  );
} finally {
  await browser.close();
}
