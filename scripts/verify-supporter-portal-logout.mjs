import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const browser = await chromium.launch();
const cases = [];
try {
  for (const variant of ["same-session-refresh", "new-actor", "new-session"]) {
    const page = await browser.newPage();
    await page.route("**/api/supporter/records", (route) =>
      route.fulfill({
        json: { adoption: [], sponsorship: [], donations: [], receipts: [], marketingEmail: null },
      }),
    );
    await page.goto("http://127.0.0.1:56556/scripts/fixtures/supporter-portal.html", {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "同意接收推廣電郵", exact: true }).waitFor();
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
    await page.evaluate((token) => window.setSyntheticToken(token), tokens[0]);
    await page.getByRole("button", { name: "同意接收推廣電郵", exact: true }).waitFor();
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.evaluate((token) => {
      window.setSyntheticToken(token);
      window.finishSignOut({ error: { message: "synthetic logout refusal" } });
    }, tokens[1]);
    await page.waitForTimeout(100);
    assert.equal(
      await page.getByRole("alert").count(),
      variant === "same-session-refresh" ? 1 : 0,
      "Logout refusal after same-session refresh must remain visible",
    );
    assert.equal(await page.getByRole("button", { name: "退出", exact: true }).isEnabled(), true);
    cases.push({ variant, passed: true });
    await page.close();
  }
  const result = {
    status: "passed",
    environment:
      "actual SupporterPortal / synthetic refreshed and switched sessions / local Chromium",
    providerRequests: 0,
    cases,
  };
  await writeFile(
    "docs/evidence/audit-remediation-20260927/t22-portal-logout-ui.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
