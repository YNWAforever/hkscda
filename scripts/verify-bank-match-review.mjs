import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const capturePrefix = process.env.BANK_MATCH_CAPTURE_PREFIX ?? "t23-bank-match";
const before = process.argv.includes("--before"),
  browser = await chromium.launch(),
  results = [],
  base = "hkscda-finance-bank-match-operation",
  idA = "aaaaaaaa-1111-4111-8111-111111111111",
  idB = "bbbbbbbb-2222-4222-8222-222222222222",
  payment = "22222222-3333-4444-8555-666666666666";
const item = (n) => ({
  ordinal: n,
  paymentId: payment,
  bankReference: "REF-" + n,
  paymentHint: "HINT-" + n,
  amountCents: 10000,
  status: "pending",
  reasonCode: null,
  deliveryJobId: null,
  appliedAt: null,
});
const op = (id, count) => ({
  operationId: id,
  fileSha256: "a".repeat(64),
  createdAt: "2026-09-30T00:00:00Z",
  expiresAt: "2026-09-30T00:15:00Z",
  state: "queued",
  items: Array.from({ length: count }, (_, i) => item(i + 1)),
});
try {
  for (const width of [390, 768, 1366])
    for (const mode of before ? ["page"] : ["page", "mount", "lost", "actor"]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }),
        page = await context.newPage(),
        errors = [];
      let reads = 0,
        creates = 0,
        patches = 0,
        release,
        readStarted;
      const started = new Promise((r) => (readStarted = r));
      let saved = op(idA, mode === "page" ? 50 : 1);
      const actor = mode === "actor" ? "second-finance" : "synthetic-finance";
      await context.addInitScript(
        ({ base, idA }) => {
          sessionStorage.setItem(base, idA);
          sessionStorage.setItem(base + ":synthetic-finance", idA);
        },
        { base, idA },
      );
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (d) => d.accept());
      await context.route("**/*", async (route) => {
        const u = new URL(route.request().url()),
          method = route.request().method();
        if (u.hostname !== "127.0.0.1") return route.abort();
        if (!u.pathname.startsWith("/api/")) return route.continue();
        if (u.pathname.endsWith("/bank-statement-preview"))
          return route.fulfill({
            json: {
              fileSha256: "a".repeat(64),
              generatedAt: "2026-09-30",
              summary: {
                total: 1,
                invalid: 0,
                duplicate: 0,
                credited: 0,
                candidates: 1,
                unmatched: 0,
              },
              rows: [
                {
                  ordinal: 1,
                  bankReference: "REF-1",
                  receivedOn: "2026-09-30",
                  amountCents: 10000,
                  paymentHint: "HINT-1",
                  status: "candidate_exact",
                  invalidReason: null,
                  candidateCount: 1,
                  candidates: [{ id: payment, provider: "fps", providerRef: "HINT-1" }],
                },
              ],
            },
          });
        assert.equal(u.pathname, "/api/admin/finance/bank-match-operations");
        if (method === "GET") {
          reads++;
          if (mode === "actor")
            return route.fulfill({ status: 403, json: { error: "Owner mismatch" } });
          if (mode === "mount" && reads === 1) {
            readStarted();
            await new Promise((r) => (release = r));
          }
          return route.fulfill({ json: saved });
        }
        if (method === "POST") {
          creates++;
          saved = op(idB, 1);
          return route.fulfill({ json: saved });
        }
        if (method === "PATCH") {
          patches++;
          saved = { ...saved, state: "done", items: [{ ...saved.items[0], status: "succeeded" }] };
          return route.abort("failed");
        }
        throw Error("Unexpected method");
      });
      await page.goto(`http://127.0.0.1:56573/scripts/fixtures/bank-match.html?actor=${actor}`, {
        waitUntil: "domcontentloaded",
      });
      const review = page.getByRole("region", { name: "逐組確認", exact: true });
      if (mode === "lost") {
        await review.waitFor();
        await review.getByRole("button", { name: "確認此筆入帳", exact: true }).click();
        await page.getByRole("alert").waitFor();
        assert.equal(
          await review.getByRole("button", { name: "確認此筆入帳", exact: true }).isDisabled(),
          true,
        );
        await page.getByRole("button", { name: "重新讀取確認結果", exact: true }).click();
        await review.getByRole("cell", { name: "已入帳", exact: true }).waitFor();
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "下載逐筆結果 CSV" }).click();
        assert.equal((await download).suggestedFilename(), "bulk-results.csv");
      } else {
        if (mode === "mount") await started;
        else if (mode === "page") {
          await review.waitFor();
          await review.getByRole("button", { name: "下一頁", exact: true }).click();
          await review.getByText("第 2 / 2 頁", { exact: true }).waitFor();
        }
        await page
          .getByLabel("選擇標準 CSV")
          .setInputFiles({
            name: "synthetic.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(
              "bank_reference,received_on,currency,amount_hkd,payment_hint\nREF-1,2026-09-30,HKD,100.00,HINT-1",
            ),
          });
        await page.getByRole("button", { name: "產生唯讀預覽", exact: true }).click();
        await page.getByRole("checkbox", { name: "選取第 1 行作確認預覽" }).check();
        if (mode === "mount") {
          assert.equal(
            await page.getByRole("button", { name: "正在處理快照…", exact: true }).isDisabled(),
            true,
          );
          release();
          await review.waitFor();
        }
        const create = page.getByRole("button", { name: "建立逐組確認預覽", exact: true });
        await create.focus();
        await page.keyboard.press("Enter");
        await page.getByText("快照 " + idB, { exact: false }).waitFor();
      }
      const visibleRows = await review.locator("tbody tr").count(),
        axe = await new AxeBuilder({ page }).analyze(),
        overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (mode === "page")
        await page.screenshot({
          path: `docs/evidence/audit-remediation-20260927/ui/${capturePrefix}-${before ? "before" : "after"}-${width}.png`,
          fullPage: true,
        });
      const keys = await page.evaluate(
        (base) => ({
          first: sessionStorage.getItem(base + ":synthetic-finance"),
          second: sessionStorage.getItem(base + ":second-finance"),
        }),
        base,
      );
      results.push({
        width,
        mode,
        visibleRows,
        reads,
        creates,
        patches,
        actorPreserved:
          mode !== "actor" || (keys.first === idA && keys.second === idB && reads === 0),
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
        r.visibleRows === 1 &&
        r.actorPreserved &&
        r.axe.length === 0 &&
        !r.overflow &&
        r.errors.length === 0,
    ),
  );
} finally {
  await browser.close();
}
