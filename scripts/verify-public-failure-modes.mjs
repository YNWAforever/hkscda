import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch();
const results = [];
async function mode(value) {
  await writeFile("docs/evidence/frontend-wave2/fixture-mode.json", JSON.stringify(value));
}
async function pageFor(route) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: "window.turnstile={render:(el,opts)=>{queueMicrotask(()=>opts.callback('synthetic-config-token'));return String(1)},remove:()=>{},reset:()=>{}}",
    }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /418|hydrat/i.test(m.text())) errors.push(m.text());
  });
  const response = await page.goto("http://127.0.0.1:4174" + route, { waitUntil: "networkidle" });
  return { context, page, response, errors };
}
try {
  for (const faq of ["empty", "slow"]) {
    await mode({ faq });
    let upstreamDelayObservedMs = null;
    if (faq === "slow") {
      const delayStart = performance.now();
      await fetch("http://127.0.0.1:54330/rest/v1/faq_entry").then((r) => r.arrayBuffer());
      upstreamDelayObservedMs = performance.now() - delayStart;
      assert.ok(upstreamDelayObservedMs >= 1100);
    }
    const start = Date.now();
    const { context, page, response, errors } = await pageFor("/help");
    const expected = faq === "empty" ? "0 條已審批答案" : "2 條已審批答案";
    assert.ok((await page.locator("main").textContent()).includes(expected));
    assert.equal(response.status(), 200);
    assert.deepEqual(errors, []);
    await page.locator("main").getByRole("button", { name: "English", exact: true }).click();
    assert.ok(
      (await page.locator("main").textContent()).includes(
        faq === "empty" ? "0 approved answers" : "2 approved answers",
      ),
    );
    results.push({
      scenario: "help-" + faq,
      status: response.status(),
      expected,
      elapsedMs: Date.now() - start,
      upstreamDelayObservedMs,
      errors,
    });
    await context.close();
  }
  await mode({ payments: "error" });
  {
    const { context, page, response, errors } = await pageFor("/donate");
    let posts = 0;
    await context.route("**/api/donations", async (r) => {
      posts++;
      await r.fulfill({ status: 503, body: "{}" });
    });
    const button = page.locator("form button[type=submit]").first();
    assert.equal(await button.isDisabled(), true);
    await page.getByLabel("姓名", { exact: true }).fill("Synthetic config check");
    await page.getByRole("textbox", { name: "電郵", exact: true }).fill("config@example.invalid");
    await page
      .locator("form")
      .first()
      .evaluate((f) => f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await page.waitForTimeout(100);
    assert.equal(posts, 0);
    assert.deepEqual(errors, []);
    assert.equal(await page.getByRole("button", { name: "PayPal", exact: true }).count(), 0);
    results.push({
      scenario: "donation-config-error",
      status: response.status(),
      disabled: true,
      posts,
      errors,
    });
    await context.close();
  }
  await mode({ animals: "error" });
  {
    const { context, page, response, errors } = await pageFor(
      "/animals/cat/00000000-0000-4000-8000-000000000001",
    );
    const body = await page.locator("body").textContent();
    assert.equal(response.status(), 200);
    assert.equal(
      await page.getByRole("heading", { name: "暫時未能載入貓貓資料", exact: true }).isVisible(),
      true,
    );
    assert.equal(
      await page.getByRole("link", { name: "返回貓貓列表", exact: true }).getAttribute("href"),
      "/animals/cat",
    );
    assert.deepEqual(errors, []);

    assert.ok(!body.includes("Synthetic source unavailable"));
    results.push({
      scenario: "detail-source-outage",
      status: response.status(),
      brandedState: true,
      providerErrorHidden: true,
      errors,
    });
    await context.close();
  }
  await mode({});
  {
    const { context, page, response } = await pageFor(
      "/animals/cat/00000000-0000-4000-8000-000000000031",
    );
    const html = await response.text();
    assert.equal(response.status(), 404);
    assert.ok(!html.includes("已移除測試貓"));
    assert.ok(!(await page.locator("body").textContent()).includes("已移除測試貓"));
    results.push({
      scenario: "removed-animal-private-record-absent",
      status: 404,
      privateNameAbsent: true,
    });
    await context.close();
  }
  await mode({});
  {
    const { context, page } = await pageFor("/donate");
    const paypal = page.getByRole("button", { name: "PayPal", exact: true });
    assert.equal(await paypal.getAttribute("aria-pressed"), "true");
    await page.locator("form").getByRole("button", { name: "EN", exact: true }).click();
    assert.equal(await paypal.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("form").getAttribute("lang"), "en");
    await page.locator("form").getByRole("button", { name: "繁", exact: true }).click();
    assert.equal(await paypal.getAttribute("aria-pressed"), "true");
    results.push({
      scenario: "published-payment-choice-both-languages",
      method: "paypal",
      selectedAcrossLanguageChange: true,
    });
    await context.close();
  }
} finally {
  await mode({});
  await browser.close();
  await writeFile(
    "docs/evidence/frontend-wave2/failure-mode-browser.json",
    JSON.stringify({ results }, null, 2),
  );
}
console.log(`Passed ${results.length} failure-mode scenarios`);
