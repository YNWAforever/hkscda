import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const sessions = JSON.parse(
  await readFile(".local-policy-test/browser-sessions-private.json", "utf8"),
);
const fixture = JSON.parse(await readFile(".local-policy-test/daily-work-private.json", "utf8"));
const origin = "http://127.0.0.1:56548";
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const index of [0, 1, 2]) {
    const context = await browser.newContext({ storageState: sessions[index].path });
    const page = await context.newPage();
    const overviewResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.replace(/\/$/, "") === "/api/admin/volunteers/overview",
    );
    await page.goto(origin + "/admin/volunteers");
    const overview = await (await overviewResponse).json();
    const card = page.locator('#volunteer-page-content a[href*="tasks?pending_scope=all"]').first();
    await card.waitFor();
    assert.ok((await card.textContent()).includes(String(overview.counts.pendingRegistrations)));
    const tasksResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.replace(/\/$/, "") === "/api/admin/volunteers/tasks" &&
        response.request().postDataJSON()?.scope === "all",
    );
    await card.click();
    const tasks = await (await tasksResponse).json();
    assert.equal(tasks.pendingCounts.total, overview.counts.pendingRegistrations);
    assert.equal(
      tasks.pendingCounts.upcoming + tasks.pendingCounts.overdue,
      tasks.pendingCounts.total,
    );
    const ownedPending = tasks.pending.filter((row) => fixture.registrationIds.includes(row.id));
    assert.equal(ownedPending.length, 3);
    for (const row of ownedPending) {
      const link = page
        .locator(`#volunteer-page-content a[href*="/registrations/${row.id}"]`)
        .first();
      await link.click();
      await page.waitForURL(`**/admin/volunteers/registrations/${row.id}**`);
      await page.locator("#volunteer-page-content h1").waitFor();
      await page.getByText(row.contact_name, { exact: true }).first().waitFor();
      await page.goBack();
      await page.waitForURL("**/admin/volunteers/tasks**");
    }
    const overdueResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.replace(/\/$/, "") === "/api/admin/volunteers/tasks" &&
        response.request().postDataJSON()?.scope === "overdue",
    );
    await page.locator("#volunteer-page-content select").first().selectOption("overdue");
    const overdue = await (await overdueResponse).json();
    assert.equal(overdue.pending.length, overdue.pendingCounts.overdue);
    assert.equal(
      overdue.pending.filter((row) => fixture.registrationIds.includes(row.id)).length,
      3,
    );
    results.push({
      role: sessions[index].role,
      check: "UC02-UC03-pending-entries",
      totalMatchesOverview: true,
      ownPendingEntriesOpened: 3,
      overdueOwnEntriesRetained: 3,
      mutations: 0,
    });
    await context.close();
  }
} catch (error) {
  results.push({ check: "UC02-UC03-pending-entries", status: "failed", error: error.message });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    process.env.PENDING_ENTRIES_OUTPUT ??
      ".superpowers/sdd/volunteer-admin-20261013/pending-entries-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
}
