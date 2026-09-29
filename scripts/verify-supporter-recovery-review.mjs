import assert from "node:assert/strict";
import { chromium } from "playwright";
const baseline = process.env.RECOVERY_FIXTURE_BASELINE === "1";
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [390, 768, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    const requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/supporter/recovery", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: requests.length === 1 ? 503 : 202,
        json: requests.length === 1 ? { error: "Temporarily unavailable" } : { accepted: true },
      });
    });
    await page.goto("http://127.0.0.1:56553/scripts/fixtures/supporter-recovery.html", {
      waitUntil: "networkidle",
    });
    await page.getByLabel("電郵地址").fill("SYNTHETIC@example.invalid");
    await page.getByRole("button", { name: "合成人機驗證" }).click();
    await page.getByRole("button", { name: "取得登入電郵", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("alert").waitFor();
    const challengeReset =
      (await page.getByRole("button", { name: "取得登入電郵", exact: true }).isDisabled()) &&
      (await page.getByRole("button", { name: "合成人機驗證" }).isEnabled());
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t22-recovery-${baseline ? "before" : "after"}-${width}.png`,
      fullPage: true,
    });
    if (!baseline) {
      assert.equal(challengeReset, true, "Failed request must obtain a fresh single-use challenge");
      await page.getByRole("button", { name: "合成人機驗證" }).click();
    }
    await page.getByRole("button", { name: "取得登入電郵", exact: true }).click();
    await page.getByLabel("電郵驗證碼").fill("123456");
    await page.getByRole("button", { name: "驗證並繼續", exact: true }).click();
    await page.waitForFunction(() => window.recoveryFixture.verifies.length === 1);
    const retryLocked = await page.getByRole("button", { name: "重新取得連結" }).isDisabled();
    if (!baseline) {
      assert.equal(retryLocked, true, "Cannot switch identity while OTP verification is pending");
      assert.notEqual(requests[0].challengeToken, requests[1].challengeToken);
    }
    await page.evaluate(() =>
      window.recoveryFixture.resolve({ data: { session: null }, error: { message: "expired" } }),
    );
    await page.getByRole("alert").waitFor();
    await page.getByLabel("電郵驗證碼").fill("654321");
    await page.getByRole("button", { name: "驗證並繼續", exact: true }).click();
    await page.waitForFunction(() => window.recoveryFixture.verifies.length === 2);
    await page.evaluate(() =>
      window.recoveryFixture.resolve({
        data: { session: { access_token: "synthetic" } },
        error: null,
      }),
    );
    await page.getByRole("heading", { name: "電郵已驗證" }).waitFor();
    await page.getByRole("button", { name: "退出", exact: true }).click();
    assert.equal(await page.getByLabel("電郵地址").isVisible(), true);
    if (width === 768)
      await page.evaluate(() => {
        document.body.style.zoom = "200%";
      });
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(dimensions.scroll <= dimensions.width + 1);
    assert.deepEqual(errors, []);
    results.push({
      width,
      challengeReset,
      retryLocked,
      expiredThenValid: true,
      logout: true,
      noOverflow: true,
      syntheticOnly: true,
    });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  assert.ok(
    results.every((r) => r.challengeReset && r.retryLocked),
    "Recovery challenge reset and pending identity lock",
  );
} finally {
  await browser.close();
}
