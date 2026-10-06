import { afterAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";
const url = process.env.R01_ADOPTION_ATOMIC_TEST_DATABASE_URL;
const enabled = process.env.R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES === "1" && !!url;
if (enabled) assertCloneUrl(url!);
const db = enabled ? new SQL(url!, { max: 4 }) : null;

const fixtureBaselines = new WeakMap<SQL, Record<string, number>>();
const rollback = new Error("Task9 synthetic transaction rollback");
async function fixture(run: (tx: SQL, actor: string, status: string) => Promise<void>) {
  if (!db) throw Error("owned Task9 clone required");
  try {
    await db.begin(async (sql) => {
      const tx = sql as SQL;
      await tx`set local role postgres`;
      const baseline: Record<string, number> = {};
      for (const table of [
        "audit_log",
        "supporter",
        "supporter_role",
        "adopter_profile",
        "adoption_case",
        "adoption_followup",
        "coordinator_status",
        "animal_match",
      ]) {
        const [row] = await tx.unsafe("select count(*)::integer count from public." + table);
        baseline[table] = row.count;
      }
      fixtureBaselines.set(tx, baseline);
      const actor = randomUUID(),
        status = randomUUID();
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en) values(${status}::uuid,'adoption_case',${"synthetic_" + status.replaceAll("-", "")},'Synthetic','Synthetic')`;
      await run(tx, actor, status);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}
const statusValues = () => ({
  category: "followup",
  key: "synthetic_" + randomUUID().replaceAll("-", ""),
  label_zh: "Synthetic",
  label_en: "Synthetic",
  sort_order: 0,
  color: "slate",
  is_active: true,
  is_closing: false,
  is_final: false,
});
async function coordinator(
  tx: SQL,
  actor: string,
  entity: string,
  operation: string,
  id: string | null,
  payload: unknown,
) {
  const [r] =
    await tx`select public.mutate_adoption_coordinator_with_audit(${actor}::uuid,${entity},${operation},${id}::uuid,${payload}::jsonb) value`;
  return r.value;
}
async function manual(
  tx: SQL,
  actor: string,
  status: string,
  identity: unknown = {
    kind: "new_supporter",
    supporter: { name: "Synthetic intake", phone: "00000000" },
    adopterProfile: { nameEnglish: "Synthetic adopter" },
  },
) {
  const [r] =
    await tx`select public.create_manual_adoption_case(${actor}::uuid,${identity}::jsonb,${{ initialStatusId: status, animalType: "cat", applicantName: "Synthetic intake", applicantPhone: "00000000" }}::jsonb) value`;
  return r.value;
}
async function expectCode(tx: SQL, operation: (sql: SQL) => Promise<unknown>, code: string) {
  const sp = "adopt_" + randomUUID().replaceAll("-", "");
  await tx.unsafe("savepoint " + sp);
  let error: unknown;
  try {
    await operation(tx);
  } catch (e) {
    error = e;
  } finally {
    await tx.unsafe("rollback to savepoint " + sp);
    await tx.unsafe("release savepoint " + sp);
  }
  expect(error).toMatchObject({ errno: code });
}
async function count(tx: SQL, table: string) {
  const [r] = await tx.unsafe("select count(*)::integer count from public." + table);
  return (r.count as number) - (fixtureBaselines.get(tx)?.[table] ?? 0);
}

describe.skipIf(!db)("R01 adoption atomic real owned database", () => {
  test("coordinator status creates and returns its row with one transactional audit", () =>
    fixture(async (tx, actor) => {
      await tx`set local role service_role`;
      const r = await coordinator(tx, actor, "coordinator_status", "create", null, statusValues());
      expect(r.category).toBe("followup");
      expect(r.id).toBeString();
      const [a] =
        await tx`select action,entity_id from public.audit_log where actor_user_id=${actor}::uuid`;
      expect(a.action).toBe("coordinator_status.create");
      expect(a.entity_id).toBe(r.id);
    }));
  test("manual default initial task creates linked identity/case and audit without a task", () =>
    fixture(async (tx, actor, status) => {
      await tx`set local role service_role`;
      const r = await manual(tx, actor, status);
      expect(r.caseId).toBeString();
      expect(r.supporterId).toBeString();
      expect(r.adopterProfileId).toBeString();
      expect(r.taskId).toBeNull();
      const [c] =
        await tx`select source,supporter_id,adopter_profile_id,bulk_row_version from public.adoption_case where id=${r.caseId}::uuid`;
      expect(c.source).toBe("manual_intake");
      expect(c.supporter_id).toBe(r.supporterId);
      expect(c.adopter_profile_id).toBe(r.adopterProfileId);
      expect(String(c.bulk_row_version)).toBe("1");
      expect(await count(tx, "audit_log")).toBe(1);
      expect(await count(tx, "adoption_followup")).toBe(0);
    }));
  test("identity search returns literal matching/paged candidates and numeric total", () =>
    fixture(async (tx) => {
      await tx`insert into public.supporter(name,email) values('ZZ Synthetic Needle','synthetic-needle@example.invalid'),('AA Synthetic Needle',null),('Unrelated',null)`;
      await tx`set local role service_role`;
      const [r] = await tx`select public.search_manual_case_identity('synthetic needle',1,1) value`;
      expect(r.value.total).toBe(2);
      expect(r.value.candidates).toHaveLength(1);
      expect(r.value.candidates[0].displayName).toBe("AA Synthetic Needle");
      const [next] =
        await tx`select public.search_manual_case_identity('synthetic needle',2,1) value`;
      expect(next.value.candidates[0].displayName).toBe("ZZ Synthetic Needle");
    }));
  for (const target of ["coordinator", "manual"] as const)
    for (const state of ["banned", "unconfirmed"] as const)
      test(`${target} refuses ${state} actor before any rows or audit`, () =>
        fixture(async (tx, actor, status) => {
          if (state === "banned")
            await tx`update auth.users set banned_until=now()+interval '1 hour' where id=${actor}::uuid`;
          else await tx`update auth.users set email_confirmed_at=null where id=${actor}::uuid`;
          await tx`set local role service_role`;
          await expectCode(
            tx,
            (s) =>
              target === "manual"
                ? manual(s, actor, status)
                : coordinator(s, actor, "coordinator_status", "create", null, statusValues()),
            "42501",
          );
          expect(await count(tx, "audit_log")).toBe(0);
          expect(await count(tx, "supporter")).toBe(0);
          expect(await count(tx, "coordinator_status")).toBe(1);
        }));
});

describe.skipIf(!db)("R01 adoption role and transaction contracts", () => {
  for (const target of ["coordinator", "manual"] as const)
    for (const state of ["missing", "disabled", "treasurer"] as const)
      test(`${target} refuses actual ${state} actor with42501 and no audit`, () =>
        fixture(async (tx, actor, status) => {
          if (state === "disabled")
            await tx`update public.admin_user set status='disabled' where auth_user_id=${actor}::uuid`;
          if (state === "treasurer")
            await tx`update public.admin_user set role='treasurer' where auth_user_id=${actor}::uuid`;
          await tx`set local role service_role`;
          await expectCode(
            tx,
            (s) =>
              target === "manual"
                ? manual(s, state === "missing" ? randomUUID() : actor, status)
                : coordinator(
                    s,
                    state === "missing" ? randomUUID() : actor,
                    "coordinator_status",
                    "create",
                    null,
                    statusValues(),
                  ),
            "42501",
          );
          expect(await count(tx, "audit_log")).toBe(0);
        }));
  for (const role of ["anon", "authenticated"] as const)
    test(`${role} cannot execute any restored service-only RPC`, () =>
      fixture(async (tx, actor, status) => {
        await tx.unsafe("set local role " + role);
        await expectCode(
          tx,
          (s) => coordinator(s, actor, "coordinator_status", "create", null, statusValues()),
          "42501",
        );
        await expectCode(tx, (s) => manual(s, actor, status), "42501");
        await expectCode(tx, (s) => s`select public.search_manual_case_identity('',1,10)`, "42501");
      }));
  test("staff cannot mutate statuses but may create and update audited followup tasks", () =>
    fixture(async (tx, actor, caseStatus) => {
      const status = randomUUID();
      await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en) values(${status}::uuid,'followup','completed','Synthetic','Synthetic')`;
      await tx`update public.admin_user set role='staff' where auth_user_id=${actor}::uuid`;
      await tx`set local role service_role`;
      await expectCode(
        tx,
        (s) => coordinator(s, actor, "coordinator_status", "create", null, statusValues()),
        "42501",
      );
      const linked = await manual(tx, actor, caseStatus);
      const task = await coordinator(tx, actor, "adoption_followup", "create", null, {
        adoption_case_id: linked.caseId,
        title: "Synthetic task",
        status_id: status,
        task_type: "followup",
        priority: "normal",
      });
      expect(task.title).toBe("Synthetic task");
      expect(task.created_by).toBe(actor);
      const changed = await coordinator(tx, actor, "adoption_followup", "update", task.id, {
        status_id: status,
        remarks: "Synthetic update",
        updated_by: randomUUID(),
      });
      expect(changed.remarks).toBe("Synthetic update");
      expect(changed.updated_by).toBe(actor);
      const [a] =
        await tx`select count(*)::integer total from public.audit_log where action='coordinator_task.complete'`;
      expect(a.total).toBe(1);
    }));
  test("system status identity/deletion remain protected and normal status update/delete return audited rows", () =>
    fixture(async (tx, actor, status) => {
      await tx`update public.coordinator_status set is_system=true where id=${status}::uuid`;
      await tx`set local role service_role`;
      await expectCode(
        tx,
        (s) => coordinator(s, actor, "coordinator_status", "delete", status, {}),
        "23514",
      );
      await expectCode(
        tx,
        (s) => coordinator(s, actor, "coordinator_status", "update", status, { key: "changed" }),
        "23514",
      );
      const created = await coordinator(
        tx,
        actor,
        "coordinator_status",
        "create",
        null,
        statusValues(),
      );
      const updated = await coordinator(tx, actor, "coordinator_status", "update", created.id, {
        label_en: "Changed",
      });
      expect(updated.label_en).toBe("Changed");
      const deleted = await coordinator(tx, actor, "coordinator_status", "delete", created.id, {});
      expect(deleted.id).toBe(created.id);
      expect(await count(tx, "audit_log")).toBe(3);
    }));
  test("missing targets and unsupported operations keep P0002/22023 without audit", () =>
    fixture(async (tx, actor) => {
      await tx`set local role service_role`;
      await expectCode(
        tx,
        (s) => coordinator(s, actor, "coordinator_status", "update", randomUUID(), {}),
        "P0002",
      );
      await expectCode(
        tx,
        (s) => coordinator(s, actor, "adoption_followup", "update", randomUUID(), {}),
        "P0002",
      );
      await expectCode(
        tx,
        (s) => coordinator(s, actor, "unrecognized", "create", null, {}),
        "22023",
      );
      expect(await count(tx, "audit_log")).toBe(0);
    }));
  for (const target of ["coordinator", "manual"] as const)
    test(`${target} audit failure rolls back all identity/business writes`, () =>
      fixture(async (tx, actor, status) => {
        await tx.unsafe(
          "alter table public.audit_log add constraint task9_injected_audit_failure check(action not in('coordinator_status.create','coordinator_manual_intake.create'))",
        );
        await tx`set local role service_role`;
        await expectCode(
          tx,
          (s) =>
            target === "manual"
              ? manual(s, actor, status)
              : coordinator(s, actor, "coordinator_status", "create", null, statusValues()),
          "23514",
        );
        expect(await count(tx, "supporter")).toBe(0);
        expect(await count(tx, "adopter_profile")).toBe(0);
        expect(await count(tx, "adoption_case")).toBe(0);
        expect(await count(tx, "audit_log")).toBe(0);
        expect(await count(tx, "coordinator_status")).toBe(1);
      }));
  test("manual intake preserves initial task linking and actor IDs", () =>
    fixture(async (tx, actor, status) => {
      const followup = randomUUID();
      await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en) values(${followup}::uuid,'followup','pending','Synthetic','Synthetic')`;
      await tx`set local role service_role`;
      const [r] =
        await tx`select public.create_manual_adoption_case(${actor}::uuid,${{ kind: "new_supporter", supporter: { name: "Synthetic", phone: "00000000" } }}::jsonb,${{ initialStatusId: status, animalType: "cat", applicantName: "Synthetic", applicantPhone: "00000000" }}::jsonb,${{ statusId: followup, title: "Synthetic initial task" }}::jsonb) value`;
      expect(r.value.taskId).toBeString();
      const [t] =
        await tx`select adoption_case_id,adopter_profile_id,created_by,updated_by from public.adoption_followup where id=${r.value.taskId}::uuid`;
      expect(t.adoption_case_id).toBe(r.value.caseId);
      expect(t.adopter_profile_id).toBe(r.value.adopterProfileId);
      expect(t.created_by).toBe(actor);
      expect(t.updated_by).toBe(actor);
      expect(await count(tx, "audit_log")).toBe(1);
    }));
  test("manual existing supporter retries reuse identity/role and create separate cases without inventing request idempotency", () =>
    fixture(async (tx, actor, status) => {
      const supporter = randomUUID();
      await tx`insert into public.supporter(id,name) values(${supporter}::uuid,'Synthetic existing')`;
      await tx`set local role service_role`;
      const identity = {
        kind: "existing_supporter",
        supporterId: supporter,
        adopterProfile: { nameEnglish: "Synthetic existing" },
      };
      const first = await manual(tx, actor, status, identity),
        second = await manual(tx, actor, status, identity);
      expect(first.supporterId).toBe(supporter);
      expect(second.supporterId).toBe(supporter);
      expect(first.adopterProfileId).toBe(second.adopterProfileId);
      expect(first.caseId).not.toBe(second.caseId);
      expect(await count(tx, "supporter")).toBe(1);
      expect(await count(tx, "supporter_role")).toBe(1);
      expect(await count(tx, "adopter_profile")).toBe(1);
      expect(await count(tx, "adoption_case")).toBe(2);
      expect(await count(tx, "audit_log")).toBe(2);
    }));
  test("manual malformed/unavailable identities preserve original refusal and no partial writes", () =>
    fixture(async (tx, actor, status) => {
      const supporter = randomUUID();
      await tx`insert into public.supporter(id,name,deleted_at) values(${supporter}::uuid,'Synthetic deleted',now())`;
      await tx`set local role service_role`;
      for (const identity of [
        { kind: "unknown" },
        { kind: "existing_supporter", supporterId: supporter },
        { kind: "existing_adopter", adopterProfileId: randomUUID() },
      ])
        await expectCode(tx, (s) => manual(s, actor, status, identity), "P0001");
      await expectCode(
        tx,
        (s) => manual(s, actor, status, { kind: "existing_supporter", supporterId: "bad-uuid" }),
        "22P02",
      );
      expect(await count(tx, "adoption_case")).toBe(0);
      expect(await count(tx, "adopter_profile")).toBe(0);
      expect(await count(tx, "audit_log")).toBe(0);
    }));
  test("duplicate coordinator status and malformed payload are atomic refusals", () =>
    fixture(async (tx, actor) => {
      await tx`set local role service_role`;
      const payload = statusValues();
      await coordinator(tx, actor, "coordinator_status", "create", null, payload);
      await expectCode(
        tx,
        (s) => coordinator(s, actor, "coordinator_status", "create", null, payload),
        "23505",
      );
      await expectCode(
        tx,
        (s) =>
          coordinator(s, actor, "coordinator_status", "create", null, {
            ...statusValues(),
            sort_order: "not_integer",
          }),
        "22P02",
      );
      expect(await count(tx, "audit_log")).toBe(1);
    }));
  test("empty pinned public commands and preserved private helper ignore temporary table shadows", () =>
    fixture(async (tx, actor, status) => {
      for (const name of ["admin_user", "audit_log", "supporter", "coordinator_status"])
        await tx.unsafe("create temporary table " + name + "(fake text)");
      await tx`set local role service_role`;
      const r = await manual(tx, actor, status);
      expect(r.caseId).toBeString();
      const s = await coordinator(tx, actor, "coordinator_status", "create", null, statusValues());
      expect(s.category).toBe("followup");
      expect(await count(tx, "audit_log")).toBe(2);
    }));
  test("existing bulk case/supporter version triggers remain unchanged during valid synthetic updates", () =>
    fixture(async (tx, actor, status) => {
      await tx`set local role service_role`;
      const r = await manual(tx, actor, status);
      await tx`set local role postgres`;
      const [s] =
        await tx`select edit_version from public.supporter where id=${r.supporterId}::uuid`;
      expect(String(s.edit_version)).toBe("2");
      await tx`update public.adoption_case set reason='Synthetic update' where id=${r.caseId}::uuid`;
      const [c] =
        await tx`select bulk_row_version from public.adoption_case where id=${r.caseId}::uuid`;
      expect(String(c.bulk_row_version)).toBe("2");
    }));
});

async function actorLockRace(target: "coordinator" | "manual", table: "admin_user" | "auth.users") {
  if (!db) throw Error("owned Task9 clone required");
  const actor = randomUUID(),
    status = randomUUID();
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
    await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
    await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en) values(${status}::uuid,'adoption_case',${"synthetic_" + status.replaceAll("-", "")},'Synthetic','Synthetic')`;
  });
  let release = () => {};
  const hold = new Promise<void>((r) => {
    release = r;
  });
  let ready = () => {};
  const called = new Promise<void>((r) => {
    ready = r;
  });
  let commandPid = 0,
    updatePid = 0;
  let updateReady = () => {};
  const updaterStarted = new Promise<void>((r) => {
    updateReady = r;
  });
  const command = db
    .begin(async (sql) => {
      const tx = sql as SQL;
      await tx.unsafe("set local statement_timeout='5s';set local role service_role");
      const [p] = await tx`select pg_backend_pid() pid`;
      commandPid = p.pid;
      if (target === "manual") await manual(tx, actor, status);
      else await coordinator(tx, actor, "coordinator_status", "create", null, statusValues());
      ready();
      await hold;
      throw rollback;
    })
    .catch((e) => {
      ready();
      if (e !== rollback) throw e;
    });
  await called;
  const update = db
    .begin(async (sql) => {
      const tx = sql as SQL;
      await tx.unsafe("set local statement_timeout='5s';set local role postgres");
      const [p] = await tx`select pg_backend_pid() pid`;
      updatePid = p.pid;
      updateReady();
      if (table === "admin_user")
        await tx`update public.admin_user set status='disabled' where auth_user_id=${actor}::uuid`;
      else
        await tx`update auth.users set banned_until=now()+interval '1 hour' where id=${actor}::uuid`;
      throw rollback;
    })
    .catch((e) => {
      if (e !== rollback) throw e;
    });
  try {
    await updaterStarted;
    let blocked = false;
    for (let i = 0; i < 20; i++) {
      const [r] =
        await db`select ${commandPid}::integer=any(pg_blocking_pids(${updatePid}::integer)) held`;
      if (r.held) {
        blocked = true;
        break;
      }
      await Bun.sleep(25);
    }
    expect(blocked).toBe(true);
  } finally {
    release();
    await Promise.all([command, update]);
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`delete from public.coordinator_status where id=${status}::uuid`;
      await tx`delete from public.admin_user where auth_user_id=${actor}::uuid`;
      await tx`delete from auth.users where id=${actor}::uuid`;
    });
  }
}
async function actorUpdateFirst(
  target: "coordinator" | "manual",
  state: "disabled" | "treasurer" | "banned" | "unconfirmed",
) {
  if (!db) throw Error("owned Task9 clone required");
  const actor = randomUUID(),
    status = randomUUID();
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
    await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
    await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en) values(${status}::uuid,'adoption_case',${"synthetic_" + status.replaceAll("-", "")},'Synthetic','Synthetic')`;
  });
  let release = () => {},
    ready = () => {},
    started = () => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  const updated = new Promise<void>((r) => {
    ready = r;
  });
  const called = new Promise<void>((r) => {
    started = r;
  });
  let updaterPid = 0,
    commandPid = 0;
  const updater = db.begin(async (tx) => {
    await tx.unsafe("set local statement_timeout='5s';set local role postgres");
    const [pid] = await tx`select pg_backend_pid() pid`;
    updaterPid = pid.pid;
    if (state === "disabled")
      await tx`update public.admin_user set status='disabled' where auth_user_id=${actor}::uuid`;
    if (state === "treasurer")
      await tx`update public.admin_user set role='treasurer' where auth_user_id=${actor}::uuid`;
    if (state === "banned")
      await tx`update auth.users set banned_until=now()+interval '1 hour' where id=${actor}::uuid`;
    if (state === "unconfirmed")
      await tx`update auth.users set email_confirmed_at=null where id=${actor}::uuid`;
    ready();
    await held;
  });
  let command: Promise<unknown> | undefined;
  try {
    await updated;
    command = db.begin(async (sql) => {
      const tx = sql as SQL;
      await tx.unsafe("set local statement_timeout='5s';set local role service_role");
      const [pid] = await tx`select pg_backend_pid() pid`;
      commandPid = pid.pid;
      started();
      await expectCode(
        tx,
        (s) =>
          target === "manual"
            ? manual(s, actor, status)
            : coordinator(s, actor, "coordinator_status", "create", null, statusValues()),
        "42501",
      );
      const [audit] =
        await tx`select count(*)::integer total from public.audit_log where actor_user_id=${actor}::uuid`;
      const [cases] =
        await tx`select count(*)::integer total from public.adoption_case where created_by=${actor}::uuid`;
      expect(audit.total).toBe(0);
      expect(cases.total).toBe(0);
    });
    await called;
    let blocked = false;
    for (let i = 0; i < 20; i++) {
      const [r] =
        await db`select ${updaterPid}::integer=any(pg_blocking_pids(${commandPid}::integer)) held`;
      if (r.held) {
        blocked = true;
        break;
      }
      await Bun.sleep(25);
    }
    expect(blocked).toBe(true);
    release();
    await Promise.all([updater, command]);
  } finally {
    release();
    await Promise.allSettled([updater, ...(command ? [command] : [])]);
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`delete from public.coordinator_status where id=${status}::uuid`;
      await tx`delete from public.admin_user where auth_user_id=${actor}::uuid`;
      await tx`delete from auth.users where id=${actor}::uuid`;
    });
  }
}

async function concurrentIdentity() {
  if (!db) throw Error("owned Task9 clone required");
  const actor = randomUUID(),
    status = randomUUID(),
    supporter = randomUUID();
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
    await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
    await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en) values(${status}::uuid,'adoption_case',${"synthetic_" + status.replaceAll("-", "")},'Synthetic','Synthetic')`;
    await tx`insert into public.supporter(id,name) values(${supporter}::uuid,'Synthetic concurrent identity')`;
  });
  let release = () => {},
    ready = () => {},
    started = () => {};
  const hold = new Promise<void>((r) => {
      release = r;
    }),
    held = new Promise<void>((r) => {
      ready = r;
    }),
    called = new Promise<void>((r) => {
      started = r;
    });
  let firstPid = 0,
    secondPid = 0;
  const identity = {
    kind: "existing_supporter",
    supporterId: supporter,
    adopterProfile: { nameEnglish: "Synthetic concurrent" },
  };
  const first = db.begin(async (sql) => {
    const tx = sql as SQL;
    await tx.unsafe("set local statement_timeout='5s';set local role service_role");
    const [p] = await tx`select pg_backend_pid() pid`;
    firstPid = p.pid;
    const result = await manual(tx, actor, status, identity);
    ready();
    await hold;
    return result;
  });
  let second: Promise<unknown> | undefined;
  try {
    await held;
    second = db.begin(async (sql) => {
      const tx = sql as SQL;
      await tx.unsafe("set local statement_timeout='5s';set local role service_role");
      const [p] = await tx`select pg_backend_pid() pid`;
      secondPid = p.pid;
      started();
      return manual(tx, actor, status, identity);
    });
    await called;
    let blocked = false;
    for (let i = 0; i < 20; i++) {
      const [r] =
        await db`select ${firstPid}::integer=any(pg_blocking_pids(${secondPid}::integer)) held`;
      if (r.held) {
        blocked = true;
        break;
      }
      await Bun.sleep(25);
    }
    expect(blocked).toBe(true);
    release();
    const [one, two] = (await Promise.all([first, second])) as [
      { adopterProfileId: string; caseId: string },
      { adopterProfileId: string; caseId: string },
    ];
    expect(one.adopterProfileId).toBe(two.adopterProfileId);
    expect(one.caseId).not.toBe(two.caseId);
    const [row] =
      await db`select (select count(*)::integer from public.adopter_profile where supporter_id=${supporter}::uuid) profiles,(select count(*)::integer from public.supporter_role where supporter_id=${supporter}::uuid and role='adopter') roles,(select count(*)::integer from public.adoption_case where created_by=${actor}::uuid) cases,(select count(*)::integer from public.audit_log where actor_user_id=${actor}::uuid and action='coordinator_manual_intake.create') audits`;
    expect(row).toMatchObject({ profiles: 1, roles: 1, cases: 2, audits: 2 });
  } finally {
    release();
    await Promise.allSettled([first, ...(second ? [second] : [])]);
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`delete from public.audit_log where actor_user_id=${actor}::uuid`;
      await tx`delete from public.adoption_case where created_by=${actor}::uuid`;
      await tx`delete from public.adopter_profile where supporter_id=${supporter}::uuid`;
      await tx`delete from public.supporter_role where supporter_id=${supporter}::uuid`;
      await tx`delete from public.supporter where id=${supporter}::uuid`;
      await tx`delete from public.coordinator_status where id=${status}::uuid`;
      await tx`delete from public.admin_user where auth_user_id=${actor}::uuid`;
      await tx`delete from auth.users where id=${actor}::uuid`;
    });
  }
}

describe.skipIf(!db)("R01 adoption transaction actor locks", () => {
  test(
    "concurrent existing-supporter intakes wait on the existing unique identity and retain one profile/role, two cases/audits",
    concurrentIdentity,
  );
  afterAll(async () => {
    await db?.close();
  });
  for (const target of ["coordinator", "manual"] as const)
    for (const state of ["disabled", "treasurer", "banned", "unconfirmed"] as const)
      test(`${target} waits for actual ${state} update then rechecks and refuses without writes`, () =>
        actorUpdateFirst(target, state));
  for (const target of ["coordinator", "manual"] as const)
    for (const table of ["admin_user", "auth.users"] as const)
      test(`${target} holds actual actor ${table} row against concurrent suspension/ban until transaction ends`, () =>
        actorLockRace(target, table));
});
