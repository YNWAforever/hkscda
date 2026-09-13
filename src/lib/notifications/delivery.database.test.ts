import { SQL } from "bun";
import { test, expect } from "bun:test";
const enabled = process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (enabled && url !== "postgresql://postgres:postgres@127.0.0.1:56322/postgres")
  throw Error("Dedicated disposable database required");
test.skipIf(!enabled)(
  "delivery event ledger is atomic, deduplicated, immutable and ordered independently of provider acceptance",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    try {
      await db.begin(async (tx) => {
        const id = crypto.randomUUID(),
          message = crypto.randomUUID();
        async function record(suffix: string, type: string, time: string, hash = "a".repeat(64)) {
          return tx`select public.record_mail_delivery_event(${id + suffix},${message},${type},${time}::timestamptz,${hash}) result`;
        }
        await record("delivered", "email.delivered", "2026-09-13T10:00:00Z");
        await record("delivered", "email.delivered", "2026-09-13T10:00:00Z");
        expect(
          (
            await tx`select count(*)::int n from public.mail_delivery_event where provider_message_id=${message}`
          )[0].n,
        ).toBe(1);
        await record("late-delay", "email.delivery_delayed", "2026-09-13T11:00:00Z");
        expect(
          (
            await tx`select state from public.mail_delivery_latest where provider_message_id=${message}`
          )[0].state,
        ).toBe("delivered");
        await record("bounce", "email.bounced", "2026-09-13T12:00:00Z");
        await record("old-delivered", "email.delivered", "2026-09-13T09:00:00Z");
        expect(
          (
            await tx`select state from public.mail_delivery_latest where provider_message_id=${message}`
          )[0].state,
        ).toBe("bounced");
        const supporter = crypto.randomUUID();
        await tx`insert into public.supporter(id,name,email) values(${supporter}::uuid,'Delivery fixture','delivery@example.invalid')`;
        await tx`insert into public.message(supporter_id,channel,status,payload) values(${supporter}::uuid,'email','sent',${JSON.stringify({ providerMessageId: message })}::jsonb)`;
        expect(
          (
            await tx`select delivery_state from public.message_delivery_status where supporter_id=${supporter}::uuid`
          )[0].delivery_state,
        ).toBe("bounced");
        for (const sql of [
          () => record("delivered", "email.delivered", "2026-09-13T10:00:00Z", "b".repeat(64)),
          () =>
            tx`update public.mail_delivery_event set body_hash=${"b".repeat(64)} where provider_message_id=${message}`,
        ]) {
          await tx.unsafe("savepoint rejected");
          let denied = false;
          try {
            await sql();
          } catch {
            denied = true;
          }
          await tx.unsafe("rollback to savepoint rejected");
          expect(denied).toBe(true);
        }
        await tx.unsafe("savepoint permissions");
        await tx.unsafe("set local role authenticated");
        let denied = false;
        try {
          await record("forged", "email.delivered", "2026-09-13T13:00:00Z");
        } catch {
          denied = true;
        }
        await tx.unsafe("rollback to savepoint permissions");
        expect(denied).toBe(true);
        expect(
          (
            await tx`select count(*)::int n from public.audit_log where action='notification.delivery_event' and detail->>'providerMessageId'=${message}`
          )[0].n,
        ).toBe(4);
        await tx.unsafe("rollback");
      });
    } finally {
      await db.close();
    }
  },
);
