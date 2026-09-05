import { chromium } from "playwright";
import fs from "node:fs/promises";
const browser = await chromium.launch();
const cases = [
  { name: "empty", shortlist: null, draft: null },
  {
    name: "saved",
    shortlist: JSON.stringify([
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Fixture Cat",
        animalType: "cat",
        imageUrl: null,
        intent: "adoption",
        rank: 1,
      },
    ]),
    draft: JSON.stringify({
      contact: {
        applicantName: "Saved Applicant",
        phone: "91234567",
        email: "saved@example.test",
        address: "Synthetic address",
        preferredContactMethod: "whatsapp",
        householdSize: 2,
      },
    }),
  },
];
const results = [];
for (const sample of cases) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(
    ({ shortlist, draft }) => {
      localStorage.clear();
      if (shortlist) localStorage.setItem("hkscda-public-shortlist-v1", shortlist);
      if (draft) localStorage.setItem("hkscda-adoption-application-draft-v1", draft);
      window.__probe = { shifts: [], mutations: [], frames: [] };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          if (!e.hadRecentInput)
            window.__probe.shifts.push({
              value: e.value,
              sources: (e.sources || []).map((s) => ({
                node: s.node?.tagName + "." + s.node?.className,
                previousRect: s.previousRect,
                currentRect: s.currentRect,
              })),
            });
      }).observe({ type: "layout-shift", buffered: true });
      new MutationObserver((records) =>
        window.__probe.mutations.push(
          records.map((r) => ({
            type: r.type,
            added: [...r.addedNodes].map((n) => n.textContent?.slice(0, 60)),
            removed: [...r.removedNodes].map((n) => n.textContent?.slice(0, 60)),
          })),
        ),
      ).observe(document, { subtree: true, childList: true });
      let count = 0;
      const snap = () => {
        const main = document.querySelector("#main-content main");
        const footer = document.querySelector("footer");
        window.__probe.frames.push({
          t: performance.now(),
          mainText: main?.innerText.slice(0, 80),
          mainRect: main?.getBoundingClientRect().toJSON(),
          footerTop: footer?.getBoundingClientRect().top,
          style: main?.getAttribute("style"),
        });
        if (++count < 30) requestAnimationFrame(snap);
      };
      requestAnimationFrame(snap);
    },
    { shortlist: sample.shortlist, draft: sample.draft },
  );
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/adoption/apply", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if (sample.name === "saved") {
    await page.getByRole("button", { name: /下一步/ }).click();
    await page.waitForTimeout(100);
  }
  const probe = await page.evaluate(() => window.__probe);
  results.push({
    name: sample.name,
    ...probe,
    finalValue: probe.shifts.reduce((n, e) => n + e.value, 0),
    savedName: (await page.locator('input[name="contact.applicantName"]').count())
      ? await page.locator('input[name="contact.applicantName"]').inputValue()
      : null,
  });
  await context.close();
}
await browser.close();
await fs.writeFile(
  "docs/evidence/frontend-wave2/adoption-cls-storage-cases.json",
  JSON.stringify(results, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    results.map((r) => ({
      name: r.name,
      finalValue: r.finalValue,
      savedName: r.savedName,
      frames: r.frames.slice(0, 6),
      shifts: r.shifts,
    })),
    null,
    2,
  ),
);
