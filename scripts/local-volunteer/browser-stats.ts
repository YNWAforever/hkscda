import assert from "node:assert/strict";
import { browserContext } from "./browser-context";
import type { OverviewData } from "../../src/lib/volunteers/overview";
const c = await browserContext();
let release: () => void = () => {};
let lock: Promise<unknown> | undefined;
try {
  assert.equal((await c.read<{ count: number }>("native-results.json")).count, 18);
  const { page } = await c.login("admin");
  await c.check();
  let ready: () => void = () => {};
  const acquired = new Promise<void>((r) => {
    ready = r;
  });
  const held = new Promise<void>((r) => {
    release = r;
  });
  lock = c.db.begin(async (tx) => {
    await tx.unsafe("lock table public.volunteer_registration in access exclusive mode");
    ready();
    await held;
  });
  await acquired;
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/admin/volunteers/overview?") &&
      !new URL(r.url()).searchParams.has("stats"),
    { timeout: 30000 },
  );
  await page.goto("http://127.0.0.1:59330/admin/volunteers", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const result = await response;
  assert.equal(result.status(), 200);
  const partial = (await result.json()) as OverviewData;
  assert.equal(partial.counts.pendingProfiles, 2);
  assert.equal(partial.counts.pendingRegistrations, null);
  assert.equal(partial.counts.todayActivities, 0);
  assert.equal(partial.runtimeHealth?.state, "degraded");
  assert(partial.runtimeHealth?.retryCandidate);
  await page.getByRole("button", { name: /重試統計|Retry figures/ }).waitFor();
  const card = page
    .locator('a[href="/admin/volunteers/tasks?pending_scope=all"]')
    .filter({ hasText: /待審批報名|Applications to review/ });
  // The real rendered count must say unavailable, never a successful zero.
  assert.match(await card.innerText(), /—/);
  await c.screenshot(page, "overview-partial");
  release();
  await lock;
  lock = undefined;
  const retryResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/admin/volunteers/overview" &&
      new URL(r.url()).searchParams.has("stats"),
  );
  await page.getByRole("button", { name: /重試統計|Retry figures/ }).click();
  const retry = await retryResponse;
  const retryUrl = new URL(retry.url());
  assert.equal(retryUrl.searchParams.get("stats"), "pendingRegistrations");
  assert.equal(retry.status(), 200);
  const recovered = (await retry.json()) as OverviewData;
  assert.equal(recovered.counts.pendingRegistrations, 0);
  assert.equal(recovered.counts.pendingProfiles, null);
  assert.equal(recovered.counts.todayActivities, null);
  assert.equal(recovered.runtimeHealth, undefined);
  await page.getByRole("button", { name: /重試統計|Retry figures/ }).waitFor({ state: "hidden" });
  assert.match(await card.innerText(), /\n0\n/);
  const full = (await (
    await c.api(page, "/api/admin/volunteers/overview?centre=all")
  ).json()) as OverviewData;
  assert.equal(full.counts.pendingProfiles, 2);
  assert.equal(full.counts.pendingRegistrations, 0);
  assert.equal(full.runtimeHealth?.state, "degraded");
  await c.screenshot(page, "overview-statistics-recovered");
  const resultEvidence = {
    projectRef: c.target.projectRef,
    systemIdentifier: c.target.systemIdentifier,
    renderedActualRoute: true,
    mockedResponses: 0,
    partial,
    retryQuery: retryUrl.search,
    recovered,
    full,
    pageErrors: c.pageErrors,
    blockedExternal: c.blockedExternal,
    normalWorkerRuns: 0,
  };
  assert.deepEqual(c.pageErrors, []);
  await c.save("browser-stats-results.json", resultEvidence);
  console.info(JSON.stringify(resultEvidence));
} finally {
  release();
  if (lock) await lock;
  await c.browser.close();
  await c.db.close({ timeout: 1 });
}
