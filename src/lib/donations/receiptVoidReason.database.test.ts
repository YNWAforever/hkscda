import { SQL } from "bun";
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

/**
 * Runs only against an isolated, disposable Postgres on 127.0.0.1 that already has the SP-5b-2
 * receipt-void migration applied. Never point it at the shared local stack (port 55321).
 */
const url = process.env.SP5B2_RECEIPT_VOID_TEST_DATABASE_URL;
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

const rollback = new Error("rollback receipt void reason fixture");

type Fixture = { actor: string; supporter: string; donation: string; receipt: string };

async function seed(tx: SQL): Promise<Fixture> {
  const f = {
    actor: randomUUID(),
    supporter: randomUUID(),
    donation: randomUUID(),
    receipt: randomUUID(),
  };
  await tx`set local role postgres`;
  await tx`insert into auth.users(id,email,email_confirmed_at) values(${f.actor}::uuid,${f.actor + "@example.invalid"},now())`;
  await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${f.actor}::uuid,${f.actor + "@example.invalid"},'treasurer','active')`;
  await tx`insert into public.supporter(id,name,email) values(${f.supporter}::uuid,'Synthetic supporter',${f.supporter + "@example.invalid"})`;
  await tx`insert into public.donation(id,supporter_id,amount_cents,purpose,method) values(${f.donation}::uuid,${f.supporter}::uuid,10000,'general','fps')`;
  await tx`insert into public.receipt(id,supporter_id,receipt_no,donation_ids,total_amount_cents,tax_year,issued_at,status) values(${f.receipt}::uuid,${f.supporter}::uuid,${"SP5B2-" + f.receipt},array[${f.donation}::uuid],10000,2026,now(),'issued')`;
  await tx`set local role service_role`;
  return f;
}

async function storedReason(tx: SQL, receipt: string): Promise<unknown> {
  await tx`set local role postgres`;
  const rows =
    await tx`select detail->>'reason' as reason from public.audit_log where action='receipt.void' and entity_id=${receipt}`;
  return rows[0]?.reason;
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

test.skipIf(!url)("voiding with a reason stores it in audit_log.detail.reason", async () => {
  await inRollback(async (tx) => {
    const f = await seed(tx);
    await tx`select * from public.void_receipt_with_audit(${f.receipt}::uuid,${f.actor}::uuid,${f.supporter}::uuid,'wrong donor')`;
    expect(await storedReason(tx, f.receipt)).toBe("wrong donor");
  });
});

test.skipIf(!url)(
  "voiding without a reason still stores 'manual' (the old call shape)",
  async () => {
    await inRollback(async (tx) => {
      const f = await seed(tx);
      await tx`select * from public.void_receipt_with_audit(p_receipt_id => ${f.receipt}::uuid, p_actor => ${f.actor}::uuid, p_supporter_id => ${f.supporter}::uuid)`;
      expect(await storedReason(tx, f.receipt)).toBe("manual");
    });
  },
);
