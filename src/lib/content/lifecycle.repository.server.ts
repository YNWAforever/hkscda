import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  ContentLifecycleError,
  type ContentLifecycleMutation,
  type ContentLifecycleResult,
  type ContentRevisionSummary,
} from "./lifecycle";

const resultSchema = z.object({
  content_id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  revision_id: z.string().uuid(),
  child_id: z.string().uuid().nullable().optional(),
});

const revisionSchema = z.object({
  id: z.string().uuid(),
  content_item_id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  operation: z.string().min(1),
  created_by: z.string().uuid(),
  created_at: z.string(),
  is_published: z.boolean(),
});

type DatabaseError = { code?: string; message?: unknown };

/**
 * The known refusals of the content RPCs (BUG-69), read from the SQLSTATE and the text the
 * migrations raise or the unique constraint Postgres names. Only the reason code leaves this
 * module; the database's text never does.
 *
 * - `finalize_content_media_session` (20260905155426): 'Internal update media cannot be a cover'
 *   and 'Media session expired', both 23514.
 * - `mutate_content_revision_with_audit` create_link (20260905150012): 23505 on the
 *   `content_link` unique key (content_item_id, linked_type, linked_id, relationship) or on
 *   `content_link_one_primary_animal_idx` (20260705120000).
 * - save_content: 23505 on `content_item_slug_key`; publish: 'Published slug already used' or
 *   `content_item_published_slug_unique`.
 *
 * A duplicate link or primary subject is a refusal of the input, not a stale version, so it is
 * `invalid` (422): the editor shows the reason without the conflict banner. A slug clash stays a
 * `conflict`, as before; the editor's conflict banner already names a public URL clash.
 */
function knownRefusal(code: string | undefined, message: string): ContentLifecycleError | null {
  if (code === "23514") {
    if (message === "Internal update media cannot be a cover")
      return new ContentLifecycleError("invalid", undefined, "media_cover_internal");
    if (message === "Media session expired")
      return new ContentLifecycleError("invalid", undefined, "session_expired");
  }
  if (code === "23505") {
    if (message.includes('"content_link_one_primary_animal_idx"'))
      return new ContentLifecycleError("invalid", undefined, "primary_subject_exists");
    if (message.includes('"content_link_'))
      return new ContentLifecycleError("invalid", undefined, "link_exists");
    if (
      message === "Published slug already used" ||
      message.includes('"content_item_slug_key"') ||
      message.includes('"content_item_published_slug_unique"')
    )
      return new ContentLifecycleError("conflict", undefined, "slug_taken");
  }
  return null;
}

export function mapContentLifecycleRepositoryError(error: unknown): ContentLifecycleError {
  const { code, message } = (error as DatabaseError | null) ?? {};
  const known = knownRefusal(code, typeof message === "string" ? message : "");
  if (known) return known;
  if (code === "40001" || code === "23505") return new ContentLifecycleError("conflict");
  if (code === "P0002") return new ContentLifecycleError("not_found");
  if (code === "22023" || code === "23514") return new ContentLifecycleError("invalid");
  return new ContentLifecycleError("internal");
}

function parseResult(value: unknown): ContentLifecycleResult {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) throw new ContentLifecycleError("internal");
  return {
    contentId: parsed.data.content_id,
    version: parsed.data.version,
    revisionId: parsed.data.revision_id,
    ...(parsed.data.child_id ? { childId: parsed.data.child_id } : {}),
  };
}

export type ContentLifecycleRepository = {
  create(input: {
    actorUserId: string;
    values: Record<string, unknown>;
  }): Promise<ContentLifecycleResult>;
  getRevision(
    contentId: string,
    revisionId: string,
  ): Promise<{ id: string; version: number; snapshot: Record<string, unknown> }>;
  listRevisions(contentId: string, beforeVersion?: number): Promise<ContentRevisionSummary[]>;
  mutate(input: ContentLifecycleMutation): Promise<ContentLifecycleResult>;
  restore(input: {
    actorUserId: string;
    contentId: string;
    revisionId: string;
    expectedVersion: number;
  }): Promise<ContentLifecycleResult>;
  publish(input: {
    actorUserId: string;
    contentId: string;
    revisionId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }): Promise<ContentLifecycleResult>;
};

export function createSupabaseContentLifecycleRepository(
  client: SupabaseClient,
): ContentLifecycleRepository {
  async function rpc(name: string, input: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, input);
    if (error) throw mapContentLifecycleRepositoryError(error);
    return parseResult(data);
  }

  return {
    create(input) {
      return rpc("create_content_revision_with_audit", {
        p_actor_user_id: input.actorUserId,
        p_values: input.values,
      });
    },
    async listRevisions(contentId, beforeVersion) {
      let query = client
        .from("content_revision")
        .select("id,content_item_id,version,operation,created_by,created_at,is_published")
        .eq("content_item_id", contentId)
        .order("version", { ascending: false })
        .limit(20);
      if (beforeVersion !== undefined) query = query.lt("version", beforeVersion);
      const { data, error } = await query;
      if (error) throw mapContentLifecycleRepositoryError(error);
      const parsed = z.array(revisionSchema).safeParse(data ?? []);
      if (!parsed.success) throw new ContentLifecycleError("internal");
      return parsed.data.map((row) => ({
        id: row.id,
        contentId: row.content_item_id,
        version: row.version,
        operation: row.operation,
        createdBy: row.created_by,
        createdAt: row.created_at,
        isPublished: row.is_published,
      }));
    },

    async getRevision(contentId, revisionId) {
      const { data, error } = await client
        .from("content_revision")
        .select("id,version,authoring_snapshot")
        .eq("content_item_id", contentId)
        .eq("id", revisionId)
        .maybeSingle();
      if (error) throw mapContentLifecycleRepositoryError(error);
      if (!data) throw new ContentLifecycleError("not_found");
      const parsed = z
        .object({
          id: z.string().uuid(),
          version: z.number().int(),
          authoring_snapshot: z.record(z.string(), z.unknown()),
        })
        .parse(data);
      return { id: parsed.id, version: parsed.version, snapshot: parsed.authoring_snapshot };
    },
    mutate(input) {
      return rpc("mutate_content_revision_with_audit", {
        p_actor_user_id: input.actorUserId,
        p_content_id: input.contentId,
        p_expected_version: input.expectedVersion,
        p_operation: input.operation,
        p_values: input.values,
      });
    },

    restore(input) {
      return rpc("restore_content_revision", {
        p_actor_user_id: input.actorUserId,
        p_content_id: input.contentId,
        p_revision_id: input.revisionId,
        p_expected_version: input.expectedVersion,
      });
    },

    publish(input) {
      return rpc("publish_content_revision", {
        p_actor_user_id: input.actorUserId,
        p_content_id: input.contentId,
        p_revision_id: input.revisionId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
      });
    },
  };
}
