import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.DELIVERY_RETRY_TEST_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).port !== "57322" ||
    new URL(url).pathname !== "/postgres")
)
  throw new Error("Dedicated local delivery retry database required");

test.skipIf(!url || process.env.DELIVERY_RETRY_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "retry rechecks Auth ban, preserves one audit and refuses already-complete jobs",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback synthetic delivery retry");
    const actor = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const donation = crypto.randomUUID();
    const payment = crypto.randomUUID();
    const job = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at,banned_until) values($1::uuid,$2,now(),now(),now(),now()+interval '1 hour')",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'treasurer','active')",
          [crypto.randomUUID(), actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic retry donor',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.donation(id,supporter_id,amount_cents,purpose,method,status) values($1::uuid,$2::uuid,10000,'general','fps','succeeded')",
          [donation, supporter],
        );
        await tx.unsafe(
          "insert into public.payment(id,donation_id,provider,amount_cents,status) values($1::uuid,$2::uuid,'fps',10000,'succeeded')",
          [payment, donation],
        );
        await tx.unsafe(
          "insert into public.donation_delivery_job(id,donation_id,payment_id,status,attempts,error_code) values($1::uuid,$2::uuid,$3::uuid,'attention_required',2,'provider_error')",
          [job, donation, payment],
        );

        const call = () =>
          tx.unsafe(
            "select public.retry_donation_delivery_job_with_audit($1::uuid,$2::uuid) retried",
            [job, actor],
          ) as Promise<Array<{ retried: boolean }>>;
        const expectForbidden = async () => {
          await tx.unsafe("savepoint guarded_retry");
          let deniedCode: string | undefined;
          try {
            await call();
          } catch (error) {
            deniedCode = (error as { errno?: string }).errno;
          }
          await tx.unsafe("rollback to savepoint guarded_retry");
          expect(deniedCode).toBe("42501");
        };
        await expectForbidden(); // Banned Auth user must not use an active admin row.
        await tx.unsafe(
          "update auth.users set banned_until=null,email_confirmed_at=null where id=$1::uuid",
          [actor],
        );
        await expectForbidden();
        await tx.unsafe("update auth.users set email_confirmed_at=now() where id=$1::uuid", [
          actor,
        ]);
        await tx.unsafe("update public.admin_user set role='staff' where auth_user_id=$1::uuid", [
          actor,
        ]);
        await expectForbidden();
        await tx.unsafe(
          "update public.admin_user set role='treasurer' where auth_user_id=$1::uuid",
          [actor],
        );
        await tx.unsafe("update public.payment set status='refunded' where id=$1::uuid", [payment]);
        expect((await call())[0]?.retried).toBe(false);
        await tx.unsafe("update public.payment set status='succeeded' where id=$1::uuid", [
          payment,
        ]);
        expect((await call())[0]?.retried).toBe(true);
        expect((await call())[0]?.retried).toBe(false);
        const rows = (await tx.unsafe(
          "select j.status,j.attempts,(select count(*)::int from public.audit_log a where a.entity='donation_delivery_job' and a.entity_id=$2 and a.action='donation.delivery_retry') audit_count from public.donation_delivery_job j where j.id=$1::uuid",
          [job, job],
        )) as Array<{ status: string; attempts: number; audit_count: number }>;
        expect(rows[0]).toEqual({ status: "pending", attempts: 2, audit_count: 1 });

        await tx.unsafe(
          "update public.donation_delivery_job set status='complete' where id=$1::uuid",
          [job],
        );
        expect((await call())[0]?.retried).toBe(false);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
  30_000,
);
