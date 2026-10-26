import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../../operations/sqlFunctionBody";

const migration = readFileSync(
  "supabase/migrations/20261025193000_volunteer_runtime_retry_expired_lease.sql",
  "utf8",
);
const draft = readFileSync(
  "supabase/drafts/20261025000000_volunteer_runtime_retry_with_audit.sql",
  "utf8",
);

test("an expired running hour can be retried and a lease that is still open cannot", () => {
  const body = normaliseSql(
    extractFunctionBody(migration, "public.retry_volunteer_runtime_job_with_audit"),
  );
  expect(body).toContain("v_run.status = 'failed'");
  expect(body).toContain("v_run.lease_until <= v_now");
  expect(body).toContain("v_run.status = 'running'");
  expect(body).toContain("v_run.lease_until is not null");
  expect(body).toContain("isfinite(v_run.lease_until)");
  expect(body).toContain("v_run.lease_until < v_now");
  expect(body).not.toContain("v_run.lease_until <= v_now and v_run.status = 'running'");
  expect(body).toContain("not (v_failed is true or v_expired_running is true)");
  expect(body).toContain("v_run.updated_at <> p_expected_updated_at");
  expect(body).toContain("date_trunc('hour', v_now at time zone 'utc')");
  expect(body).toContain("volunteer_policy_admin(p_actor)");
  expect(body).toContain("volunteer_runtime_job.retry");
  expect(body).not.toContain("v_run.status <> 'failed'");
  expect(body).toBe(
    normaliseSql(extractFunctionBody(draft, "public.retry_volunteer_runtime_job_with_audit")),
  );
  const normalised = normaliseSql(migration);
  expect(normalised).toContain("security definer");
  expect(normalised).toContain("set search_path = public, pg_temp");
  expect(normalised).toContain("errcode = '22023'");
  expect(normalised).toContain(
    "revoke all on function public.retry_volunteer_runtime_job_with_audit( uuid, timestamptz, timestamptz, uuid, boolean, text ) from public, anon, authenticated",
  );
  expect(normalised).toContain(
    "grant execute on function public.retry_volunteer_runtime_job_with_audit( uuid, timestamptz, timestamptz, uuid, boolean, text ) to service_role",
  );
});
