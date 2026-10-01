import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const before = process.argv.includes("--before"),
  browser = await chromium.launch(),
  results = [];
const header = "bank_reference,received_on,currency,amount_hkd,payment_hint";
const csv =
  "\uFEFF" +
  header +
  "\r\n" +
  Array.from({ length: 1000 }, (_, i) => `BANK-${i},2026-09-30,HKD,100.00,HINT-${i}`).join("\r\n");
const sha = (s) => createHash("sha256").update(s).digest("hex");
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } }),
      page = await context.newPage(),
      errors = [];
    let release,
      started,
      count = 0,
      lastPayload;
    const ready = new Promise((r) => (started = r));
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.hostname !== "127.0.0.1") return route.abort();
      if (!u.pathname.startsWith("/api/")) return route.continue();
      assert.equal(u.pathname, "/api/admin/finance/bank-statement-preview");
      assert.equal(route.request().method(), "POST");
      count++;
      const body = route.request().postDataJSON();
      lastPayload = body.csvText;
      if (!body.csvText.replace(/^\uFEFF/, "").startsWith(header))
        return route.fulfill({ status: 400, json: { error: "Invalid synthetic CSV" } });
      if (count === 1) {
        started();
        await new Promise((r) => (release = r));
      }
      const rows = body.csvText
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line, i) => ({
          ordinal: i + 1,
          bankReference: line.split(",")[0],
          receivedOn: "2026-09-30",
          amountCents: 10000,
          status: "candidate_amount_only",
          invalidReason: null,
          candidateCount: 1,
          candidates: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              provider: "fps",
              providerRef: "SYNTHETIC",
            },
          ],
        }));
      return route.fulfill({
        json: {
          fileSha256: sha(body.csvText),
          generatedAt: "2026-09-30T00:00:00Z",
          rows,
          summary: {
            total: rows.length,
            invalid: 0,
            duplicate: 0,
            credited: 0,
            candidates: rows.length,
            unmatched: 0,
          },
        },
      });
    });
    await page.goto("http://127.0.0.1:56570/scripts/fixtures/bank-dryrun.html", {
      waitUntil: "networkidle",
    });
    const input = page.getByLabel("選擇標準 CSV"),
      button = page.getByRole("button", { name: "產生唯讀預覽", exact: true });
    await input.setInputFiles({
      name: "A.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(header + "\nA,2026-09-30,HKD,100.00,HINT"),
    });
    await button.click();
    await ready;
    await input.setInputFiles({ name: "B.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    const responded = page.waitForResponse((r) => r.url().includes("/bank-statement-preview"));
    release();
    await responded;
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const stale = await page.locator("tbody tr").count();
    await button.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("status").waitFor();
    const hashMatches =
      lastPayload === csv && (await page.getByText(sha(csv), { exact: false }).count()) === 1;
    const visibleRows = await page.locator("tbody tr").count();
    const axe = await new AxeBuilder({ page }).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t23-bank-${before ? "before" : "after"}-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "下一頁", exact: true }).click();
    await page.getByText("BANK-25", { exact: true }).waitFor();
    const calls = count;
    await input.setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([255, 254]),
    });
    await button.click();
    await page.getByRole("alert").waitFor();
    await page.waitForLoadState("networkidle");
    results.push({
      width,
      stale,
      hashMatches,
      visibleRows,
      pages: 40,
      malformedRejected: count === calls,
      axe: axe.violations.map((v) => v.id),
      overflow,
      errors,
    });
    await context.close();
  }
  console.log(JSON.stringify(results));
  assert.ok(
    results.every(
      (r) =>
        r.stale === 0 &&
        r.hashMatches &&
        r.visibleRows === 25 &&
        r.malformedRejected &&
        r.axe.length === 0 &&
        !r.overflow &&
        r.errors.length === 0,
    ),
  );
} finally {
  await browser.close();
}
