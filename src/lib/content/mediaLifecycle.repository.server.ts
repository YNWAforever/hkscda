import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  contentMediaDigest,
  type ContentMediaPorts,
  type MediaSession,
} from "./mediaLifecycle.server";
import {
  createSupabaseContentLifecycleRepository,
  mapContentLifecycleRepositoryError,
} from "./lifecycle.repository.server";
import { ContentLifecycleError } from "./lifecycle";
const resultSchema = z.object({
  content_id: z.string().uuid(),
  revision_id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  child_id: z.string().uuid().optional(),
});
function result(value: unknown) {
  const data = resultSchema.parse(value);
  return {
    contentId: data.content_id,
    revisionId: data.revision_id,
    version: data.version,
    ...(data.child_id ? { childId: data.child_id } : {}),
  };
}
const sessionSchema = z.object({
  id: z.string().uuid(),
  content_item_id: z.string().uuid(),
  expected_version: z.number().int(),
  storage_bucket: z.literal("content-media-private"),
  storage_path: z.string(),
  mime_type: z.string(),
  byte_size: z.number().int(),
  story_update_id: z.string().uuid().nullable(),
  expires_at: z.string(),
  result: z.unknown().nullable(),
});
function session(value: unknown): MediaSession {
  const data = sessionSchema.parse(value);
  return {
    id: data.id,
    contentId: data.content_item_id,
    expectedVersion: data.expected_version,
    storageBucket: data.storage_bucket,
    storagePath: data.storage_path,
    mimeType: data.mime_type,
    byteSize: data.byte_size,
    storyUpdateId: data.story_update_id,
    expiresAt: data.expires_at,
    result: data.result ? result(data.result) : null,
  };
}
const assetSchema = z.object({
  id: z.string().uuid(),
  source_bucket: z.literal("content-media-private"),
  source_path: z.string(),
  public_bucket: z.literal("content-media"),
  public_path: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  ready: z.boolean(),
});
export function createSupabaseContentMediaPorts(client: SupabaseClient): ContentMediaPorts {
  async function rpc(name: string, input: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, input);
    if (error) throw mapContentLifecycleRepositoryError(error);
    return data;
  }
  async function download(bucket: string, path: string) {
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error) {
      if ("statusCode" in error && String(error.statusCode) === "404")
        throw new ContentLifecycleError("not_found", "Uploaded object not found");
      throw error;
    }
    if (!data) throw new Error("Media object unavailable");
    return new Uint8Array(await data.arrayBuffer());
  }
  return {
    async createSession(input) {
      return session(
        await rpc("create_content_media_session", {
          p_actor_user_id: input.actorUserId,
          p_content_id: input.contentId,
          p_expected_version: input.expectedVersion,
          p_mime_type: input.mimeType,
          p_byte_size: input.byteSize,
          p_story_update_id: input.storyUpdateId,
        }),
      );
    },
    async getSession(input) {
      return session(
        await rpc("get_content_media_session", {
          p_actor_user_id: input.actorUserId,
          p_content_id: input.contentId,
          p_session_id: input.uploadSessionId,
        }),
      );
    },
    async signUpload(bucket, path) {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUploadUrl(path, { upsert: false });
      if (error) throw error;
      if (!data?.token) throw new Error("Signed upload target unavailable");
      return { path: data.path, token: data.token };
    },
    download,
    async finalize(input) {
      return result(
        await rpc("finalize_content_media_session", {
          p_actor_user_id: input.actorUserId,
          p_content_id: input.contentId,
          p_session_id: input.uploadSessionId,
          p_expected_version: input.expectedVersion,
          p_values: input.values,
          p_sha256: input.sha256,
        }),
      );
    },
    async preview(input) {
      const { data, error } = await client
        .from("content_media")
        .select("storage_bucket,storage_path")
        .eq("id", input.mediaId)
        .eq("content_item_id", input.contentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ContentLifecycleError("not_found");
      const { data: signed, error: signError } = await client.storage
        .from(data.storage_bucket)
        .createSignedUrl(data.storage_path, 300);
      if (signError) throw signError;
      if (!signed?.signedUrl) throw new Error("Media preview unavailable");
      return signed.signedUrl;
    },
    async preparePublication(input) {
      const data = await rpc("prepare_content_public_assets", {
        p_actor_user_id: input.actorUserId,
        p_content_id: input.contentId,
        p_revision_id: input.revisionId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
      });
      return z
        .array(assetSchema)
        .parse(data)
        .map((asset) => ({
          id: asset.id,
          sourceBucket: asset.source_bucket,
          sourcePath: asset.source_path,
          publicBucket: asset.public_bucket,
          publicPath: asset.public_path,
          sha256: asset.sha256,
          ready: asset.ready,
        }));
    },
    async copyPublic(asset) {
      const bytes = await download(asset.sourceBucket, asset.sourcePath);
      if ((await contentMediaDigest(bytes)) !== asset.sha256)
        throw new Error("Private image changed after finalization");
      const contentType = asset.publicPath.endsWith(".png")
        ? "image/png"
        : asset.publicPath.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
      const { error } = await client.storage
        .from(asset.publicBucket)
        .upload(asset.publicPath, bytes, { contentType, upsert: false });
      if (error) {
        const existing = await download(asset.publicBucket, asset.publicPath);
        if ((await contentMediaDigest(existing)) !== asset.sha256) throw error;
      }
    },
    markPublicReady(input) {
      return rpc("mark_content_public_asset_ready", {
        p_actor_user_id: input.actorUserId,
        p_content_id: input.contentId,
        p_asset_id: input.assetId,
      });
    },
    publish(input) {
      return createSupabaseContentLifecycleRepository(client).publish(input);
    },
  };
}
