import assert from "node:assert/strict";
import { chromium } from "playwright";
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch(),
  results = [];
const shortlist = [1, 2, 3]
  .map((n) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Synthetic Cat ${n}`,
    animalType: "cat",
    imageUrl: null,
    intent: "adoption",
    rank: n,
  }))
  .concat([
    {
      id: "00000000-0000-4000-8000-000000000099",
      name: "Synthetic Sponsor",
      animalType: "sponsor",
      imageUrl: null,
      intent: "sponsorship",
      rank: 1,
    },
  ]);
try {
  for (const [mode, port] of [
    ["before", 4174],
    ["after", 4173],
  ])
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.addInitScript((items) => {
        if (!localStorage.getItem("hkscda-public-shortlist-v1"))
          localStorage.setItem("hkscda-public-shortlist-v1", JSON.stringify(items));
        window.__wizardCls = 0;
        new PerformanceObserver((entries) => {
          for (const e of entries.getEntries())
            if (!e.hadRecentInput) window.__wizardCls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      }, shortlist);
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (dialog) => dialog.accept());
      await page.goto(`http://127.0.0.1:${port}/adoption/apply`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "領養申請", exact: true }).waitFor();
      await page.locator('li[aria-current="step"]').waitFor();
      const tray = await page.locator('aside[aria-live="polite"]').count();
      const removes = page.getByRole("button", { name: /將 Synthetic Cat .* 從領養清單移除/ });
      const removeCount = await removes.count();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const cls = await page.evaluate(() => window.__wizardCls);
      const axe = await new AxeBuilder({ page }).analyze();
      await page.screenshot({
        path: `docs/evidence/audit-remediation-20260927/ui/t09-current-wizard-${mode}-${width}.png`,
        fullPage: true,
      });
      assert.equal(await page.locator("form ol > li").count(), 7);
      if (mode === "after") {
        assert.equal(tray, 0);
        assert.equal(removeCount, 3);
        const middle = page.getByRole("button", {
          name: "將 Synthetic Cat 2 從領養清單移除",
          exact: true,
        });
        await middle.focus();
        await page.keyboard.press("Enter");
        await middle.waitFor({ state: "detached" });
        const items = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("hkscda-public-shortlist-v1")),
        );
        assert.deepEqual(
          items.filter((x) => x.intent === "adoption").map((x) => [x.name, x.rank]),
          [
            ["Synthetic Cat 1", 1],
            ["Synthetic Cat 3", 2],
          ],
        );
        assert.equal(items.filter((x) => x.intent === "sponsorship").length, 1);
        await page.getByRole("button", { name: /下一步/ }).click();
        await page.locator('input[name="contact.applicantName"]').waitFor();
        await page.getByRole("button", { name: /上一步/ }).click();
        await page
          .getByRole("button", { name: "將 Synthetic Cat 1 從領養清單移除", exact: true })
          .click();
        await page
          .getByRole("button", { name: "將 Synthetic Cat 3 從領養清單移除", exact: true })
          .click();
        await page.getByRole("heading", { name: "請先選擇想領養的動物" }).waitFor();
        await page.getByRole("link", { name: "瀏覽可領養貓隻" }).click();
        await page.waitForURL((url) => url.pathname === "/animals/cat", {
          waitUntil: "domcontentloaded",
        });
        await page.locator('aside[aria-live="polite"]').waitFor();
        assert.equal(await page.getByRole("link", { name: "開始助養", exact: true }).count(), 1);
      } else {
        assert.equal(tray, 1);
        assert.equal(removeCount, 0);
      }
      results.push({
        mode,
        width,
        tray,
        removeCount,
        overflow,
        cls,
        axe: axe.violations.map((v) => v.id),
        errors,
      });
      await context.close();
    }
  console.log(JSON.stringify(results));
  await writeFile(
    "docs/evidence/audit-remediation-20260927/ui/t09-current-wizard-results.json",
    JSON.stringify(
      {
        beforeSource: "79838107c738854a28ac5a977b0e9fa6c3c6f5c2",
        afterSource: "c0da836ee5f3e3a47bd2d61f4cb83d7e52ec436a",
        environment: "Windows loopback built Nitro previews; read-only synthetic PostgREST",
        browser: browser.version(),
        fixtureSha256: createHash("sha256")
          .update(await readFile("scripts/ci/supabase-fixture.mjs"))
          .digest("hex"),
        measurementNote:
          "Single unthrottled navigation CLS sample per viewport; not a median or hosted performance claim.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  assert.ok(
    results.every(
      (x) => !x.overflow && x.errors.length === 0 && (x.mode === "before" || x.axe.length === 0),
    ),
  );
} finally {
  await browser.close();
}
