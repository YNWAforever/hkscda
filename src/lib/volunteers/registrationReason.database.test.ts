import { SQL } from "bun";
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

/**
 * Runs only against an isolated, disposable Postgres on 127.0.0.1 that already has the SP-5b-2
 * volunteer-registration-reason migration applied. Never point it at the shared local stack
 * (port 55321).
 */
const url = process.env.SP5B2_VOLUNTEER_REASON_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" ||
    target.port === "55321" ||
    target.search ||
    target.hash
  )
    throw new Error("Dedicated disposable database required");
}

const rollback = new Error("rollback volunteer registration reason fixture");

type Fixture = { actor: string; registration: string; version: string };

async function seed(tx: SQL): Promise<Fixture> {
  const f = { actor: randomUUID(), activity: randomUUID(), registration: randomUUID() };
  await tx`set local role postgres`;
  await tx`insert into public.admin_user(auth_user_id,email,role) values(${f.actor}::uuid,${f.actor + "@example.invalid"},'admin')`;
  await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status) values(${f.activity}::uuid,'volunteer_shift','Synthetic reason fixture',now()+interval '2 days',now()+interval '2 days 2 hours','Isolated test',10,'published')`;
  await tx`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at) values(${f.registration}::uuid,${f.activity}::uuid,'individual','pending',1,'Synthetic reason',${f.registration + "@example.invalid"},'00000000',${f.registration},now()+interval '1 day')`;
  const rows =
    await tx`select updated_at::text as version from public.volunteer_registration where id=${f.registration}::uuid`;
  await tx`set local role service_role`;
  return { actor: f.actor, registration: f.registration, version: rows[0].version as string };
}

async function auditDetail(tx: SQL, registration: string): Promise<Record<string, unknown>> {
  await tx`set local role postgres`;
  const rows =
    await tx`select detail from public.audit_log where action='volunteer_registration.status_update' and entity_id=${registration}`;
  return rows[0]?.detail as Record<string, unknown>;
}

async function inRollback(run: (tx: SQL) => Promise<void>) {
  const db = new SQL(url!, { max: 1, prepare: false });
  try {
    await db.begin(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.close();
  }
}

test.skipIf(!url)("rejecting with a reason stores it in audit_log.detail.reason", async () => {
  await inRollback(async (tx) => {
    const f = await seed(tx);
    await tx`select public.set_volunteer_registration_status_with_audit(${f.registration}::uuid,${f.actor}::uuid,${f.version}::timestamptz,'rejected',null,false,'  no-show history  ')`;
    expect(await auditDetail(tx, f.registration)).toEqual({
      status: "rejected",
      reason: "no-show history",
    });
  });
});

test.skipIf(!url)(
  "a call without a reason keeps the old audit detail (the six-argument call shape)",
  async () => {
    await inRollback(async (tx) => {
      const f = await seed(tx);
      await tx`select public.set_volunteer_registration_status_with_audit(p_registration_id => ${f.registration}::uuid, p_actor_user_id => ${f.actor}::uuid, p_expected_updated_at => ${f.version}::timestamptz, p_status => 'approved')`;
      expect(await auditDetail(tx, f.registration)).toEqual({ status: "approved" });
    });
  },
);
