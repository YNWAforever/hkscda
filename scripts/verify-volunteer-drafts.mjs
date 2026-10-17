import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const sessions = JSON.parse(
  await readFile(".local-policy-test/browser-sessions-private.json", "utf8"),
);
const policy = JSON.parse(
  await readFile(".superpowers/sdd/volunteer-admin-20261013/monthly-policy-fixture.json", "utf8"),
);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const context = await browser.newContext({ storageState: sessions[0].path });
  const page = await context.newPage();
  let saved = false;
  await page.route("**/api/admin/volunteers/assessments/", async (route) => {
    const command = route.request().postDataJSON();
    if (command.kind === "list") {
      if (saved) {
        await route.fulfill({ status: 500, json: { error: "AUDIT injected refresh failure" } });
        return;
      }
      const response = await route.fetch();
      const body = await response.json();
      body.draft = { revision: 1, body: { ...policy, regular_attendance_threshold: 6 } };
      await route.fulfill({ response, json: body });
      return;
    }
    if (command.kind === "save") {
      saved = true;
      await route.fulfill({ status: 200, json: { draft: { revision: 2, body: command.body } } });
      return;
    }
    throw Error("Unapproved command in read-only response fixture");
  });
  await page.goto("http://127.0.0.1:56548/admin/volunteers/assessments");
  const input = page.getByRole("spinbutton").first();
  await page.waitForFunction(() => document.querySelector('input[type="number"]')?.value === "6");
  await input.fill("77");
  const response = page.waitForResponse((r) => r.request().postDataJSON()?.kind === "save");
  await page.getByRole("button", { name: "儲存草稿", exact: true }).click();
  await response;
  await page.waitForTimeout(100);
  await input.fill("88");
  await page.waitForTimeout(300);
  assert.equal(await input.inputValue(), "88");
  assert.equal(
    await page.getByRole("alert").filter({ hasText: "已有新版本，未儲存輸入已保留。" }).count(),
    0,
  );
  results.push({
    check: "save-success-refresh-failure-more-editing",
    inputPreserved: true,
    olderRevisionNotOffered: true,
    policyWrites: 0,
  });
  await context.close();
} catch (error) {
  results.push({ check: "stale-draft", status: "failed", error: String(error.message) });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    ".superpowers/sdd/volunteer-admin-20261013/stale-draft-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
}
