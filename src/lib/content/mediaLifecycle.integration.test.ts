import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createContentMediaLifecycle } from "./mediaLifecycle.server";
import { createSupabaseContentMediaPorts } from "./mediaLifecycle.repository.server";
const databaseUrl = process.env.CMS_LIFECYCLE_TEST_DATABASE_URL;
const storageUrl = process.env.CMS_MEDIA_TEST_URL;
const storageKey = process.env.CMS_MEDIA_TEST_SERVICE_ROLE_KEY;
for (const value of [databaseUrl, storageUrl]) {
  if (!value) continue;
  const target = new URL(value);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    !["postgres:", "postgresql:", "http:", "https:"].includes(target.protocol) ||
    target.search ||
    target.hash
  )
    throw new Error(
      "CMS media acceptance requires explicit loopback targets without routing overrides",
    );
}
const enabled =
  Boolean(databaseUrl && storageUrl && storageKey) &&
  process.env.CMS_LIFECYCLE_TEST_ALLOW_LOCAL_FIXTURES === "1";
const actor = crypto.randomUUID();
const ids: string[] = [];
let db: SQL;
let client: SupabaseClient;
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
    "base64",
  ),
);
type Created = { content_id: string; version: number; revision_id: string };
async function createFixture() {
  const [row] =
    await db`select public.create_content_revision_with_audit(${actor}::uuid,${JSON.stringify({ slug: `cms-media-${crypto.randomUUID()}`, type: "event", title: "Synthetic media fixture", summary: "Disposable private media acceptance" })}::jsonb) as result`;
  const result = row.result as Created;
  ids.push(result.content_id);
  return result;
}
describe.skipIf(!enabled)("CMS private media isolated SQL and storage acceptance", () => {
  beforeAll(async () => {
    db = new SQL(databaseUrl!);
    client = createClient(storageUrl!, storageKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await db`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${`cms-media-${actor}@example.test`},'staff','active')`;
  });
  afterAll(async () => {
    if (!db) return;
    for (const id of ids) {
      const sessions =
        await db`select storage_bucket,storage_path from public.content_media_session where content_item_id=${id}::uuid`;
      const assets =
        await db`select public_bucket as storage_bucket,public_path as storage_path from public.content_public_asset where content_item_id=${id}::uuid`;
      for (const row of [...sessions, ...assets]) {
        const { error } = await client.storage.from(row.storage_bucket).remove([row.storage_path]);
        if (error) throw error;
      }
      await db`delete from public.content_publication_prepare where content_item_id=${id}::uuid`;
      await db`delete from public.content_public_asset where content_item_id=${id}::uuid`;
      await db`delete from public.content_publish_request where content_item_id=${id}::uuid`;
      await db`update public.content_item set draft_revision_id=null,published_revision_id=null where id=${id}::uuid`;
      await db`delete from public.content_item where id=${id}::uuid`;
    }
    await db`delete from public.audit_log where actor_user_id=${actor}::uuid`;
    await db`delete from public.admin_user where auth_user_id=${actor}::uuid`;
    await db.close();
  });
  test("known private URL denies anonymous reads; finalize replay and signed preview work", async () => {
    const item = await createFixture();
    const lifecycle = createContentMediaLifecycle(createSupabaseContentMediaPorts(client));
    const target = await lifecycle.allocate({
      actorUserId: actor,
      contentId: item.content_id,
      input: { expectedVersion: item.version, mimeType: "image/png", byteSize: png.length },
    });
    const { error } = await client.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, png, { contentType: "image/png" });
    if (error) throw error;
    const publicUrl = client.storage.from(target.bucket).getPublicUrl(target.path).data.publicUrl;
    expect((await fetch(publicUrl)).ok).toBe(false);
    const command = {
      actorUserId: actor,
      contentId: item.content_id,
      input: {
        expectedVersion: item.version,
        uploadSessionId: target.uploadSessionId,
        altText: "Synthetic pixel",
        isCover: true,
      },
    };
    const first = await lifecycle.finalize(command);
    expect(await lifecycle.finalize(command)).toEqual(first);
    await expect(
      lifecycle.finalize({ ...command, input: { ...command.input, altText: "Changed payload" } }),
    ).rejects.toThrow();
    const preview = await lifecycle.preview({
      actorUserId: actor,
      contentId: item.content_id,
      input: { mediaId: first.childId },
    });
    expect((await fetch(preview.url)).ok).toBe(true);
    expect(preview.expiresIn).toBe(300);
    const published = await lifecycle.publish({
      actorUserId: actor,
      contentId: item.content_id,
      input: {
        expectedVersion: first.version,
        revisionId: first.revisionId,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(published.version).toBe(first.version + 1);
    const [pointer] =
      await db`select published_revision_id from public.content_item where id=${item.content_id}::uuid`;
    expect(pointer.published_revision_id).toBe(first.revisionId);
  });
  test("invalid preparation leaves no public asset or preparation rows", async () => {
    const item = await createFixture();
    await expect(
      db`select public.prepare_content_public_assets(${actor}::uuid,${item.content_id}::uuid,${item.revision_id}::uuid,${item.version},${crypto.randomUUID()})`,
    ).rejects.toThrow();
    const [counts] =
      await db`select (select count(*)::int from public.content_public_asset where content_item_id=${item.content_id}::uuid) as assets,(select count(*)::int from public.content_publication_prepare where content_item_id=${item.content_id}::uuid) as preparations`;
    expect(counts.assets).toBe(0);
    expect(counts.preparations).toBe(0);
  });
  test("database refuses a private publication before public-copy preparation", async () => {
    const item = await createFixture();
    const lifecycle = createContentMediaLifecycle(createSupabaseContentMediaPorts(client));
    const target = await lifecycle.allocate({
      actorUserId: actor,
      contentId: item.content_id,
      input: { expectedVersion: item.version, mimeType: "image/png", byteSize: png.length },
    });
    const { error } = await client.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, png, { contentType: "image/png" });
    if (error) throw error;
    const saved = await lifecycle.finalize({
      actorUserId: actor,
      contentId: item.content_id,
      input: {
        expectedVersion: item.version,
        uploadSessionId: target.uploadSessionId,
        altText: "Synthetic pixel",
        isCover: true,
      },
    });
    await expect(
      db`select public.publish_content_revision(${actor}::uuid,${item.content_id}::uuid,${saved.revisionId}::uuid,${saved.version},${crypto.randomUUID()})`,
    ).rejects.toThrow();
    const [pointer] =
      await db`select published_revision_id from public.content_item where id=${item.content_id}::uuid`;
    expect(pointer.published_revision_id).toBeNull();
  });
});
