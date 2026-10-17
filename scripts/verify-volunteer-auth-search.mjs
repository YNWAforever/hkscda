import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const sessions = JSON.parse(
  await readFile(".local-policy-test/browser-sessions-private.json", "utf8"),
);
const state = JSON.parse(await readFile(sessions[2].path, "utf8"));
const auth = state.origins
  .flatMap((item) => item.localStorage)
  .find((item) => item.name.endsWith("-auth-token"));
const session = JSON.parse(auth.value);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const context = await browser.newContext({ storageState: sessions[1].path });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:56548/admin/volunteers/people");
  const input = page.getByRole("searchbox");
  await input.waitFor();
  await input.fill("AUDIT previous-actor-only@example.invalid");
  await page.waitForFunction(
    () =>
      sessionStorage.getItem("hkscda.admin.list.query.volunteer-directory") ===
      "AUDIT previous-actor-only@example.invalid",
  );
  await page.goto("http://127.0.0.1:56548/admin");
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await page.waitForURL("**/admin/login**");
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("hkscda.admin.list.query.volunteer-directory"),
    ),
    null,
  );
  await page.evaluate(
    async (tokens) => {
      const { supabase } = await import("/src/lib/supabase.ts");
      const result = await supabase.auth.setSession(tokens);
      if (result.error) throw Error("Local actor change failed");
    },
    { access_token: session.access_token, refresh_token: session.refresh_token },
  );
  await page.goto("http://127.0.0.1:56548/admin/volunteers/people");
  await page.getByRole("searchbox").waitFor();
  assert.equal(await page.getByRole("searchbox").inputValue(), "");
  results.push({
    check: "staffA-outside-frame-logout-staffB",
    oldSearchRemoved: true,
    newSearchEmpty: true,
  });
  await context.close();
} catch (error) {
  results.push({ check: "outside-frame-identity", status: "failed", error: String(error.message) });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    ".superpowers/sdd/volunteer-admin-20261013/outside-identity-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
}
