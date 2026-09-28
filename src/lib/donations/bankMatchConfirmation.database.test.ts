import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.BANK_MATCH_CONFIRM_TEST_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).port !== "57322" ||
    new URL(url).pathname !== "/postgres")
)
  throw new Error("Dedicated local bank match database required");

// All synthetic money, jobs and audit facts roll back together.
test.skipIf(!url || process.env.BANK_MATCH_CONFIRM_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "bank match snapshot preserves one credit, conflict and current actor fence",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback synthetic bank confirmation");
    const actor = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const donations = [crypto.randomUUID(), crypto.randomUUID()];
    const payments = [crypto.randomUUID(), crypto.randomUUID()];
    const references = [`SYNTH-175-${crypto.randomUUID()}`, `SYNTH-175-${crypto.randomUUID()}`];
    const fileSha = "a".repeat(64);
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, `${actor}@example.invalid`],
        );
        await tx.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'treasurer','active')",
          [crypto.randomUUID(), actor, `${actor}@example.invalid`],
        );
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic bank donor',$2)",
          [supporter, `${supporter}@example.invalid`],
        );
        for (let index = 0; index < 2; index++) {
          const amount = (index + 1) * 10000;
          await tx.unsafe(
            "insert into public.donation(id,supporter_id,amount_cents,purpose,method) values($1::uuid,$2::uuid,$3,'general','fps')",
            [donations[index], supporter, amount],
          );
          await tx.unsafe(
            "insert into public.payment(id,donation_id,provider,provider_ref,amount_cents) values($1::uuid,$2::uuid,'fps',$3,$4)",
            [payments[index], donations[index], `HINT-${payments[index]}`, amount],
          );
        }
        const selected = JSON.stringify(
          payments.map((paymentId, index) => ({
            ordinal: index + 1,
            bankReference: references[index],
            paymentId,
            amountCents: (index + 1) * 10000,
          })),
        );
        const create = () =>
          tx.unsafe(
            "select public.create_finance_bank_match_preview($1::uuid,$2,$3::jsonb) result",
            [actor, fileSha, selected],
          );
        await tx.unsafe(
          "update auth.users set banned_until=now()+interval '1 hour' where id=$1::uuid",
          [actor],
        );
        await tx.unsafe("savepoint denied_preview");
        let denied: string | undefined;
        try {
          await create();
        } catch (error) {
          denied = (error as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint denied_preview");
        expect(denied).toBe("42501");
        await tx.unsafe("update auth.users set banned_until=null where id=$1::uuid", [actor]);

        const preview = (await create())[0]!.result as {
          operationId: string;
          state: string;
          items: Array<{ status: string }>;
        };
        expect(preview.state).toBe("queued");
        expect(preview.items.map((item) => item.status)).toEqual(["pending", "pending"]);
        const operationId = preview.operationId;
        const expiredPreview = (await create())[0]!.result as { operationId: string };
        const competing = (await create())[0]!.result as { operationId: string };
        await tx.unsafe(
          "update public.finance_bank_match_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [expiredPreview.operationId],
        );
        await tx.unsafe("savepoint expired_apply");
        let expired: string | undefined;
        try {
          await tx.unsafe("select public.apply_finance_bank_match_item($1::uuid,$2::uuid,2)", [
            actor,
            expiredPreview.operationId,
          ]);
        } catch (error) {
          expired = (error as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint expired_apply");
        expect(expired).toBe("P0001");
        const duplicates = JSON.stringify([
          { ordinal: 1, bankReference: references[0], paymentId: payments[0], amountCents: 10000 },
          { ordinal: 2, bankReference: references[0], paymentId: payments[1], amountCents: 20000 },
        ]);
        await tx.unsafe("savepoint duplicate_reference");
        let duplicate: string | undefined;
        try {
          await tx.unsafe(
            "select public.create_finance_bank_match_preview($1::uuid,$2,$3::jsonb)",
            [actor, fileSha, duplicates],
          );
        } catch (error) {
          duplicate = (error as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint duplicate_reference");
        expect(duplicate).toBe("23505");
        const grants = await tx.unsafe(
          "select has_function_privilege('anon','public.create_finance_bank_match_preview(uuid,text,jsonb)','EXECUTE') anon_allowed,has_function_privilege('authenticated','public.apply_finance_bank_match_item(uuid,uuid,integer)','EXECUTE') auth_allowed,has_function_privilege('service_role','public.apply_finance_bank_match_item(uuid,uuid,integer)','EXECUTE') service_allowed,(select relrowsecurity from pg_class where oid='public.finance_bank_match_item'::regclass) rls",
        );
        expect(grants[0]).toEqual({
          anon_allowed: false,
          auth_allowed: false,
          service_allowed: true,
          rls: true,
        });

        const apply = (ordinal: number) =>
          tx.unsafe("select public.apply_finance_bank_match_item($1::uuid,$2::uuid,$3) result", [
            actor,
            operationId,
            ordinal,
          ]);
        expect((await apply(1))[0]?.result?.status).toBe("succeeded");
        const staleCompeting = await tx.unsafe(
          "select public.apply_finance_bank_match_item($1::uuid,$2::uuid,1) result",
          [actor, competing.operationId],
        );
        expect(staleCompeting[0]?.result).toMatchObject({
          status: "conflict",
          reasonCode: "status_changed",
        });
        expect((await apply(1))[0]?.result?.status).toBe("succeeded");
        // Simulate a separate committed edit: the payment stays pending, but its version changes.
        await tx.unsafe("set local session_replication_role=replica");
        await tx.unsafe(
          "update public.payment set updated_at=clock_timestamp()+interval '2 seconds' where id=$1::uuid",
          [payments[1]],
        );
        await tx.unsafe("set local session_replication_role=origin");
        const versioned = await tx.unsafe(
          "select public.apply_finance_bank_match_item($1::uuid,$2::uuid,2) result",
          [actor, competing.operationId],
        );
        expect(versioned[0]?.result).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        await tx.unsafe("update public.payment set status='failed' where id=$1::uuid", [
          payments[1],
        ]);
        expect((await apply(2))[0]?.result).toMatchObject({
          status: "conflict",
          reasonCode: "status_changed",
        });
        const operation = (
          await tx.unsafe(
            "select public.get_finance_bank_match_operation($1::uuid,$2::uuid) result",
            [actor, operationId],
          )
        )[0]!.result as { state: string; items: Array<{ status: string }> };
        expect(operation.state).toBe("done");
        expect(operation.items.map((item) => item.status)).toEqual(["succeeded", "conflict"]);
        const facts = (await tx.unsafe(
          "select p.id,p.status,p.bank_reference,(select count(*)::int from public.donation_delivery_job j where j.payment_id=p.id) jobs,(select count(*)::int from public.audit_log a where a.entity='payment' and a.entity_id=p.id::text and a.action='payment.mark_received') audits from public.payment p where p.id in ($1::uuid,$2::uuid) order by p.id",
          payments,
        )) as Array<{
          id: string;
          status: string;
          bank_reference: string | null;
          jobs: number;
          audits: number;
        }>;
        expect(facts.find((row) => row.id === payments[0])).toMatchObject({
          status: "succeeded",
          bank_reference: references[0],
          jobs: 1,
          audits: 1,
        });
        expect(facts.find((row) => row.id === payments[1])).toMatchObject({
          status: "failed",
          bank_reference: null,
          jobs: 0,
          audits: 0,
        });

        await tx.unsafe("update public.admin_user set role='staff' where auth_user_id=$1::uuid", [
          actor,
        ]);
        await tx.unsafe("savepoint downgraded_read");
        let readDenied: string | undefined;
        try {
          await tx.unsafe("select public.get_finance_bank_match_operation($1::uuid,$2::uuid)", [
            actor,
            operationId,
          ]);
        } catch (error) {
          readDenied = (error as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint downgraded_read");
        expect(readDenied).toBe("42501");
        await tx.unsafe("savepoint downgraded_apply");
        let applyDenied: string | undefined;
        try {
          await tx.unsafe("select public.apply_finance_bank_match_item($1::uuid,$2::uuid,2)", [
            actor,
            expiredPreview.operationId,
          ]);
        } catch (error) {
          applyDenied = (error as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint downgraded_apply");
        expect(applyDenied).toBe("42501");
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

test.skipIf(!url || process.env.BANK_MATCH_CONFIRM_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "two finance snapshots racing the same payment settle only once",
  async () => {
    const db = new SQL(url!, { max: 3, prepare: false });
    const actor = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const donation = crypto.randomUUID();
    const payment = crypto.randomUUID();
    const reference = "SYNTH-175-RACE-" + crypto.randomUUID();
    const operationIds: string[] = [];
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'treasurer','active')",
          [crypto.randomUUID(), actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic race donor',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.donation(id,supporter_id,amount_cents,purpose,method) values($1::uuid,$2::uuid,10000,'general','fps')",
          [donation, supporter],
        );
        await tx.unsafe(
          "insert into public.payment(id,donation_id,provider,provider_ref,amount_cents) values($1::uuid,$2::uuid,'fps',$3,10000)",
          [payment, donation, "HINT-" + payment],
        );
      });
      const selected = JSON.stringify([
        { ordinal: 1, bankReference: reference, paymentId: payment, amountCents: 10000 },
      ]);
      for (let n = 0; n < 2; n++) {
        const created = await db.unsafe(
          "select public.create_finance_bank_match_preview($1::uuid,$2,$3::jsonb) result",
          [actor, "b".repeat(64), selected],
        );
        operationIds.push(created[0]!.result.operationId);
      }
      const results = await Promise.all(
        operationIds.map((operationId) =>
          db.unsafe("select public.apply_finance_bank_match_item($1::uuid,$2::uuid,1) result", [
            actor,
            operationId,
          ]),
        ),
      );
      expect(results.map((row) => row[0]!.result.status).sort()).toEqual(["conflict", "succeeded"]);
      const facts = await db.unsafe(
        "select p.status,(select count(*)::int from public.audit_log a where a.action='payment.mark_received' and a.entity_id=p.id::text) audits,(select count(*)::int from public.donation_delivery_job j where j.payment_id=p.id) jobs from public.payment p where p.id=$1::uuid",
        [payment],
      );
      expect(facts[0]).toMatchObject({ status: "succeeded", audits: 1, jobs: 1 });
      const replay = await db.unsafe(
        "select public.apply_finance_bank_match_item($1::uuid,$2::uuid,1) result",
        [actor, operationIds[0]],
      );
      expect(["conflict", "succeeded"]).toContain(replay[0]!.result.status);
      const afterReplay = await db.unsafe(
        "select count(*)::int audits from public.audit_log where action='payment.mark_received' and entity_id=$1",
        [payment],
      );
      expect(afterReplay[0]!.audits).toBe(1);
    } finally {
      try {
        await db.begin(async (tx) => {
          await tx.unsafe(
            "delete from public.finance_bank_match_item where operation_id in (select id from public.finance_bank_match_operation where actor_user_id=$1::uuid)",
            [actor],
          );
          await tx.unsafe(
            "delete from public.finance_bank_match_operation where actor_user_id=$1::uuid",
            [actor],
          );
          await tx.unsafe("delete from public.donation_delivery_job where payment_id=$1::uuid", [
            payment,
          ]);
          await tx.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
          await tx.unsafe("delete from public.payment where id=$1::uuid", [payment]);
          await tx.unsafe("delete from public.donation where id=$1::uuid", [donation]);
          await tx.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
          await tx.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [actor]);
          await tx.unsafe("delete from auth.users where id=$1::uuid", [actor]);
        });
      } finally {
        await db.close();
      }
    }
  },
  30_000,
);
