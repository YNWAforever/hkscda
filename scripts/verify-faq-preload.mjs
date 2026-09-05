import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch();
const page = await browser.newPage();
const responses = [];
const pending = [];
page.on("response", (response) => {
  if (response.request().resourceType() === "document") return;
  pending.push(
    (async () => {
      const body = await response.text().catch(() => "");
      if (body.includes("fixture-adoption")) responses.push({ bytes: Buffer.byteLength(body) });
    })(),
  );
});
await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await Promise.all(pending);
const beforeOpen = responses.length;
await page.getByRole("button", { name: "開啟 HKSCDA 小幫手", exact: true }).click();
await page.locator("#help-widget-panel input").fill("領養");
await page.locator("#help-widget-panel input").press("Enter");
await page.waitForLoadState("networkidle");
await Promise.all(pending);
const afterOpen = responses.length;
const answerVisible = (await page.locator("#help-widget-panel").textContent()).includes("本機驗證");
await browser.close();
await mkdir("docs/evidence/frontend-wave2", { recursive: true });
const result = { beforeOpen, afterOpen, answerVisible, responses };
await writeFile(
  process.env.OUTPUT_FILE ?? "docs/evidence/frontend-wave2/faq-preload.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
if (beforeOpen !== 0 || afterOpen !== 1 || !answerVisible) process.exitCode = 1;
