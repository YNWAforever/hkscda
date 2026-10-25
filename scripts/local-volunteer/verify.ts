/** Final reads and one denied authenticated RPC. Never runs or resets a job. */
import assert from "node:assert/strict";
import { browserContext } from "./browser-context";
import { hongKongDayRange, type OverviewData } from "../../src/lib/volunteers/overview";
import type { Row } from "../../src/components/admin/volunteers/activityWorkspaceTypes";
const c = await browserContext();
try {
  assert.equal(c.f.phase, "accepted");
  const proof = await c.read<{ draftSha256: string; definitionMd5: string }>(
    "migration-installed.json",
  );
  await c.check();
  const installed = (
    await c.db`select md5(pg_get_functiondef('public.retry_volunteer_runtime_job_with_audit(uuid,timestamptz,timestamptz,uuid,boolean,text)'::regprocedure)) md5,
  has_function_privilege('anon','public.retry_volunteer_runtime_job_with_audit(uuid,timestamptz,timestamptz,uuid,boolean,text)','execute') anon,
  has_function_privilege('authenticated','public.retry_volunteer_runtime_job_with_audit(uuid,timestamptz,timestamptz,uuid,boolean,text)','execute') authenticated,
  has_function_privilege('service_role','public.retry_volunteer_runtime_job_with_audit(uuid,timestamptz,timestamptz,uuid,boolean,text)','execute') service`
  )[0];
  assert.equal(installed.md5, proof.definitionMd5);
  assert.equal(installed.anon, false);
  assert.equal(installed.authenticated, false);
  assert.equal(installed.service, true);
  // Gather arguments BEFORE changing role, so a table-read denial cannot falsely
  // stand in for the RPC EXECUTE denial asserted here.
  const job = (
    await c.db`select bucket::text bucket,updated_at::text revision,status,lease_owner,lease_until from public.volunteer_runtime_job_run where job_key='volunteer-hourly' and bucket=${c.f.bucket}::timestamptz`
  )[0];
  await assert.rejects(
    async () => {
      await c.db.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx`select public.retry_volunteer_runtime_job_with_audit(${c.f.accounts.admin!.id}::uuid,${job.bucket}::timestamptz,${job.revision}::timestamptz,${crypto.randomUUID()}::uuid,true,'Synthetic direct RPC denial')`;
      });
    },
    (e) => !!e && typeof e === "object" && "errno" in e && e.errno === "42501",
  );
  const { page } = await c.login("admin");
  const session = await c.token(page);
  const denied = await fetch(
    "http://127.0.0.1:59321/rest/v1/rpc/retry_volunteer_runtime_job_with_audit",
    {
      method: "POST",
      headers: {
        apikey: process.env.VITE_SUPABASE_ANON_KEY!,
        authorization: "Bearer " + session,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_actor: c.f.accounts.admin!.id,
        p_bucket: job.bucket,
        p_expected_updated_at: job.revision,
        p_owner: crypto.randomUUID(),
        p_confirmed: true,
        p_reason: "Synthetic real Auth direct denial",
      }),
    },
  );
  const deniedBody = (await denied.json()) as { code: string };
  assert.equal(denied.status, 403);
  assert.equal(deniedBody.code, "42501");
  const range = hongKongDayRange(new Date());
  const calendarResponse = await c.api(
    page,
    "/api/admin/volunteers/calendar?" +
      new URLSearchParams({ from: range.from, until: range.until }),
  );
  assert.equal(calendarResponse.status(), 200);
  const calendar = (await calendarResponse.json()) as { activities: Row[] };
  assert(calendar.activities.length >= 1);
  for (const a of calendar.activities) {
    assert.equal(a.approved, 0);
    assert.equal(a.policy_version_id, c.f.versionId);
    assert(!("approved_participants" in a));
  }
  await page.goto("http://127.0.0.1:59330/admin/volunteers", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /義工營運總覽|Volunteer operations/ }).waitFor();
  for (const a of calendar.activities) {
    const article = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: a.title, exact: true }) });
    await article
      .first()
      .getByText(/0 人已確認 · 場次容量|0 confirmed · session capacity/)
      .waitFor();
    assert(!/undefined|NaN/.test(await article.first().innerText()));
    assert(!/尚未連結政策|No policy is linked/.test(await article.first().innerText()));
  }
  const screenshots = [];
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await c.screenshot(page, "overview-fixed-" + width);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    screenshots.push("overview-fixed-" + width + ".png");
  }
  const overview = (await (
    await c.api(page, "/api/admin/volunteers/overview?centre=all")
  ).json()) as OverviewData;
  const counts = (
    await c.db`select (select count(*)::int from auth.users) auth_users,
  (select count(*)::int from auth.users where raw_user_meta_data->>'fixture_id' is distinct from ${c.target.fixtureId}) unknown_auth_users,
  (select count(*)::int from public.admin_user) admins,(select count(*)::int from public.volunteer_profile) profiles,
  (select count(*)::int from public.volunteer_activity) activities,(select count(*)::int from public.volunteer_registration) registrations,
  (select count(*)::int from public.volunteer_policy_version) policy_versions,(select count(*)::int from public.volunteer_runtime_job_run) runtime_jobs,
  (select count(*)::int from public.volunteer_operation_outbox) notifications,
  (select count(*)::int from public.audit_log where action='volunteer_runtime_job.retry') retry_audits,
  (select count(*)::int from pg_trigger where tgname='local_acceptance_audit_failure') temporary_triggers,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='local_acceptance' and p.proname='reject_audit') temporary_functions`
  )[0];
  assert.deepEqual(
    { ...counts },
    {
      auth_users: 6,
      unknown_auth_users: 0,
      admins: 4,
      profiles: 2,
      activities: 2,
      registrations: 0,
      policy_versions: 1,
      runtime_jobs: 2,
      notifications: 0,
      retry_audits: 2,
      temporary_triggers: 0,
      temporary_functions: 0,
    },
  );
  assert.equal(job.status, "complete");
  assert.equal(job.lease_owner, null);
  assert.equal(job.lease_until, null);
  assert.deepEqual(c.pageErrors, []);
  assert.deepEqual(c.blockedExternal, []);
  const evidence = {
    projectRef: c.target.projectRef,
    systemIdentifier: c.target.systemIdentifier,
    installed,
    directSqlRpcDenied: "42501",
    realAuthPostgrestRpc: { status: denied.status, code: deniedBody.code },
    calendar,
    overview,
    counts,
    screenshots,
    pageErrors: c.pageErrors,
    blockedExternal: c.blockedExternal,
    extraWorkerRuns: 0,
  };
  await c.save("final-verification.json", evidence);
  console.info(
    JSON.stringify({
      stage: "final_verification",
      counts,
      rpcStatus: denied.status,
      screenshots,
      pageErrors: c.pageErrors,
      extraWorkerRuns: 0,
    }),
  );
} finally {
  await c.browser.close();
  await c.db.close({ timeout: 1 });
}
