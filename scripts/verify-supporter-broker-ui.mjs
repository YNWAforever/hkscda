import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const browser = await chromium.launch();
const results = [];
const portal = process.argv.includes("--portal");
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    const verifies = [];
    let release;
    if (portal)
      await page.route("**/api/supporter/records", (route) =>
        route.fulfill({
          json: {
            adoption: [],
            sponsorship: [],
            donations: [],
            receipts: [],
            marketingEmail: null,
          },
        }),
      );
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/supporter/recovery", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: requests.length === 1 ? 503 : 202,
        json:
          requests.length === 1
            ? { error: "Temporarily unavailable" }
            : { accepted: true, challengeId: "12345678-1234-4234-8234-123456789012" },
      });
    });
    await page.route("**/api/supporter/recovery/verify", async (route) => {
      verifies.push(route.request().postDataJSON());
      const response = await new Promise((resolve) => {
        release = resolve;
      });
      await route.fulfill(response);
    });
    await page.goto("http://127.0.0.1:56553/scripts/fixtures/supporter-recovery.html", {
      waitUntil: "networkidle",
    });
    await page.getByLabel("電郵地址").fill("SYNTHETIC@example.invalid");
    await page.getByRole("button", { name: "合成人機驗證" }).click();
    await page.getByRole("button", { name: "取得登入電郵", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page.getByRole("button", { name: "取得登入電郵", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "合成人機驗證" }).click();
    await page.getByRole("button", { name: "取得登入電郵", exact: true }).click();
    await page.getByLabel("電郵驗證碼").fill("12345678");
    assert.equal(
      await page.getByRole("button", { name: "驗證並繼續", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "合成人機驗證" }).click();
    await page.getByRole("button", { name: "驗證並繼續", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.querySelector('input[autocomplete="one-time-code"]')?.disabled,
    );
    assert.equal(await page.getByRole("button", { name: "重新取得連結" }).isDisabled(), true);
    while (!release) await new Promise((resolve) => setTimeout(resolve, 20));
    release({ status: 401, json: { error: "Verification failed" } });
    release = undefined;
    await page.getByRole("alert").waitFor();
    await page.getByLabel("電郵驗證碼").fill("87654321");
    await page.getByRole("button", { name: "合成人機驗證" }).click();
    await page.getByRole("button", { name: "驗證並繼續", exact: true }).click();
    while (!release) await new Promise((resolve) => setTimeout(resolve, 20));
    release({
      status: 200,
      json: { access_token: "synthetic-a-access", refresh_token: "synthetic-a-refresh" },
    });
    release = undefined;
    await page.getByRole("heading", { name: portal ? "我的紀錄" : "電郵已驗證" }).waitFor();
    assert.equal(await page.evaluate(() => window.recoveryFixture.sessions.length), 1);
    assert.equal(verifies.length, 2);
    assert.equal(verifies[0].challengeId, "12345678-1234-4234-8234-123456789012");
    assert.equal(verifies[0].email, "synthetic@example.invalid");
    assert.notEqual(verifies[0].challengeToken, verifies[1].challengeToken);
    assert.equal(
      await page.evaluate(() => window.recoveryFixture.verifies.length),
      0,
      "Browser must not redeem the provider carrier directly",
    );
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.getByLabel("電郵地址").waitFor();
    await page.getByRole("button", { name: "合成人機驗證" }).click();
    await page.getByRole("button", { name: "取得登入電郵", exact: true }).click();
    await page.getByLabel("電郵驗證碼").fill("87654321");
    await page.getByRole("button", { name: "合成人機驗證" }).click();
    await page.getByRole("button", { name: "驗證並繼續", exact: true }).click();
    while (!release) await new Promise((resolve) => setTimeout(resolve, 20));
    await page.evaluate(() =>
      window.recoveryFixture.emit("SIGNED_IN", {
        access_token: "synthetic-b",
        user: { id: "synthetic-b" },
      }),
    );
    release({
      status: 200,
      json: { access_token: "stale-a-access", refresh_token: "stale-a-refresh" },
    });
    release = undefined;
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(() => window.recoveryFixture.sessions.length),
      1,
      "Late recovery must not replace a newly signed-in actor",
    );
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.getByLabel("電郵地址").waitFor();
    const a11y = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(
      a11y.violations.map((v) => v.id),
      [],
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false);
    await page.screenshot({
      path: `docs/evidence/audit-remediation-20260927/ui/t22-${portal ? "integrated" : "broker"}-after-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    results.push({
      width,
      keyboard: true,
      expiredThenValid: true,
      freshChallenges: true,
      providerOtpCalls: 0,
      sessionInstallation: true,
      lateActorChangeRefused: true,
      logout: true,
      axeViolations: 0,
      overflow: false,
      pageErrors: 0,
      syntheticOnly: true,
      portal,
    });
    await context.close();
  }
  await writeFile(
    `docs/evidence/audit-remediation-20260927/t22-${portal ? "integrated" : "broker"}-ui.json`,
    JSON.stringify(
      {
        environment:
          "actual SupporterPage / loopback Vite / synthetic HTTP, Auth and Turnstile boundaries",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
