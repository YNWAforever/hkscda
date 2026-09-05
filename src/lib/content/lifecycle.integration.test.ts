import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";

const databaseUrl = process.env.CMS_LIFECYCLE_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl) && process.env.CMS_LIFECYCLE_TEST_ALLOW_LOCAL_FIXTURES === "1";
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.search || target.hash)
    throw new Error("CMS integration URL must not contain connection-routing overrides");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    !["postgres:", "postgresql:"].includes(target.protocol)
  ) {
    throw new Error(
      "CMS lifecycle integration requires an explicitly configured loopback Postgres target",
    );
  }
}
const actor = crypto.randomUUID();
const createdIds: string[] = [];
let db: SQL;
type Result = { content_id: string; revision_id: string; version: number; child_id?: string };
async function createFixture() {
  const [row] =
    await db`select public.create_content_revision_with_audit(${actor}::uuid, ${JSON.stringify({ slug: `cms-${crypto.randomUUID()}`, type: "event", title: "Synthetic review fixture", summary: "Disposable local CMS acceptance fixture" })}::jsonb) as result`;
  const result = row.result as Result;
  createdIds.push(result.content_id);
  return result;
}
async function addCover(item: Result) {
  const [row] =
    await db`select public.mutate_content_revision_with_audit(${actor}::uuid, ${item.content_id}::uuid, ${item.version}, 'create_media', ${JSON.stringify({ storageBucket: "content-media", storagePath: `${item.content_id}/synthetic.jpg`, altText: "Synthetic fixture", isCover: true })}::jsonb) as result`;
  return row.result as Result;
}
async function publish(item: Result, key: string) {
  const [row] =
    await db`select public.publish_content_revision(${actor}::uuid, ${item.content_id}::uuid, ${item.revision_id}::uuid, ${item.version}, ${key}) as result`;
  return row.result as Result;
}

describe.skipIf(!enabled)("CMS lifecycle isolated database acceptance", () => {
  beforeAll(async () => {
    db = new SQL(databaseUrl!, { max: 4 });
    await db`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${`cms-${actor}@example.test`},'staff','active')`;
  });
  afterAll(async () => {
    if (!db) return;
    for (const id of createdIds) {
      await db`delete from public.content_publish_request where content_item_id=${id}::uuid`;
      await db`update public.content_item set published_revision_id=null,draft_revision_id=null where id=${id}::uuid`;
      await db`delete from public.content_item where id=${id}::uuid`;
    }
    await db`delete from public.audit_log where actor_user_id=${actor}::uuid`;
    await db`delete from public.admin_user where auth_user_id=${actor}::uuid`;
    await db.close();
  });
  test("audit constraint failure rolls back content and version", async () => {
    const item = await createFixture();
    await expect(
      db.begin(async (tx) => {
        await tx.unsafe(
          `alter table public.audit_log add constraint cms_fixture_audit_rejection check (actor_user_id <> '${actor}'::uuid) not valid`,
        );
        await tx`select public.mutate_content_revision_with_audit(${actor}::uuid,${item.content_id}::uuid,${item.version},'save_content','{"title":"Must roll back"}'::jsonb)`;
      }),
    ).rejects.toThrow();
    const [after] =
      await db`select version,title from public.content_item where id=${item.content_id}::uuid`;
    expect(after.version).toBe(item.version);
    expect(after.title).toBe("Synthetic review fixture");
  });
  test("two writers using the same parent version produce one winner", async () => {
    const item = await createFixture();
    const outcomes = await Promise.allSettled(
      ["First", "Second"].map(
        (title) =>
          db`select public.mutate_content_revision_with_audit(${actor}::uuid,${item.content_id}::uuid,${item.version},'save_content',${JSON.stringify({ title })}::jsonb)`,
      ),
    );
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [after] =
      await db`select version from public.content_item where id=${item.content_id}::uuid`;
    expect(after.version).toBe(item.version + 1);
  });
  test("publication replay is stable and changed payload conflicts", async () => {
    const item = await addCover(await createFixture());
    const key = crypto.randomUUID();
    const first = await publish(item, key);
    expect(await publish(item, key)).toEqual(first);
    await expect(publish({ ...item, version: item.version + 1 }, key)).rejects.toThrow();
    const [count] =
      await db`select count(*)::integer as count from public.audit_log where entity_id=${item.content_id} and action='content.publish'`;
    expect(count.count).toBe(1);
  });
  test("draft slug edits do not release the currently published URL", async () => {
    const first = await addCover(await createFixture());
    const [original] =
      await db`select slug from public.content_item where id=${first.content_id}::uuid`;
    const live = await publish(first, crypto.randomUUID());
    await db`select public.mutate_content_revision_with_audit(${actor}::uuid,${first.content_id}::uuid,${live.version},'save_content',${JSON.stringify({ slug: `cms-new-${crypto.randomUUID()}` })}::jsonb)`;
    const second = await createFixture();
    const [saved] =
      await db`select public.mutate_content_revision_with_audit(${actor}::uuid,${second.content_id}::uuid,${second.version},'save_content',${JSON.stringify({ slug: original.slug })}::jsonb) as result`;
    const ready = await addCover(saved.result as Result);
    await expect(publish(ready, crypto.randomUUID())).rejects.toThrow();
    const [after] =
      await db`select published_revision_id,version from public.content_item where id=${second.content_id}::uuid`;
    expect(after.published_revision_id).toBeNull();
    expect(after.version).toBe(ready.version);
  });
  test("concurrent publication of historical identical slugs has one winner", async () => {
    const first = await addCover(await createFixture());
    const [original] =
      await db`select slug from public.content_item where id=${first.content_id}::uuid`;
    const move = async (item: Result, slug: string) => {
      const [row] =
        await db`select public.mutate_content_revision_with_audit(${actor}::uuid,${item.content_id}::uuid,${item.version},'save_content',${JSON.stringify({ slug })}::jsonb) as result`;
      return row.result as Result;
    };
    const firstMoved = await move(first, `cms-moved-${crypto.randomUUID()}`);
    const second = await addCover(await move(await createFixture(), original.slug));
    const secondMoved = await move(second, `cms-moved-${crypto.randomUUID()}`);
    const outcomes = await Promise.allSettled([
      publish({ ...first, version: firstMoved.version }, crypto.randomUUID()),
      publish({ ...second, version: secondMoved.version }, crypto.randomUUID()),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [count] =
      await db`select count(*)::int as total from public.content_item where status='published' and published_slug=${original.slug}`;
    expect(count.total).toBe(1);
  });
  test("profile-free restore creates a new revision without changing publication", async () => {
    const item = await addCover(await createFixture());
    const first = await publish(item, crypto.randomUUID());
    const [row] =
      await db`select public.restore_content_revision(${actor}::uuid,${item.content_id}::uuid,${item.revision_id}::uuid,${first.version}) as result`;
    expect((row.result as Result).revision_id).not.toBe(item.revision_id);
    const [after] =
      await db`select published_revision_id from public.content_item where id=${item.content_id}::uuid`;
    expect(after.published_revision_id).toBe(item.revision_id);
  });
  test.each([
    ["content", "title", "  "],
    ["content", "slug", "  "],
    ["content", "summary", "  "],
    ["profile", "rescue_region", "  "],
    ["profile", "public_map_label", "  "],
    ["profile", "public_lat", null],
    ["profile", "public_lng", null],
  ] as const)("publication rejects invalid saved %s.%s", async (section, field, value) => {
    const item = await addCover(await createFixture());
    const [source] =
      await db`select public_snapshot,authoring_snapshot,created_by from public.content_revision where id=${item.revision_id}::uuid`;
    const snapshot = source.public_snapshot as {
      content: Record<string, unknown>;
      profile: Record<string, unknown>;
    };
    snapshot.content.type = "rescue_story";
    snapshot.profile = {
      animal_type: "cat",
      public_status: "rescued",
      rescue_region: "Synthetic district",
      show_on_map: true,
      public_map_label: "Approximate location",
      public_lat: 22,
      public_lng: 114,
    };
    snapshot[section][field] = value;
    const invalidId = crypto.randomUUID();
    await db`insert into public.content_revision(id,content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by) values(${invalidId}::uuid,${item.content_id}::uuid,0,'synthetic_invalid_snapshot',${JSON.stringify(source.authoring_snapshot)}::jsonb,${JSON.stringify(snapshot)}::jsonb,${source.created_by}::uuid)`;
    await expect(
      publish({ ...item, revision_id: invalidId }, crypto.randomUUID()),
    ).rejects.toThrow();
    const [after] =
      await db`select version,published_revision_id from public.content_item where id=${item.content_id}::uuid`;
    expect(after.version).toBe(item.version);
    expect(after.published_revision_id).toBeNull();
  });
  test("media finalization rejects an update removed from current authoring by restore", async () => {
    const item = await addCover(await createFixture());
    const [update] =
      await db`select public.mutate_content_revision_with_audit(${actor}::uuid,${item.content_id}::uuid,${item.version},'create_update','{"kind":"general","title":"Synthetic update","visibility":"public","occurredAt":"2026-09-05T00:00:00Z"}'::jsonb) as result`;
    const updated = update.result as Result;
    const [restored] =
      await db`select public.restore_content_revision(${actor}::uuid,${item.content_id}::uuid,${item.revision_id}::uuid,${updated.version}) as result`;
    await expect(
      db`select public.mutate_content_revision_with_audit(${actor}::uuid,${item.content_id}::uuid,${(restored.result as Result).version},'create_media',${JSON.stringify({ storyUpdateId: updated.child_id, storageBucket: "content-media", storagePath: `${item.content_id}/removed.jpg`, altText: "Removed update" })}::jsonb)`,
    ).rejects.toThrow();
  });
  test("anon and authenticated cannot mutate revision tables or call lifecycle RPCs", async () => {
    for (const role of ["anon", "authenticated"]) {
      const [access] =
        await db`select has_table_privilege(${role},'public.content_revision','INSERT') as insert_allowed, has_function_privilege(${role},'public.publish_content_revision(uuid,uuid,uuid,integer,text)','EXECUTE') as execute_allowed`;
      expect(access.insert_allowed).toBe(false);
      expect(access.execute_allowed).toBe(false);
    }
  });
});
