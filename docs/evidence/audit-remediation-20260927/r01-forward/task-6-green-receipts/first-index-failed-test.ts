import { afterAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";
const raw =
  process.env.R01_CRM_ALLOW_LOCAL_FIXTURES === "1"
    ? process.env.R01_CRM_TEST_DATABASE_URL
    : undefined;
if (raw) assertCloneUrl(raw);
const db = raw ? new SQL(raw, { max: 4 }) : null;
const at = "2026-10-02T01:00:00Z";
const rollback = new Error("Task6 fixture rollback");
async function fixture(run: (tx: SQL, actor: string, supporter: string) => Promise<void>) {
  if (!db) throw new Error("Owned clone required");
  try {
    await db.begin(async (tx) => {
      const actor = randomUUID(),
        supporter = randomUUID();
      await tx`set local role postgres`;
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'treasurer','active')`;
      await tx`insert into public.supporter(id,name,email,language,tags,source) values(${supporter}::uuid,'Synthetic retained supporter',${supporter + "@example.invalid"},'en','{}','test')`;
      await run(tx, actor, supporter);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}
async function state(tx: SQL) {
  const [row] =
    await tx`select jsonb_build_object('supporter',(select jsonb_agg(to_jsonb(t) order by id) from public.supporter t),'roles',(select jsonb_agg(to_jsonb(t) order by supporter_id,role) from public.supporter_role t),'consents',(select jsonb_agg(to_jsonb(t) order by id) from public.consent t),'audit',(select jsonb_agg(to_jsonb(t) order by id) from public.audit_log t)) value`;
  return row.value;
}
async function service<T>(tx: SQL, run: (s: SQL) => Promise<T>, role = "service_role"): Promise<T> {
  const sp = "crm_sp_" + randomUUID().replaceAll("-", "");
  await tx.unsafe(`savepoint ${sp}`);
  try {
    await tx.unsafe(`set local role ${role}`);
    const value = await run(tx);
    await tx`set local role postgres`;
    await tx.unsafe(`release savepoint ${sp}`);
    return value;
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
async function edit(tx: SQL, actor: string, supporter: string) {
  const [v] = await tx`select edit_version from public.supporter where id=${supporter}::uuid`;
  return service(
    tx,
    (s) =>
      s`select public.mutate_crm_supporter_if_version_with_audit(${supporter}::uuid,${v.edit_version}::bigint,${{ name: "Forbidden replacement" }}::jsonb,null,${actor}::uuid,${at}::timestamptz,'{}'::jsonb)`,
  );
}
describe.skipIf(!db)("R01 CRM forward commands on owned synthetic clone", () => {
  afterAll(async () => {
    await db?.close();
  });
  test("missing-target create commits supporter roles and actor audit", () =>
    fixture(async (tx, actor) => {
      const email = randomUUID() + "@example.invalid";
      const [r] = await service(
        tx,
        (s) =>
          s`select public.mutate_crm_supporter_with_audit('create',null,${{ name: "Synthetic create", email, phone: null, language: "en", tags: [], source: "test" }}::jsonb,${["donor"]}::jsonb,${actor}::uuid,${at}::timestamptz,'{}'::jsonb) value`,
      );
      expect(r.value.email).toBe(email);
      const [audit] =
        await tx`select actor_user_id from public.audit_log where entity_id=${r.value.id}`;
      expect(audit.actor_user_id).toBe(actor);
    }));
  test("missing-target roles replace within one transaction", () =>
    fixture(async (tx, _actor, supporter) => {
      await service(
        tx,
        (s) =>
          s`select public.replace_supporter_roles_atomic(${supporter}::uuid,${["donor"]}::jsonb)`,
      );
      const roles =
        await tx`select role from public.supporter_role where supporter_id=${supporter}::uuid`;
      expect(roles.map((r: { role: string }) => r.role)).toEqual(["donor"]);
    }));
  test("missing-target consent append deduplicates immutable rows and audits", () =>
    fixture(async (tx, actor, supporter) => {
      const rows = [
        {
          supporter_id: supporter,
          channel: "email",
          status: "opt_in",
          source: "admin",
          timestamp: at,
        },
      ];
      await service(
        tx,
        (s) =>
          s`select public.append_crm_consents_with_audit(${rows}::jsonb,${actor}::uuid,${supporter}::uuid,${at}::timestamptz,'{}'::jsonb)`,
      );
      const [count] =
        await tx`select count(*)::int total from public.consent where supporter_id=${supporter}::uuid`;
      expect(count.total).toBe(1);
    }));
  test("versioned actor rejects managed Auth ban without mutation", () =>
    fixture(async (tx, actor, supporter) => {
      await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${actor}::uuid`;
      const before = await state(tx);
      expect(await errno(() => edit(tx, actor, supporter))).toBe("42501");
      expect(await state(tx)).toEqual(before);
    }));
  test("legacy defect create refuses an unauthorized staff actor", () =>
    fixture(async (tx, actor) => {
      await tx`update public.admin_user set role='staff' where auth_user_id=${actor}::uuid`;
      const before = await state(tx);
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.mutate_crm_supporter_with_audit('create',null,${{ name: "Forbidden", email: randomUUID() + "@example.invalid", language: "en", tags: [], source: "test" }}::jsonb,${["donor"]}::jsonb,${actor}::uuid,${at}::timestamptz,'{}'::jsonb)`,
          ),
        ),
      ).toBe("42501");
      expect(await state(tx)).toEqual(before);
    }));
  test("legacy defect consent refuses a banned actor", () =>
    fixture(async (tx, actor, supporter) => {
      await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${actor}::uuid`;
      const before = await state(tx),
        rows = [
          {
            supporter_id: supporter,
            channel: "email",
            status: "opt_in",
            source: "admin",
            timestamp: at,
          },
        ];
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.append_crm_consents_with_audit(${rows}::jsonb,${actor}::uuid,${supporter}::uuid,${at}::timestamptz,'{}'::jsonb)`,
          ),
        ),
      ).toBe("42501");
      expect(await state(tx)).toEqual(before);
    }));
  test("legacy defect consent refuses row identity mismatch", () =>
    fixture(async (tx, actor, supporter) => {
      const before = await state(tx),
        rows = [
          {
            supporter_id: randomUUID(),
            channel: "email",
            status: "opt_in",
            source: "admin",
            timestamp: at,
          },
        ];
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.append_crm_consents_with_audit(${rows}::jsonb,${actor}::uuid,${supporter}::uuid,${at}::timestamptz,'{}'::jsonb)`,
          ),
        ),
      ).toBe("22023");
      expect(await state(tx)).toEqual(before);
    }));
  test("legacy defect consent refuses empty audit-only append", () =>
    fixture(async (tx, actor, supporter) => {
      const before = await state(tx);
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.append_crm_consents_with_audit('[]'::jsonb,${actor}::uuid,${supporter}::uuid,${at}::timestamptz,'{}'::jsonb)`,
          ),
        ),
      ).toBe("22023");
      expect(await state(tx)).toEqual(before);
    }));
  for (const command of ["create", "update", "consent"] as const) {
    test(`${command} rejects stale role, status, unconfirmed, missing and banned actors`, async () => {
      for (const kind of [
        "staff",
        "disabled",
        "pending",
        "unconfirmed",
        "banned",
        "no-admin",
        "no-auth",
        "unknown",
        "null",
      ]) {
        await fixture(async (tx, actor, supporter) => {
          if (kind === "staff")
            await tx`update public.admin_user set role='staff' where auth_user_id=${actor}::uuid`;
          if (kind === "disabled" || kind === "pending")
            await tx`update public.admin_user set status=${kind} where auth_user_id=${actor}::uuid`;
          if (kind === "unconfirmed")
            await tx`update auth.users set email_confirmed_at=null where id=${actor}::uuid`;
          if (kind === "banned")
            await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${actor}::uuid`;
          if (kind === "no-admin")
            await tx`delete from public.admin_user where auth_user_id=${actor}::uuid`;
          if (kind === "no-auth") await tx`delete from auth.users where id=${actor}::uuid`;
          const who = kind === "null" ? null : kind === "unknown" ? randomUUID() : actor,
            before = await state(tx);
          const result = await errno(() =>
            service(tx, (s) =>
              command === "create"
                ? s`select public.mutate_crm_supporter_with_audit('create',null,${{ name: "Forbidden", email: randomUUID() + "@example.invalid", language: "en", tags: [], source: "test" }}::jsonb,${["donor"]}::jsonb,${who}::uuid,${at}::timestamptz,'{}'::jsonb)`
                : command === "consent"
                  ? s`select public.append_crm_consents_with_audit(${[{ supporter_id: supporter, channel: "email", status: "opt_in", source: "admin", timestamp: at }]}::jsonb,${who}::uuid,${supporter}::uuid,${at}::timestamptz,'{}'::jsonb)`
                  : s`select public.mutate_crm_supporter_if_version_with_audit(${supporter}::uuid,1::bigint,'{}'::jsonb,null,${who}::uuid,${at}::timestamptz,'{}'::jsonb)`,
            ),
          );
          expect(result).toBe("42501");
          expect(await state(tx)).toEqual(before);
        });
      }
    });
  }
  test("each public command and private bridge rejects direct anon and authenticated execution", () =>
    fixture(async (tx, actor, supporter) => {
      for (const role of ["anon", "authenticated"]) {
        expect(
          await errno(() =>
            service(
              tx,
              (s) =>
                s`select public.mutate_crm_supporter_with_audit('create',null,'{}'::jsonb,'[]'::jsonb,${actor}::uuid,${at}::timestamptz,'{}'::jsonb)`,
              role,
            ),
          ),
        ).toBe("42501");
        expect(
          await errno(() =>
            service(
              tx,
              (s) =>
                s`select public.replace_supporter_roles_atomic(${supporter}::uuid,'[]'::jsonb)`,
              role,
            ),
          ),
        ).toBe("42501");
        expect(
          await errno(() =>
            service(
              tx,
              (s) =>
                s`select public.append_crm_consents_with_audit('[]'::jsonb,${actor}::uuid,${supporter}::uuid,${at}::timestamptz,'{}'::jsonb)`,
              role,
            ),
          ),
        ).toBe("42501");
        expect(
          await errno(() =>
            service(
              tx,
              (s) =>
                s`select public.mutate_crm_supporter_if_version_with_audit(${supporter}::uuid,1,'{}'::jsonb,null,${actor}::uuid,${at}::timestamptz,'{}'::jsonb)`,
              role,
            ),
          ),
        ).toBe("42501");
        expect(
          await errno(() =>
            service(tx, (s) => s`select private.require_crm_supporter_actor(${actor}::uuid)`, role),
          ),
        ).toBe("42501");
      }
    }));
  test("service has no effective managed Auth column access and bridge adds none", () =>
    fixture(async (tx) => {
      const columns =
        await tx`select attname from pg_attribute where attrelid='auth.users'::regclass and attnum>0 and not attisdropped`;
      for (const c of columns) {
        const [p] =
          await tx`select has_column_privilege('service_role','auth.users',${c.attname},'SELECT') sel,has_column_privilege('service_role','auth.users',${c.attname},'UPDATE') upd`;
        expect(p.sel).toBe(false);
        expect(p.upd).toBe(false);
      }
      expect(await errno(() => service(tx, (s) => s`select id from auth.users limit 0`))).toBe(
        "42501",
      );
      expect(
        await errno(() =>
          service(tx, (s) => s`update auth.users set banned_until=null where false`),
        ),
      ).toBe("42501");
    }));
  test("create retry retains supporter identity while valid consent retry preserves one immutable fact", () =>
    fixture(async (tx, actor, supporter) => {
      const input = {
        name: "Synthetic retry",
        email: randomUUID() + "@example.invalid",
        language: "en",
        tags: ["synthetic"],
        source: "test",
      };
      const call = () =>
        service(
          tx,
          (s) =>
            s`select public.mutate_crm_supporter_with_audit('create',null,${input}::jsonb,${["donor"]}::jsonb,${actor}::uuid,${at}::timestamptz,'{}'::jsonb) value`,
        );
      const [first] = await call(),
        [second] = await call();
      expect(second.value).toEqual(first.value);
      const rows = [
        {
          supporter_id: supporter,
          channel: "email",
          status: "opt_out",
          source: "admin",
          timestamp: at,
        },
      ];
      for (let n = 0; n < 2; n++)
        await service(
          tx,
          (s) =>
            s`select public.append_crm_consents_with_audit(${rows}::jsonb,${actor}::uuid,${supporter}::uuid,${at}::timestamptz,'{}'::jsonb)`,
        );
      const [count] =
        await tx`select count(*)::int total from public.consent where supporter_id=${supporter}::uuid`;
      const [audit] =
        await tx`select count(*)::int total from public.audit_log where entity_id=${supporter} and action='consent.append'`;
      expect(count.total).toBe(1);
      expect(audit.total).toBe(2);
    }));
  test("audit failure rolls back profile roles version and consent history", () =>
    fixture(async (tx, actor, supporter) => {
      const before = await state(tx);
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.mutate_crm_supporter_with_audit('create',null,${{ name: "Rollback", email: randomUUID() + "@example.invalid", language: "en", tags: [], source: "test" }}::jsonb,${["donor"]}::jsonb,${actor}::uuid,null,'{}'::jsonb)`,
          ),
        ),
      ).toBe("23502");
      expect(await state(tx)).toEqual(before);
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.mutate_crm_supporter_if_version_with_audit(${supporter}::uuid,1,${{ name: "Rollback" }}::jsonb,${["donor"]}::jsonb,${actor}::uuid,null,'{}'::jsonb)`,
          ),
        ),
      ).toBe("23502");
      expect(await state(tx)).toEqual(before);
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.append_crm_consents_with_audit(${[{ supporter_id: supporter, channel: "email", status: "opt_in", source: "admin", timestamp: at }]}::jsonb,${actor}::uuid,${supporter}::uuid,null,'{}'::jsonb)`,
          ),
        ),
      ).toBe("23502");
      expect(await state(tx)).toEqual(before);
    }));
  test("actorless role utility rolls back invalid role and triggers monotonic stale-version rejection", () =>
    fixture(async (tx, actor, supporter) => {
      const before = await state(tx);
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.replace_supporter_roles_atomic(${supporter}::uuid,${["donor", "invalid"]}::jsonb)`,
          ),
        ),
      ).toBe("23514");
      expect(await state(tx)).toEqual(before);
      await service(
        tx,
        (s) =>
          s`select public.replace_supporter_roles_atomic(${supporter}::uuid,${["volunteer"]}::jsonb)`,
      );
      const [v] = await tx`select edit_version from public.supporter where id=${supporter}::uuid`;
      expect(Number(v.edit_version)).toBeGreaterThan(1);
      const changed = await state(tx);
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.mutate_crm_supporter_if_version_with_audit(${supporter}::uuid,1,${{ name: "Stale" }}::jsonb,null,${actor}::uuid,${at}::timestamptz,'{}'::jsonb)`,
          ),
        ),
      ).toBe("P4090");
      expect(await state(tx)).toEqual(changed);
    }));
  test("consent payload rejects malformed and missing identities before audit", () =>
    fixture(async (tx, actor, supporter) => {
      for (const rows of [
        null,
        {},
        [],
        [null],
        ["invalid"],
        [{}],
        [{ supporter_id: null }],
        [{ supporter_id: "not-a-uuid" }],
      ]) {
        const before = await state(tx);
        expect(
          await errno(() =>
            service(
              tx,
              (s) =>
                s`select public.append_crm_consents_with_audit(${rows}::jsonb,${actor}::uuid,${supporter}::uuid,${at}::timestamptz,'{}'::jsonb)`,
            ),
          ),
        ).toBe("22023");
        expect(await state(tx)).toEqual(before);
      }
    }));
  test("temporary shadow tables cannot bypass actor or redirect audited writes", () =>
    fixture(async (tx, actor) => {
      await tx.unsafe(
        "create temp table supporter(id uuid);create temp table admin_user(auth_user_id uuid,role text,status text);create temp table consent(id uuid);create temp table audit_log(id uuid)",
      );
      const email = randomUUID() + "@example.invalid";
      const [row] = await service(
        tx,
        (s) =>
          s`select public.mutate_crm_supporter_with_audit('create',null,${{ name: "Qualified", email, language: "en", tags: [], source: "test" }}::jsonb,${["donor"]}::jsonb,${actor}::uuid,${at}::timestamptz,'{}'::jsonb) value`,
      );
      const [stored] = await tx`select email from public.supporter where id=${row.value.id}::uuid`;
      expect(stored.email).toBe(email);
      const [shadow] = await tx.unsafe("select count(*)::int n from pg_temp.supporter");
      expect(shadow.n).toBe(0);
    }));
});
