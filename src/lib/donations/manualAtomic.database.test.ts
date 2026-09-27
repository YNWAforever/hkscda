import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.MANUAL_FINANCE_TEST_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).port !== "57322" ||
    new URL(url).pathname !== "/postgres")
)
  throw new Error("Dedicated local finance database required");

test.skipIf(!url || process.env.MANUAL_FINANCE_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "one normalized manual bank reference cannot credit two payments",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback finance duplicate fixture");
    const supporter = crypto.randomUUID(),
      ids = [crypto.randomUUID(), crypto.randomUUID()],
      pay = [crypto.randomUUID(), crypto.randomUUID()];
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic donor',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        for (let i = 0; i < 2; i++) {
          await tx.unsafe(
            "insert into public.donation(id,supporter_id,amount_cents,purpose,method) values($1::uuid,$2::uuid,10000,'general','fps')",
            [ids[i], supporter],
          );
          await tx.unsafe(
            "insert into public.payment(id,donation_id,provider,amount_cents) values($1::uuid,$2::uuid,'fps',10000)",
            [pay[i], ids[i]],
          );
        }
        await tx.unsafe(
          "update public.payment set status='succeeded',bank_reference='  FPS-dup-01  ' where id=$1::uuid",
          [pay[0]],
        );
        await tx.unsafe("savepoint duplicate_finance_reference");
        let error: unknown;
        try {
          await tx.unsafe(
            "update public.payment set status='succeeded',bank_reference='fps-DUP-01' where id=$1::uuid",
            [pay[1]],
          );
        } catch (cause) {
          error = cause;
        }
        await tx.unsafe("rollback to savepoint duplicate_finance_reference");
        expect((error as { errno?: string } | undefined)?.errno).toBe("23505");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
  30000,
);

test.skipIf(!url || process.env.MANUAL_FINANCE_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "manual settlement is role guarded and payment/donation/audit roll back together",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback manual settlement fixture");
    const actor = crypto.randomUUID(),
      admin = crypto.randomUUID(),
      supporter = crypto.randomUUID();
    const donations = [crypto.randomUUID(), crypto.randomUUID()],
      payments = [crypto.randomUUID(), crypto.randomUUID()];
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'treasurer','active')",
          [admin, actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic finance donor',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        for (let i = 0; i < 2; i++) {
          await tx.unsafe(
            "insert into public.donation(id,supporter_id,amount_cents,purpose,method) values($1::uuid,$2::uuid,10000,'general','fps')",
            [donations[i], supporter],
          );
          await tx.unsafe(
            "insert into public.payment(id,donation_id,provider,amount_cents) values($1::uuid,$2::uuid,'fps',$3)",
            [payments[i], donations[i], i === 1 ? 9000 : 10000],
          );
        }
        const call = (id: string, ref: string) =>
          tx.unsafe("select public.reconcile_manual_payment_atomic($1::uuid,$2::uuid,$3) result", [
            actor,
            id,
            ref,
          ]) as Promise<Array<{ result: { kind: string; donationId?: string } }>>;
        const fail = async (fn: () => Promise<unknown>, errno: string) => {
          await tx.unsafe("savepoint manual_atomic_fail");
          let error: unknown;
          try {
            await fn();
          } catch (cause) {
            error = cause;
          }
          await tx.unsafe("rollback to savepoint manual_atomic_fail");
          expect((error as { errno?: string } | undefined)?.errno).toBe(errno);
        };
        expect((await call(payments[1]!, "FPS-MISMATCH"))[0]!.result.kind).toBe("amount_mismatch");
        expect((await call(payments[0]!, "  FPS-ATOMIC-01 "))[0]!.result.kind).toBe("applied");
        expect((await call(payments[0]!, "FPS-ATOMIC-01"))[0]!.result.kind).toBe("state_conflict");
        await tx.unsafe("update public.payment set amount_cents=10000 where id=$1::uuid", [
          payments[1],
        ]);
        await fail(() => call(payments[1]!, "fps-atomic-01"), "23505");
        await tx.unsafe("update public.admin_user set role='staff' where auth_user_id=$1::uuid", [
          actor,
        ]);
        await fail(() => call(payments[1]!, "FPS-OTHER"), "42501");
        await tx.unsafe(
          "update public.admin_user set role='treasurer',status='disabled' where auth_user_id=$1::uuid",
          [actor],
        );
        await fail(() => call(payments[1]!, "FPS-OTHER"), "42501");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [actor],
        );
        await tx.unsafe(
          "create function pg_temp.fail_manual_audit() returns trigger language plpgsql as $$ begin if new.action='payment.mark_received' then raise exception 'synthetic audit failure' using errcode='P0002';end if;return new;end $$",
        );
        await tx.unsafe(
          "create trigger fail_manual_audit before insert on public.audit_log for each row execute function pg_temp.fail_manual_audit()",
        );
        await fail(() => call(payments[1]!, "FPS-OTHER"), "P0002");
        const state = (await tx.unsafe(
          "select p.status payment_status,d.status donation_status from public.payment p join public.donation d on d.id=p.donation_id where p.id=$1::uuid",
          [payments[1]],
        )) as Array<{ payment_status: string; donation_status: string }>;
        expect(state[0]).toEqual({ payment_status: "pending", donation_status: "pending" });
        await tx.unsafe("drop trigger fail_manual_audit on public.audit_log");
        const audits = (await tx.unsafe(
          "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='payment.mark_received'",
          [actor],
        )) as Array<{ n: number }>;
        expect(audits[0]!.n).toBe(1);
        const grants = (await tx.unsafe(
          "select has_function_privilege('authenticated','public.reconcile_manual_payment_atomic(uuid,uuid,text)','EXECUTE') allowed",
        )) as Array<{ allowed: boolean }>;
        expect(grants[0]!.allowed).toBe(false);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
  30000,
);
