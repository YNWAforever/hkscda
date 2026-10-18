import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:56548";
const sessions = JSON.parse(
  await readFile(".local-policy-test/browser-sessions-private.json", "utf8"),
);
const fixture = JSON.parse(await readFile(".local-policy-test/daily-work-private.json", "utf8"));
const browser = await chromium.launch({ headless: true });
const results = [];
let activePage;
try {
  for (const roleIndex of [0, 1, 2]) {
    const context = await browser.newContext({ storageState: sessions[roleIndex].path });
    const page = await context.newPage();
    activePage = page;
    const taskReads = [];
    let documents = 0;
    page.on("request", (request) => {
      if (request.resourceType() === "document") documents++;
      if (
        new URL(request.url()).pathname.replace(/\/$/, "") === "/api/admin/volunteers/tasks" &&
        request.method() === "POST"
      )
        taskReads.push(request.postDataJSON());
    });
    for (const safe of [
      { date_scope: "all", page: "2", selected: fixture.activityIds[0], shortage: "true" },
      {
        date_scope: "custom",
        from: "2000-01-01",
        until: "2000-01-31",
        page: "2",
        selected: fixture.activityIds[0],
      },
    ]) {
      const bookmark = new URLSearchParams({
        ...safe,
        registration_status: "pending",
        q: "private-search",
        return: "https://evil.invalid",
        action: "approve",
      });
      await page.goto(origin + "/admin/volunteers/activities?" + bookmark);
      await page.waitForURL("**/admin/volunteers/tasks**");
      const pending = page.locator('#volunteer-page-content a[href*="/registrations/"]').first();
      await pending.waitFor();
      assert.equal(taskReads.at(-1).page, 1, "activity page must not become task page");
      assert.equal(taskReads.at(-1).scope, "all");
      const href = await pending.getAttribute("href");
      const destination = new URL(href, origin);
      for (const [key, value] of Object.entries(safe))
        assert.equal(destination.searchParams.get(key), value, `registration retains ${key}`);
      for (const url of [page.url(), destination.href]) {
        assert.ok(!url.includes("private-search"));
        assert.ok(!url.includes("evil.invalid"));
        assert.ok(!url.includes("approve"));
        assert.ok(!url.includes("registration_status"));
      }
      const before = documents;
      await pending.click();
      await page.waitForURL("**/admin/volunteers/registrations/**");
      const back = page
        .locator('#volunteer-page-content a[href*="/admin/volunteers/activities"]')
        .last();
      await back.waitFor();
      await back.click();
      await page.waitForURL("**/admin/volunteers/activities**");
      for (const [key, value] of Object.entries(safe))
        assert.equal(new URL(page.url()).searchParams.get(key), value, `return retains ${key}`);
      assert.equal(documents, before, "registration and return use router navigation");
      results.push({
        role: sessions[roleIndex].role,
        check: "legacy-pending-safe-return",
        dateScope: safe.date_scope,
        taskPage: 1,
        activityPage: 2,
        selectionRestored: true,
        excludedUnsafeParameters: true,
        additionalDocuments: 0,
      });
    }
    await context.close();
  }
} catch (error) {
  results.push({
    check: "legacy-pending-safe-return",
    status: "failed",
    pathname: activePage ? new URL(activePage.url()).pathname : null,
    error: error.message,
  });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    process.env.PENDING_BOOKMARK_OUTPUT ??
      ".superpowers/sdd/volunteer-admin-20261013/pending-bookmark-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
}
