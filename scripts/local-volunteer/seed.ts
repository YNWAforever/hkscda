import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { initialPolicyCatalogue } from "../../src/lib/volunteers/policy/catalogue";
import { context, roles, type Fixture, type Role } from "./context";

const c = await context();
try {
  const privateData = await c.read<
    Record<string, unknown> & { accountPasswords?: Partial<Record<Role, string>> }
  >("private.json");
  privateData.accountPasswords ??= {};
  let fixture: Fixture;
  try {
    fixture = await c.read<Fixture>("fixture-state.json");
  } catch {
    fixture = {
      fixtureId: c.target.fixtureId,
      accounts: {},
      profileIds: [randomUUID(), randomUUID()],
      versionId: randomUUID(),
      templateKey: "local-acceptance-" + c.target.fixtureId.slice(0, 8),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      phase: "seeding",
    };
  }
  assert.equal(fixture.fixtureId, c.target.fixtureId);
  assert.notEqual(fixture.phase, "accepted", "Do not reset a completed acceptance target");
  await c.save("fixture-state.json", fixture);
  for (const role of roles) {
    await c.check();
    privateData.accountPasswords[role] ??= randomBytes(18).toString("hex");
    await c.save("private.json", privateData);
    await chmod(join(c.root, "private.json"), 0o600);
    if (!fixture.accounts[role]) {
      const email = "synthetic-" + role + "-" + c.target.fixtureId.slice(0, 8) + "@example.invalid";
      const result = await c.service.auth.admin.createUser({
        email,
        password: privateData.accountPasswords[role],
        email_confirm: true,
        role: "authenticated",
        user_metadata: { fixture_id: c.target.fixtureId, synthetic: true, fixture_role: role },
      });
      assert(!result.error, "Local Auth createUser failed for " + role + ": " + result.error?.code);
      assert(result.data.user);
      fixture.accounts[role] = { id: result.data.user.id, email };
      await c.save("fixture-state.json", fixture);
    }
    const user = await c.service.auth.admin.getUserById(fixture.accounts[role]!.id);
    assert.equal(user.data.user?.user_metadata.fixture_id, c.target.fixtureId);
    assert(user.data.user?.email_confirmed_at);
  }
  const unknown =
    await c.db`select count(*)::int n from auth.users where raw_user_meta_data->>'fixture_id' is distinct from ${c.target.fixtureId}`;
  assert.equal(unknown[0].n, 0, "Refusing a target with unknown Auth provenance");
  await c.check();
  for (const key of ["admin", "worker", "staff", "treasurer"] as const) {
    const a = fixture.accounts[key]!;
    await c.db`insert into public.admin_user(auth_user_id,email,role,status) values(${a.id}::uuid,${a.email},${key === "worker" ? "admin" : key},'active') on conflict(auth_user_id) do nothing`;
  }
  for (const [idx, key] of (["volunteer1", "volunteer2"] as const).entries()) {
    await c.db`insert into public.volunteer_profile(id,auth_user_id,display_name,status) values(${fixture.profileIds[idx]}::uuid,${fixture.accounts[key]!.id}::uuid,${"Synthetic volunteer " + (idx + 1)},'pending') on conflict(id) do nothing`;
  }
  const body = structuredClone(initialPolicyCatalogue[0]);
  body.template_key = fixture.templateKey;
  body.name = "Synthetic isolated job acceptance";
  body.schedule.generation_days = 1;
  body.schedule.start_time = "23:00";
  body.schedule.end_time = "23:30";
  body.source = "Synthetic isolated acceptance " + c.target.fixtureId;
  await c.db`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason)
    values(${fixture.versionId}::uuid,${fixture.templateKey},${JSON.stringify(body)}::jsonb,md5(${JSON.stringify(body)}),${fixture.effectiveFrom}::timestamptz,${fixture.accounts.admin!.id}::uuid,'Synthetic isolated job acceptance') on conflict(id) do nothing`;
  await c.db`insert into public.volunteer_policy_schedule(template_key,effective_from,version_id) values(${fixture.templateKey},${fixture.effectiveFrom}::timestamptz,${fixture.versionId}::uuid) on conflict do nothing`;
  const bucket = (await c.db`select date_trunc('hour',clock_timestamp()) bucket`)[0].bucket as Date;
  fixture.bucket = bucket.toISOString();
  for (const hours of [0, 1]) {
    await c.db`insert into public.volunteer_runtime_job_run(job_key,bucket,status,result,updated_at)
      values('volunteer-hourly',${fixture.bucket}::timestamptz-(${hours}*interval '1 hour'),'failed','{"error":"SYNTHETIC_ACCEPTANCE","stage":"generate"}'::jsonb,clock_timestamp()-(${hours}*interval '1 hour')-interval '2 seconds') on conflict do nothing`;
  }
  const counts = (
    await c.db`select (select count(*)::int from auth.users) auth_users,
    (select count(*)::int from public.admin_user) admin_users,(select count(*)::int from public.volunteer_profile) profiles,
    (select count(*)::int from public.volunteer_activity) activities,(select count(*)::int from public.volunteer_registration) registrations,
    (select count(*)::int from public.volunteer_policy_version) policy_versions,(select count(*)::int from public.volunteer_operation_outbox) notifications,
    (select count(*)::int from public.volunteer_runtime_job_run) runtime_jobs`
  )[0];
  assert.equal(counts.auth_users, 6);
  assert.equal(counts.admin_users, 4);
  assert.equal(counts.profiles, 2);
  assert.equal(counts.activities, 0);
  assert.equal(counts.registrations, 0);
  assert.equal(counts.policy_versions, 1);
  assert.equal(counts.notifications, 0);
  assert.equal(counts.runtime_jobs, 2);
  fixture.phase = "seeded";
  await c.save("fixture-state.json", fixture);
  await c.save("seed-counts.json", counts);
  console.info(
    JSON.stringify({
      stage: "synthetic_seed_complete",
      projectRef: c.target.projectRef,
      counts,
      budget: { normalWorkerRuns: 1, maxGeneratedActivities: 2, outboundProviderCalls: 0 },
      roles: ["admin", "staff", "treasurer", "worker(admin)"],
    }),
  );
} finally {
  await c.db.close({ timeout: 1 });
}
