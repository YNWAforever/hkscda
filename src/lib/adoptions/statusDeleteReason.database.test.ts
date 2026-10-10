import { SQL } from "bun";
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

/**
 * Runs only against an isolated, disposable Postgres on 127.0.0.1 that already has the SP-5b-2
 * coordinator-status-delete-reason migration applied. Never point it at the shared local stack (port 55321).
 */
const url = process.env.SP5B2_STATUS_REASON_TEST_DATABASE_URL;
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

const rollback = new Error("rollback coordinator status delete reason fixture");

type Fixture = { actor: string; key: string };

async function seed(tx: SQL): Promise<Fixture & { status: string }> {
  const actor = randomUUID();
  const status = randomUUID();
  const key = "synthetic_" + status.replaceAll("-", "");
  await tx`set local role postgres`;
  await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
  await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
  await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en) values(${status}::uuid,'followup',${key},'Synthetic','Synthetic')`;
  await tx`set local role service_role`;
  return { actor, status, key };
}

async function deleteStatus(tx: SQL, actor: string, status: string, payload: object) {
  await tx`select public.mutate_adoption_coordinator_with_audit(${actor}::uuid,'coordinator_status','delete',${status}::uuid,${JSON.stringify(payload)}::jsonb) value`;
}

async function auditDetail(tx: SQL, status: string): Promise<Record<string, unknown>> {
  await tx`set local role postgres`;
  const rows =
    await tx`select detail from public.audit_log where action='coordinator_status.delete' and entity_id=${status}`;
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

test.skipIf(!url)(
  "a status delete with a reason stores it in audit_log.detail.reason",
  async () => {
    await inRollback(async (tx) => {
      const { actor, status, key } = await seed(tx);
      await deleteStatus(tx, actor, status, { reason: "  merged into another status  " });
      expect(await auditDetail(tx, status)).toEqual({
        category: "followup",
        key,
        reason: "merged into another status",
      });
    });
  },
);

test.skipIf(!url)(
  "a status delete without a reason (the deployed app) keeps category and key only",
  async () => {
    await inRollback(async (tx) => {
      const { actor, status, key } = await seed(tx);
      await deleteStatus(tx, actor, status, {});
      expect(await auditDetail(tx, status)).toEqual({ category: "followup", key });
    });
  },
);

test.skipIf(!url)("a blank reason is stored as no reason", async () => {
  await inRollback(async (tx) => {
    const { actor, status, key } = await seed(tx);
    await deleteStatus(tx, actor, status, { reason: "   " });
    expect(await auditDetail(tx, status)).toEqual({ category: "followup", key });
  });
});
