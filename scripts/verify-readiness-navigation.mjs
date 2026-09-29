import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const base = "http://127.0.0.1:56566",
  secret = "synthetic-readiness-32-character-x";
const denied = await fetch(base + "/api/internal/readiness", {
  signal: AbortSignal.timeout(15000),
  headers: { authorization: "Bearer " + "é".repeat(secret.length) },
});
assert.equal(denied.status, 401);
assert.equal(denied.headers.get("cache-control"), "no-store");
const checked = await fetch(base + "/api/internal/readiness", {
  signal: AbortSignal.timeout(15000),
  headers: { authorization: "Bearer " + secret },
});
assert.equal(checked.status, 503);
assert.equal(checked.headers.get("cache-control"), "no-store");
const report = await checked.json();
assert.equal(report.state, "unavailable");
assert.ok(!JSON.stringify(report).includes(secret));
const browser = await chromium.launch(),
  results = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } }),
      page = await context.newPage();
    let documents = 0;
    const errors = [],
      logs = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => logs.push(m.text()));
    page.on("request", (r) => {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++;
    });
    await context.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort(),
    );
    await page.goto(base + "/about/privacy", { waitUntil: "networkidle" });
    const initialDocuments = documents;
    await page.locator('footer a[href="/adoption/instructions"]').focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "暫時未能載入領養資訊", exact: true }).waitFor();
    const text = await page.locator("body").innerText(),
      reference = text.match(/參考編號\s+([a-f0-9-]{36})/)?.[1];
    assert.ok(reference);
    assert.equal(documents, initialDocuments); // Real TanStack client navigation, no full document reload.
    const privateLog = await readFile(
      path.join(process.env.TEMP, "hkscda-pr168-dev-error.log"),
      "utf8",
    );
    assert.ok(privateLog.includes(reference), "Visible UUID must exist in private server output");
    assert.ok(
      !logs.some((v) => v.includes(reference)),
      "Browser console must not mint/log the server reference",
    );
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t02-reference-client-${width}.png`,
      fullPage: true,
    });
    const axe = await new AxeBuilder({ page }).analyze(),
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    // SSR also carries the server-generated reference and preserves the HTTP200 error shell.
    const ssr = await page.request.get(base + "/adoption/instructions");
    assert.equal(ssr.status(), 200);
    const html = await ssr.text();
    assert.ok(html.includes("暫時未能載入領養資訊"));
    results.push({
      width,
      clientNavigation: true,
      privateReferenceMatched: true,
      browserReferenceLogs: 0,
      ssrErrorStatus: ssr.status(),
      axe: axe.violations.map((v) => v.id),
      overflow,
      errors,
    });
    await context.close();
  }
  console.log(JSON.stringify({ malformedAuthorization: 401, unavailableReadiness: 503, results }));
  assert.ok(results.every((r) => !r.overflow && r.errors.length === 0 && r.axe.length === 0));
} finally {
  await browser.close();
}
