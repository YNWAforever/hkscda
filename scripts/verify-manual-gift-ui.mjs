import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "node:http";
const output = resolve("docs/evidence/crm-package2/browser");
await mkdir(output, { recursive: true });
if (typeof Bun !== "undefined") {
  console.log("Building isolated UI fixture");
  const built = await Bun.build({
    entrypoints: ["scripts/fixtures/manual-gift-ui.tsx"],
    target: "browser",
    plugins: [
      {
        name: "isolated-admin-api",
        setup(builder) {
          builder.onLoad({ filter: /[\\/]components[\\/]admin[\\/]crm[\\/]api\.ts$/ }, () => ({
            loader: "ts",
            contents: `export async function fetchAdminJson(path, init) { const response = await fetch(path, init); if (!response.ok) throw new Error('Temporary fixture failure'); return response.json(); }`,
          }));
          builder.onLoad({ filter: /[\\/]components[\\/]admin[\\/]adminPageCopy\.ts$/ }, () => ({
            loader: "ts",
            contents: `export function useAdminPageCopy(){return {language:'zh'};}`,
          }));
        },
      },
    ],
  });
  if (!built.success) throw new Error("Fixture bundle failed: " + built.logs.join("\n"));
  console.log("UI fixture bundled");
  await writeFile(resolve(output, "fixture.js"), await built.outputs[0].text());
  process.exit(0);
}
const bundle = await readFile(resolve(output, "fixture.js"), "utf8");
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(bundle);
  } else {
    response.setHeader("content-type", "text/html");
    response.end(
      '<!doctype html><html><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => console.error(error.message));
  console.log("Browser ready");
  const posts = [];
  let retries = 0;
  await page.route("**/api/admin/donations/manual", async (route) => {
    posts.push(route.request().postDataJSON());
    if (posts.length === 1) return route.fulfill({ status: 503, body: "{}" });
    return route.fulfill({
      status: 201,
      json: {
        donationId: "synthetic-gift",
        paymentId: "synthetic-payment",
        deliveryJobId: "11111111-2222-4333-8444-555555555555",
        deliveryStatus: "retryable",
        replayed: true,
      },
    });
  });
  await page.route("**/api/admin/donations/delivery/*/retry", (route) => {
    retries++;
    return route.fulfill({ json: { deliveryStatus: "complete" } });
  });
  await page.goto(baseURL);
  await page.getByRole("button", { name: "手動捐款", exact: true }).click();
  await page.getByLabel("金額 HKD").fill("100");
  await page.getByRole("button", { name: "儲存手動捐款" }).click();
  await page.getByText("Temporary fixture failure").waitFor();
  await page.getByRole("button", { name: "儲存手動捐款" }).click();
  await page.getByText("捐款已儲存", { exact: true }).waitFor();
  await page.getByRole("button", { name: "重試收據及確認電郵" }).click();
  await page.getByText("收據處理完成，電郵服務已接納確認電郵。").waitFor();
  const result = {
    financialPosts: posts.length,
    stableRequestId: posts[0].requestId === posts[1].requestId,
    retryPosts: retries,
    remainingSaveButtons: await page.getByRole("button", { name: "儲存手動捐款" }).count(),
    remainingRetryButtons: await page.getByRole("button", { name: "重試收據及確認電郵" }).count(),
  };
  await writeFile(resolve(output, "result.json"), JSON.stringify(result, null, 2));
  await page.screenshot({ path: resolve(output, "complete.png") });
  if (
    !result.stableRequestId ||
    result.financialPosts !== 2 ||
    result.retryPosts !== 1 ||
    result.remainingSaveButtons ||
    result.remainingRetryButtons
  )
    throw new Error("Manual gift recovery acceptance failed");
  console.log(JSON.stringify(result));
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("region", { name: "Saved donation history" }).getByRole("button", { name: "重試收據及確認電郵" }).click();
  await page.getByText("電郵服務已接納確認電郵", { exact: true }).waitFor();
  const historyResult = { financialPosts: posts.length, totalRetryPosts: retries, historyRetryCompleted: true };
  if (posts.length !== 2 || retries !== 2) throw new Error("History retry created unexpected writes");
  await writeFile(resolve(output, "history-result.json"), JSON.stringify(historyResult, null, 2));
  console.log(JSON.stringify(historyResult));
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}

