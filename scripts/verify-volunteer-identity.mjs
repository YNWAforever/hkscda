import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:56548";
const sessions = JSON.parse(
  await readFile(".local-policy-test/browser-sessions-private.json", "utf8"),
);
const state = JSON.parse(await readFile(sessions[1].path, "utf8"));
const auth = state.origins
  .flatMap((item) => item.localStorage)
  .find((item) => item.name.endsWith("-auth-token"));
if (!auth) throw Error("Staff fixture session absent");
const session = JSON.parse(auth.value);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const context = await browser.newContext({ storageState: sessions[0].path });
  const page = await context.newPage();
  await page.goto(origin + "/admin/volunteers/settings");
  await page.locator("#volunteer-page-content h1").waitFor();
  await page.evaluate(() =>
    sessionStorage.setItem("hkscda.admin.list.query.volunteers", "AUDIT private old actor query"),
  );
  await page.evaluate(
    async (tokens) => {
      const { supabase } = await import("/src/lib/supabase.ts");
      const result = await supabase.auth.setSession(tokens);
      if (result.error) throw Error("Local actor change failed");
    },
    { access_token: session.access_token, refresh_token: session.refresh_token },
  );
  await page.waitForFunction(() => location.pathname !== "/admin/volunteers/settings", null, {
    timeout: 10000,
  });
  await page.locator("#volunteer-page-content h1").waitFor({ timeout: 10000 });
  assert.equal(await page.getByText("職員工作區", { exact: true }).count(), 1);
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("hkscda.admin.list.query.volunteers")),
    null,
  );
  results.push({
    check: "same-tab-admin-to-staff",
    policyRouteExited: true,
    oldSearchRemoved: true,
    finalPath: new URL(page.url()).pathname,
  });
  await context.close();
} catch (error) {
  results.push({
    check: "same-tab-admin-to-staff",
    status: "failed",
    error: String(error.message),
  });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    ".superpowers/sdd/volunteer-admin-20261013/identity-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
}
