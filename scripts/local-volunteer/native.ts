import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SQL, TransactionSQL } from "bun";
import { context, type Fixture } from "./context";
const c = await context();
const f = await c.read<Fixture>("fixture-state.json");
assert.equal(f.phase, "seeded");
const admin = f.accounts.admin!.id;
assert.equal(
  (
    await c.db`select count(*)::int n from public.audit_log where action='volunteer_runtime_job.retry'`
  )[0].n,
  0,
  "Never repeat the committed native claim",
);
const passed: string[] = [];
class Rollback extends Error {}
const state = (error: unknown) =>
  error && typeof error === "object"
    ? "errno" in error
      ? error.errno
      : "code" in error
        ? error.code
        : null
    : null;
async function rejected(action: () => Promise<unknown>, code: string) {
  try {
    await action();
    assert.fail("Expected SQL rejection");
  } catch (e) {
    assert.equal(state(e), code);
  }
}
async function rollback(name: string, action: (tx: TransactionSQL) => Promise<void>) {
  await c.check();
  try {
    await c.db.begin(async (tx) => {
      await action(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) {
      console.error("FAIL: " + name);
      throw e;
    }
  }
  passed.push(name);
}
const current = async (sql: SQL) =>
  (
    await sql`select bucket::text bucket,updated_at::text revision,status from public.volunteer_runtime_job_run where job_key='volunteer-hourly' and bucket=date_trunc('hour',clock_timestamp())`
  )[0];
async function claim(
  sql: SQL,
  options: {
    actor?: string;
    owner?: string;
    confirmed?: boolean;
    reason?: string;
    revision?: string;
    bucket?: string;
  } = {},
) {
  const row = await current(sql);
  assert(row, "Current synthetic bucket required; do not backfill");
  return (
    await sql`select public.retry_volunteer_runtime_job_with_audit(${options.actor ?? admin}::uuid,${options.bucket ?? row.bucket}::timestamptz,${options.revision ?? row.revision}::timestamptz,${options.owner ?? randomUUID()}::uuid,${options.confirmed ?? true},${options.reason ?? "Synthetic atomic acceptance"}) ok`
  )[0].ok;
}
try {
  for (const key of ["staff", "treasurer"] as const)
    await rollback("SQL active " + key + " denied", async (tx) => {
      await tx.unsafe("set local role service_role");
      await rejected(() => claim(tx, { actor: f.accounts[key]!.id }), "42501");
    });
  await rollback("authenticated cannot execute RPC directly", async (tx) => {
    const row = await current(tx);
    assert(row);
    await tx.unsafe("set local role authenticated");
    await rejected(
      () =>
        tx`select public.retry_volunteer_runtime_job_with_audit(${admin}::uuid,${row.bucket}::timestamptz,${row.revision}::timestamptz,${randomUUID()}::uuid,true,'Synthetic direct RPC denial')`,
      "42501",
    );
  });
  await rollback("disabled admin denied", async (tx) => {
    await tx`update public.admin_user set status='disabled' where auth_user_id=${admin}::uuid`;
    await rejected(() => claim(tx), "42501");
  });
  // Auth token validity belongs to the HTTP/GoTrue boundary. This service-only
  // SQL command checks the active admin record, not an Auth session.
  for (const opts of [{ confirmed: false }, { reason: " \n\t " }, { reason: "x".repeat(501) }])
    await rollback("invalid confirmation/reason " + Object.keys(opts)[0], async (tx) => {
      await rejected(() => claim(tx, opts), "22023");
    });
  await rollback("stale microsecond revision conflicts", async (tx) => {
    assert.equal(await claim(tx, { revision: "2000-01-01T00:00:00Z" }), false);
  });
  await rollback("historical bucket rejected", async (tx) => {
    const row = (
      await tx`select bucket::text bucket,updated_at::text revision from public.volunteer_runtime_job_run where job_key='volunteer-hourly' order by bucket asc limit 1`
    )[0];
    assert.equal(
      await claim(tx, { bucket: row.bucket as string, revision: row.revision as string }),
      false,
    );
  });
  for (const item of [
    { status: "complete", lease: null },
    { status: "running", lease: "2000-01-01T00:00:00Z" },
    { status: "failed", lease: "9999-01-01T00:00:00Z" },
    { status: "failed", lease: "infinity" },
    { status: "failed", lease: "-infinity" },
  ])
    await rollback("lease/status rejected " + JSON.stringify(item), async (tx) => {
      await tx`update public.volunteer_runtime_job_run set status=${item.status},lease_until=${item.lease}::timestamptz where job_key='volunteer-hourly' and bucket=date_trunc('hour',clock_timestamp())`;
      assert.equal(await claim(tx), false);
    });
  await rollback("audit exception rolls back claim", async (tx) => {
    const before = await current(tx);
    await tx.unsafe(
      "create function local_acceptance.reject_audit() returns trigger language plpgsql set search_path='' as $$ begin if new.action='volunteer_runtime_job.retry' then raise exception 'synthetic audit failure' using errcode='P0001'; end if; return new; end $$; create trigger local_acceptance_audit_failure before insert on public.audit_log for each row execute function local_acceptance.reject_audit();",
    );
    try {
      await tx.savepoint(async (nested) => {
        await claim(nested as SQL);
      });
      assert.fail("Audit must reject");
    } catch (e) {
      assert.equal(state(e), "P0001");
    }
    assert.deepEqual(await current(tx), before);
    assert.equal(
      (
        await tx`select count(*)::int n from public.audit_log where action='volunteer_runtime_job.retry'`
      )[0].n,
      0,
    );
  });
  assert.equal(
    (
      await c.db`select count(*)::int n from public.audit_log where action='volunteer_runtime_job.retry'`
    )[0].n,
    0,
  );
  assert.equal(
    (
      await c.db`select count(*)::int n from pg_trigger where tgname='local_acceptance_audit_failure'`
    )[0].n,
    0,
  );
  await c.check();
  const before = await current(c.db);
  assert(before);
  const owners = [randomUUID(), randomUUID()];
  const results = await Promise.all(
    owners.map((owner) =>
      claim(c.db, { owner, revision: before.revision as string, bucket: before.bucket as string }),
    ),
  );
  assert.deepEqual([...results].sort(), [false, true]);
  const owner = owners[results.indexOf(true)];
  assert.equal(
    (
      await c.db`select public.finish_volunteer_runtime_job('volunteer-hourly',${before.bucket}::timestamptz,${randomUUID()}::uuid,'complete','{}'::jsonb) ok`
    )[0].ok,
    false,
  );
  assert.equal(
    (
      await c.db`select public.finish_volunteer_runtime_job('volunteer-hourly',${before.bucket}::timestamptz,${owner}::uuid,'failed','{"error":"SYNTHETIC_NATIVE_ACCEPTANCE","stage":"preflight"}'::jsonb) ok`
    )[0].ok,
    true,
  );
  const audit =
    await c.db`select actor_user_id::text actor,detail from public.audit_log where action='volunteer_runtime_job.retry'`;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor, admin);
  assert.equal(audit[0].detail.reason, "Synthetic atomic acceptance");
  assert.equal(audit[0].detail.lease_owner, owner);
  passed.push(
    "concurrent real SQL claims admit exactly one owner",
    "wrong-owner finish rejected, correct-owner failure acknowledged",
    "requester audit persisted exactly once",
  );
  const result = {
    projectRef: c.target.projectRef,
    systemIdentifier: c.target.systemIdentifier,
    passed,
    count: passed.length,
    concurrency: results,
    auditRows: audit.length,
    normalWorkerRuns: 0,
  };
  await c.save("native-results.json", result);
  console.info(JSON.stringify(result));
} finally {
  await c.db.close({ timeout: 1 });
}
