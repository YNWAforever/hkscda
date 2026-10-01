import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import {
  assertCloneUrl,
  assertSafeFixtureTables,
} from "../../../supabase/rls-tests/helpers/productionSchemaClone";

const url = process.env.R01_FORWARD_TEST_DATABASE_URL;
if (url) assertCloneUrl(url);
const fingerprint = "a".repeat(64);
let db: SQL;
let supporter: string;

async function sqlState(operation: Promise<unknown>, expected: string) {
  try {
    await operation;
    throw new Error(`Expected SQLSTATE ${expected}`);
  } catch (error) {
    expect((error as { errno?: string }).errno).toBe(expected);
  }
}

describe.skipIf(!url)("R01 donation/payment forward schema on a guarded new clone", () => {
  beforeAll(async () => {
    db = new SQL(url!, { max: 4, prepare: false });
    await assertSafeFixtureTables(db, [
      "supporter",
      "donation",
      "payment",
      "admin_user",
      "auth.users",
      "audit_log",
    ]);
    supporter = crypto.randomUUID();
    await db`insert into public.supporter(id,name,email) values(${supporter}::uuid,'R01 synthetic donor',${`r01-${supporter}@example.invalid`})`;
  });
  afterAll(async () => {
    await db?.close();
  });

  test("current repository projection can read all five nullable intent columns", async () => {
    // RED must be an actual missing-column query, before any forward DDL.
    await db`select id,idempotency_key,idempotency_fingerprint from public.donation limit 0`;
    await db`select id,idempotency_key,checkout_url,checkout_attempted_at from public.payment limit 0`;
    const columns =
      await db`select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns
      where table_schema='public' and (table_name='donation' and column_name in ('idempotency_key','idempotency_fingerprint')
      or table_name='payment' and column_name in ('idempotency_key','checkout_url','checkout_attempted_at')) order by table_name,column_name`;
    expect(
      columns.map(
        (c: {
          table_name: string;
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: unknown;
        }) => [c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default],
      ),
    ).toEqual([
      ["donation", "idempotency_fingerprint", "text", "YES", null],
      ["donation", "idempotency_key", "uuid", "YES", null],
      ["payment", "checkout_attempted_at", "timestamp with time zone", "YES", null],
      ["payment", "checkout_url", "text", "YES", null],
      ["payment", "idempotency_key", "uuid", "YES", null],
    ]);
  });

  test("legacy rows keep NULL intent fields and immutable money/provider facts", async () => {
    const donation = crypto.randomUUID(),
      payment = crypto.randomUUID();
    await db`insert into public.donation(id,supporter_id,amount_cents,currency,purpose,type,status,method,refunded_cents)
      values(${donation}::uuid,${supporter}::uuid,12345,'HKD','medical','one_time','succeeded','stripe',123)`;
    await db`insert into public.payment(id,donation_id,provider,provider_ref,amount_cents,status,refunded_cents)
      values(${payment}::uuid,${donation}::uuid,'stripe','r01-synthetic-committed',12345,'succeeded',123)`;
    const [d] =
      await db`select idempotency_key,idempotency_fingerprint,amount_cents,refunded_cents,status,currency from public.donation where id=${donation}::uuid`;
    const [p] =
      await db`select idempotency_key,checkout_url,checkout_attempted_at,amount_cents,refunded_cents,status,provider_ref from public.payment where id=${payment}::uuid`;
    expect(d).toMatchObject({
      idempotency_key: null,
      idempotency_fingerprint: null,
      amount_cents: 12345,
      refunded_cents: 123,
      status: "succeeded",
      currency: "HKD",
    });
    expect(p).toMatchObject({
      idempotency_key: null,
      checkout_url: null,
      checkout_attempted_at: null,
      amount_cents: 12345,
      refunded_cents: 123,
      status: "succeeded",
      provider_ref: "r01-synthetic-committed",
    });
  });

  test("NULL, malformed, uppercase and unkeyed fingerprints cannot create an intent", async () => {
    for (const [key, fp] of [
      [crypto.randomUUID(), null],
      [crypto.randomUUID(), "bad"],
      [crypto.randomUUID(), "A".repeat(64)],
      [null, fingerprint],
    ] as const) {
      await sqlState(
        db.begin(async (tx) => {
          await tx`set local role service_role`;
          await tx`insert into public.donation(supporter_id,amount_cents,currency,purpose,type,status,method,idempotency_key,idempotency_fingerprint)
        values(${supporter}::uuid,10000,'HKD','general','one_time','pending','stripe',${key}::uuid,${fp})`;
        }),
        "23514",
      );
    }
  });

  test("service role concurrent duplicate retries commit one intent and one payment", async () => {
    const key = crypto.randomUUID();
    const insert = () =>
      db.begin(async (tx) => {
        await tx`set local role service_role`;
        return tx`insert into public.donation(supporter_id,amount_cents,currency,purpose,type,status,method,idempotency_key,idempotency_fingerprint)
      values(${supporter}::uuid,10000,'HKD','general','one_time','pending','stripe',${key}::uuid,${fingerprint}) returning id`;
      });
    const attempts = await Promise.allSettled([insert(), insert()]);
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((x) => x.status === "rejected");
    expect(
      rejected?.status === "rejected" ? (rejected.reason as { errno: string }).errno : null,
    ).toBe("23505");
    const [d] =
      await db`select id,idempotency_fingerprint,amount_cents from public.donation where idempotency_key=${key}::uuid`;
    expect(d.idempotency_fingerprint).toBe(fingerprint);
    expect(d.amount_cents).toBe(10000);
    const pay = () =>
      db.begin(async (tx) => {
        await tx`set local role service_role`;
        return tx`insert into public.payment(donation_id,provider,amount_cents,status,idempotency_key)
      values(${d.id}::uuid,'stripe',10000,'pending',${key}::uuid) returning id`;
      });
    const payments = await Promise.allSettled([pay(), pay()]);
    expect(payments.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const duplicate = payments.find((x) => x.status === "rejected");
    expect(
      duplicate?.status === "rejected" ? (duplicate.reason as { errno: string }).errno : null,
    ).toBe("23505");
    const [p] = await db`select id from public.payment where idempotency_key=${key}::uuid`;
    const claim = () =>
      db.begin(async (tx) => {
        await tx`set local role service_role`;
        return tx`update public.payment set checkout_attempted_at='2026-10-01T00:00:00Z' where id=${p.id}::uuid and checkout_attempted_at is null returning id`;
      });
    const claims = await Promise.all([claim(), claim()]);
    expect(claims.map((x) => x.length).sort()).toEqual([0, 1]);
    await db.begin(async (tx) => {
      await tx`set local role service_role`;
      await tx`update public.payment set checkout_url='https://sandbox.example.invalid/r01' where id=${p.id}::uuid`;
    });
    const [retry] =
      await db`select checkout_url,checkout_attempted_at from public.payment where idempotency_key=${key}::uuid`;
    expect(retry.checkout_url).toBe("https://sandbox.example.invalid/r01");
    expect(new Date(retry.checkout_attempted_at).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    // A different request fingerprint cannot win the same key.
    await sqlState(
      db`insert into public.donation(supporter_id,amount_cents,currency,purpose,type,status,method,idempotency_key,idempotency_fingerprint)
      values(${supporter}::uuid,20000,'HKD','general','one_time','pending','stripe',${key}::uuid,${"b".repeat(64)})`,
      "23505",
    );
  });

  test("failed payment insert rolls back its donation and allows a clean retry", async () => {
    const key = crypto.randomUUID();
    await sqlState(
      db.begin(async (tx) => {
        await tx`set local role service_role`;
        const [d] =
          await tx`insert into public.donation(supporter_id,amount_cents,currency,purpose,type,status,method,idempotency_key,idempotency_fingerprint)
        values(${supporter}::uuid,10000,'HKD','general','one_time','pending','stripe',${key}::uuid,${fingerprint}) returning id`;
        await tx`insert into public.payment(donation_id,provider,amount_cents,status,idempotency_key) values(${d.id}::uuid,'stripe',-1,'pending',${key}::uuid)`;
      }),
      "23514",
    );
    const [absent] =
      await db`select count(*)::int count from public.donation where idempotency_key=${key}::uuid`;
    expect(absent.count).toBe(0);
    await db.begin(async (tx) => {
      await tx`set local role service_role`;
      await tx`insert into public.donation(supporter_id,amount_cents,currency,purpose,type,status,method,idempotency_key,idempotency_fingerprint)
      values(${supporter}::uuid,10000,'HKD','general','one_time','pending','stripe',${key}::uuid,${fingerprint})`;
    });
  });

  test("JWT finance actors cannot directly rewrite server-controlled intent fields", async () => {
    const [d] =
      await db`insert into public.donation(supporter_id,amount_cents,currency,purpose,type,status,method) values(${supporter}::uuid,10000,'HKD','general','one_time','pending','stripe') returning id`;
    const [p] =
      await db`insert into public.payment(donation_id,provider,amount_cents,status) values(${d.id}::uuid,'stripe',10000,'pending') returning id`;
    for (const [role, status] of [
      ["treasurer", "active"],
      ["admin", "active"],
      ["staff", "active"],
      ["treasurer", "pending"],
      ["admin", "disabled"],
    ] as const) {
      const actor = crypto.randomUUID(),
        email = actor + "@example.invalid";
      await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values(${actor}::uuid,${email},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${email},${role},${status})`;
      const actorWrite = (statement: string) =>
        db.begin(async (tx) => {
          await tx`set local role authenticated`;
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: "authenticated" })},true)`;
          return tx.unsafe(statement);
        });
      await sqlState(
        actorWrite(
          `update public.payment set checkout_url='https://sandbox.example.invalid/direct' where id='${p.id}'::uuid returning id`,
        ),
        "42501",
      );
      await sqlState(
        actorWrite(
          `update public.payment set checkout_attempted_at=now(),idempotency_key='${crypto.randomUUID()}'::uuid where id='${p.id}'::uuid returning id`,
        ),
        "42501",
      );
      await sqlState(
        actorWrite(
          `update public.donation set idempotency_key='${crypto.randomUUID()}'::uuid,idempotency_fingerprint='${fingerprint}' where id='${d.id}'::uuid returning id`,
        ),
        "42501",
      );
      const oldWrite = () =>
        actorWrite(
          `update public.payment set provider_ref='r01-authorized-old-column' where id='${p.id}'::uuid returning id`,
        );
      expect(await oldWrite()).toHaveLength(status === "active" && role !== "staff" ? 1 : 0);
      if (status === "active" && role !== "staff") {
        const [audit] =
          await db`select count(*)::int count from public.audit_log where actor_user_id=${actor}::uuid and entity='payment' and entity_id=${p.id}::text and action='payment.update'`;
        expect(audit.count).toBe(1);
        await sqlState(
          db.begin(async (tx) => {
            await tx`alter table public.audit_log add constraint r01_test_audit_failure check(false) not valid`;
            await tx`set local role authenticated`;
            await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: "authenticated" })},true)`;
            await tx`update public.payment set provider_ref='r01-must-rollback' where id=${p.id}::uuid`;
          }),
          "23514",
        );
        const [unchanged] =
          await db`select provider_ref from public.payment where id=${p.id}::uuid`;
        expect(unchanged.provider_ref).toBe("r01-authorized-old-column");
      }
    }
  });

  test("public roles cannot insert intent columns and checkout remains disabled/version one", async () => {
    for (const role of ["anon", "authenticated"]) {
      await sqlState(
        db.begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          await tx`insert into public.donation(supporter_id,amount_cents,currency,purpose,type,status,method,idempotency_key,idempotency_fingerprint)
        values(${supporter}::uuid,10000,'HKD','general','one_time','pending','stripe',${crypto.randomUUID()}::uuid,${fingerprint})`;
        }),
        "42501",
      );
      const before = await db`select id,checkout_url from public.payment order by id`;
      try {
        const changed = await db.begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          return tx`update public.payment set checkout_url='https://sandbox.example.invalid/unauthorized' returning id`;
        });
        // A granted UPDATE with no visible RLS rows legitimately returns zero.
        expect(changed).toHaveLength(0);
      } catch (error) {
        expect((error as { errno?: string }).errno).toBe("42501");
      }
      expect(await db`select id,checkout_url from public.payment order by id`).toEqual(before);
    }
    const policies = await db`select enabled,version from public.checkout_policy`;
    expect(
      policies.map((p: { enabled: boolean; version: number }) => [p.enabled, p.version]),
    ).toEqual([[false, 1]]);
  });
});
