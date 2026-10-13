import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const sessions = JSON.parse(
  await readFile(".local-policy-test/browser-sessions-private.json", "utf8"),
);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const context = await browser.newContext({ storageState: sessions[0].path });
  const page = await context.newPage();
  const pages = [];
  let documents = 0;
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents++;
    if (request.url().includes("/api/admin/volunteers/people") && request.method() === "POST")
      pages.push(request.postDataJSON().page);
  });
  await page.goto("http://127.0.0.1:56548/admin/volunteers/people");
  const next = page.locator('#volunteer-page-content a[href*="page=2"]').first();
  await next.waitFor();
  const before = documents;
  await next.click();
  await page.waitForTimeout(800);
  assert.equal(pages.at(-1), 2);
  assert.equal(documents, before);
  results.push({ check: "directory-router-pagination", lastApiPage: 2, additionalDocuments: 0 });
  await context.close();
} catch (error) {
  results.push({
    check: "directory-router-pagination",
    status: "failed",
    error: String(error.message),
  });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    ".superpowers/sdd/volunteer-admin-20261013/pagination-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
}
