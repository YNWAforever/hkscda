import { chromium } from "playwright";

const origin = "http://127.0.0.1:56543";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({ json: { admin: { role: "staff", authUserId: "synthetic" } } }),
  );
  await page.route("**/api/admin/adoption-information?**", (route) => {
    const resource = new URL(route.request().url()).searchParams.get("resource");
    return route.fulfill({ json: {
      resource,
      items: resource === "estates" ? [{
        id: "22222222-2222-4222-8222-222222222222",
        estateName: "甲屋苑",
        district: "九龍",
        notes: null,
        sortOrder: 0,
        isPublished: false,
      }] : [],
      total: resource === "estates" ? 1 : 0,
      page: 1,
      pageSize: 50,
    } });
  });
  await page.goto(origin + "/scripts/fixtures/adoption-unsaved.html", {
    waitUntil: "domcontentloaded", timeout: 45000,
  });
  await page.getByRole("tab", { name: "可養狗屋苑" }).click();
  await page.getByRole("heading", { name: "編輯屋苑" }).waitFor();
  await page.screenshot({
    path: "docs/evidence/audit-remediation-20260927/ui/t12-estate-before.png",
    fullPage: true,
  });
  console.log("PASS pre-T12 synthetic mobile estate screenshot");
} finally {
  await browser.close();
}
