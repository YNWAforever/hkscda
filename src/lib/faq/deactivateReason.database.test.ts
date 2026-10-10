import { SQL } from "bun";
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

/**
 * Runs only against an isolated, disposable Postgres on 127.0.0.1 that already has the SP-5b-2
 * FAQ-deactivate-reason migration applied. Never point it at the shared local stack (port 55321).
 */
const url = process.env.SP5B2_FAQ_REASON_TEST_DATABASE_URL;
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

const rollback = new Error("rollback faq deactivate reason fixture");

async function seed(tx: SQL): Promise<{ actor: string; entry: string }> {
  const f = { actor: randomUUID(), entry: randomUUID() };
  await tx`set local role postgres`;
  await tx`insert into public.admin_user(auth_user_id,email,role) values(${f.actor}::uuid,${f.actor + "@example.invalid"},'admin')`;
  await tx`insert into public.faq_entry(id,category,question_zh,question_en,answer_zh,answer_en,sort_order) values(${f.entry}::uuid,'contact','Synthetic reason fixture','Synthetic reason fixture','Synthetic','Synthetic',999)`;
  await tx`set local role service_role`;
  return f;
}

async function auditDetail(tx: SQL, entry: string): Promise<Record<string, unknown>> {
  await tx`set local role postgres`;
  const rows =
    await tx`select detail from public.audit_log where action='faq_entry.deactivate' and entity_id=${entry}`;
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

test.skipIf(!url)("deactivating with a reason stores it in audit_log.detail.reason", async () => {
  await inRollback(async (tx) => {
    const f = await seed(tx);
    await tx`select public.deactivate_faq_entry_with_audit(${f.actor}::uuid,${f.entry}::uuid,'  duplicate of another question  ')`;
    expect(await auditDetail(tx, f.entry)).toEqual({ reason: "duplicate of another question" });
  });
});

test.skipIf(!url)(
  "a call without a reason keeps the old empty audit detail (the two-argument call shape)",
  async () => {
    await inRollback(async (tx) => {
      const f = await seed(tx);
      await tx`select public.deactivate_faq_entry_with_audit(p_actor_user_id => ${f.actor}::uuid, p_id => ${f.entry}::uuid)`;
      expect(await auditDetail(tx, f.entry)).toEqual({});
    });
  },
);

test.skipIf(!url)("a blank reason is stored as no reason", async () => {
  await inRollback(async (tx) => {
    const f = await seed(tx);
    await tx`select public.deactivate_faq_entry_with_audit(${f.actor}::uuid,${f.entry}::uuid,'   ')`;
    expect(await auditDetail(tx, f.entry)).toEqual({});
  });
});
