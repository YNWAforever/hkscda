import { SQL } from "bun";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import {
  selectContentMediaReconciliationCandidates,
  summarizeContentMediaReconciliation,
  type ContentMediaInventory,
} from "./reconcile-content-media";

export type LocalMaintenanceTarget = {
  apply: boolean;
  localMaintenance: boolean;
  apiUrl: string;
  dbUrl: string;
};

type Dependencies = {
  now?: Date;
  withLockedInventory: <T>(
    operation: (inventory: ContentMediaInventory) => Promise<T>,
  ) => Promise<T>;
  remove: (bucket: string, paths: string[]) => Promise<void>;
};

const LOCAL_API = "http://127.0.0.1:55321";
const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const BUCKETS = new Set(["content-media", "content-media-private"]);

export function validateLocalMaintenanceTarget(target: LocalMaintenanceTarget) {
  if (!target.localMaintenance)
    throw new Error("Fresh inventory requires --local-maintenance explicit opt-in");
  if (target.apiUrl !== LOCAL_API) throw new Error("Exact disposable local API required");
  if (target.dbUrl !== LOCAL_DB) throw new Error("Exact disposable local database required");
  return target;
}

export async function runLocalContentMediaReconciliation(
  target: LocalMaintenanceTarget,
  dependencies: Dependencies,
) {
  validateLocalMaintenanceTarget(target);
  return dependencies.withLockedInventory(async (inventory) => {
    const { candidates } = selectContentMediaReconciliationCandidates(
      inventory,
      dependencies.now ?? new Date(),
    );
    if (!target.apply)
      return summarizeContentMediaReconciliation(inventory, dependencies.now ?? new Date());
    if (candidates.length > 100)
      throw new Error(`Refusing to delete ${candidates.length} candidates; local cap is 100`);
    for (const candidate of candidates)
      if (!BUCKETS.has(candidate.bucket))
        throw new Error("Unexpected Storage bucket in candidate set");
    for (const bucket of BUCKETS) {
      const paths = candidates
        .filter((candidate) => candidate.bucket === bucket)
        .map(({ path }) => path);
      if (paths.length) await dependencies.remove(bucket, paths);
    }
    return {
      mode: "local-apply",
      objectsInspected: inventory.objects.length,
      deleted: candidates.length,
    };
  });
}

async function readLocalConfig() {
  const lines = (await readFile("supabase/.temp/completion-local/start.raw.log", "utf8"))
    .trim()
    .split(/\r?\n/);
  const config = JSON.parse(lines.at(-1) ?? "null");
  if (config?.API_URL !== LOCAL_API || typeof config?.SERVICE_ROLE_KEY !== "string")
    throw new Error("Exact ignored local startup configuration required");
  return config as { API_URL: string; SERVICE_ROLE_KEY: string };
}

async function lockedInventory(
  db: SQL,
  operation: (inventory: ContentMediaInventory) => Promise<unknown>,
) {
  return db.begin(async (tx) => {
    await tx`set local lock_timeout = '5s'`;
    await tx`set local idle_in_transaction_session_timeout = '60s'`;
    await tx`set local statement_timeout = '55s'`;
    await tx`lock table public.content_item, public.content_revision, public.content_media, public.content_media_session, public.content_public_asset, public.content_publication_prepare in share mode`;
    const objects = await tx`
      select bucket_id as bucket, name as path, to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
      from storage.objects where bucket_id in ('content-media','content-media-private')`;
    const mediaObjects = await tx`
      select storage_bucket as bucket, storage_path as path from public.content_media`;
    const revisionObjects = await tx`
      select media->>'storage_bucket' as bucket, media->>'storage_path' as path
      from public.content_revision revision
      cross join lateral jsonb_array_elements(coalesce(revision.authoring_snapshot->'media','[]'::jsonb) || coalesce(revision.public_snapshot->'media','[]'::jsonb)) media
      where media->>'storage_bucket' in ('content-media','content-media-private') and nullif(media->>'storage_path','') is not null`;
    const publicationObjects = await tx`
      select source_bucket as bucket, source_path as path from public.content_public_asset
      union
      select public_bucket as bucket, public_path as path from public.content_public_asset`;
    const sessions = await tx`
      select storage_bucket as bucket, storage_path as path, to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "expiresAt", finalized_at is not null as finalized
      from public.content_media_session`;
    const [legacy] = await tx`
      select count(*)::int as count
      from public.content_revision revision
      cross join lateral jsonb_array_elements(coalesce(revision.public_snapshot->'media','[]'::jsonb)) media
      join public.story_update update_row on update_row.id=(media->>'story_update_id')::uuid
      where update_row.visibility='internal'`;
    return operation({
      objects,
      mediaObjects,
      revisionObjects,
      publicationObjects,
      sessions,
      legacyInternalPublicCount: legacy?.count ?? 0,
    });
  });
}

if (import.meta.main) {
  const target = validateLocalMaintenanceTarget({
    apply: process.argv.includes("--apply"),
    localMaintenance: process.argv.includes("--local-maintenance"),
    apiUrl: LOCAL_API,
    dbUrl: LOCAL_DB,
  });
  const config = await readLocalConfig();
  const storage = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init = {}) => {
        const signals = [AbortSignal.timeout(10_000)];
        if (init.signal) signals.push(init.signal);
        return fetch(input, { ...init, signal: AbortSignal.any(signals) });
      },
    },
  }).storage;
  const db = new SQL(target.dbUrl);
  try {
    const result = await runLocalContentMediaReconciliation(target, {
      withLockedInventory: (operation) => lockedInventory(db, operation),
      remove: async (bucket, paths) => {
        const response = await storage.from(bucket).remove(paths);
        if (response.error) throw new Error("Local Storage removal failed");
      },
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.close();
  }
}
