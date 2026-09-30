import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const browser = await chromium.launch();
const cases = [];
try {
  for (const variant of ["same-session-refresh", "new-actor", "new-session"]) {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:56553/scripts/fixtures/supporter-recovery.html", {
      waitUntil: "networkidle",
    });
    const tokens = await page.evaluate((variant) => {
      const token = (sub, session, exp) =>
        btoa(JSON.stringify({ alg: "HS256" })) +
        "." +
        btoa(JSON.stringify({ sub, session_id: session, exp })) +
        ".synthetic";
      return [
        token("a", "same-session-a", 1),
        token(
          variant === "new-actor" ? "b" : "a",
          variant === "new-session" ? "new-session-a" : "same-session-a",
          2,
        ),
      ];
    }, variant);
    await page.evaluate((token) => {
      window.recoveryFixture.emit("SIGNED_IN", { access_token: token });
      window.recoveryFixture.holdLogout = true;
    }, tokens[0]);
    await page.getByRole("heading", { name: "電郵已驗證" }).waitFor();
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.evaluate((token) => {
      window.recoveryFixture.emit("TOKEN_REFRESHED", { access_token: token });
      window.recoveryFixture.finishLogout({ error: { message: "synthetic logout refusal" } });
    }, tokens[1]);
    await page.waitForTimeout(50);
    assert.equal(await page.getByRole("alert").count(), variant === "same-session-refresh" ? 1 : 0);
    assert.equal(await page.getByRole("button", { name: "退出", exact: true }).isEnabled(), true);
    cases.push({ variant, passed: true });
    await page.close();
  }
  const result = {
    status: "passed",
    environment:
      "actual SupporterPage / synthetic refreshed and switched sessions / local Chromium",
    providerRequests: 0,
    cases,
  };
  await writeFile(
    "docs/evidence/audit-remediation-20260927/t22-logout-ui.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
