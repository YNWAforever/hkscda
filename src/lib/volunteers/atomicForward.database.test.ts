import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertSafeFixtureTables } from "../../../supabase/rls-tests/helpers/productionSchemaClone";
import { fixtureScope } from "../../../docs/evidence/audit-remediation-20260927/r01-forward/task-8-profile";
import { volunteerFixtureUrl } from "./atomicForwardFixtureGuard";

const raw = volunteerFixtureUrl(process.env);
const db = raw ? new SQL(raw, { max: 4 }) : null;
beforeAll(async () => {
  if (!db || raw !== "postgresql://postgres:postgres@127.0.0.1:55322/postgres") return;
  // Fresh native CI runs first. Scan the real catalog before reading rows/DML;
  // refuse populated fixtures without resetting or removing any existing rows.
  await assertSafeFixtureTables(db, fixtureScope);
  for (const table of fixtureScope) {
    const qualified = table.includes(".") ? table : "public." + table;
    const [row] = await db.unsafe(`select exists(select 1 from ${qualified}) populated`);
    if (row.populated) throw new Error("Task8 native CI requires empty fixture scope");
  }
});
const rollback = new Error("Task8 synthetic fixture rollback");
type Fixture = { actor: string; activity: string; supporter: string; token: string };

async function fixture(run: (tx: SQL, ids: Fixture) => Promise<void>) {
  if (!db) throw new Error("Owned Task8 clone required");
  try {
    await db.begin(async (tx) => {
      const ids = {
        actor: randomUUID(),
        activity: randomUUID(),
        supporter: randomUUID(),
        token: randomUUID().replaceAll("-", "").repeat(2),
      };
      await tx`set local role postgres`;
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${ids.actor}::uuid,${ids.actor + "@example.invalid"},now())`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${ids.actor}::uuid,${ids.actor + "@example.invalid"},'staff','active')`;
      await tx`insert into public.supporter(id,name,email,source) values(${ids.supporter}::uuid,'Synthetic volunteer',${ids.supporter + "@example.invalid"},'volunteer_registration_form')`;
      await tx`insert into public.volunteer_activity(id,type,title,description,starts_at,ends_at,location,capacity,status,auto_approve) values(${ids.activity}::uuid,'cleaning_day','Synthetic Task8 activity','Synthetic description','2000-01-01T02:00:00Z','2000-01-01T05:00:00Z','Owned clone',1,'published',true)`;
      await run(tx, ids);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}

async function role<T>(tx: SQL, run: (tx: SQL) => Promise<T>, name = "service_role") {
  if (!["service_role", "anon", "authenticated"].includes(name))
    throw new Error("Test role refused");
  const sp = "volunteer_sp_" + randomUUID().replaceAll("-", "");
  await tx.unsafe(`savepoint ${sp}`);
  try {
    await tx.unsafe(`set local role ${name}`);
    const result = await run(tx);
    await tx`set local role postgres`;
    await tx.unsafe(`release savepoint ${sp}`);
    return result;
  } catch (e) {
    await tx.unsafe(`rollback to savepoint ${sp}`);
    await tx.unsafe(`release savepoint ${sp}`);
    throw e;
  }
}
async function errno(run: () => Promise<unknown>) {
  try {
    await run();
    return "success";
  } catch (e) {
    return (e as { errno?: string }).errno ?? "unexpected";
  }
}
type RegistrationResult = {
  created: boolean;
  registration: { id: string; status: string; status_reason: string; participant_count: number };
};
async function register(
  tx: SQL,
  ids: Fixture,
  options: {
    token?: string;
    name?: string;
    supporter?: string | null;
    role?: string;
    consent?: boolean;
  } = {},
) {
  return role(
    tx,
    async (s) => {
      const [row] = await s`select public.create_volunteer_registration_idempotent(
        ${ids.activity}::uuid,${options.supporter === undefined ? ids.supporter : options.supporter}::uuid,
        'individual',1,${options.name ?? "Synthetic volunteer"},${ids.supporter + "@example.invalid"},
        '91234567','zh-HK',null::text,21,null::integer,null::text,null::text,null::text,
        ${options.token ?? ids.token},'2099-02-01T00:00:00Z'::timestamptz,${options.consent ?? false},${options.consent ?? false}) value`;
      return row.value as RegistrationResult;
    },
    options.role,
  );
}
async function clone(
  tx: SQL,
  ids: Fixture,
  actor = ids.actor,
  starts: string | null = null,
  name?: string,
) {
  return role(
    tx,
    async (s) => {
      const [row] =
        await s`select public.clone_volunteer_activity_with_audit(${ids.activity}::uuid,${actor}::uuid,${starts}::timestamptz) id`;
      return row.id as string;
    },
    name,
  );
}
async function state(tx: SQL) {
  const [row] = await tx`select jsonb_build_object(
    'activity',(select jsonb_agg(to_jsonb(t) order by id) from public.volunteer_activity t),
    'registration',(select jsonb_agg(to_jsonb(t) order by id) from public.volunteer_registration t),
    'audit',(select jsonb_agg(to_jsonb(t) order by id) from public.audit_log t),
    'consent',(select jsonb_agg(to_jsonb(t) order by id) from public.supporter_consent_intent t)) value`;
  return row.value;
}

/** Committed synthetic rows exist only in the owned DB and are removed normally. */
async function concurrentFixture(run: (ids: Fixture) => Promise<void>) {
  if (!db) throw Error("Owned Task8 clone required");
  const ids = {
    actor: randomUUID(),
    activity: randomUUID(),
    supporter: randomUUID(),
    token: randomUUID().replaceAll("-", "").repeat(2),
  };
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${ids.actor}::uuid,${ids.actor + "@example.invalid"},now())`;
    await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${ids.actor}::uuid,${ids.actor + "@example.invalid"},'staff','active')`;
    await tx`insert into public.supporter(id,name,email,source) values(${ids.supporter}::uuid,'Synthetic volunteer',${ids.supporter + "@example.invalid"},'volunteer_registration_form')`;
    await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status,auto_approve) values(${ids.activity}::uuid,'cleaning_day','Synthetic concurrency','2000-01-01T02:00:00Z','2000-01-01T05:00:00Z','Owned clone',1,'published',true)`;
  });
  try {
    await run(ids);
  } finally {
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`delete from public.audit_log where actor_user_id=${ids.actor}::uuid`;
      await tx`delete from public.volunteer_registration where activity_id=${ids.activity}::uuid`;
      await tx`delete from public.volunteer_activity where id=${ids.activity}::uuid`;
      await tx`delete from public.supporter where id=${ids.supporter}::uuid`;
      await tx`delete from public.admin_user where auth_user_id=${ids.actor}::uuid`;
      await tx`delete from auth.users where id=${ids.actor}::uuid`;
    });
  }
}

async function waitForLock(pid: number) {
  if (!db) throw Error("Owned clone required");
  for (let i = 0; i < 100; i++) {
    const [row] = await db`select wait_event_type from pg_stat_activity where pid=${pid}`;
    if (row?.wait_event_type === "Lock") return;
    await Bun.sleep(10);
  }
  throw Error("Second transaction did not reach an actual lock wait");
}

describe.skipIf(!db)("R01 Task8 volunteer forward", () => {
  afterAll(async () => {
    await db?.close();
  });

  test("missing-target registration preserves actorless historical bookkeeping contract", async () => {
    await fixture(async (tx, ids) => {
      const result = await register(tx, ids);
      expect(result.created).toBe(true);
      expect(result.registration.status).toBe("pending");
      expect(result.registration.status_reason).toBe("activity_not_available");
    });
  });
  test("missing-target clone creates a draft and one matching audit fact", async () => {
    await fixture(async (tx, ids) => {
      const id = await clone(tx, ids, ids.actor, "2099-01-02T04:00:00Z");
      const [row] =
        await tx`select title,status,starts_at::text start,ends_at::text finish from public.volunteer_activity where id=${id}::uuid`;
      expect(row.title).toBe("Synthetic Task8 activity copy");
      expect(row.status).toBe("draft");
      expect(new Date(row.start).toISOString()).toBe("2099-01-02T04:00:00.000Z");
      expect(new Date(row.finish).toISOString()).toBe("2099-01-02T07:00:00.000Z");
      const [audit] =
        await tx`select actor_user_id,detail from public.audit_log where entity_id=${id} and action='volunteer_activity.clone'`;
      expect(audit.actor_user_id).toBe(ids.actor);
      expect(audit.detail).toEqual({ sourceActivityId: ids.activity });
    });
  });
  test("registration exact retry preserves one row and capacity", async () => {
    await fixture(async (tx, ids) => {
      const first = await register(tx, ids);
      const before = await state(tx);
      const retry = await register(tx, ids);
      expect(retry.created).toBe(false);
      expect(retry.registration.id).toBe(first.registration.id);
      expect(await state(tx)).toEqual(before);
    });
  });
  test("registration changed token payload and fresh duplicate token roll back", async () => {
    await fixture(async (tx, ids) => {
      await register(tx, ids);
      const before = await state(tx);
      expect(await errno(() => register(tx, ids, { name: "Different contact" }))).toBe("23505");
      expect(await errno(() => register(tx, ids, { token: "c".repeat(64) }))).toBe("23505");
      expect(await state(tx)).toEqual(before);
    });
  });
  test("registration rejects malformed and expired replay tokens", async () => {
    await fixture(async (tx, ids) => {
      expect(await errno(() => register(tx, ids, { token: "BAD" }))).toBe("22023");
      const result = await register(tx, ids);
      await tx`update public.volunteer_registration set status_token_expires_at=now()-interval '1 day' where id=${result.registration.id}::uuid`;
      const before = await state(tx);
      expect(await errno(() => register(tx, ids))).toBe("22023");
      expect(await state(tx)).toEqual(before);
    });
  });
  for (const name of ["anon", "authenticated"]) {
    test(`direct ${name} cannot register or clone`, async () => {
      await fixture(async (tx, ids) => {
        const before = await state(tx);
        expect(await errno(() => register(tx, ids, { role: name }))).toBe("42501");
        expect(await errno(() => clone(tx, ids, ids.actor, null, name))).toBe("42501");
        expect(await state(tx)).toEqual(before);
      });
    });
  }
  test("future legacy registration keeps current-policy fence for capacity and publication decisions", async () => {
    await fixture(async (tx, ids) => {
      await tx`update public.volunteer_activity set starts_at='2099-01-01T02:00:00Z',ends_at='2099-01-01T05:00:00Z' where id=${ids.activity}::uuid`;
      for (const [capacity, status] of [
        [1, "published"],
        [2, "published"],
        [1, "draft"],
      ] as const) {
        await tx`update public.volunteer_activity set capacity=${capacity},status=${status} where id=${ids.activity}::uuid`;
        const before = await state(tx);
        expect(await errno(() => register(tx, ids))).toBe("22023");
        expect(await state(tx)).toEqual(before);
      }
    });
  });
  test("clone missing actor and disabled admin are refused without mutation", async () => {
    await fixture(async (tx, ids) => {
      const before = await state(tx);
      expect(await errno(() => clone(tx, ids, randomUUID()))).toBe("42501");
      await tx`update public.admin_user set status='disabled' where auth_user_id=${ids.actor}::uuid`;
      expect(await errno(() => clone(tx, ids))).toBe("42501");
      expect(await state(tx)).toEqual(before);
    });
  });
  test("clone actor rejects currently banned and unconfirmed Auth identity", async () => {
    await fixture(async (tx, ids) => {
      const before = await state(tx);
      await tx`update auth.users set banned_until='2099-01-01T00:00:00Z' where id=${ids.actor}::uuid`;
      expect(await errno(() => clone(tx, ids))).toBe("42501");
      await tx`update auth.users set banned_until=null,email_confirmed_at=null where id=${ids.actor}::uuid`;
      expect(await errno(() => clone(tx, ids))).toBe("42501");
      expect(await state(tx)).toEqual(before);
    });
  });
  test("clone audit failure rolls back activity insert", async () => {
    await fixture(async (tx, ids) => {
      await tx`create function pg_temp.task8_fail_audit() returns trigger language plpgsql as 'begin raise exception ''injected_task8_audit_failure''; end'`;
      await tx`create trigger task8_fail_audit after insert on public.audit_log for each row when(new.action='volunteer_activity.clone') execute function pg_temp.task8_fail_audit()`;
      const before = await state(tx);
      expect(await errno(() => clone(tx, ids))).toBe("P0001");
      expect(await state(tx)).toEqual(before);
    });
  });

  test("clone refuses a current non-staff role without mutation", async () => {
    await fixture(async (tx, ids) => {
      await tx`update public.admin_user set role='treasurer' where auth_user_id=${ids.actor}::uuid`;
      const before = await state(tx);
      expect(await errno(() => clone(tx, ids))).toBe("42501");
      expect(await state(tx)).toEqual(before);
    });
  });

  test("clone public tables resist temporary shadowing", async () => {
    await fixture(async (tx, ids) => {
      await tx`create temporary table volunteer_activity (like public.volunteer_activity including defaults)`;
      await tx`create temporary table admin_user (like public.admin_user including defaults)`;
      await tx`create temporary table audit_log (like public.audit_log including defaults)`;
      const id = await clone(tx, ids);
      const [row] =
        await tx`select (select count(*)::integer from pg_temp.volunteer_activity) shadows,(select count(*)::integer from public.audit_log where entity_id=${id}) audits`;
      expect(row).toEqual({ shadows: 0, audits: 1 });
    });
  });

  test("concurrent exact registration retries create one historical row", async () => {
    await concurrentFixture(async (ids) => {
      if (!db) throw Error("Owned clone required");
      const results = await Promise.all([
        db.begin((tx) => register(tx as SQL, ids)),
        db.begin((tx) => register(tx as SQL, ids)),
      ]);
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(results[0].registration.id).toBe(results[1].registration.id);
      const [row] =
        await db`select count(*)::integer count from public.volunteer_registration where activity_id=${ids.activity}::uuid`;
      expect(row.count).toBe(1);
    });
  });

  test("concurrent distinct tokens cannot duplicate an active historical registration", async () => {
    await concurrentFixture(async (ids) => {
      if (!db) throw Error("Owned clone required");
      const results = await Promise.all([
        errno(() => db!.begin((tx) => register(tx as SQL, ids))),
        errno(() => db!.begin((tx) => register(tx as SQL, ids, { token: "c".repeat(64) }))),
      ]);
      expect(results.sort()).toEqual(["23505", "success"]);
      const [row] =
        await db`select count(*)::integer count from public.volunteer_registration where activity_id=${ids.activity}::uuid`;
      expect(row.count).toBe(1);
    });
  });

  for (const fence of ["auth ban", "admin downgrade"] as const) {
    test(`clone waits for a concurrent ${fence} and rechecks committed authority`, async () => {
      await concurrentFixture(async (ids) => {
        if (!db) throw Error("Owned clone required");
        let started!: () => void;
        const ready = new Promise<void>((resolve) => {
          started = resolve;
        });
        let worker: Promise<string>;
        let pid = 0;
        await db.begin(async (tx) => {
          await tx`set local role postgres`;
          if (fence === "auth ban")
            await tx`update auth.users set banned_until='2099-01-01T00:00:00Z' where id=${ids.actor}::uuid`;
          else
            await tx`update public.admin_user set role='treasurer' where auth_user_id=${ids.actor}::uuid`;
          worker = errno(() =>
            db!.begin(async (other) => {
              const [row] = await other`select pg_backend_pid() pid`;
              pid = row.pid;
              started();
              return clone(other as SQL, ids);
            }),
          );
          await ready;
          await waitForLock(pid);
        });
        expect(await worker!).toBe("42501");
        const [row] =
          await db`select count(*)::integer count from public.audit_log where actor_user_id=${ids.actor}::uuid and action='volunteer_activity.clone'`;
        expect(row.count).toBe(0);
      });
    });
  }

  test("registration consent facts stay idempotent with exact retries", async () => {
    await fixture(async (tx, ids) => {
      const first = await register(tx, ids, { consent: true });
      const before = await state(tx);
      const retry = await register(tx, ids, { consent: true });
      expect(retry.created).toBe(false);
      expect(retry.registration.id).toBe(first.registration.id);
      const [row] =
        await tx`select count(*)::integer count from public.supporter_consent_intent where submission_id=${first.registration.id}::uuid`;
      expect(row.count).toBe(2);
      expect(await state(tx)).toEqual(before);
    });
  });

  test("registration consent failure rolls back registration and consent facts", async () => {
    await fixture(async (tx, ids) => {
      await tx`create function pg_temp.task8_fail_consent() returns trigger language plpgsql as 'begin raise exception ''injected_task8_consent_failure''; end'`;
      await tx`create trigger task8_fail_consent after insert on public.supporter_consent_intent for each row execute function pg_temp.task8_fail_consent()`;
      const before = await state(tx);
      expect(await errno(() => register(tx, ids, { consent: true }))).toBe("P0001");
      expect(await state(tx)).toEqual(before);
    });
  });
});
