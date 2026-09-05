// Local-only production component fixture; all API and storage operations are synthetic.
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
execFileSync("bun", ["scripts/build-protected-forms-fixture.ts"], {
  stdio: "pipe",
  windowsHide: true,
});
const bundle = await readFile(
  "docs/evidence/frontend-coverage/protected-forms/protected-forms.js",
  "utf8",
);
const server = createServer((req, res) => {
  res.setHeader("content-type", req.url === "/fixture.js" ? "text/javascript" : "text/html");
  res.end(
    req.url === "/fixture.js"
      ? bundle
      : '<div id="root"></div><script type="module" src="/fixture.js"></script>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
const results = [];
const pageErrors = [];
const draft = {
  language: "en",
  contact: {
    applicantName: "Synthetic Ada",
    phone: "91234567",
    email: "ada@example.invalid",
    address: "Synthetic home",
    preferredContactMethod: "whatsapp",
    householdSize: 3,
  },
  home: {
    housingType: "私人樓宇",
    landlordRestrictions: "No restrictions",
    windowDoorSafety: "Mesh installed",
    indoorSpaceNotes: "Quiet living room",
    homeModificationsPossible: true,
  },
  readiness: {
    currentPets: "None",
    petCareExperience: "Grew up with cats",
    householdAgreement: "Everyone agrees",
    dailySchedule: "Home evenings",
    monthlyBudgetHkd: 1200,
    emergencyCarePlan: "Nearby vet",
    reason: "Safe stable home",
  },
  visit: {
    dateRangeStart: "2030-01-10",
    dateRangeEnd: "2030-01-24",
    dogTimeWindows: [],
    catTimeWindows: ["weekday_evening"],
    notes: "Call first",
  },
  terms: { agreed: true, version: "adoption-terms-2026-07" },
};
async function setup(form) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const posts = [];
  await page.addInitScript((draft) => {
    localStorage.setItem("hkscda-adoption-application-draft-v1", JSON.stringify(draft));
    window.fixtureWidgets = [];
    window.fixtureUploads = [];
    window.fixtureUploadFailAt = 0;
    window.fixtureUpload = async (bucket, path, token, file) => {
      window.fixtureUploads.push({ bucket, path, name: file.name, size: file.size });
      return {
        error:
          window.fixtureUploads.length === window.fixtureUploadFailAt
            ? new Error("Synthetic upload failure")
            : null,
      };
    };
    window.turnstile = {
      render: (_el, options) => {
        window.fixtureWidgets.push(options);
        return String(window.fixtureWidgets.length);
      },
      remove: () => {},
      reset: () => {},
    };
  }, draft);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const data = route.request().postDataJSON();
    if (route.request().method() === "POST") posts.push({ path: url.pathname, data });
    if (url.pathname === "/api/volunteer/activities")
      return route.fulfill({
        json: {
          activities: [
            {
              id: "11111111-2222-4333-8444-555555555555",
              title: "Synthetic activity",
              status: "published",
              startsAt: "2030-01-01T00:00:00Z",
              capacity: 10,
              remainingCapacity: 10,
              approvedParticipants: 0,
              waitlistedParticipants: 0,
              pendingParticipants: 0,
              allowWaitlist: true,
              autoApprove: false,
              minAge: 21,
              underagePolicy: "block",
              registrationModes: ["individual", "group"],
              location: "Synthetic place",
              type: "volunteer_shift",
            },
          ],
        },
      });
    if (url.pathname.endsWith("proof-upload-url"))
      return route.fulfill({
        json: {
          pledgeId: "11111111-2222-4333-8444-555555555555",
          upload: { path: "synthetic/proof", token: "fixture" },
        },
      });
    if (url.pathname.endsWith("photo-upload-urls"))
      return route.fulfill({
        json: {
          applicationId: "11111111-2222-4333-8444-555555555555",
          uploads: data.photos.map((p) => ({
            category: p.category,
            path: "synthetic/" + p.category,
            token: "fixture",
          })),
        },
      });
    return route.fulfill({ status: 503, json: { error: "Synthetic submit failure" } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?form=${form}`);
  await page.locator("form").waitFor();
  return { page, posts };
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const verify = async (page, token) => {
  await page.evaluate((token) => window.fixtureWidgets.at(-1).callback(token), token);
  await page.locator('button[type="submit"]').waitFor();
};
const snapshot = (page) =>
  page.locator("input,select,textarea").evaluateAll((nodes) =>
    nodes.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      value: e.type === "file" ? Array.from(e.files ?? []).map((f) => f.name) : e.value,
      checked: e.type === "checkbox" ? e.checked : undefined,
    })),
  );
async function submitFailure(page, token) {
  const count = await page.evaluate(() => window.fixtureWidgets.length);
  await verify(page, token);
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction((count) => window.fixtureWidgets.length > count, count);
  assert(await page.locator('button[type="submit"]').isDisabled(), "submit must await fresh token");
}
const jpeg = {
  name: "synthetic-home.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from([255, 216, 255, 217]),
};
try {
  for (const form of ["group", "volunteer", "sponsorship"]) {
    const { page, posts } = await setup(form);
    if (form === "group") {
      const fields = page.locator("form input");
      for (const [i, v] of [
        [0, "Synthetic Organisation"],
        [1, "Synthetic Ada"],
        [2, "ada@example.invalid"],
        [3, "91234567"],
        [4, "12"],
        [5, "Adults"],
        [6, "January mornings"],
      ])
        await fields.nth(i).fill(v);
      await page.locator("textarea").fill("Keep synthetic group notes");
    }
    if (form === "volunteer") {
      for (const [id, v] of [
        ["volunteer-contact-name", "Synthetic Ada"],
        ["volunteer-email", "ada@example.invalid"],
        ["volunteer-phone", "91234567"],
        ["volunteer-declared-age", "30"],
        ["volunteer-notes", "Keep synthetic volunteer notes"],
      ])
        await page.locator("#" + id).fill(v);
      await page.locator("#volunteer-whatsapp-consent").check();
    }
    if (form === "sponsorship") {
      for (const [id, v] of [
        ["pledge-supporter-name", "Synthetic Ada"],
        ["pledge-email", "ada@example.invalid"],
        ["pledge-phone", "91234567"],
        ["pledge-notes", "Keep synthetic pledge notes"],
      ])
        await page.locator("#" + id).fill(v);
      await page.locator("#pledge-terms").check();
      await page.locator("#pledge-include-proof").check();
      await page.locator("#pledge-proof-reference").fill("SYNTHETIC-REF");
      await page.locator("#pledge-proof-amount").fill("300");
      await page.locator("#pledge-proof-date").fill("2026-09-06");
      await page.locator("#pledge-proof-file").setInputFiles(jpeg);
      await page.evaluate(() => (window.fixtureUploadFailAt = 1));
    }
    const before = await snapshot(page);
    await submitFailure(page, "synthetic-first");
    assert(
      JSON.stringify(await snapshot(page)) === JSON.stringify(before),
      form + " fields changed after failure",
    );
    if (form === "sponsorship") {
      assert(
        posts.filter((p) => p.path === "/api/sponsorships/pledges").length === 0,
        "proof failure must prevent final post",
      );
      await submitFailure(page, "synthetic-after-upload-error");
      assert(
        JSON.stringify(await snapshot(page)) === JSON.stringify(before),
        "proof/file changed after transport error",
      );
    }
    await submitFailure(page, "synthetic-retry");
    assert(
      JSON.stringify(await snapshot(page)) === JSON.stringify(before),
      form + " fields changed after retry",
    );
    const finalPosts = posts.filter((p) => !p.path.endsWith("upload-url"));
    assert(finalPosts.length === 2, form + " expected two final attempts");
    assert(
      finalPosts[0].data.turnstileToken !== finalPosts[1].data.turnstileToken,
      form + " reused token",
    );
    await page.screenshot({
      path: `docs/evidence/frontend-coverage/protected-${form}.png`,
      fullPage: true,
    });
    results.push({
      form,
      fieldsPreserved: true,
      freshTokenRetry: true,
      finalAttempts: finalPosts.length,
      partialUploadFailure: form === "sponsorship",
      uploadFiles: await page.evaluate(() => window.fixtureUploads.map((x) => x.name)),
    });
    await page.close();
  }
  const { page, posts } = await setup("adoption");
  const next = () => page.getByRole("button", { name: "下一步", exact: true }).click();
  await next();
  await page.locator('[name="contact.applicantName"]').fill("Synthetic Edited Ada");
  await next();
  await next();
  await next();
  await next();
  await page.locator('input[type="file"]').nth(0).setInputFiles(jpeg);
  await page
    .locator('input[type="file"]')
    .nth(1)
    .setInputFiles({ ...jpeg, name: "synthetic-window.jpg" });
  await next();
  await page.locator('input[type="checkbox"]').check();
  await page.evaluate(() => (window.fixtureUploadFailAt = 2));
  await submitFailure(page, "synthetic-photo-first");
  assert(
    posts.filter((p) => p.path === "/api/adoption/applications").length === 0,
    "partial photo failure must prevent final post",
  );
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  assert(
    await page.getByText("synthetic-home.jpg", { exact: true }).isVisible(),
    "first photo lost on wizard remount",
  );
  assert(
    await page.getByText("synthetic-window.jpg", { exact: true }).isVisible(),
    "second photo lost on wizard remount",
  );
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "上一步", exact: true }).click();
  assert(
    (await page.locator('[name="contact.applicantName"]').inputValue()) === "Synthetic Edited Ada",
    "contact lost across wizard steps",
  );
  for (let i = 0; i < 5; i++) await next();
  assert(
    await page.locator('button[type="submit"]').isDisabled(),
    "wizard remount needs fresh verification",
  );
  await submitFailure(page, "synthetic-after-photo-error");
  await submitFailure(page, "synthetic-photo-retry");
  const finalPosts = posts.filter((p) => p.path === "/api/adoption/applications");
  assert(finalPosts.length === 2, "adoption final retry count");
  assert(
    finalPosts.every(
      (p) =>
        p.data.payload.contact.applicantName === "Synthetic Edited Ada" &&
        p.data.photos.length === 2,
    ),
    "adoption fields/files missing in retried payload",
  );
  assert(
    finalPosts[0].data.turnstileToken !== finalPosts[1].data.turnstileToken,
    "adoption reused token",
  );
  await page.screenshot({
    path: "docs/evidence/frontend-coverage/protected-adoption.png",
    fullPage: true,
  });
  results.push({
    form: "adoption",
    fieldsPreserved: true,
    photoNamesPreserved: true,
    wizardStepRemount: true,
    partialUploadFailure: true,
    freshTokenRetry: true,
    finalAttempts: 2,
    uploadedFiles: await page.evaluate(() => window.fixtureUploads.map((x) => x.name)),
  });
  await page.close();
  assert(pageErrors.length === 0, JSON.stringify(pageErrors));
  await writeFile(
    "docs/evidence/frontend-coverage/protected-forms-result.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}
