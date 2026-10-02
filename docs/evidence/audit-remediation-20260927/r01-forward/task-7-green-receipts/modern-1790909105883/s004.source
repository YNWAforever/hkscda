import { afterAll, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";

const raw =
  process.env.R01_CMS_ALLOW_LOCAL_FIXTURES === "1"
    ? process.env.R01_CMS_TEST_DATABASE_URL
    : undefined;
if (raw) assertCloneUrl(raw);
const db = raw ? new SQL(raw, { max: 4 }) : null;
const rollback = new Error("Task7 knowledge fixture rollback");
afterAll(async () => {
  await db?.close();
});

test.skipIf(!db)("generic published knowledge rejects an unpublished PDF atomically", async () => {
  if (!db) throw new Error("Owned clone required");
  try {
    await db.begin(async (tx) => {
      const actor = randomUUID(),
        asset = randomUUID();
      await tx`set local role postgres`;
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
      await tx`insert into public.document_assets(id,kind,title,language,object_path,byte_size,is_published) values(${asset}::uuid,'annual_report','Synthetic PDF','zh-HK',${"synthetic-" + asset + ".pdf"},100,false)`;
      const payload = {
        title: "Synthetic knowledge",
        topic: "Synthetic",
        short_intro: "Synthetic intro",
        source_name: "Synthetic",
        external_url: null,
        document_asset_id: asset,
        zh_hk_document_asset_id: null,
        en_document_asset_id: null,
        is_published: true,
        sort_order: 0,
      };
      await tx`savepoint knowledge_probe`;
      let code = "success";
      try {
        await tx`set local role service_role`;
        await tx`select public.mutate_admin_content_with_audit(${actor}::uuid,'knowledge_post','upsert',null::uuid,${payload}::jsonb)`;
        await tx`set local role postgres`;
      } catch (e) {
        code = (e as { errno?: string }).errno ?? "unexpected";
        await tx`rollback to savepoint knowledge_probe`;
      }
      await tx`release savepoint knowledge_probe`;
      const [rows] =
        await tx`select (select count(*)::integer from public.knowledge_posts where document_asset_id=${asset}::uuid) posts,(select count(*)::integer from public.audit_log where actor_user_id=${actor}::uuid) audits`;
      console.log(
        JSON.stringify({ probe: "unpublished PDF", code, posts: rows.posts, audits: rows.audits }),
      );
      expect(code).toBe("23514");
      expect(rows.posts).toBe(0);
      expect(rows.audits).toBe(0);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
});

async function knowledgeFixture(run: (tx: SQL, actor: string, assets: string[]) => Promise<void>) {
  if (!db) throw new Error("Owned clone required");
  try {
    await db.begin(async (tx) => {
      const actor = randomUUID(),
        assets = [randomUUID(), randomUUID()];
      await tx`set local role postgres`;
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      for (const asset of assets)
        await tx`insert into public.document_assets(id,kind,title,language,object_path,byte_size,is_published) values(${asset}::uuid,'annual_report','Synthetic PDF','zh-HK',${"synthetic-" + asset + ".pdf"},100,true)`;
      await run(tx, actor, assets);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}
function knowledgePayload(assets: string[], kind = "single", published = true) {
  return {
    title: "Synthetic knowledge",
    topic: "Synthetic",
    short_intro: "Synthetic intro",
    source_name: "Synthetic",
    external_url: kind === "external" ? "https://example.invalid/knowledge" : null,
    document_asset_id: kind === "single" ? assets[0] : null,
    zh_hk_document_asset_id: kind === "pair" ? assets[0] : null,
    en_document_asset_id: kind === "pair" ? assets[1] : null,
    is_published: published,
    sort_order: 0,
  };
}
async function mutateKnowledge(tx: SQL, actor: string, payload: unknown, id: string | null = null) {
  await tx`savepoint knowledge_call`;
  try {
    await tx`set local role service_role`;
    const [r] =
      await tx`select public.mutate_admin_content_with_audit(${actor}::uuid,'knowledge_post','upsert',${id}::uuid,${payload}::jsonb) value`;
    await tx`set local role postgres`;
    await tx`release savepoint knowledge_call`;
    return r.value;
  } catch (e) {
    await tx`rollback to savepoint knowledge_call`;
    await tx`release savepoint knowledge_call`;
    throw e;
  }
}
for (const kind of ["single", "pair", "external", "draft"])
  test.skipIf(!db)(`knowledge ${kind} create and update preserve result and audit`, () =>
    knowledgeFixture(async (tx, actor, assets) => {
      if (kind === "draft")
        await tx`update public.document_assets set is_published=false where id=${assets[0]}::uuid`;
      const payload = knowledgePayload(
        assets,
        kind === "draft" ? "single" : kind,
        kind !== "draft",
      );
      const first = await mutateKnowledge(tx, actor, payload);
      expect(first.is_published).toBe(payload.is_published);
      const second = await mutateKnowledge(
        tx,
        actor,
        { ...payload, title: "Synthetic updated" },
        first.id,
      );
      expect(second.id).toBe(first.id);
      expect(second.title).toBe("Synthetic updated");
      const audits =
        await tx`select action,entity_id from public.audit_log where actor_user_id=${actor}::uuid order by action`;
      expect(audits).toEqual([
        { action: "knowledge_post.create", entity_id: first.id },
        { action: "knowledge_post.update", entity_id: first.id },
      ]);
    }),
  );
test.skipIf(!db)(
  "knowledge pair checks every referenced published asset and preserves update",
  () =>
    knowledgeFixture(async (tx, actor, assets) => {
      const draft = knowledgePayload(assets, "pair", false);
      const first = await mutateKnowledge(tx, actor, draft);
      await tx`update public.document_assets set is_published=false where id=${assets[1]}::uuid`;
      let code = "success",
        message = "";
      try {
        await mutateKnowledge(tx, actor, { ...draft, is_published: true }, first.id);
      } catch (e) {
        code = (e as { errno?: string }).errno ?? "unexpected";
        message = (e as Error).message;
      }
      expect(code).toBe("23514");
      expect(message).toContain("Publish the PDF asset before publishing its knowledge post");
      const [after] =
        await tx`select is_published from public.knowledge_posts where id=${first.id}::uuid`;
      expect(after.is_published).toBe(false);
      const [audit] =
        await tx`select count(*)::integer count from public.audit_log where actor_user_id=${actor}::uuid`;
      expect(audit.count).toBe(1);
    }),
);
test.skipIf(!db)("knowledge missing post retains P0002 before asset publication check", () =>
  knowledgeFixture(async (tx, actor, assets) => {
    await tx`update public.document_assets set is_published=false where id=${assets[0]}::uuid`;
    let code = "success";
    try {
      await mutateKnowledge(tx, actor, knowledgePayload(assets), randomUUID());
    } catch (e) {
      code = (e as { errno?: string }).errno ?? "unexpected";
    }
    expect(code).toBe("P0002");
    const [r] =
      await tx`select count(*)::integer count from public.audit_log where actor_user_id=${actor}::uuid`;
    expect(r.count).toBe(0);
  }),
);
test.skipIf(!db)("knowledge asset publication fence preserves audit-failure atomic rollback", () =>
  knowledgeFixture(async (tx, actor, assets) => {
    await tx.unsafe(
      "create function public.task7_knowledge_audit_fail() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure' using errcode='P0001'; end $$; create trigger task7_knowledge_audit_fail before insert on public.audit_log for each row execute function public.task7_knowledge_audit_fail()",
    );
    let code = "success";
    try {
      await mutateKnowledge(tx, actor, knowledgePayload(assets));
    } catch (e) {
      code = (e as { errno?: string }).errno ?? "unexpected";
    }
    expect(code).toBe("P0001");
    const [r] =
      await tx`select (select count(*)::integer from public.knowledge_posts where document_asset_id=${assets[0]}::uuid) posts,(select count(*)::integer from public.audit_log where actor_user_id=${actor}::uuid) audits,(select bool_and(is_published) from public.document_assets where id in (${assets[0]}::uuid,${assets[1]}::uuid)) assets_published`;
    expect(r).toEqual({ posts: 0, audits: 0, assets_published: true });
  }),
);
test.skipIf(!db)("knowledge duplicate pair references lock one actual asset", () =>
  knowledgeFixture(async (tx, actor, assets) => {
    const result = await mutateKnowledge(
      tx,
      actor,
      knowledgePayload([assets[0], assets[0]], "pair"),
    );
    expect(result.zh_hk_document_asset_id).toBe(assets[0]);
    expect(result.en_document_asset_id).toBe(assets[0]);
  }),
);
test.skipIf(!db)("knowledge asset lock ignores temporary document table shadows", () =>
  knowledgeFixture(async (tx, actor, assets) => {
    await tx.unsafe(
      "create temporary table document_assets(id uuid,is_published boolean) on commit drop",
    );
    await tx`insert into pg_temp.document_assets(id,is_published) values(${assets[0]}::uuid,false)`;
    expect((await mutateKnowledge(tx, actor, knowledgePayload(assets))).is_published).toBe(true);
  }),
);

test.skipIf(!db)(
  "asset unpublish first blocks then refuses knowledge publication atomically",
  async () => {
    if (!db) throw new Error("Owned clone required");
    const actor = randomUUID(),
      asset = randomUUID();
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
      await tx`insert into public.document_assets(id,kind,title,language,object_path,byte_size,is_published) values(${asset}::uuid,'annual_report','Synthetic PDF','zh-HK',${"synthetic-" + asset + ".pdf"},100,true)`;
    });
    let release = () => {},
      ready = () => {},
      entered = () => {},
      backend = 0;
    const gate = new Promise<void>((r) => (release = r)),
      held = new Promise<void>((r) => (ready = r)),
      competing = new Promise<void>((r) => (entered = r));
    const unpublish = db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`update public.document_assets set is_published=false where id=${asset}::uuid`;
      ready();
      await gate;
    });
    let command: Promise<string> | undefined;
    try {
      await held;
      command = db
        .begin(async (tx) => {
          const [r] = await tx`select pg_backend_pid() id`;
          backend = r.id;
          entered();
          await tx`set local role service_role`;
          await tx`select public.mutate_admin_content_with_audit(${actor}::uuid,'knowledge_post','upsert',null::uuid,${knowledgePayload([asset])}::jsonb)`;
          return "success";
        })
        .catch((e) => (e as { errno?: string }).errno ?? "unexpected");
      await competing;
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const [r] = await db`select cardinality(pg_blocking_pids(${backend}::integer))>0 blocked`;
        if (r.blocked) {
          blocked = true;
          break;
        }
        await Bun.sleep(10);
      }
      release();
      await unpublish;
      expect(blocked).toBe(true);
      expect(await command).toBe("23514");
      const [r] =
        await db`select (select count(*)::integer from public.knowledge_posts where document_asset_id=${asset}::uuid) posts,(select count(*)::integer from public.audit_log where actor_user_id=${actor}::uuid) audits`;
      expect(r).toEqual({ posts: 0, audits: 0 });
    } finally {
      release();
      await unpublish;
      await command;
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx`delete from public.audit_log where actor_user_id=${actor}::uuid`;
        await tx`delete from public.knowledge_posts where document_asset_id=${asset}::uuid`;
        await tx`delete from public.document_assets where id=${asset}::uuid`;
        await tx`delete from public.admin_user where auth_user_id=${actor}::uuid`;
        await tx`delete from auth.users where id=${actor}::uuid`;
      });
    }
  },
);

test.skipIf(!db)(
  "knowledge publish holds referenced asset against concurrent unpublish",
  async () => {
    if (!db) throw new Error("Owned clone required");
    const actor = randomUUID(),
      asset = randomUUID();
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
      await tx`insert into public.document_assets(id,kind,title,language,object_path,byte_size,is_published) values(${asset}::uuid,'annual_report','Synthetic PDF','zh-HK',${"synthetic-" + asset + ".pdf"},100,true)`;
    });
    let release = () => {},
      ready = () => {},
      entered = () => {},
      commandError: unknown,
      backend = 0;
    const gate = new Promise<void>((r) => (release = r)),
      held = new Promise<void>((r) => (ready = r)),
      competing = new Promise<void>((r) => (entered = r));
    const command = db
      .begin(async (tx) => {
        await tx`set local role service_role`;
        const payload = {
          title: "Synthetic knowledge",
          topic: "Synthetic",
          short_intro: "Synthetic intro",
          source_name: "Synthetic",
          external_url: null,
          document_asset_id: asset,
          zh_hk_document_asset_id: null,
          en_document_asset_id: null,
          is_published: true,
          sort_order: 0,
        };
        await tx`select public.mutate_admin_content_with_audit(${actor}::uuid,'knowledge_post','upsert',null::uuid,${payload}::jsonb)`;
        ready();
        await gate;
        throw rollback;
      })
      .catch((e) => {
        if (e !== rollback) commandError = e;
        ready();
      });
    let unpublish: Promise<void> | undefined;
    try {
      await held;
      if (commandError) throw commandError;
      unpublish = db
        .begin(async (tx) => {
          await tx`set local role postgres`;
          const [r] = await tx`select pg_backend_pid() id`;
          backend = r.id;
          entered();
          await tx`update public.document_assets set is_published=false where id=${asset}::uuid`;
          throw rollback;
        })
        .catch((e) => {
          if (e !== rollback) throw e;
        });
      await competing;
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const [r] = await db`select cardinality(pg_blocking_pids(${backend}::integer))>0 blocked`;
        if (r.blocked) {
          blocked = true;
          break;
        }
        await Bun.sleep(10);
      }
      console.log(JSON.stringify({ probe: "command-first asset unpublish", blocked }));
      expect(blocked).toBe(true);
    } finally {
      release();
      await command;
      await unpublish;
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx`delete from public.audit_log where actor_user_id=${actor}::uuid`;
        await tx`delete from public.knowledge_posts where document_asset_id=${asset}::uuid`;
        await tx`delete from public.document_assets where id=${asset}::uuid`;
        await tx`delete from public.admin_user where auth_user_id=${actor}::uuid`;
        await tx`delete from auth.users where id=${actor}::uuid`;
      });
    }
  },
);
