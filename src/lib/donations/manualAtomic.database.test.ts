import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.MANUAL_FINANCE_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" ||
    target.search ||
    target.hash ||
    ![
      "57322/postgres",
      "52322/audit_pr135_20260929",
      ...(process.env.CI ? ["55322/postgres"] : []),
    ].includes(`${target.port}${target.pathname}`)
  )
    throw new Error("Dedicated disposable finance database required");
}

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
        // The dedicated local DB can carry an untracked experimental trigger.
        // Disable it only inside this rollback-only fixture so the RPC must queue its own job.
        await tx.unsafe(
          "do $$ begin if exists(select 1 from pg_trigger where tgrelid='public.donation'::regclass and tgname='donation_success_delivery_job') then execute 'alter table public.donation disable trigger donation_success_delivery_job'; end if; end $$",
        );
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
        const call = async (id: string, ref: string) => {
          await tx.unsafe("set local role service_role");
          const result = await tx.unsafe(
            "select public.reconcile_manual_payment_atomic($1::uuid,$2::uuid,$3) result",
            [actor, id, ref],
          );
          await tx.unsafe("reset role");
          return result as Array<{ result: { kind: string; donationId?: string } }>;
        };
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
        for (const role of ["anon", "authenticated"])
          await fail(async () => {
            await tx.unsafe(`set local role ${role}`);
            await tx.unsafe("select public.reconcile_manual_payment_atomic($1::uuid,$2::uuid,$3)", [
              actor,
              payments[0],
              "DENIED",
            ]);
          }, "42501");
        for (const change of ["banned_until=now()+interval '1 day'", "email_confirmed_at=null"]) {
          await tx.unsafe(`update auth.users set ${change} where id=$1::uuid`, [actor]);
          await fail(() => call(payments[0]!, "DENIED"), "42501");
          await tx.unsafe(
            "update auth.users set banned_until=null,email_confirmed_at=now() where id=$1::uuid",
            [actor],
          );
        }
        expect((await call(payments[1]!, "FPS-MISMATCH"))[0]!.result.kind).toBe("amount_mismatch");
        expect((await call(payments[0]!, "  FPS-ATOMIC-01 "))[0]!.result.kind).toBe("applied");
        const jobs = (await tx.unsafe(
          "select count(*)::int n from public.donation_delivery_job where payment_id=$1::uuid",
          [payments[0]],
        )) as Array<{ n: number }>;
        expect(jobs[0]!.n).toBe(1);
        expect((await call(payments[0]!, "fps-ATOMIC-01"))[0]!.result.kind).toBe("duplicate");
        expect((await call(payments[0]!, "DIFFERENT-REFERENCE"))[0]!.result.kind).toBe(
          "state_conflict",
        );
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
        const failedJobs = (await tx.unsafe(
          "select count(*)::int n from public.donation_delivery_job where payment_id=$1::uuid",
          [payments[1]],
        )) as Array<{ n: number }>;
        expect(failedJobs[0]!.n).toBe(0);
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

test.skipIf(!url || process.env.MANUAL_FINANCE_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "manual settlement holds actor authority until commit and concurrent replay recovers one job",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const other = new SQL(url!, { max: 1, prepare: false });
    const actor = crypto.randomUUID(),
      admin = crypto.randomUUID(),
      supporter = crypto.randomUUID();
    const donation = crypto.randomUUID(),
      payment = crypto.randomUUID();
    const reference = "SYNTHETIC-" + payment;
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
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic settlement donor',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.donation(id,supporter_id,amount_cents,purpose,method) values($1::uuid,$2::uuid,10000,'general','fps')",
          [donation, supporter],
        );
        await tx.unsafe(
          "insert into public.payment(id,donation_id,provider,amount_cents) values($1::uuid,$2::uuid,'fps',10000)",
          [payment, donation],
        );
      });
      const rewind = new Error("rewind manual finance lock");
      try {
        await db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          await tx.unsafe("select public.reconcile_manual_payment_atomic($1::uuid,$2::uuid,$3)", [
            actor,
            payment,
            reference,
          ]);
          for (const query of [
            "update public.admin_user set role='staff' where auth_user_id=$1::uuid",
            "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
            "update auth.users set banned_until=now()+interval '1 day' where id=$1::uuid",
          ])
            await expect(
              other.begin(async (tx2) => {
                await tx2.unsafe("set local lock_timeout='150ms'");
                await tx2.unsafe(query, [actor]);
              }),
            ).rejects.toMatchObject({ errno: "55P03" });
          throw rewind;
        });
      } catch (error) {
        if (error !== rewind) throw error;
      }
      const apply = (connection: SQL) =>
        connection.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          return (
            await tx.unsafe(
              "select public.reconcile_manual_payment_atomic($1::uuid,$2::uuid,$3) result",
              [actor, payment, reference],
            )
          )[0].result as { kind: string; deliveryJobId: string };
        });
      const results = await Promise.all([apply(db), apply(other)]);
      expect(results.map((r) => r.kind).sort()).toEqual(["applied", "duplicate"]);
      expect(results[0]!.deliveryJobId).toBe(results[1]!.deliveryJobId);
      expect(
        (
          await db.unsafe(
            "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='payment.mark_received'",
            [actor],
          )
        )[0].n,
      ).toBe(1);
      expect(
        (
          await db.unsafe(
            "select count(*)::int n from public.donation_delivery_job where payment_id=$1::uuid",
            [payment],
          )
        )[0].n,
      ).toBe(1);
      expect(
        (
          await db.unsafe(
            "select p.status payment_status,d.status donation_status from public.payment p join public.donation d on d.id=p.donation_id where p.id=$1::uuid",
            [payment],
          )
        )[0],
      ).toEqual({ payment_status: "succeeded", donation_status: "succeeded" });
    } finally {
      await db.unsafe("delete from public.donation_delivery_job where donation_id=$1::uuid", [
        donation,
      ]);
      await db.unsafe(
        "delete from public.audit_log where actor_user_id=$1::uuid or entity_id=any($2::text[])",
        [actor, "{" + donation + "," + payment + "}"],
      );
      await db.unsafe("delete from public.payment where id=$1::uuid", [payment]);
      await db.unsafe("delete from public.donation where id=$1::uuid", [donation]);
      await db.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
      await db.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [actor]);
      await db.unsafe("delete from auth.users where id=$1::uuid", [actor]);
      await other.close();
      await db.close();
    }
  },
  30000,
);

test.skipIf(!url || process.env.MANUAL_FINANCE_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "two concurrent payments sharing one normalized bank reference credit exactly one donation",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false }),
      other = new SQL(url!, { max: 1, prepare: false });
    const actor = crypto.randomUUID(),
      admin = crypto.randomUUID(),
      supporter = crypto.randomUUID();
    const donations = [crypto.randomUUID(), crypto.randomUUID()],
      payments = [crypto.randomUUID(), crypto.randomUUID()];
    const packed = "{" + donations.join(",") + "}";
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'admin','active')",
          [admin, actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic concurrency donor',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        for (let i = 0; i < 2; i++) {
          await tx.unsafe(
            "insert into public.donation(id,supporter_id,amount_cents,purpose,method) values($1::uuid,$2::uuid,10000,'general','fps')",
            [donations[i], supporter],
          );
          await tx.unsafe(
            "insert into public.payment(id,donation_id,provider,amount_cents) values($1::uuid,$2::uuid,'fps',10000)",
            [payments[i], donations[i]],
          );
        }
      });
      const apply = (connection: SQL, index: number) =>
        connection.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          return (
            await tx.unsafe(
              "select public.reconcile_manual_payment_atomic($1::uuid,$2::uuid,$3) result",
              [
                actor,
                payments[index],
                index === 0 ? "  SAME-" + supporter.toUpperCase() + "  " : "same-" + supporter,
              ],
            )
          )[0].result.kind as string;
        });
      const outcomes = await Promise.allSettled([apply(db, 0), apply(other, 1)]);
      expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
        status: "rejected",
        reason: { errno: "23505" },
      });
      expect(
        (
          await db.unsafe(
            "select (select count(*)::int from public.payment where donation_id=any($1::uuid[]) and status='succeeded') payments,(select count(*)::int from public.donation where id=any($1::uuid[]) and status='succeeded') donations,(select count(*)::int from public.donation_delivery_job where donation_id=any($1::uuid[])) jobs,(select count(*)::int from public.audit_log where actor_user_id=$2::uuid and action='payment.mark_received') audits",
            [packed, actor],
          )
        )[0],
      ).toEqual({ payments: 1, donations: 1, jobs: 1, audits: 1 });
    } finally {
      await db.unsafe(
        "delete from public.donation_delivery_job where donation_id=any($1::uuid[])",
        [packed],
      );
      await db.unsafe(
        "delete from public.audit_log where actor_user_id=$1::uuid or entity_id=any($2::text[])",
        [actor, "{" + [...donations, ...payments].join(",") + "}"],
      );
      await db.unsafe("delete from public.payment where donation_id=any($1::uuid[])", [packed]);
      await db.unsafe("delete from public.donation where id=any($1::uuid[])", [packed]);
      await db.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
      await db.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [actor]);
      await db.unsafe("delete from auth.users where id=$1::uuid", [actor]);
      await other.close();
      await db.close();
    }
  },
  30000,
);
