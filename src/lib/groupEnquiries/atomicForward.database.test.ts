import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertSafeFixtureTables } from "../../../supabase/rls-tests/helpers/productionSchemaClone";
import { assertGroupFixtureUrl } from "./atomicForwardFixtureGuard";

const url = process.env.R01_GROUP_ENQUIRY_TEST_DATABASE_URL;
const enabled = !!url && process.env.R01_GROUP_ENQUIRY_ALLOW_LOCAL_FIXTURES === "1";
if (enabled) assertGroupFixtureUrl(url!, process.env);
const db = enabled ? new SQL(url!, { max: 5 }) : null;
const rollback = new Error("Task12 synthetic fixture rollback");
beforeAll(async () => {
  if (db)
    await assertSafeFixtureTables(db, ["auth.users", "admin_user", "group_enquiries", "audit_log"]);
});
afterAll(async () => {
  if (db) await db.close({ timeout: 2 });
});

async function transaction(fn: (tx: SQL) => Promise<void>) {
  try {
    await db!.begin(async (tx) => {
      await tx`set local role postgres`;
      await fn(tx as SQL);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}
async function seed(tx: SQL, state = "confirmed", role = "staff") {
  const actor = randomUUID(),
    enquiry = randomUUID();
  await tx`insert into auth.users(id,email,email_confirmed_at,banned_until) values(${actor}::uuid,${actor + "@example.invalid"},${state === "unconfirmed" ? null : new Date()},${state === "banned" ? new Date(Date.now() + 86400000) : null})`;
  await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},${role},'active')`;
  await tx`insert into public.group_enquiries(id,organisation,contact_name,contact_email,contact_phone,activity_type,participant_count,idempotency_key,updated_at) values(${enquiry}::uuid,'Task12 synthetic organisation','Synthetic contact','group@example.invalid','00000000','shelter_visit',15,${randomUUID()},'2020-01-01')`;
  const version = (
    await tx`select updated_at::text version from public.group_enquiries where id=${enquiry}::uuid`
  )[0].version as string;
  return { actor, enquiry, version };
}
async function call(
  tx: SQL,
  f: { actor: string; enquiry: string; version: string },
  patch: unknown = { status: "in_progress" },
) {
  await tx`set local role service_role`;
  return (
    await tx`select public.update_group_enquiry_with_audit(${f.enquiry}::uuid,${f.actor}::uuid,${f.version}::timestamptz,${patch as Record<string, unknown>}::jsonb) result`
  )[0].result as Record<string, unknown>;
}
async function reject(tx: SQL, run: () => Promise<unknown>, code: string) {
  await tx.unsafe("savepoint task12_reject");
  let error: unknown;
  try {
    await run();
  } catch (e) {
    error = e;
  }
  await tx.unsafe("rollback to savepoint task12_reject");
  expect((error as { errno?: string } | undefined)?.errno).toBe(code);
}
describe.skipIf(!db)("Task12 group enquiry atomic command", () => {
  test("resolves current API signature before input rejection", async () => {
    await transaction(async (tx) => {
      await tx`set local role service_role`;
      await tx.unsafe("savepoint task12_missing");
      let error: unknown;
      try {
        await tx`select public.update_group_enquiry_with_audit(null::uuid,null::uuid,null::timestamptz,'{}'::jsonb)`;
      } catch (e) {
        error = e;
      }
      await tx.unsafe("rollback to savepoint task12_missing");
      expect((error as { errno?: string } | undefined)?.errno).not.toBe("42883");
      expect(error).toBeDefined();
    });
  });
  for (const state of ["banned", "unconfirmed"])
    test(`${state} group actor cannot update an enquiry`, async () => {
      await transaction(async (tx) => {
        const f = await seed(tx, state);
        await reject(
          tx,
          async () => {
            const result = await call(tx, f);
            await tx`set local role postgres`;
            const rows =
              await tx`select status,(select count(*)::text from public.audit_log where entity_id=${f.enquiry}) audits from public.group_enquiries where id=${f.enquiry}::uuid`;
            console.log(
              JSON.stringify({ actorState: state, resultKind: result.kind, observation: rows }),
            );
          },
          "42501",
        );
        await tx`set local role postgres`;
        expect(
          (await tx`select status from public.group_enquiries where id=${f.enquiry}::uuid`)[0]
            .status,
        ).toBe("new");
        expect(
          (await tx`select count(*)::int n from public.audit_log where entity_id=${f.enquiry}`)[0]
            .n,
        ).toBe(0);
      });
    });
});

describe.skipIf(!db)("Task12 group transaction contract", () => {
  for (const role of ["staff", "admin"])
    test(`${role} updates allowed fields and writes one privacy-safe audit`, async () => {
      await transaction(async (tx) => {
        const f = await seed(tx, "confirmed", role);
        const assignee = (
          await tx`select id from public.admin_user where auth_user_id=${f.actor}::uuid`
        )[0].id;
        const before = (
          await tx`select to_jsonb(g) value from public.group_enquiries g where id=${f.enquiry}::uuid`
        )[0].value;
        const result = await call(tx, f, {
          status: "resolved",
          assignedTo: assignee,
          adminNotes: "Synthetic private notes",
        });
        expect(result.kind).toBe("updated");
        expect(result.enquiry).toMatchObject({
          id: f.enquiry,
          status: "resolved",
          assigned_to: assignee,
          admin_notes: "Synthetic private notes",
        });
        await tx`set local role postgres`;
        const after = (
          await tx`select to_jsonb(g) value from public.group_enquiries g where id=${f.enquiry}::uuid`
        )[0].value;
        for (const key of Object.keys(before))
          if (!["status", "assigned_to", "admin_notes", "updated_at"].includes(key))
            expect(after[key]).toEqual(before[key]);
        const audits =
          await tx`select actor_user_id,action,entity,entity_id,detail from public.audit_log where entity_id=${f.enquiry}`;
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
          actor_user_id: f.actor,
          action: "group_enquiries.update",
          entity: "group_enquiries",
          entity_id: f.enquiry,
          detail: { fields: ["adminNotes", "assignedTo", "status"], status: "resolved" },
        });
      });
    });
  for (const state of ["disabled", "role_changed", "identity_mismatch", "missing_auth"])
    test(`${state} actor is denied without mutation or audit`, async () => {
      await transaction(async (tx) => {
        const f = await seed(tx);
        if (state === "disabled")
          await tx`update public.admin_user set status='disabled' where auth_user_id=${f.actor}::uuid`;
        if (state === "role_changed")
          await tx`update public.admin_user set role='treasurer' where auth_user_id=${f.actor}::uuid`;
        if (state === "identity_mismatch") f.actor = randomUUID();
        if (state === "missing_auth") {
          await tx`delete from public.admin_user where auth_user_id=${f.actor}::uuid`;
          await tx`delete from auth.users where id=${f.actor}::uuid`;
        }
        await reject(tx, () => call(tx, f), "42501");
        await tx`set local role postgres`;
        expect(
          (await tx`select status from public.group_enquiries where id=${f.enquiry}::uuid`)[0]
            .status,
        ).toBe("new");
        expect(
          (await tx`select count(*)::int n from public.audit_log where entity_id=${f.enquiry}`)[0]
            .n,
        ).toBe(0);
      });
    });
  for (const role of ["anon", "authenticated"])
    test(`${role} cannot invoke command, read or write group table even with forged actor claims`, async () => {
      await transaction(async (tx) => {
        const f = await seed(tx);
        await tx.unsafe("set local request.jwt.claim.sub='" + f.actor + "';set local role " + role);
        await reject(
          tx,
          () =>
            tx`select public.update_group_enquiry_with_audit(${f.enquiry}::uuid,${f.actor}::uuid,${f.version}::timestamptz,'{"status":"resolved"}'::jsonb)`,
          "42501",
        );
        await reject(tx, () => tx`select * from public.group_enquiries`, "42501");
        await reject(
          tx,
          () => tx`update public.group_enquiries set status='resolved' where id=${f.enquiry}::uuid`,
          "42501",
        );
      });
    });
  for (const patch of [
    {},
    { notificationStatus: "sent" },
    { status: "closed", contactEmail: "changed@example.invalid" },
    [],
    "bad",
  ])
    test(`malformed or unowned patch ${JSON.stringify(patch)} is rejected`, async () => {
      await transaction(async (tx) => {
        const f = await seed(tx);
        await reject(tx, () => call(tx, f, patch), "22023");
        await tx`set local role postgres`;
        expect(
          (await tx`select status from public.group_enquiries where id=${f.enquiry}::uuid`)[0]
            .status,
        ).toBe("new");
        expect(
          (await tx`select count(*)::int n from public.audit_log where entity_id=${f.enquiry}`)[0]
            .n,
        ).toBe(0);
      });
    });
  for (const patch of [
    { status: "invalid" },
    { assignedTo: randomUUID() },
    { assignedTo: "not-a-uuid" },
  ])
    test(`constraint failure ${Object.keys(patch)} rolls back all changes and audit`, async () => {
      await transaction(async (tx) => {
        const f = await seed(tx);
        await reject(
          tx,
          () => call(tx, f, { ...patch, adminNotes: "Must roll back" }),
          "assignedTo" in patch ? (patch.assignedTo === "not-a-uuid" ? "22P02" : "23503") : "23514",
        );
        await tx`set local role postgres`;
        expect(
          (
            await tx`select status,admin_notes from public.group_enquiries where id=${f.enquiry}::uuid`
          )[0],
        ).toMatchObject({ status: "new", admin_notes: null });
        expect(
          (await tx`select count(*)::int n from public.audit_log where entity_id=${f.enquiry}`)[0]
            .n,
        ).toBe(0);
      });
    });
  test("missing enquiry and stale version return exact result without an audit", async () => {
    await transaction(async (tx) => {
      const f = await seed(tx);
      expect(await call(tx, { ...f, enquiry: randomUUID() })).toEqual({ kind: "not_found" });
      expect(await call(tx, { ...f, version: "2000-01-01T00:00:00Z" })).toEqual({
        kind: "conflict",
      });
      await tx`set local role postgres`;
      expect(
        (await tx`select count(*)::int n from public.audit_log where entity_id=${f.enquiry}`)[0].n,
      ).toBe(0);
    });
  });
  test("null actor, enquiry, version and patch preserve the existing input contract", async () => {
    await transaction(async (tx) => {
      const f = await seed(tx);
      await tx`set local role service_role`;
      await reject(
        tx,
        () =>
          tx`select public.update_group_enquiry_with_audit(${f.enquiry}::uuid,null::uuid,${f.version}::timestamptz,'{"status":"closed"}'::jsonb)`,
        "42501",
      );
      expect(
        (
          await tx`select public.update_group_enquiry_with_audit(null::uuid,${f.actor}::uuid,${f.version}::timestamptz,'{"status":"closed"}'::jsonb) result`
        )[0].result,
      ).toEqual({ kind: "not_found" });
      expect(
        (
          await tx`select public.update_group_enquiry_with_audit(${f.enquiry}::uuid,${f.actor}::uuid,null::timestamptz,'{"status":"closed"}'::jsonb) result`
        )[0].result,
      ).toEqual({ kind: "conflict" });
      await reject(tx, () => call(tx, f, null), "22023");
      await tx`set local role postgres`;
      expect(
        (
          await tx`select status,(select count(*)::int from public.audit_log where entity_id=${f.enquiry}) audits from public.group_enquiries where id=${f.enquiry}::uuid`
        )[0],
      ).toMatchObject({ status: "new", audits: 0 });
    });
  });
  test("explicit null clears only assignedTo and adminNotes with bounded audit fields", async () => {
    await transaction(async (tx) => {
      const f = await seed(tx),
        assignee = (
          await tx`select id from public.admin_user where auth_user_id=${f.actor}::uuid`
        )[0].id;
      const first = await call(tx, f, {
        assignedTo: assignee,
        adminNotes: "Synthetic private note",
      });
      const enquiry = first.enquiry as { updated_at: string };
      const next = await call(
        tx,
        { ...f, version: enquiry.updated_at },
        { assignedTo: null, adminNotes: null },
      );
      expect(next.enquiry).toMatchObject({ assigned_to: null, admin_notes: null, status: "new" });
      await tx`set local role postgres`;
      const audits = await tx`select detail from public.audit_log where entity_id=${f.enquiry}`;
      expect(audits).toHaveLength(2);
      for (const audit of audits)
        expect(audit.detail).toEqual({ fields: ["adminNotes", "assignedTo"], status: null });
    });
  });
  test("audit failure rolls back updated enquiry and retry remains possible", async () => {
    await transaction(async (tx) => {
      const f = await seed(tx);
      await tx.unsafe(
        "alter table public.audit_log add constraint task12_test_audit_rejection check(action<>'group_enquiries.update')",
      );
      await reject(
        tx,
        () => call(tx, f, { status: "closed", adminNotes: "Must roll back" }),
        "23514",
      );
      await tx`set local role postgres`;
      expect(
        (
          await tx`select status,admin_notes from public.group_enquiries where id=${f.enquiry}::uuid`
        )[0],
      ).toMatchObject({ status: "new", admin_notes: null });
      await tx.unsafe("alter table public.audit_log drop constraint task12_test_audit_rejection");
      expect((await call(tx, f)).kind).toBe("updated");
    });
  });
  test("temporary table shadowing cannot redirect target or audit writes", async () => {
    await transaction(async (tx) => {
      const f = await seed(tx);
      await tx.unsafe(
        "create temporary table group_enquiries(id uuid,status text);create temporary table audit_log(actor_user_id uuid,action text)",
      );
      expect((await call(tx, f)).kind).toBe("updated");
      await tx`set local role postgres`;
      expect((await tx`select count(*)::int n from pg_temp.group_enquiries`)[0].n).toBe(0);
      expect((await tx`select count(*)::int n from pg_temp.audit_log`)[0].n).toBe(0);
      expect(
        (await tx`select count(*)::int n from public.audit_log where entity_id=${f.enquiry}`)[0].n,
      ).toBe(1);
    });
  });
  test("expired Auth ban permits the same confirmed staff contract", async () => {
    await transaction(async (tx) => {
      const f = await seed(tx);
      await tx`update auth.users set banned_until=clock_timestamp()-interval '1 hour' where id=${f.actor}::uuid`;
      expect((await call(tx, f)).kind).toBe("updated");
    });
  });
});

function latch() {
  let release = () => {};
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { release, promise };
}
async function committedFixture(fn: (f: Awaited<ReturnType<typeof seed>>) => Promise<void>) {
  const f = await db!.begin(async (tx) => {
    await tx`set local role postgres`;
    return seed(tx as SQL);
  });
  try {
    await fn(f);
  } finally {
    await db!.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`delete from public.audit_log where entity_id=${f.enquiry}`;
      await tx`delete from public.group_enquiries where id=${f.enquiry}::uuid`;
      await tx`delete from public.admin_user where auth_user_id=${f.actor}::uuid`;
      await tx`delete from auth.users where id=${f.actor}::uuid`;
    });
  }
}
async function blocked(pid: number) {
  for (let i = 0; i < 100; i++) {
    if ((await db!`select cardinality(pg_blocking_pids(${pid}::int))>0 held`)[0].held) return;
    await Bun.sleep(20);
  }
  throw Error("Expected actual PostgreSQL row blocking absent");
}
describe.skipIf(!db)("Task12 group concurrent transaction fencing", () => {
  for (const kind of ["disable", "role", "ban", "unconfirm"] as const)
    for (const order of ["mutation-first", "command-first"] as const)
      test(`${kind} ${order} observes real actor row blocking and rechecked commit order`, async () => {
        await committedFixture(async (f) => {
          const ready = latch(),
            release = latch(),
            waiting = latch();
          const change = async (tx: SQL) => {
            await tx`set local role postgres`;
            if (kind === "disable")
              await tx`update public.admin_user set status='disabled' where auth_user_id=${f.actor}::uuid`;
            if (kind === "role")
              await tx`update public.admin_user set role='treasurer' where auth_user_id=${f.actor}::uuid`;
            if (kind === "ban")
              await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${f.actor}::uuid`;
            if (kind === "unconfirm")
              await tx`update auth.users set email_confirmed_at=null where id=${f.actor}::uuid`;
          };
          const first = db!.begin(async (sql) => {
            const tx = sql as SQL;
            await tx.unsafe("set local statement_timeout='8s'");
            if (order === "command-first") expect((await call(tx, f)).kind).toBe("updated");
            else await change(tx);
            ready.release();
            await release.promise;
          });
          let second: Promise<unknown> | undefined;
          try {
            await ready.promise;
            let pid = 0;
            second = db!
              .begin(async (sql) => {
                const tx = sql as SQL;
                await tx.unsafe("set local statement_timeout='8s'");
                pid = (await tx`select pg_backend_pid() pid`)[0].pid;
                waiting.release();
                if (order === "mutation-first") await call(tx, f);
                else await change(tx);
              })
              .then(
                () => undefined,
                (e) => (e as { errno?: string }).errno,
              );
            await waiting.promise;
            await blocked(pid);
            release.release();
            await first;
            expect(await second).toBe(order === "mutation-first" ? "42501" : undefined);
            const rows =
              await db!`select status,(select count(*)::int from public.audit_log where entity_id=${f.enquiry}) audits from public.group_enquiries where id=${f.enquiry}::uuid`;
            expect(rows[0]).toMatchObject({
              status: order === "command-first" ? "in_progress" : "new",
              audits: order === "command-first" ? 1 : 0,
            });
          } finally {
            release.release();
            await Promise.allSettled([first, ...(second ? [second] : [])]);
          }
        });
      });
  test("concurrent and sequential same-version retries retain one mutation/audit and exact conflict", async () => {
    await committedFixture(async (f) => {
      const ready = latch(),
        release = latch(),
        waiting = latch();
      let pid = 0;
      const first = db!.begin(async (sql) => {
        const tx = sql as SQL;
        const result = await call(tx, f);
        ready.release();
        await release.promise;
        return result;
      });
      let second: Promise<Record<string, unknown>> | undefined;
      try {
        await ready.promise;
        second = db!.begin(async (sql) => {
          const tx = sql as SQL;
          await tx.unsafe("set local statement_timeout='8s'");
          pid = (await tx`select pg_backend_pid() pid`)[0].pid;
          waiting.release();
          return call(tx, f, { status: "closed" });
        });
        await waiting.promise;
        await blocked(pid);
        release.release();
        expect((await first).kind).toBe("updated");
        expect(await second).toEqual({ kind: "conflict" });
        const retry = await db!.begin(async (sql) => call(sql as SQL, f));
        expect(retry).toEqual({ kind: "conflict" });
        expect(
          (
            await db!`select status,(select count(*)::int from public.audit_log where entity_id=${f.enquiry}) audits from public.group_enquiries where id=${f.enquiry}::uuid`
          )[0],
        ).toMatchObject({ status: "in_progress", audits: 1 });
      } finally {
        release.release();
        await Promise.allSettled([first, ...(second ? [second] : [])]);
      }
    });
  });
});
