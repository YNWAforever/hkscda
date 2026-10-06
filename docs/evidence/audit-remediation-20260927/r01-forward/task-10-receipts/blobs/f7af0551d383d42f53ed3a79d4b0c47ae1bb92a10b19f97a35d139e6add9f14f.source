import { afterAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";
const url = process.env.R01_ADMIN_ATOMIC_TEST_DATABASE_URL;
const enabled = !!url && process.env.R01_ADMIN_ATOMIC_ALLOW_LOCAL_FIXTURES === "1";
if (enabled) assertCloneUrl(url!);
const db = enabled ? new SQL(url!, { max: 5 }) : null;
const rollback = new Error("Task10 fixture rollback");
type Fixture = {
  actor: string;
  targetAuth: string;
  target: string;
  inviteAuth: string;
  newAuth: string;
  pending: string;
};
async function seed(tx: SQL): Promise<Fixture> {
  const actor = randomUUID(),
    targetAuth = randomUUID(),
    inviteAuth = randomUUID(),
    newAuth = randomUUID();
  for (const id of [actor, targetAuth, inviteAuth, newAuth])
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
  const ids: string[] = [];
  for (const [id, role, status] of [
    [actor, "admin", "active"],
    [targetAuth, "staff", "active"],
    [inviteAuth, "staff", "pending"],
  ]) {
    const [r] =
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${id}::uuid,${id + "@example.invalid"},${role},${status}) returning id`;
    ids.push(r.id);
  }
  return { actor, targetAuth, inviteAuth, newAuth, target: ids[1], pending: ids[2] };
}
async function fixture(run: (tx: SQL, f: Fixture) => Promise<void>) {
  if (!db) throw Error("Own clone required");
  try {
    await db.begin(async (sql) => {
      const tx = sql as SQL;
      await tx`set local role postgres`;
      const f = await seed(tx);
      await run(tx, f);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}
type Command = "update" | "invite" | "resend" | "activate";
const commands: Command[] = ["update", "invite", "resend", "activate"];
async function call(tx: SQL, command: Command, f: Fixture) {
  const actor = f.actor;
  if (command === "update") {
    const [r] =
      await tx`select to_jsonb(public.update_admin_user_with_audit(${actor}::uuid,${f.target}::uuid,'treasurer')) value`;
    return r.value;
  }
  if (command === "invite") {
    const [r] =
      await tx`select to_jsonb(public.invite_admin_user_with_audit(${actor}::uuid,${f.newAuth}::uuid,${f.newAuth + "@example.invalid"},'staff',now())) value`;
    return r.value;
  }
  if (command === "resend") {
    const [r] =
      await tx`select to_jsonb(public.resend_admin_invite_with_audit(${actor}::uuid,${f.pending}::uuid,now())) value`;
    return r.value;
  }
  const [r] =
    await tx`select to_jsonb(public.activate_admin_invite_with_audit(${f.inviteAuth}::uuid)) value`;
  return r.value;
}
async function expectError(tx: SQL, run: () => Promise<unknown>, message: string, code = "P0001") {
  const sp = "task10_" + randomUUID().replaceAll("-", "");
  await tx.unsafe("savepoint " + sp);
  let caught: unknown;
  try {
    await run();
  } catch (e) {
    caught = e;
  } finally {
    await tx.unsafe("rollback to savepoint " + sp);
    await tx.unsafe("release savepoint " + sp);
  }
  expect(caught).toMatchObject({ errno: code, message });
}
describe.skipIf(!db)("Task10 actual admin database contracts", () => {
  for (const command of commands)
    test(`${command} valid service command produces one audit`, () =>
      fixture(async (tx, f) => {
        await tx`set local role service_role`;
        const r = await call(tx, command, f);
        expect(r.id).toBeString();
        const [a] =
          await tx`select count(*)::integer count from public.audit_log where actor_user_id in(${f.actor}::uuid,${f.inviteAuth}::uuid)`;
        expect(a.count).toBe(1);
      }));
  for (const command of commands)
    for (const state of ["banned", "unconfirmed"] as const)
      test(`${command} refuses ${state} authenticated actor or legitimate invitee`, () =>
        fixture(async (tx, f) => {
          const id = command === "activate" ? f.inviteAuth : f.actor;
          if (state === "banned")
            await tx`update auth.users set banned_until=now()+interval '1 hour' where id=${id}::uuid`;
          else await tx`update auth.users set email_confirmed_at=null where id=${id}::uuid`;
          await tx`set local role service_role`;
          await expectError(
            tx,
            () => call(tx, command, f),
            command === "activate" ? "admin_user_not_found" : "admin_actor_denied",
          );
          const [a] =
            await tx`select count(*)::integer count from public.audit_log where actor_user_id in(${f.actor}::uuid,${f.inviteAuth}::uuid)`;
          expect(a.count).toBe(0);
        }));
});
describe.skipIf(!db)("Task10 role, retry, audit and validation", () => {
  for (const command of ["update", "invite", "resend"] as const)
    for (const state of ["missing", "disabled", "staff", "treasurer"] as const)
      test(`${command} denies current ${state} admin actor`, () =>
        fixture(async (tx, f) => {
          if (state === "missing") f.actor = randomUUID();
          else if (state === "disabled") {
            // Retain another active admin for the existing modern trigger.
            await tx`update public.admin_user set role='admin' where id=${f.target}::uuid`;
            await tx`update public.admin_user set status='disabled' where auth_user_id=${f.actor}::uuid`;
          } else {
            await tx`update public.admin_user set role='admin' where id=${f.target}::uuid`;
            await tx`update public.admin_user set role=${state} where auth_user_id=${f.actor}::uuid`;
          }
          await tx`set local role service_role`;
          await expectError(tx, () => call(tx, command, f), "admin_actor_denied");
        }));
  for (const command of commands)
    for (const role of ["anon", "authenticated"] as const)
      test(`${role} cannot invoke ${command}`, () =>
        fixture(async (tx, f) => {
          await tx.unsafe("set local role " + role);
          await expectError(
            tx,
            () => call(tx, command, f),
            "permission denied for function " +
              {
                update: "update_admin_user_with_audit",
                invite: "invite_admin_user_with_audit",
                resend: "resend_admin_invite_with_audit",
                activate: "activate_admin_invite_with_audit",
              }[command],
            "42501",
          );
        }));
  test("update intentional defaults retain status and audited old/new role", () =>
    fixture(async (tx, f) => {
      await tx`set local role service_role`;
      const r = await call(tx, "update", f);
      expect(r.role).toBe("treasurer");
      expect(r.status).toBe("active");
      const [a] =
        await tx`select action,entity_id,detail from public.audit_log where actor_user_id=${f.actor}::uuid`;
      expect(a.action).toBe("admin_user.role_update");
      expect(a.entity_id).toBe(f.target);
      expect(a.detail).toMatchObject({
        oldRole: "staff",
        newRole: "treasurer",
        oldStatus: "active",
        newStatus: "active",
      });
    }));
  test("self demotion and disable refuse, pending activation cannot use admin update", () =>
    fixture(async (tx, f) => {
      const [a] = await tx`select id from public.admin_user where auth_user_id=${f.actor}::uuid`;
      await tx`set local role service_role`;
      await expectError(
        tx,
        () =>
          tx`select public.update_admin_user_with_audit(${f.actor}::uuid,${a.id}::uuid,'staff')`,
        "self_demote",
      );
      await expectError(
        tx,
        () =>
          tx`select public.update_admin_user_with_audit(${f.actor}::uuid,${a.id}::uuid,null,'disabled')`,
        "self_disable",
      );
      await expectError(
        tx,
        () =>
          tx`select public.update_admin_user_with_audit(${f.actor}::uuid,${f.pending}::uuid,null,'active')`,
        "invalid_status_transition",
      );
      await expectError(
        tx,
        () =>
          tx`select public.update_admin_user_with_audit(${f.actor}::uuid,${f.target}::uuid,null,'pending')`,
        "invalid_status_transition",
      );
    }));
  test("update rejects malformed/no-op/missing inputs before audit", () =>
    fixture(async (tx, f) => {
      await tx`set local role service_role`;
      await expectError(
        tx,
        () => tx`select public.update_admin_user_with_audit(${f.actor}::uuid,${f.target}::uuid)`,
        "empty_admin_user_update",
      );
      await expectError(
        tx,
        () =>
          tx`select public.update_admin_user_with_audit(${f.actor}::uuid,${f.target}::uuid,'owner')`,
        "invalid_role",
      );
      await expectError(
        tx,
        () =>
          tx`select public.update_admin_user_with_audit(${f.actor}::uuid,${f.target}::uuid,null,'suspended')`,
        "invalid_status",
      );
      await expectError(
        tx,
        () =>
          tx`select public.update_admin_user_with_audit(${f.actor}::uuid,${randomUUID()}::uuid,'staff')`,
        "admin_user_not_found",
      );
    }));
  test("invite keeps case-insensitive duplicate semantics and reuses only disabled row", () =>
    fixture(async (tx, f) => {
      await tx`set local role service_role`;
      const first = await call(tx, "invite", f);
      expect(first.status).toBe("pending");
      await expectError(
        tx,
        () =>
          tx`select public.invite_admin_user_with_audit(${f.actor}::uuid,${f.newAuth}::uuid,${String(first.email).toUpperCase()},'staff',now())`,
        "duplicate_admin_user",
      );
      await tx`set local role postgres`;
      await tx`update public.admin_user set status='disabled' where id=${first.id}::uuid`;
      await tx`set local role service_role`;
      const [r] =
        await tx`select to_jsonb(public.invite_admin_user_with_audit(${f.actor}::uuid,${f.newAuth}::uuid,${first.email},'treasurer',now())) value`;
      expect(r.value.id).toBe(first.id);
      expect(r.value.role).toBe("treasurer");
      expect(r.value.invite_accepted_at).toBeNull();
      const [a] =
        await tx`select count(*)::integer count from public.audit_log where actor_user_id=${f.actor}::uuid`;
      expect(a.count).toBe(2);
    }));
  test("invite malformed email/role/identity/sent time are rejected", () =>
    fixture(async (tx, f) => {
      await tx`set local role service_role`;
      await expectError(
        tx,
        () =>
          tx`select public.invite_admin_user_with_audit(${f.actor}::uuid,${f.newAuth}::uuid,' ','staff',now())`,
        "invalid_email",
      );
      await expectError(
        tx,
        () =>
          tx`select public.invite_admin_user_with_audit(${f.actor}::uuid,${f.newAuth}::uuid,'valid@example.invalid','owner',now())`,
        "invalid_role",
      );
      await expectError(
        tx,
        () =>
          tx`select public.invite_admin_user_with_audit(${f.actor}::uuid,null,'valid@example.invalid','staff',now())`,
        "invalid_invite_input",
      );
      await expectError(
        tx,
        () =>
          tx`select public.invite_admin_user_with_audit(${f.actor}::uuid,${f.newAuth}::uuid,'valid@example.invalid','staff',null)`,
        "invalid_invite_input",
      );
    }));
  test("resend retains invited time/role and refuses active/unknown targets", () =>
    fixture(async (tx, f) => {
      await tx`set local role service_role`;
      const r = await call(tx, "resend", f);
      expect(r.status).toBe("pending");
      expect(r.role).toBe("staff");
      expect(r.last_invited_by).toBe(f.actor);
      await expectError(
        tx,
        () =>
          tx`select public.resend_admin_invite_with_audit(${f.actor}::uuid,${f.target}::uuid,now())`,
        "invite_not_pending",
      );
      await expectError(
        tx,
        () =>
          tx`select public.resend_admin_invite_with_audit(${f.actor}::uuid,${randomUUID()}::uuid,now())`,
        "admin_user_not_found",
      );
      await expectError(
        tx,
        () =>
          tx`select public.resend_admin_invite_with_audit(${f.actor}::uuid,${f.pending}::uuid,null)`,
        "invalid_invite_input",
      );
    }));
  for (const role of ["staff", "treasurer", "admin"] as const)
    test(`legitimate ${role} invitee activation is idempotent with one audit`, () =>
      fixture(async (tx, f) => {
        await tx`update public.admin_user set role=${role} where id=${f.pending}::uuid`;
        await tx`set local role service_role`;
        const a = await call(tx, "activate", f),
          b = await call(tx, "activate", f);
        expect(a.status).toBe("active");
        expect(b.id).toBe(a.id);
        expect(b.invite_accepted_at).toEqual(a.invite_accepted_at);
        expect(b.role).toBe(role);
        const [r] =
          await tx`select count(*)::integer count from public.audit_log where actor_user_id=${f.inviteAuth}::uuid`;
        expect(r.count).toBe(1);
      }));
  test("activation disabled/missing/null identity is refused", () =>
    fixture(async (tx, f) => {
      await tx`update public.admin_user set status='disabled' where id=${f.pending}::uuid`;
      await tx`set local role service_role`;
      await expectError(tx, () => call(tx, "activate", f), "admin_user_not_found");
      await expectError(
        tx,
        () => tx`select public.activate_admin_invite_with_audit(${randomUUID()}::uuid)`,
        "admin_user_not_found",
      );
      await expectError(
        tx,
        () => tx`select public.activate_admin_invite_with_audit(null)`,
        "admin_user_not_found",
      );
    }));
  for (const command of commands)
    test(`${command} forced audit rejection rolls back complete mutation`, () =>
      fixture(async (tx, f) => {
        const [before] =
          await tx`select md5(string_agg(to_jsonb(a)::text,E'\n' order by a.id)) hash from public.admin_user a`;
        await tx`alter table public.audit_log add constraint task10_fail_audit check(action not like 'admin_user.%')`;
        await tx`set local role service_role`;
        await expectError(
          tx,
          () => call(tx, command, f),
          'new row for relation "audit_log" violates check constraint "task10_fail_audit"',
          "23514",
        );
        const [after] =
          await tx`select md5(string_agg(to_jsonb(a)::text,E'\n' order by a.id)) hash from public.admin_user a`;
        expect(after.hash).toBe(before.hash);
      }));
  test("all public RPCs ignore temporary table shadows", () =>
    fixture(async (tx, f) => {
      for (const name of ["admin_user", "audit_log", "users"])
        await tx.unsafe("create temporary table " + name + "(fake text)");
      await tx`set local role service_role`;
      for (const c of commands) expect((await call(tx, c, f)).id).toBeString();
    }));
});
async function persistentFixture() {
  if (!db) throw Error("Own clone required");
  return db.begin(async (tx) => {
    await tx`set local role postgres`;
    return seed(tx as SQL);
  });
}
async function cleanup(f: Fixture) {
  if (!db) throw Error("Own clone required");
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    for (const id of [f.actor, f.targetAuth, f.inviteAuth, f.newAuth]) {
      await tx`delete from public.audit_log where actor_user_id=${id}::uuid`;
      await tx`delete from public.admin_user where auth_user_id=${id}::uuid`;
    }
    for (const id of [f.actor, f.targetAuth, f.inviteAuth, f.newAuth])
      await tx`delete from auth.users where id=${id}::uuid`;
  });
}
function signal() {
  let release = () => {};
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
async function blocking(holder: number, waiter: number) {
  if (!db) throw Error("Own clone required");
  for (let i = 0; i < 30; i++) {
    const [r] = await db`select ${holder}::integer=any(pg_blocking_pids(${waiter}::integer)) held`;
    if (r.held) return true;
    await Bun.sleep(20);
  }
  return false;
}
async function lockFirst(command: Command, table: "auth" | "admin" | "lastadmin") {
  if (!db) throw Error("Own clone required");
  const f = await persistentFixture(),
    hold = signal(),
    ready = signal(),
    started = signal();
  let holder = 0,
    waiter = 0;
  const first = db
    .begin(async (sql) => {
      const tx = sql as SQL;
      await tx.unsafe("set local statement_timeout='5s';set local role service_role");
      holder = (await tx`select pg_backend_pid() pid`)[0].pid;
      await call(tx, command, f);
      ready.release();
      await hold.promise;
      throw rollback;
    })
    .then(
      () => null,
      (e) => {
        ready.release();
        return e;
      },
    );
  let second: Promise<unknown> | undefined;
  let results: unknown[] = [];
  try {
    await ready.promise;
    second = db
      .begin(async (tx) => {
        await tx.unsafe("set local statement_timeout='5s';set local role postgres");
        waiter = (await tx`select pg_backend_pid() pid`)[0].pid;
        started.release();
        const id = command === "activate" ? f.inviteAuth : f.actor;
        if (table === "auth")
          await tx`update auth.users set banned_until=now()+interval '1 hour' where id=${id}::uuid`;
        else if (table === "lastadmin")
          await expectError(
            tx as SQL,
            () => tx`delete from public.admin_user where role='admin' and status='active'`,
            "last_active_admin",
          );
        else
          await tx`update public.admin_user set status='disabled' where auth_user_id=${id}::uuid`;
        throw rollback;
      })
      .then(
        () => null,
        (e) => e,
      );
    await started.promise;
    expect(await blocking(holder, waiter)).toBe(true);
  } finally {
    hold.release();
    results = await Promise.all([first, ...(second ? [second] : [])]);
    await cleanup(f);
  }
  for (const r of results)
    if (r !== rollback) throw r ?? Error("Expected held transaction rollback");
}
async function updateFirst(
  command: Command,
  state: "banned" | "unconfirmed" | "disabled" | "staff",
) {
  if (!db) throw Error("Own clone required");
  const f = await persistentFixture(),
    hold = signal(),
    ready = signal(),
    started = signal();
  let holder = 0,
    waiter = 0;
  const first = db
    .begin(async (tx) => {
      await tx.unsafe("set local statement_timeout='5s';set local role postgres");
      holder = (await tx`select pg_backend_pid() pid`)[0].pid;
      const id = command === "activate" ? f.inviteAuth : f.actor;
      if (state === "banned")
        await tx`update auth.users set banned_until=now()+interval '1 hour' where id=${id}::uuid`;
      if (state === "unconfirmed")
        await tx`update auth.users set email_confirmed_at=null where id=${id}::uuid`;
      if (state === "disabled")
        await tx`update public.admin_user set status='disabled' where auth_user_id=${id}::uuid`;
      if (state === "staff")
        await tx`update public.admin_user set role='staff' where auth_user_id=${id}::uuid`;
      ready.release();
      await hold.promise;
    })
    .then(
      () => null,
      (e) => {
        ready.release();
        return e;
      },
    );
  let second: Promise<unknown> | undefined;
  let results: unknown[] = [];
  try {
    await ready.promise;
    second = db
      .begin(async (sql) => {
        const tx = sql as SQL;
        await tx.unsafe("set local statement_timeout='5s';set local role service_role");
        waiter = (await tx`select pg_backend_pid() pid`)[0].pid;
        started.release();
        await expectError(
          tx,
          () => call(tx, command, f),
          command === "activate" ? "admin_user_not_found" : "admin_actor_denied",
        );
        const [r] =
          await tx`select count(*)::integer count from public.audit_log where actor_user_id in(${f.actor}::uuid,${f.inviteAuth}::uuid)`;
        expect(r.count).toBe(0);
      })
      .then(
        () => null,
        (e) => e,
      );
    await started.promise;
    expect(await blocking(holder, waiter)).toBe(true);
  } finally {
    hold.release();
    results = await Promise.all([first, ...(second ? [second] : [])]);
    await cleanup(f);
  }
  for (const r of results) if (r) throw r;
}
async function concurrentRetry(command: "activate" | "invite") {
  if (!db) throw Error("Own clone required");
  const f = await persistentFixture(),
    hold = signal(),
    ready = signal(),
    started = signal();
  let holder = 0,
    waiter = 0;
  const first = db
    .begin(async (sql) => {
      const tx = sql as SQL;
      await tx.unsafe("set local statement_timeout='5s';set local role service_role");
      holder = (await tx`select pg_backend_pid() pid`)[0].pid;
      const r = await call(tx, command, f);
      ready.release();
      await hold.promise;
      return r;
    })
    .then(
      (value) => ({ value, error: null }),
      (error) => {
        ready.release();
        return { value: null, error };
      },
    );
  let second: Promise<{ value: Record<string, unknown> | null; error: unknown }> | undefined;
  try {
    await ready.promise;
    second = db
      .begin(async (sql) => {
        const tx = sql as SQL;
        await tx.unsafe("set local statement_timeout='5s';set local role service_role");
        waiter = (await tx`select pg_backend_pid() pid`)[0].pid;
        started.release();
        return call(tx, command, f);
      })
      .then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error }),
      );
    await started.promise;
    expect(await blocking(holder, waiter)).toBe(true);
    hold.release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.error).toBeNull();
    if (command === "activate") {
      expect(b.error).toBeNull();
      expect(b.value?.id).toBe(a.value.id);
      expect(b.value?.invite_accepted_at).toEqual(a.value.invite_accepted_at);
    } else expect(b.error).toMatchObject({ errno: "P0001", message: "duplicate_admin_user" });
    const id = command === "activate" ? f.inviteAuth : f.actor;
    const [r] =
      await db`select count(*)::integer count from public.audit_log where actor_user_id=${id}::uuid`;
    expect(r.count).toBe(1);
  } finally {
    hold.release();
    await Promise.all([first, ...(second ? [second] : [])]);
    await cleanup(f);
  }
}
describe.skipIf(!db)("Task10 actual concurrent transactions", () => {
  test("concurrent direct bulk deletion waits for RPC lock and preserves the final active admin", () =>
    lockFirst("update", "lastadmin"));
  for (const command of commands) {
    test(`${command} holds Auth row until transaction finishes`, () => lockFirst(command, "auth"));
    for (const state of ["banned", "unconfirmed"] as const)
      test(`${command} waits then rechecks ${state}`, () => updateFirst(command, state));
  }
  for (const command of ["update", "invite", "resend"] as const) {
    test(`${command} holds current admin actor row`, () => lockFirst(command, "admin"));
    for (const state of ["disabled", "staff"] as const)
      test(`${command} waits then rechecks ${state}`, () => updateFirst(command, state));
  }
  test("activation waits then rejects disabled invitee", () => updateFirst("activate", "disabled"));
  test("concurrent activation retains one transition and audit", () => concurrentRetry("activate"));
  test("concurrent same invite identity refuses duplicate with one audit", () =>
    concurrentRetry("invite"));
});
afterAll(async () => {
  await db?.close();
});
