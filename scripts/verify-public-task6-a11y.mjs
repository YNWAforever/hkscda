import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
const out = [];
const browser = await chromium.launch();
for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      errors.push(m.text());
  });
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  let opened = "none";
  if (viewport.name === "mobile") {
    const b = page.getByRole("button", { name: "開啟選單" });
    await b.click();
    await page.getByRole("navigation", { name: "主選單" }).waitFor();
    opened = "mobile main menu dialog";
  } else {
    const triggers = page.locator("header button:visible");
    const labels = await triggers.allTextContents();
    if (await triggers.count()) {
      await triggers.first().click();
      await page.waitForTimeout(250);
      opened = `desktop header menu: ${labels[0]?.trim()}`;
    }
  }
  const axe = await new AxeBuilder({ page }).analyze();
  const severe = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  out.push({
    viewport,
    opened,
    errors,
    severe: severe.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
    allViolations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
    })),
  });
  await page.screenshot({
    path: `docs/evidence/frontend-wave2/task6-a11y-${viewport.name}.png`,
    fullPage: true,
  });
  await context.close();
}
await browser.close();
await fs.writeFile(
  "docs/evidence/frontend-wave2/task6-a11y.json",
  JSON.stringify(out, null, 2) + "\n",
);
console.log(JSON.stringify(out, null, 2));
if (out.some((x) => x.errors.length || x.severe.length)) process.exitCode = 1;
