import { SQL } from "bun";
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

/**
 * Runs only against an isolated, disposable Postgres on 127.0.0.1 that already has the SP-5b-2
 * admin-content-delete-reason migration applied. Never point it at the shared local stack (port 55321).
 */
const url = process.env.SP5B2_CONTENT_REASON_TEST_DATABASE_URL;
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

const rollback = new Error("rollback admin content delete reason fixture");

async function seedActor(tx: SQL): Promise<string> {
  const actor = randomUUID();
  await tx`set local role postgres`;
  await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
  await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
  await tx`set local role service_role`;
  return actor;
}

async function mutate(
  tx: SQL,
  actor: string,
  entity: string,
  operation: string,
  id: string | null,
  payload: Record<string, unknown>,
): Promise<string> {
  const rows =
    await tx`select public.mutate_admin_content_with_audit(${actor}::uuid,${entity},${operation},${id}::uuid,${JSON.stringify(payload)}::jsonb) value`;
  return (rows[0].value as { id: string }).id;
}

async function createEstate(tx: SQL, actor: string): Promise<string> {
  return mutate(tx, actor, "dog_friendly_estate", "upsert", null, {
    estate_name: "Synthetic estate",
    district: "Synthetic district",
    notes: null,
    sort_order: 999,
    is_published: false,
  });
}

async function createBoardMember(tx: SQL, actor: string): Promise<string> {
  return mutate(tx, actor, "board_member", "upsert", null, {
    name: "Synthetic member",
    role_title: "Synthetic role",
    sort_order: 999,
    effective_date: "2026-01-01",
  });
}

async function auditDetail(tx: SQL, action: string, id: string): Promise<Record<string, unknown>> {
  await tx`set local role postgres`;
  const rows =
    await tx`select detail from public.audit_log where action=${action} and entity_id=${id}`;
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
  "an estate delete with a reason stores it in audit_log.detail.reason",
  async () => {
    await inRollback(async (tx) => {
      const actor = await seedActor(tx);
      const estate = await createEstate(tx, actor);
      await mutate(tx, actor, "dog_friendly_estate", "delete", estate, {
        reason: "  listed in error  ",
      });
      expect(await auditDetail(tx, "dog_friendly_estate.delete", estate)).toEqual({
        reason: "listed in error",
      });
    });
  },
);

test.skipIf(!url)(
  "an estate delete without a reason (the deployed app) keeps the empty audit detail",
  async () => {
    await inRollback(async (tx) => {
      const actor = await seedActor(tx);
      const estate = await createEstate(tx, actor);
      await mutate(tx, actor, "dog_friendly_estate", "delete", estate, {});
      expect(await auditDetail(tx, "dog_friendly_estate.delete", estate)).toEqual({});
    });
  },
);

test.skipIf(!url)("a blank reason is stored as no reason", async () => {
  await inRollback(async (tx) => {
    const actor = await seedActor(tx);
    const estate = await createEstate(tx, actor);
    await mutate(tx, actor, "dog_friendly_estate", "delete", estate, { reason: "   " });
    expect(await auditDetail(tx, "dog_friendly_estate.delete", estate)).toEqual({});
  });
});

test.skipIf(!url)("a board member step-down stores its reason", async () => {
  await inRollback(async (tx) => {
    const actor = await seedActor(tx);
    const member = await createBoardMember(tx, actor);
    await mutate(tx, actor, "board_member", "deactivate", member, { reason: "term ended" });
    expect(await auditDetail(tx, "board_member.deactivate", member)).toEqual({
      reason: "term ended",
    });
  });
});

test.skipIf(!url)("an upsert still audits its whole payload", async () => {
  await inRollback(async (tx) => {
    const actor = await seedActor(tx);
    const member = await createBoardMember(tx, actor);
    expect(await auditDetail(tx, "board_member.create", member)).toMatchObject({
      name: "Synthetic member",
    });
  });
});
