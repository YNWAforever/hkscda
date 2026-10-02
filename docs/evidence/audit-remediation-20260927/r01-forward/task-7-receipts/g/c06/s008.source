import { afterAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";

const raw =
  process.env.R01_CMS_ALLOW_LOCAL_FIXTURES === "1"
    ? process.env.R01_CMS_TEST_DATABASE_URL
    : undefined;
if (raw) assertCloneUrl(raw);
const db = raw ? new SQL(raw, { max: 4 }) : null;
const rollback = new Error("Task7 synthetic fixture rollback");
type Fixture = { actor: string; content: string; update: string };
async function fixture(run: (tx: SQL, ids: Fixture) => Promise<void>) {
  if (!db) throw new Error("Owned Task7 clone required");
  try {
    await db.begin(async (tx) => {
      const actor = randomUUID(),
        content = randomUUID(),
        update = randomUUID();
      await tx`set local role postgres`;
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
      await tx`insert into public.content_item(id,slug,type,title,summary) values(${content}::uuid,${"synthetic-" + content},'rescue_story','Synthetic story','Synthetic summary')`;
      await tx`insert into public.story_update(id,content_item_id,kind,title,occurred_at) values(${update}::uuid,${content}::uuid,'general','Synthetic public update',now())`;
      await run(tx, { actor, content, update });
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}
async function service<T>(
  tx: SQL,
  run: (tx: SQL) => Promise<T>,
  role = "service_role",
): Promise<T> {
  const sp = "cms_sp_" + randomUUID().replaceAll("-", "");
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
function social(ids: Fixture) {
  return {
    kind: "social_generate",
    content_id: ids.content,
    story_update_id: ids.update,
    platform: "facebook",
    rows: [
      {
        content_item_id: ids.content,
        story_update_id: ids.update,
        platform: "facebook",
        language: "zh-HK",
        copy_text: "Synthetic draft",
        hashtags: [],
        status: "draft",
      },
    ],
  };
}
function draft(ids: Fixture) {
  return {
    kind: "draft_generate",
    story_update_id: ids.update,
    rows: [
      {
        content_item_id: ids.content,
        story_update_id: ids.update,
        adoption_case_id: null,
        supporter_id: null,
        channel: "email",
        recipient_name: "Synthetic recipient",
        recipient_contact: "recipient@example.invalid",
        subject: "Synthetic draft",
        body: "Synthetic body",
        status: "draft",
      },
    ],
  };
}
const fee = {
  animal_type: "dog",
  item_name: "Synthetic fee",
  price_hkd: "100",
  sort_order: 0,
  is_published: false,
};
async function promote(tx: SQL, ids: Fixture, command: unknown = social(ids)) {
  return service(
    tx,
    (s) => s`select public.cms_promotion_command(${ids.actor}::uuid,${command}::jsonb) value`,
  );
}
async function content(
  tx: SQL,
  ids: Fixture,
  entity = "adoption_fee",
  operation = "upsert",
  id: string | null = null,
  payload: unknown = fee,
) {
  return service(
    tx,
    (s) =>
      s`select public.mutate_admin_content_with_audit(${ids.actor}::uuid,${entity},${operation},${id}::uuid,${payload}::jsonb) value`,
  );
}
async function state(tx: SQL) {
  const [r] =
    await tx`select jsonb_build_object('social',(select jsonb_agg(to_jsonb(t) order by id) from public.social_copy_variant t),'draft',(select jsonb_agg(to_jsonb(t) order by id) from public.recipient_notification_draft t),'fee',(select jsonb_agg(to_jsonb(t) order by id) from public.adoption_fees t),'estate',(select jsonb_agg(to_jsonb(t) order by id) from public.dog_friendly_estates t),'board',(select jsonb_agg(to_jsonb(t) order by id) from public.board_member t),'knowledge',(select jsonb_agg(to_jsonb(t) order by id) from public.knowledge_posts t),'audit',(select jsonb_agg(to_jsonb(t) order by id) from public.audit_log t)) value`;
  return r.value;
}
async function committedFixture(run: (ids: Fixture) => Promise<void>) {
  if (!db) throw new Error("Owned clone required");
  const ids = { actor: randomUUID(), content: randomUUID(), update: randomUUID() };
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${ids.actor}::uuid,${ids.actor + "@example.invalid"},now())`;
    await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${ids.actor}::uuid,${ids.actor + "@example.invalid"},'staff','active')`;
    await tx`insert into public.content_item(id,slug,type,title,summary) values(${ids.content}::uuid,${"synthetic-" + ids.content},'rescue_story','Synthetic story','Synthetic summary')`;
    await tx`insert into public.story_update(id,content_item_id,kind,title,occurred_at) values(${ids.update}::uuid,${ids.content}::uuid,'general','Synthetic update',now())`;
  });
  try {
    await run(ids);
  } finally {
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      // Only rows created by this synthetic actor in this owned clone.
      await tx`delete from public.dog_friendly_estates where id in(select entity_id::uuid from public.audit_log where actor_user_id=${ids.actor}::uuid and entity='dog_friendly_estate')`;
      await tx`delete from public.recipient_notification_draft where story_update_id=${ids.update}::uuid`;
      await tx`delete from public.social_copy_variant where content_item_id=${ids.content}::uuid`;
      await tx`delete from public.audit_log where actor_user_id=${ids.actor}::uuid`;
      await tx`delete from public.story_update where id=${ids.update}::uuid`;
      await tx`delete from public.content_item where id=${ids.content}::uuid`;
      await tx`delete from public.admin_user where auth_user_id=${ids.actor}::uuid`;
      await tx`delete from auth.users where id=${ids.actor}::uuid`;
    });
  }
}
async function race(first: (tx: SQL) => Promise<unknown>, second: (tx: SQL) => Promise<unknown>) {
  if (!db) throw new Error("Owned clone required");
  let release = () => {},
    ready = () => {},
    entered = () => {};
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    held = new Promise<void>((r) => {
      ready = r;
    }),
    competing = new Promise<void>((r) => {
      entered = r;
    });
  let firstError: unknown,
    backend = 0;
  const a = db
    .begin(async (tx) => {
      await tx`set local role postgres`;
      await first(tx);
      ready();
      await gate;
    })
    .catch((e) => {
      firstError = e;
      ready();
    });
  await held;
  if (firstError) throw firstError;
  const b = db.begin(async (tx) => {
    await tx`set local role postgres`;
    const [r] = await tx`select pg_backend_pid() id`;
    backend = r.id;
    entered();
    return second(tx);
  });
  let blocked = false;
  try {
    await competing;
    for (let i = 0; i < 100; i++) {
      const [r] = await db`select cardinality(pg_blocking_pids(${backend}::integer))>0 blocked`;
      if (r.blocked) {
        blocked = true;
        break;
      }
      await Bun.sleep(10);
    }
  } finally {
    release();
    await a;
  }
  const result = await b;
  expect(blocked).toBe(true);
  return result;
}
describe.skipIf(!db)("R01 CMS atomic forward on owned synthetic clone", () => {
  afterAll(async () => {
    await db?.close();
  });
  for (const target of ["promotion", "generic", "estate"] as const) {
    for (const mutation of ["ban", "role", "disable"] as const) {
      test(`${target} concurrent fence blocks ${mutation} before audited commit`, async () => {
        if (!db) throw new Error("Owned clone required");
        const ids = { actor: randomUUID(), content: randomUUID(), update: randomUUID() };
        let release: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let ready: () => void = () => {};
        const entered = new Promise<void>((resolve) => {
          ready = resolve;
        });
        await db.begin(async (tx) => {
          await tx`set local role postgres`;
          await tx`insert into auth.users(id,email,email_confirmed_at) values(${ids.actor}::uuid,${ids.actor + "@example.invalid"},now())`;
          await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${ids.actor}::uuid,${ids.actor + "@example.invalid"},'staff','active')`;
          await tx`insert into public.content_item(id,slug,type,title,summary) values(${ids.content}::uuid,${"synthetic-" + ids.content},'rescue_story','Synthetic story','Synthetic summary')`;
          await tx`insert into public.story_update(id,content_item_id,kind,title,occurred_at) values(${ids.update}::uuid,${ids.content}::uuid,'general','Synthetic update',now())`;
        });
        let commandError: unknown;
        const command = db
          .begin(async (tx) => {
            await tx`set local role postgres`;
            if (target === "promotion") await promote(tx, ids);
            else if (target === "generic") await content(tx, ids);
            else
              await service(
                tx,
                (s) =>
                  s`select public.mutate_dog_friendly_estate_with_audit(${ids.actor}::uuid,'create',${randomUUID()}::uuid,null,${{ estate_name: "Synthetic estate", district: "Synthetic district", notes: null, sort_order: 0 }}::jsonb)`,
              );
            ready();
            await gate;
            throw rollback;
          })
          .catch((e: unknown) => {
            if (e !== rollback) commandError = e;
            ready();
          });
        try {
          await entered;
          if (commandError) throw commandError;
          let result = "success";
          try {
            await db.begin(async (tx) => {
              await tx`set local role postgres`;
              await tx`set local lock_timeout='250ms'`;
              if (mutation === "ban")
                await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${ids.actor}::uuid`;
              else if (mutation === "role")
                await tx`update public.admin_user set role='treasurer' where auth_user_id=${ids.actor}::uuid`;
              else
                await tx`update public.admin_user set status='disabled' where auth_user_id=${ids.actor}::uuid`;
              throw rollback;
            });
          } catch (e) {
            if (e !== rollback) result = (e as { errno?: string }).errno ?? "unexpected";
          }
          expect(result).toBe("55P03");
        } finally {
          release();
          await command;
          await db.begin(async (tx) => {
            await tx`set local role postgres`;
            await tx`delete from public.story_update where id=${ids.update}::uuid`;
            await tx`delete from public.content_item where id=${ids.content}::uuid`;
            await tx`delete from public.admin_user where auth_user_id=${ids.actor}::uuid`;
            await tx`delete from auth.users where id=${ids.actor}::uuid`;
          });
        }
      });
    }
  }
  for (const target of ["promotion", "generic", "estate"] as const)
    for (const mutation of ["ban", "role", "disable"] as const) {
      test(`${target} revocation-first ${mutation} blocks then refuses without audit`, () =>
        committedFixture(async (ids) => {
          if (!db) throw new Error("Owned clone required");
          const run = (tx: SQL) =>
            target === "promotion"
              ? promote(tx, ids)
              : target === "generic"
                ? content(tx, ids)
                : service(
                    tx,
                    (s) =>
                      s`select public.mutate_dog_friendly_estate_with_audit(${ids.actor}::uuid,'create',${randomUUID()}::uuid,null,${{ estate_name: "Synthetic estate", district: "Synthetic district", notes: null, sort_order: 0 }}::jsonb)`,
                  );
          let release = () => {},
            ready = () => {};
          const gate = new Promise<void>((r) => {
              release = r;
            }),
            held = new Promise<void>((r) => {
              ready = r;
            });
          let revokeError: unknown;
          const revoke = db
            .begin(async (tx) => {
              await tx`set local role postgres`;
              if (mutation === "ban")
                await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${ids.actor}::uuid`;
              else if (mutation === "role")
                await tx`update public.admin_user set role='treasurer' where auth_user_id=${ids.actor}::uuid`;
              else
                await tx`update public.admin_user set status='disabled' where auth_user_id=${ids.actor}::uuid`;
              ready();
              await gate;
            })
            .catch((e) => {
              revokeError = e;
              ready();
            });
          try {
            await held;
            if (revokeError) throw revokeError;
            expect(
              await errno(() =>
                db!.begin(async (tx) => {
                  await tx`set local role postgres`;
                  await tx`set local lock_timeout='250ms'`;
                  await run(tx);
                }),
              ),
            ).toBe("55P03");
          } finally {
            release();
            await revoke;
          }
          const before = await state(db);
          expect(
            await errno(() =>
              db!.begin(async (tx) => {
                await tx`set local role postgres`;
                await run(tx);
              }),
            ),
          ).toBe("42501");
          expect(await state(db)).toEqual(before);
        }));
    }
  test("two concurrent draft retries create one recipient and retain each historical audit", () =>
    committedFixture(async (ids) => {
      if (!db) throw new Error("Owned clone required");
      const second = (await race(
        (tx) => promote(tx, ids, draft(ids)),
        (tx) => promote(tx, ids, draft(ids)),
      )) as { value: { count: number } }[];
      expect(second[0].value.count).toBe(0);
      const [r] =
        await db`select count(*)::int count from public.recipient_notification_draft where story_update_id=${ids.update}::uuid`;
      expect(r.count).toBe(1);
      const [a] =
        await db`select count(*)::int count from public.audit_log where actor_user_id=${ids.actor}::uuid`;
      expect(a.count).toBe(2);
    }));
  test("concurrent estate versions preserve committed winner and reject stale audited update", () =>
    committedFixture(async (ids) => {
      if (!db) throw new Error("Owned clone required");
      const id = randomUUID(),
        payload = {
          estate_name: "Synthetic estate",
          district: "Synthetic district",
          notes: null,
          sort_order: 0,
        };
      const run = (tx: SQL, command: string, version: number | null, body: unknown) =>
        service(
          tx,
          (s) =>
            s`select public.mutate_dog_friendly_estate_with_audit(${ids.actor}::uuid,${command},${id}::uuid,${version}::integer,${body}::jsonb) value`,
        );
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await run(tx, "create", null, payload);
      });
      expect(
        await race(
          (tx) => run(tx, "update", 1, { ...payload, notes: "Synthetic winner" }),
          (tx) => errno(() => run(tx, "update", 1, { ...payload, notes: "Synthetic loser" })),
        ),
      ).toBe("P4090");
      const [r] =
        await db`select notes,version,is_published from public.dog_friendly_estates where id=${id}::uuid`;
      expect(r).toEqual({ notes: "Synthetic winner", version: 2, is_published: false });
      const [a] = await db`select count(*)::int count from public.audit_log where entity_id=${id}`;
      expect(a.count).toBe(2);
    }));
  for (const target of ["draft", "estate"] as const)
    test(`${target} audit failure preserves rows and versions`, () =>
      fixture(async (tx, ids) => {
        await tx`alter table public.audit_log add constraint task7_audit_failure check(action='synthetic.never') not valid`;
        const before = await state(tx);
        expect(
          await errno(() =>
            target === "draft"
              ? promote(tx, ids, draft(ids))
              : service(
                  tx,
                  (s) =>
                    s`select public.mutate_dog_friendly_estate_with_audit(${ids.actor}::uuid,'create',${randomUUID()}::uuid,null,${{ estate_name: "Synthetic estate", district: "Synthetic district", notes: null, sort_order: 0 }}::jsonb)`,
                ),
          ),
        ).toBe("23514");
        expect(await state(tx)).toEqual(before);
      }));
  test("missing-target promotion creates synthetic draft and actor audit atomically", () =>
    fixture(async (tx, ids) => {
      const [r] = await promote(tx, ids);
      expect(r.value).toEqual({ count: 1 });
      const [row] =
        await tx`select status,created_by from public.social_copy_variant where content_item_id=${ids.content}::uuid`;
      expect(row.status).toBe("draft");
      expect(row.created_by).toBe(ids.actor);
      const [audit] =
        await tx`select actor_user_id from public.audit_log where entity_id=${ids.content}`;
      expect(audit.actor_user_id).toBe(ids.actor);
    }));
  test("missing-target generic content preserves fee publication audit contract", () =>
    fixture(async (tx, ids) => {
      const [r] = await content(tx, ids);
      expect(r.value.item_name).toBe("Synthetic fee");
      expect(r.value.is_published).toBe(false);
      const audits =
        await tx`select action,actor_user_id from public.audit_log where entity_id=${r.value.id} order by action`;
      expect(audits.map((a: { action: string }) => a.action)).toEqual([
        "adoption_fee.create",
        "adoption_fee.unpublish",
      ]);
      expect(audits.every((a: { actor_user_id: string }) => a.actor_user_id === ids.actor)).toBe(
        true,
      );
    }));
  test("recipient index prerequisite draft retry creates one live recipient without deleting evidence", () =>
    fixture(async (tx, ids) => {
      const [a] = await promote(tx, ids, draft(ids));
      const [b] = await promote(tx, ids, draft(ids));
      expect(a.value).toEqual({ count: 1 });
      expect(b.value).toEqual({ count: 0 });
      const [r] =
        await tx`select count(*)::int count from public.recipient_notification_draft where story_update_id=${ids.update}::uuid`;
      expect(r.count).toBe(1);
    }));
  test("draft status is an audited state change and does not send", () =>
    fixture(async (tx, ids) => {
      await promote(tx, ids, draft(ids));
      const [row] =
        await tx`select id from public.recipient_notification_draft where story_update_id=${ids.update}::uuid`;
      const [r] = await promote(tx, ids, { kind: "draft_status", id: row.id, status: "copied" });
      expect(r.value).toEqual({ ok: true });
      const [after] =
        await tx`select status,updated_by from public.recipient_notification_draft where id=${row.id}::uuid`;
      expect(after).toEqual({ status: "copied", updated_by: ids.actor });
      const [audit] =
        await tx`select count(*)::int count from public.audit_log where action='content.notification_draft.status' and entity_id=${row.id}`;
      expect(audit.count).toBe(1);
    }));
  test("social status and repeated generation retain historical audit behavior", () =>
    fixture(async (tx, ids) => {
      await promote(tx, ids);
      await promote(tx, ids);
      const rows =
        await tx`select id from public.social_copy_variant where content_item_id=${ids.content}::uuid`;
      expect(rows.length).toBe(2);
      const [r] = await promote(tx, ids, {
        kind: "social_status",
        id: rows[0].id,
        status: "archived",
      });
      expect(r.value).toEqual({ ok: true });
      const [after] =
        await tx`select status,updated_by from public.social_copy_variant where id=${rows[0].id}::uuid`;
      expect(after).toEqual({ status: "archived", updated_by: ids.actor });
    }));
  test("identity mismatch and malformed promotion cannot partially mutate", () =>
    fixture(async (tx, ids) => {
      const bad = social(ids);
      bad.rows[0].content_item_id = randomUUID();
      const before = await state(tx);
      for (const command of [
        bad,
        { kind: "unknown" },
        { kind: "social_generate", content_id: ids.content, rows: "invalid" },
        { kind: "draft_status", id: randomUUID(), status: "unknown" },
      ]) {
        expect(await errno(() => promote(tx, ids, command))).toBe("22023");
        expect(await state(tx)).toEqual(before);
      }
    }));
  test("all generic entities preserve row identity and actor audit", () =>
    fixture(async (tx, ids) => {
      const cases = [
        {
          entity: "dog_friendly_estate",
          payload: {
            estate_name: "Synthetic estate",
            district: "Synthetic district",
            notes: null,
            sort_order: 0,
            is_published: false,
          },
        },
        {
          entity: "board_member",
          payload: {
            name: "Synthetic board",
            role_title: "Synthetic title",
            sort_order: 0,
            effective_date: "2026-10-02",
          },
        },
        {
          entity: "knowledge_post",
          payload: {
            title: "Synthetic knowledge",
            topic: "Synthetic topic",
            short_intro: "Synthetic introduction",
            source_name: null,
            external_url: "https://example.invalid/synthetic-knowledge",
            document_asset_id: null,
            zh_hk_document_asset_id: null,
            en_document_asset_id: null,
            is_published: false,
            sort_order: 0,
          },
        },
      ];
      for (const item of cases) {
        const [a] = await content(tx, ids, item.entity, "upsert", null, item.payload);
        const [b] = await content(tx, ids, item.entity, "upsert", a.value.id, item.payload);
        expect(b.value.id).toBe(a.value.id);
        const audits =
          await tx`select actor_user_id from public.audit_log where entity_id=${a.value.id}`;
        expect(audits.length).toBe(item.entity === "dog_friendly_estate" ? 4 : 2);
        expect(audits.every((r: { actor_user_id: string }) => r.actor_user_id === ids.actor)).toBe(
          true,
        );
        const [c] = await content(
          tx,
          ids,
          item.entity,
          item.entity === "board_member" ? "deactivate" : "delete",
          a.value.id,
          {},
        );
        expect(c.value.id).toBe(a.value.id);
      }
    }));
  test("estate wrapper preserves create retry, stale version and separate publication", () =>
    fixture(async (tx, ids) => {
      const id = randomUUID(),
        payload = {
          estate_name: "Synthetic estate",
          district: "Synthetic district",
          notes: null,
          sort_order: 0,
        };
      const run = (command: string, version: number | null, body: unknown) =>
        service(
          tx,
          (s) =>
            s`select public.mutate_dog_friendly_estate_with_audit(${ids.actor}::uuid,${command},${id}::uuid,${version}::integer,${body}::jsonb) value`,
        );
      const [a] = await run("create", null, payload);
      const [b] = await run("create", null, payload);
      expect(a.value).toEqual(b.value);
      expect(a.value.is_published).toBe(false);
      expect(a.value.version).toBe(1);
      const [c] = await run("update", 1, { ...payload, notes: "Synthetic changed" });
      expect(c.value.version).toBe(2);
      expect(c.value.is_published).toBe(false);
      const before = await state(tx);
      expect(await errno(() => run("update", 1, payload))).toBe("P4090");
      expect(await state(tx)).toEqual(before);
      const [d] = await run("publication", 2, { is_published: false });
      expect(d.value.version).toBe(3);
      expect(d.value.is_published).toBe(false);
      const [audit] =
        await tx`select count(*)::int count from public.audit_log where entity_id=${id}`;
      expect(audit.count).toBe(3);
    }));
  test("effective Auth access remains denied to direct service SQL", () =>
    fixture(async (tx, ids) => {
      const [p] =
        await tx`select has_any_column_privilege('service_role','auth.users','SELECT') sel,has_any_column_privilege('service_role','auth.users','UPDATE') upd`;
      expect(p).toEqual({ sel: false, upd: false });
      expect(
        await errno(() =>
          service(tx, (s) => s`select banned_until from auth.users where id=${ids.actor}::uuid`),
        ),
      ).toBe("42501");
      expect(
        await errno(() =>
          service(
            tx,
            (s) => s`update auth.users set banned_until=null where id=${ids.actor}::uuid`,
          ),
        ),
      ).toBe("42501");
    }));
  test("qualified commands ignore temporary table shadows", () =>
    fixture(async (tx, ids) => {
      await tx`create temporary table admin_user(auth_user_id uuid,status text,role text)`;
      await tx`create temporary table social_copy_variant(id uuid)`;
      await tx`create temporary table adoption_fees(id uuid)`;
      const [r] = await promote(tx, ids);
      expect(r.value.count).toBe(1);
      const [f] = await content(tx, ids);
      expect(f.value.item_name).toBe("Synthetic fee");
    }));
  test("generic actor rejects banned confirmed staff without mutation", () =>
    fixture(async (tx, ids) => {
      await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${ids.actor}::uuid`;
      const before = await state(tx);
      expect(await errno(() => content(tx, ids))).toBe("42501");
      expect(await state(tx)).toEqual(before);
    }));
  test("estate actor rejects banned confirmed staff preserving version and audit", () =>
    fixture(async (tx, ids) => {
      await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${ids.actor}::uuid`;
      const before = await state(tx);
      expect(
        await errno(() =>
          service(
            tx,
            (s) =>
              s`select public.mutate_dog_friendly_estate_with_audit(${ids.actor}::uuid,'create',${randomUUID()}::uuid,null,${{ estate_name: "Synthetic estate", district: "Synthetic district", notes: null, sort_order: 0 }}::jsonb)`,
          ),
        ),
      ).toBe("42501");
      expect(await state(tx)).toEqual(before);
    }));
  for (const target of ["promotion", "generic"] as const) {
    for (const denial of ["banned", "unconfirmed", "disabled", "role"] as const) {
      test(`${target} actor refuses ${denial} before any audited mutation`, () =>
        fixture(async (tx, ids) => {
          if (denial === "banned")
            await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${ids.actor}::uuid`;
          if (denial === "unconfirmed")
            await tx`update auth.users set email_confirmed_at=null where id=${ids.actor}::uuid`;
          if (denial === "disabled")
            await tx`update public.admin_user set status='disabled' where auth_user_id=${ids.actor}::uuid`;
          if (denial === "role")
            await tx`update public.admin_user set role='treasurer' where auth_user_id=${ids.actor}::uuid`;
          const before = await state(tx);
          expect(
            await errno(() => (target === "promotion" ? promote(tx, ids) : content(tx, ids))),
          ).toBe("42501");
          expect(await state(tx)).toEqual(before);
        }));
    }
    test(`${target} audit failure rolls back every mutation`, () =>
      fixture(async (tx, ids) => {
        await tx`alter table public.audit_log add constraint task7_forced_audit_failure check (action='synthetic.never') not valid`;
        const before = await state(tx);
        expect(
          await errno(() => (target === "promotion" ? promote(tx, ids) : content(tx, ids))),
        ).toBe("23514");
        expect(await state(tx)).toEqual(before);
      }));
  }
  for (const role of ["anon", "authenticated"])
    test(`direct ${role} cannot execute either atomic command`, () =>
      fixture(async (tx, ids) => {
        const before = await state(tx);
        expect(
          await errno(() =>
            service(
              tx,
              (s) =>
                s`select public.cms_promotion_command(${ids.actor}::uuid,${social(ids)}::jsonb)`,
              role,
            ),
          ),
        ).toBe("42501");
        expect(
          await errno(() =>
            service(
              tx,
              (s) =>
                s`select public.mutate_admin_content_with_audit(${ids.actor}::uuid,'adoption_fee','upsert',null,${fee}::jsonb)`,
              role,
            ),
          ),
        ).toBe("42501");
        expect(await state(tx)).toEqual(before);
      }));
});
