import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { browserContext } from "./browser-context";
import type { OverviewData } from "../../src/lib/volunteers/overview";
const c = await browserContext();
let trigger = false;
const retryPath = "/api/admin/volunteers/runtime/retry";
async function row() {
  return (
    await c.db`select bucket::text bucket,status,updated_at::text revision,lease_owner::text owner,lease_until::text lease,result from public.volunteer_runtime_job_run where job_key='volunteer-hourly' and bucket=${c.f.bucket}::timestamptz`
  )[0];
}
async function auditCount() {
  return (
    await c.db`select count(*)::int n from public.audit_log where action='volunteer_runtime_job.retry'`
  )[0].n as number;
}
async function removeTrigger() {
  await c.check();
  await c.db.unsafe(
    "drop trigger if exists local_acceptance_audit_failure on public.audit_log; drop function if exists local_acceptance.reject_audit();",
  );
  trigger = false;
}
try {
  try {
    await access(join(c.root, "worker-attempt.json"));
    assert.fail("A worker attempt exists. Inspect its persisted outcome; never rerun blindly.");
  } catch (e) {
    if (!(e && typeof e === "object" && "code" in e && e.code === "ENOENT")) throw e;
  }
  await c.read("browser-stats-results.json");
  assert.equal(await auditCount(), 1);
  const before = await row();
  assert.equal(before.status, "failed");
  const { page } = await c.login("admin");
  await page.goto("http://127.0.0.1:59330/admin/volunteers", { waitUntil: "domcontentloaded" });
  const open = page.getByRole("button", { name: /重跑本時段工作|Rerun this hour's job/ });
  await open.waitFor();
  const overview = (await (
    await c.api(page, "/api/admin/volunteers/overview?centre=all")
  ).json()) as OverviewData;
  const candidate = overview.runtimeHealth?.retryCandidate;
  assert(candidate);
  assert.equal(Date.parse(candidate.bucket), Date.parse(c.f.bucket!));
  const body = { ...candidate, confirmed: true, reason: "Synthetic isolated browser acceptance" };
  assert.equal((await c.api(page, retryPath, { ...body, confirmed: false })).status(), 400);
  assert.equal((await c.api(page, retryPath, { ...body, reason: " " })).status(), 400);
  assert.equal(
    (await c.api(page, retryPath, { ...body, expectedUpdatedAt: "2000-01-01T00:00:00Z" })).status(),
    409,
  );
  assert.equal(await auditCount(), 1);
  assert.deepEqual(await row(), before);
  const requests: { path: string; body: unknown }[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === retryPath && r.method() === "POST")
      requests.push({ path: retryPath, body: r.postDataJSON() });
  });
  await open.click();
  let dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  const confirm = () => dialog.getByRole("button", { name: /^確認重跑$|^Confirm rerun$/ });
  assert(await confirm().isDisabled());
  await dialog.locator("textarea").fill(" \n ");
  assert(await confirm().isDisabled());
  await dialog.getByRole("button", { name: /^取消$|^Cancel$/ }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(requests.length, 0);
  assert.equal(await auditCount(), 1);
  await c.check();
  assert.equal(
    (
      await c.db`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='local_acceptance' and p.proname='reject_audit'`
    )[0].n,
    0,
  );
  await c.db.unsafe(
    "create function local_acceptance.reject_audit() returns trigger language plpgsql set search_path='' as $$ begin if new.action='volunteer_runtime_job.retry' then raise exception 'synthetic browser audit failure' using errcode='P0001'; end if; return new; end $$; create trigger local_acceptance_audit_failure before insert on public.audit_log for each row execute function local_acceptance.reject_audit();",
  );
  trigger = true;
  await open.click();
  dialog = page.getByRole("alertdialog");
  await dialog.locator("textarea").fill(body.reason);
  let response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === retryPath && r.request().method() === "POST",
  );
  await confirm().evaluate((el) => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  const failed = await response;
  assert.equal(failed.status(), 500);
  await dialog.getByRole("alert").waitFor();
  assert.equal(await dialog.locator("textarea").inputValue(), body.reason);
  assert.equal(requests.length, 1);
  assert.deepEqual(await row(), before);
  assert.equal(await auditCount(), 1);
  assert.equal((await c.db`select count(*)::int n from public.volunteer_activity`)[0].n, 0);
  await c.screenshot(page, "rerun-audit-failure-preserves-reason");
  await removeTrigger();
  await c.save("worker-attempt.json", {
    phase: "about_to_submit",
    bucket: c.f.bucket,
    revision: before.revision,
    requester: c.f.accounts.admin!.id,
    worker: c.f.accounts.worker!.id,
    maxSuccessfulRuns: 1,
  });
  response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === retryPath && r.request().method() === "POST",
    { timeout: 30000 },
  );
  await confirm().evaluate((el) => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  const completed = await response;
  const responseBody = await completed.json();
  await c.save("worker-attempt.json", {
    phase: "response_received",
    status: completed.status(),
    body: responseBody,
    bucket: c.f.bucket,
  });
  assert.equal(completed.status(), 200);
  assert.equal(responseBody.kind, "complete");
  assert(responseBody.generated >= 1 && responseBody.generated <= 2);
  assert.equal(responseBody.released, 0);
  assert.equal(responseBody.promoted, 0);
  assert.equal(responseBody.assessment, false);
  assert.equal(responseBody.deferred, 0);
  await dialog.waitFor({ state: "hidden" });
  await open.waitFor({ state: "hidden" });
  assert.equal(requests.length, 2);
  const final = await row();
  assert.equal(final.status, "complete");
  assert.equal(final.owner, null);
  assert.equal(final.lease, null);
  assert.deepEqual(final.result, responseBody);
  assert.equal(await auditCount(), 2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /義工營運總覽|Volunteer operations overview/ }).waitFor();
  const refreshed = (await (
    await c.api(page, "/api/admin/volunteers/overview?centre=all")
  ).json()) as OverviewData;
  assert.equal(refreshed.runtimeHealth?.state, "healthy");
  assert.equal(refreshed.runtimeHealth?.retryCandidate, undefined);
  assert.equal(refreshed.runtimeHealth?.diagnostic, undefined);
  const sqlCounts = (
    await c.db`select (select count(*)::int from public.volunteer_profile where status='pending') pending_profiles,
  (select count(*)::int from public.volunteer_registration where status='pending') pending_registrations,
  (select count(*)::int from public.volunteer_activity where status='published' and (starts_at at time zone 'Asia/Hong_Kong')::date=${refreshed.date}::date) today_activities,
  (select count(*)::int from public.volunteer_activity) activities,(select count(*)::int from public.volunteer_operation_outbox) notifications`
  )[0];
  assert.equal(refreshed.counts.pendingProfiles, sqlCounts.pending_profiles);
  assert.equal(refreshed.counts.pendingRegistrations, sqlCounts.pending_registrations);
  assert.equal(refreshed.counts.todayActivities, sqlCounts.today_activities);
  assert.equal(sqlCounts.activities, responseBody.generated);
  assert.equal(sqlCounts.notifications, 0);
  const audit = await c.db<
    { actor: string; action: string; detail: Record<string, unknown> }[]
  >`select actor_user_id::text actor,action,detail from public.audit_log order by created_at,id`;
  const reruns = audit.filter((a) => a.action === "volunteer_runtime_job.retry");
  assert.equal(reruns.length, 2);
  assert(reruns.every((a) => a.actor === c.f.accounts.admin!.id));
  const generated = audit.filter((a) => a.action !== "volunteer_runtime_job.retry");
  assert(generated.length > 0);
  assert(generated.every((a) => a.actor === c.f.accounts.worker!.id));
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await c.screenshot(page, "overview-complete-" + width);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  const roleEvidence = [];
  for (const role of ["staff", "treasurer"] as const) {
    const { page: other, b } = await c.login(role);
    const response = await c.api(other, retryPath, body);
    assert.equal(response.status(), 403);
    const o = await c.api(other, "/api/admin/volunteers/overview?centre=all");
    if (role === "staff") {
      assert.equal(o.status(), 200);
      const data = (await o.json()) as OverviewData;
      assert.equal(data.runtimeHealth?.diagnostic, undefined);
      assert.equal(data.runtimeHealth?.retryCandidate, undefined);
      await other.goto("http://127.0.0.1:59330/admin/volunteers", {
        waitUntil: "domcontentloaded",
      });
      await other
        .getByRole("heading", { name: /義工營運總覽|Volunteer operations overview/ })
        .waitFor();
      assert.equal(
        await other.getByRole("button", { name: /重跑本時段工作|Rerun this hour's job/ }).count(),
        0,
      );
      await c.screenshot(other, "staff-overview");
    } else assert.equal(o.status(), 403);
    roleEvidence.push({ role, retryStatus: response.status(), overviewStatus: o.status() });
    await b.close();
  }
  assert.deepEqual(c.pageErrors, []);
  c.f.phase = "accepted";
  await c.save("fixture-state.json", c.f);
  const evidence = {
    projectRef: c.target.projectRef,
    systemIdentifier: c.target.systemIdentifier,
    renderedActualRoute: true,
    mockedResponses: 0,
    cancelRequests: 0,
    invalidStatus: 400,
    staleStatus: 409,
    auditFailureStatus: failed.status(),
    retainedReason: true,
    rollbackRowUnchanged: true,
    doubleClicksSentRequests: requests.length,
    workerRuns: 1,
    result: responseBody,
    final,
    refreshed,
    sqlCounts,
    audit,
    roleEvidence,
    pageErrors: c.pageErrors,
    blockedExternal: c.blockedExternal,
    outboundProviderCalls: 0,
  };
  await c.save("browser-worker-results.json", evidence);
  console.info(
    JSON.stringify({
      stage: "browser_worker_complete",
      workerRuns: 1,
      result: responseBody,
      sqlCounts,
      roleEvidence,
      pageErrors: c.pageErrors,
      blockedExternal: c.blockedExternal,
    }),
  );
} finally {
  if (trigger) await removeTrigger();
  await c.browser.close();
  await c.db.close({ timeout: 1 });
}
