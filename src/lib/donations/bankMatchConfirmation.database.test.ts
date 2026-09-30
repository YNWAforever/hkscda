import { SQL } from "bun";
import { expect, test } from "bun:test";
import { createBankMatchOperationHandler } from "../../routes/api/admin/finance/bank-match-operations";

const url = process.env.BANK_MATCH_CONFIRM_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" ||
    target.search ||
    target.hash ||
    !(
      (target.port === "57322" && target.pathname === "/postgres") ||
      (target.port === "52322" && target.pathname === "/audit_pr135_20260929")
    )
  )
    throw new Error("Dedicated local bank match database required");
}

// Missing a deadline check after an entity lock or normalized-reference index
// wait must fail these tests: a live preview cannot authorize a late settlement.
for (const contention of ["payment", "donation", "bank reference"] as const) {
  test.skipIf(!url || process.env.BANK_MATCH_CONFIRM_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
    `bank match rejects expiry while blocked on unchanged ${contention}`,
    async () => {
      const db = new SQL(url!, { max: 1, prepare: false });
      const blocker = new SQL(url!, { max: 1, prepare: false });
      const worker = new SQL(url!, { max: 1, prepare: false });
      const actor = crypto.randomUUID();
      const supporter = crypto.randomUUID();
      const donations = [crypto.randomUUID(), crypto.randomUUID()];
      const payments = [crypto.randomUUID(), crypto.randomUUID()];
      const reference = `SYNTH-175-DEADLINE-${crypto.randomUUID()}`;
      const rollback = new Error("rollback unchanged blocker after preview expiry");
      let operationId: string | undefined;
      let blockerPid = 0;
      let workerPid = 0;
      let completed = false;
      let releaseBlocker = () => {};
      let blockerReady = () => {};
      const release = new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        blockerReady = resolve;
      });
      let blocking: Promise<unknown> | undefined;
      let applying: Promise<{ result?: unknown; errno?: string; message?: string }> | undefined;
      const facts = async () =>
        (
          await db.unsafe(
            `
        select jsonb_build_object(
          'auth', (select to_jsonb(u) from auth.users u where id=$1::uuid),
          'admin', (select to_jsonb(a) from public.admin_user a where auth_user_id=$1::uuid),
          'supporter', (select to_jsonb(s) from public.supporter s where id=$2::uuid),
          'payments', (select jsonb_agg(to_jsonb(p) order by id) from public.payment p where id in ($3::uuid,$4::uuid)),
          'donations', (select jsonb_agg(to_jsonb(d) order by id) from public.donation d where id in ($5::uuid,$6::uuid)),
          'operation', (select to_jsonb(o) from public.finance_bank_match_operation o where id=$7::uuid),
          'items', (select jsonb_agg(to_jsonb(i) order by ordinal) from public.finance_bank_match_item i where operation_id=$7::uuid),
          'jobs', (select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]'::jsonb) from public.donation_delivery_job j where payment_id in ($3::uuid,$4::uuid)),
          'audits', (select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) from public.audit_log a
            where actor_user_id=$1::uuid or entity_id in ($3::text,$4::text,$5::text,$6::text,$7::text)
              or detail->>'paymentId' in ($3::text,$4::text) or detail->>'donationId' in ($5::text,$6::text))
        ) state`,
            [actor, supporter, ...payments, ...donations, operationId],
          )
        )[0]!.state;
      const observe = async () =>
        (
          await db.unsafe(
            `
        select clock_timestamp() observed_at, expires_at,
          expires_at>clock_timestamp() live,
          $2::integer=any(pg_blocking_pids($3::integer)) blocked,
          (select wait_event from pg_stat_activity where pid=$3::integer) wait_event
        from public.finance_bank_match_operation where id=$1::uuid`,
            [operationId, blockerPid, workerPid],
          )
        )[0]!;
      const waitUntil = async (condition: () => Promise<boolean>, reason: string) => {
        const end = performance.now() + 10_000;
        while (performance.now() < end) {
          if (await condition()) return;
          await Bun.sleep(20);
        }
        throw new Error(reason);
      };
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
            "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic deadline donor',$2)",
            [supporter, `${supporter}@example.invalid`],
          );
          for (let n = 0; n < 2; n++) {
            await tx.unsafe(
              "insert into public.donation(id,supporter_id,amount_cents,purpose,method) values($1::uuid,$2::uuid,10000,'general','fps')",
              [donations[n], supporter],
            );
            await tx.unsafe(
              "insert into public.payment(id,donation_id,provider,provider_ref,amount_cents) values($1::uuid,$2::uuid,'fps',$3,10000)",
              [payments[n], donations[n], `HINT-${payments[n]}`],
            );
          }
          await tx.unsafe("set local role service_role");
          const [preview] = await tx.unsafe(
            "select public.create_finance_bank_match_preview($1::uuid,$2,$3::jsonb) result",
            [
              actor,
              "c".repeat(64),
              JSON.stringify([
                {
                  ordinal: 1,
                  paymentId: payments[0],
                  paymentHint: `HINT-${payments[0]}`,
                  bankReference: reference,
                  amountCents: 10000,
                },
              ]),
            ],
          );
          operationId = preview!.result.operationId;
          expect(preview!.result.items[0].status).toBe("pending");
        });
        // The operation is saved while live before either transaction takes locks.
        await db.unsafe(
          "update public.finance_bank_match_operation set expires_at=clock_timestamp()+interval '4 seconds' where id=$1::uuid",
          [operationId],
        );
        const before = await facts();
        blocking = blocker
          .begin(async (tx) => {
            blockerPid = (await tx.unsafe("select pg_backend_pid() pid"))[0]!.pid;
            if (contention === "bank reference") {
              await tx.unsafe("set local role service_role");
              const [settled] = await tx.unsafe(
                "select public.reconcile_manual_payment_atomic($1::uuid,$2::uuid,$3) result",
                [actor, payments[1], `  ${reference.toLowerCase()}  `],
              );
              expect(settled!.result.kind).toBe("applied");
            } else {
              await tx.unsafe(`select id from public.${contention} where id=$1::uuid for update`, [
                contention === "payment" ? payments[0] : donations[0],
              ]);
            }
            blockerReady();
            await release;
            throw rollback;
          })
          .catch((error: unknown) => {
            if (error !== rollback) throw error;
          });
        await Promise.race([
          ready,
          blocking.then(() => {
            throw new Error("blocker exited before ready");
          }),
        ]);
        expect((await observe()).live).toBe(true);
        applying = worker
          .begin(async (tx) => {
            workerPid = (await tx.unsafe("select pg_backend_pid() pid"))[0]!.pid;
            await tx.unsafe("set local statement_timeout='12s'");
            await tx.unsafe("set local role service_role");
            const [row] = await tx.unsafe(
              "select public.apply_finance_bank_match_item($1::uuid,$2::uuid,1) result",
              [actor, operationId],
            );
            return { result: row!.result };
          })
          .catch((error: unknown) => ({
            errno: (error as { errno?: string }).errno,
            message: (error as Error).message,
          }))
          .finally(() => {
            completed = true;
          });
        await waitUntil(
          async () => (await observe()).blocked === true,
          "target never waited on exact blocker",
        );
        expect((await observe()).live).toBe(true);
        await waitUntil(
          async () => (await observe()).live === false,
          "database deadline did not expire while blocked",
        );
        const expired = await observe();
        expect(expired.blocked).toBe(true);
        expect(completed).toBe(false);
        console.log("Task175 live-start/exact-blocker/deadline", {
          contention,
          blockerPid,
          workerPid,
          ...expired,
        });
        releaseBlocker();
        await blocking;
        const outcome = await applying;
        console.log("Task175 outcome", contention, outcome);
        expect(outcome).toMatchObject({
          errno: "P0001",
          message: "finance_bank_match_preview_expired",
        });
        const handler = createBankMatchOperationHandler({
          authorize: async () => actor,
          create: async () => {
            throw new Error("unexpected create");
          },
          get: async () => {
            throw new Error("unexpected get");
          },
          apply: async () => {
            throw { code: outcome.errno, message: outcome.message };
          },
        });
        const response = await handler(
          new Request("https://example.invalid/api/admin/finance/bank-match-operations", {
            method: "PATCH",
            body: JSON.stringify({ operationId, ordinal: 1 }),
          }),
        );
        expect(response.status).toBe(409);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ error: "Snapshot expired or changed; refresh" });
        // This compares original versions, timestamps, references, pending item,
        // both payments/donations, actor, jobs and every generated fixture audit.
        expect(await facts()).toEqual(before);
      } finally {
        releaseBlocker();
        await Promise.allSettled([blocking, applying]);
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
            await tx.unsafe(
              "delete from public.donation_delivery_job where payment_id in ($1::uuid,$2::uuid)",
              payments,
            );
            await tx.unsafe("delete from public.payment where id in ($1::uuid,$2::uuid)", payments);
            await tx.unsafe(
              "delete from public.donation where id in ($1::uuid,$2::uuid)",
              donations,
            );
            await tx.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
            await tx.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [actor]);
            await tx.unsafe("delete from auth.users where id=$1::uuid", [actor]);
            await tx.unsafe(
              "delete from public.audit_log where actor_user_id=$1::uuid or entity_id in ($2,$3,$4,$5,$6) or detail->>'paymentId' in ($2,$3) or detail->>'donationId' in ($4,$5)",
              [actor, ...payments, ...donations, operationId],
            );
          });
        } finally {
          await Promise.all([db.close(), blocker.close(), worker.close()]);
        }
      }
    },
    30_000,
  );
}

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
        const rpc = async (query: string, args: (string | number | null)[]) => {
          await tx.unsafe("set local role service_role");
          try {
            return await tx.unsafe(query, args);
          } finally {
            await tx.unsafe("reset role").catch(() => {});
          }
        };
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
            paymentHint: "HINT-" + paymentId,
            paymentId,
            amountCents: (index + 1) * 10000,
          })),
        );
        const create = () =>
          rpc("select public.create_finance_bank_match_preview($1::uuid,$2,$3::jsonb) result", [
            actor,
            fileSha,
            selected,
          ]);
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
        await tx.unsafe("reset role");
        expect(denied).toBe("42501");
        await tx.unsafe("update auth.users set banned_until=null where id=$1::uuid", [actor]);

        const preview = (await create())[0]!.result as {
          operationId: string;
          state: string;
          items: Array<{ status: string }>;
        };
        expect(preview.state).toBe("queued");
        expect(preview.items.map((item) => item.status)).toEqual(["pending", "pending"]);
        const wrongHint = JSON.stringify([
          {
            ordinal: 2,
            bankReference: "SYNTH-175-WRONG-" + crypto.randomUUID(),
            paymentId: payments[1],
            amountCents: 20000,
            paymentHint: "OTHER-HINT",
          },
        ]);
        const wrong = await rpc(
          "select public.create_finance_bank_match_preview($1::uuid,$2,$3::jsonb) result",
          [actor, fileSha, wrongHint],
        );
        expect(wrong[0]!.result.items[0]).toMatchObject({
          status: "skipped",
          reasonCode: "hint_changed",
        });
        const operationId = preview.operationId;
        const expiredPreview = (await create())[0]!.result as { operationId: string };
        const competing = (await create())[0]!.result as { operationId: string };
        const changedHint = (await create())[0]!.result as { operationId: string };
        await tx.unsafe(
          "update public.finance_bank_match_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [expiredPreview.operationId],
        );
        await tx.unsafe("savepoint expired_apply");
        let expired: string | undefined;
        try {
          await rpc("select public.apply_finance_bank_match_item($1::uuid,$2::uuid,2)", [
            actor,
            expiredPreview.operationId,
          ]);
        } catch (error) {
          expired = (error as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint expired_apply");
        await tx.unsafe("reset role");
        expect(expired).toBe("P0001");
        const duplicates = JSON.stringify([
          {
            ordinal: 1,
            bankReference: references[0],
            paymentHint: "HINT-" + payments[0],
            paymentId: payments[0],
            amountCents: 10000,
          },
          {
            ordinal: 2,
            bankReference: references[0],
            paymentHint: "HINT-" + payments[1],
            paymentId: payments[1],
            amountCents: 20000,
          },
        ]);
        await tx.unsafe("savepoint duplicate_reference");
        let duplicate: string | undefined;
        try {
          await rpc("select public.create_finance_bank_match_preview($1::uuid,$2,$3::jsonb)", [
            actor,
            fileSha,
            duplicates,
          ]);
        } catch (error) {
          duplicate = (error as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint duplicate_reference");
        await tx.unsafe("reset role");
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
          rpc("select public.apply_finance_bank_match_item($1::uuid,$2::uuid,$3) result", [
            actor,
            operationId,
            ordinal,
          ]);
        expect((await apply(1))[0]?.result?.status).toBe("succeeded");
        const staleCompeting = await rpc(
          "select public.apply_finance_bank_match_item($1::uuid,$2::uuid,1) result",
          [actor, competing.operationId],
        );
        expect(staleCompeting[0]?.result).toMatchObject({
          status: "conflict",
          reasonCode: "status_changed",
        });
        expect((await apply(1))[0]?.result?.status).toBe("succeeded");
        // A provider reference change without a timestamp bump must still invalidate exact matching.
        await tx.unsafe("set local session_replication_role=replica");
        await tx.unsafe("update public.payment set provider_ref='OTHER-HINT' where id=$1::uuid", [
          payments[1],
        ]);
        await tx.unsafe("set local session_replication_role=origin");
        const changed = await rpc(
          "select public.apply_finance_bank_match_item($1::uuid,$2::uuid,2) result",
          [actor, changedHint.operationId],
        );
        expect(changed[0]?.result).toMatchObject({
          status: "conflict",
          reasonCode: "hint_changed",
        });
        await tx.unsafe("set local session_replication_role=replica");
        await tx.unsafe("update public.payment set provider_ref=$2 where id=$1::uuid", [
          payments[1],
          "HINT-" + payments[1],
        ]);
        await tx.unsafe("set local session_replication_role=origin");
        // Simulate a separate committed edit: the payment stays pending, but its version changes.
        await tx.unsafe("set local session_replication_role=replica");
        await tx.unsafe(
          "update public.payment set updated_at=clock_timestamp()+interval '2 seconds' where id=$1::uuid",
          [payments[1]],
        );
        await tx.unsafe("set local session_replication_role=origin");
        const versioned = await rpc(
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
          await rpc("select public.get_finance_bank_match_operation($1::uuid,$2::uuid) result", [
            actor,
            operationId,
          ])
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

        // A completed financial outcome remains recoverable after expiry.
        await tx.unsafe(
          "update public.finance_bank_match_operation set expires_at=clock_timestamp()-interval '1 second' where id=$1::uuid",
          [operationId],
        );
        expect((await apply(1))[0]?.result?.status).toBe("succeeded");
        expect(
          (
            await tx.unsafe(
              "select count(*)::int n from public.audit_log where action='payment.mark_received' and entity_id=$1",
              [payments[0]],
            )
          )[0]?.n,
        ).toBe(1);

        await tx.unsafe("update public.admin_user set role='staff' where auth_user_id=$1::uuid", [
          actor,
        ]);
        await tx.unsafe("savepoint downgraded_read");
        let readDenied: string | undefined;
        try {
          await rpc("select public.get_finance_bank_match_operation($1::uuid,$2::uuid)", [
            actor,
            operationId,
          ]);
        } catch (error) {
          readDenied = (error as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint downgraded_read");
        await tx.unsafe("reset role");
        expect(readDenied).toBe("42501");
        await tx.unsafe("savepoint downgraded_apply");
        let applyDenied: string | undefined;
        try {
          await rpc("select public.apply_finance_bank_match_item($1::uuid,$2::uuid,2)", [
            actor,
            expiredPreview.operationId,
          ]);
        } catch (error) {
          applyDenied = (error as { errno?: string }).errno;
        }
        await tx.unsafe("rollback to savepoint downgraded_apply");
        await tx.unsafe("reset role");
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
    const serviceRpc = (query: string, args: (string | number | null | undefined)[]) =>
      db.begin(async (tx) => {
        await tx.unsafe("set local role service_role");
        return tx.unsafe(query, args);
      });
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
        {
          ordinal: 1,
          bankReference: reference,
          paymentHint: "HINT-" + payment,
          paymentId: payment,
          amountCents: 10000,
        },
      ]);
      for (let n = 0; n < 2; n++) {
        const created = await serviceRpc(
          "select public.create_finance_bank_match_preview($1::uuid,$2,$3::jsonb) result",
          [actor, "b".repeat(64), selected],
        );
        operationIds.push(created[0]!.result.operationId);
      }
      const results = await Promise.all(
        operationIds.map((operationId) =>
          serviceRpc("select public.apply_finance_bank_match_item($1::uuid,$2::uuid,1) result", [
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
      const replay = await serviceRpc(
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
          await tx.unsafe(
            "delete from public.audit_log where actor_user_id=$1::uuid or detail->>'paymentId'=$2 or detail->>'donationId'=$3",
            [actor, payment, donation],
          );
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
