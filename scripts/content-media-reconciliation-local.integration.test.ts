import { afterAll, beforeAll, expect, test } from "bun:test";
import { SQL } from "bun";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const enabled = process.env.CONTENT_MEDIA_RECONCILIATION_LOCAL_TEST === "1";
const localApi = "http://127.0.0.1:55321";
const localDb = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const marker = `reconcile-${crypto.randomUUID()}`;
const paths = {
  orphan: `${marker}/orphan.png`,
  current: `${marker}/current.png`,
  revision: `${marker}/revision.png`,
  active: `${marker}/active.png`,
  finalized: `${marker}/finalized.png`,
  recent: `${marker}/recent.png`,
  assetSource: `${marker}/asset-source.png`,
  assetPublic: `${marker}/asset-public.png`,
};
const privatePaths = [
  paths.orphan,
  paths.current,
  paths.revision,
  paths.active,
  paths.finalized,
  paths.recent,
  paths.assetSource,
];
const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
  "base64",
);
let db: SQL;
let storage: ReturnType<typeof createClient>["storage"];
let actorId: string;
let contentId: string;

async function config() {
  const rows = (await readFile("supabase/.temp/completion-local/start.raw.log", "utf8"))
    .trim()
    .split(/\r?\n/);
  const value = JSON.parse(rows.at(-1) ?? "null");
  if (value?.API_URL !== localApi || typeof value?.SERVICE_ROLE_KEY !== "string")
    throw new Error("Exact ignored local startup configuration required");
  return value;
}

beforeAll(async () => {
  if (!enabled) return;
  const local = await config();
  db = new SQL(localDb);
  storage = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
  const actor = crypto.randomUUID();
  const admin = await db`
    insert into public.admin_user(auth_user_id,email,role,status)
    values(${actor}::uuid,${`${marker}@example.invalid`},'admin','active') returning id`;
  actorId = admin[0].id;
  const item = await db`
    insert into public.content_item(slug,type,title,summary,status,created_by,updated_by)
    values(${marker},'event',${marker},${marker},'draft',${actorId}::uuid,${actorId}::uuid) returning id`;
  contentId = item[0].id;

  for (const path of privatePaths) {
    const result = await storage
      .from("content-media-private")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (result.error) throw result.error;
  }
  const publicUpload = await storage
    .from("content-media")
    .upload(paths.assetPublic, bytes, { contentType: "image/png", upsert: false });
  if (publicUpload.error) throw publicUpload.error;
  await db`
    update storage.objects set created_at='2026-09-01T00:00:00Z'
    where bucket_id in ('content-media','content-media-private')
      and name like ${marker + "/%"} and name<>${paths.recent}`;

  const currentMedia = crypto.randomUUID();
  await db`
    insert into public.content_media(id,content_item_id,storage_bucket,storage_path,alt_text)
    values(${currentMedia}::uuid,${contentId}::uuid,'content-media-private',${paths.current},'fixture')`;
  const revision = await db`
    insert into public.content_revision(content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by)
    values(
      ${contentId}::uuid,0,'fixture',
      jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storage_bucket','content-media-private','storage_path',${paths.revision}::text))),
      jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storage_bucket','content-media-private','storage_path',${paths.revision}::text))),
      ${actorId}::uuid
    ) returning id`;
  await db`
    insert into public.content_media_session(content_item_id,expected_version,storage_path,mime_type,byte_size,expires_at,created_by)
    values(${contentId}::uuid,0,${paths.active},'image/png',${bytes.length},now()+interval '1 hour',${actorId}::uuid)`;
  await db`
    insert into public.content_media_session(content_item_id,expected_version,storage_path,mime_type,byte_size,expires_at,finalized_at,created_by)
    values(${contentId}::uuid,0,${paths.finalized},'image/png',${bytes.length},now()-interval '2 days',now()-interval '1 day',${actorId}::uuid)`;
  await db`
    insert into public.content_public_asset(content_item_id,revision_id,media_id,source_bucket,source_path,public_path,sha256,ready)
    values(${contentId}::uuid,${revision[0].id}::uuid,${crypto.randomUUID()}::uuid,'content-media-private',${paths.assetSource},${paths.assetPublic},${"a".repeat(64)},true)`;
});

afterAll(async () => {
  if (!enabled) return;
  await storage.from("content-media-private").remove(privatePaths);
  await storage.from("content-media").remove([paths.assetPublic]);
  if (contentId) await db`delete from public.content_item where id=${contentId}::uuid`;
  if (actorId) await db`delete from public.admin_user where id=${actorId}::uuid`;
  await db.close();
});

test.skipIf(!enabled)(
  "local apply deletes the orphan and preserves every current, historical, session and recent reference",
  async () => {
    const revisionRefs = await db`
      select media->>'storage_bucket' as bucket, media->>'storage_path' as path
      from public.content_revision revision
      cross join lateral jsonb_array_elements(coalesce(revision.authoring_snapshot->'media','[]'::jsonb) || coalesce(revision.public_snapshot->'media','[]'::jsonb)) media
      where revision.content_item_id=${contentId}::uuid`;
    expect(revisionRefs.map((row) => ({ ...row }))).toContainEqual({
      bucket: "content-media-private",
      path: paths.revision,
    });
    const childEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC)$/i.test(
          key,
        ),
      ),
    );
    const run = Bun.spawnSync(
      [
        "bun",
        "--no-env-file",
        "scripts/content-media-reconciliation-local.ts",
        "--local-maintenance",
        "--apply",
      ],
      { env: childEnv, stdout: "pipe", stderr: "pipe" },
    );
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    const report = JSON.parse(run.stdout.toString());
    expect(report).toMatchObject({ mode: "local-apply" });

    const orphan = await storage.from("content-media-private").download(paths.orphan);
    expect(orphan.error).toBeTruthy();
    for (const path of privatePaths.filter((path) => path !== paths.orphan)) {
      const retained = await storage.from("content-media-private").download(path);
      expect(retained.error, path).toBeNull();
      expect(await retained.data?.arrayBuffer()).toBeTruthy();
    }
    const publicRetained = await storage.from("content-media").download(paths.assetPublic);
    expect(publicRetained.error).toBeNull();
  },
  60_000,
);
