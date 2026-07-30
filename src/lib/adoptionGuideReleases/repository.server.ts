import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { DocumentAsset } from "../documents/types";
import {
  adoptionGuideDraftInputSchema,
  adoptionGuideMutationSchema,
  adoptionGuideReleaseIdSchema,
  adoptionGuideSpeciesSchema,
  adoptionGuideStateSchema,
  adoptionGuideVersionSchema,
} from "./schemas";
import type {
  AdoptionGuideAssetVerification,
  AdoptionGuideReadinessIssue,
  AdoptionGuideRelease,
  AdoptionGuideReleaseState,
  AdoptionGuideSpecies,
} from "./types";

const RELEASE_COLUMNS =
  "id,topic,species,zh_hk_asset_id,en_asset_id,knowledge_post_id,knowledge_title,knowledge_topic,knowledge_short_intro,knowledge_source_name,sort_order,state,version,created_by,updated_by,submitted_by,submitted_at,published_by,published_at,archived_by,archived_at,created_at,updated_at";
const ASSET_COLUMNS =
  "id,kind,title,language,bucket_name,object_path,mime_type,byte_size,checksum_sha256,is_published,sort_order,created_at,updated_at";
const PREVIEW_URL_TTL_SECONDS = 5 * 60;

export type AdoptionGuideDraftInput = z.infer<typeof adoptionGuideDraftInputSchema>;
export type AdoptionGuideMutationInput = z.infer<typeof adoptionGuideMutationSchema>;

export type AdoptionGuideAdminQuery = {
  page: number;
  pageSize: number;
  q?: string;
  species?: AdoptionGuideSpecies;
  state?: AdoptionGuideReleaseState;
};

export type PaginatedAdoptionGuideReleases = {
  items: AdoptionGuideRelease[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdoptionGuidePublishResult = {
  releaseId: string;
  releaseVersion: number;
  knowledgePostId: string;
  zhHkAssetId: string;
  enAssetId: string;
  slotKey: string;
};

export type AdoptionGuideReleaseErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "internal";

const defaultErrorMessages: Record<AdoptionGuideReleaseErrorCode, string> = {
  unauthorized: "Authentication is required.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "Adoption guide release not found.",
  conflict: "This adoption guide release changed or cannot make that transition.",
  invalid: "The adoption guide release is not ready for this action.",
  internal: "The adoption guide release request could not be completed.",
};

export class AdoptionGuideReleaseError extends Error {
  name = "AdoptionGuideReleaseError";

  constructor(
    public readonly code: AdoptionGuideReleaseErrorCode,
    public readonly status: number,
    message = defaultErrorMessages[code],
    public readonly issues?: AdoptionGuideReadinessIssue[],
  ) {
    super(message);
  }
}

export type AdoptionGuideReleaseRepository = {
  list(query: AdoptionGuideAdminQuery): Promise<PaginatedAdoptionGuideReleases>;
  getById(id: string): Promise<AdoptionGuideRelease | null>;
  getAssets(
    zhHkAssetId: string | null,
    enAssetId: string | null,
  ): Promise<{
    zhHk: AdoptionGuideAssetVerification | null;
    en: AdoptionGuideAssetVerification | null;
  }>;
  create(input: AdoptionGuideDraftInput, actorUserId: string): Promise<AdoptionGuideRelease>;
  update(
    id: string,
    input: AdoptionGuideMutationInput,
    actorUserId: string,
  ): Promise<AdoptionGuideRelease>;
  transition(input: {
    id: string;
    expectedVersion: number;
    operation: "submit" | "withdraw" | "return_to_draft";
    actorUserId: string;
  }): Promise<AdoptionGuideRelease>;
  previewAssetUrl(asset: DocumentAsset): Promise<string>;
  publish(input: {
    id: string;
    expectedVersion: number;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<AdoptionGuidePublishResult>;
};

type ProviderError = {
  code?: unknown;
  message?: unknown;
};

const nullableUuid = z.string().uuid().nullable();
const nullableTimestamp = z.string().datetime({ offset: true }).nullable();
const releaseRowSchema = z.object({
  id: adoptionGuideReleaseIdSchema,
  topic: z.string(),
  species: adoptionGuideSpeciesSchema,
  zh_hk_asset_id: nullableUuid,
  en_asset_id: nullableUuid,
  knowledge_post_id: nullableUuid,
  knowledge_title: z.string(),
  knowledge_topic: z.string(),
  knowledge_short_intro: z.string(),
  knowledge_source_name: z.string().nullable(),
  sort_order: z.number().int().nonnegative(),
  state: adoptionGuideStateSchema,
  version: adoptionGuideVersionSchema,
  created_by: z.string().uuid(),
  updated_by: z.string().uuid(),
  submitted_by: nullableUuid,
  submitted_at: nullableTimestamp,
  published_by: nullableUuid,
  published_at: nullableTimestamp,
  archived_by: nullableUuid,
  archived_at: nullableTimestamp,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
const assetRowSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["annual_report", "wedding_form", "adoption_guide"]),
  title: z.string(),
  language: z.enum(["zh-HK", "en", "bilingual"]),
  bucket_name: z.string().min(1),
  object_path: z.string().min(1),
  mime_type: z.literal("application/pdf"),
  byte_size: z.number().int().nonnegative(),
  checksum_sha256: z.string().nullable(),
  is_published: z.boolean(),
  sort_order: z.number().int(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
const publishResultSchema = z.object({
  release_id: adoptionGuideReleaseIdSchema,
  release_version: adoptionGuideVersionSchema,
  knowledge_post_id: z.string().uuid(),
  zh_hk_asset_id: z.string().uuid(),
  en_asset_id: z.string().uuid(),
  slot_key: z.string().min(1),
});

function providerError(error: unknown): ProviderError {
  return error && typeof error === "object" ? (error as ProviderError) : {};
}

function throwRepositoryError(error: unknown): never {
  const source = providerError(error);
  const code = String(source.code ?? "");
  const message = String(source.message ?? "");
  const normalized = message.toLowerCase();
  const illegalTransition =
    normalized.includes("only draft adoption guide releases can be") ||
    normalized.includes("only in-review adoption guide releases can be");

  if (
    code === "23505" ||
    code === "40001" ||
    normalized.includes("stale adoption guide release version") ||
    normalized.includes("idempotency key was already used") ||
    illegalTransition
  ) {
    throw new AdoptionGuideReleaseError("conflict", 409);
  }
  if (code === "PGRST116" || code === "P0002" || normalized.includes("release not found")) {
    throw new AdoptionGuideReleaseError("not_found", 404);
  }
  if (code === "42501") {
    throw new AdoptionGuideReleaseError("forbidden", 403);
  }
  if (
    code === "23514" ||
    code === "22023" ||
    normalized.includes("adoption guide knowledge metadata is incomplete") ||
    normalized.includes("adoption guide pdf") ||
    normalized.includes("adoption guide assets are required")
  ) {
    throw new AdoptionGuideReleaseError("invalid", 422);
  }
  throw new AdoptionGuideReleaseError("internal", 500);
}

function mapRelease(value: unknown): AdoptionGuideRelease | null {
  const result = releaseRowSchema.safeParse(value);
  if (!result.success) return null;
  const row = result.data;
  return {
    id: row.id,
    topic: row.topic,
    species: row.species,
    zhHkAssetId: row.zh_hk_asset_id,
    enAssetId: row.en_asset_id,
    knowledgePostId: row.knowledge_post_id,
    knowledgeTitle: row.knowledge_title,
    knowledgeTopic: row.knowledge_topic,
    knowledgeShortIntro: row.knowledge_short_intro,
    knowledgeSourceName: row.knowledge_source_name,
    sortOrder: row.sort_order,
    state: row.state,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    archivedBy: row.archived_by,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireRelease(value: unknown) {
  const release = mapRelease(value);
  if (!release) throw new AdoptionGuideReleaseError("internal", 500);
  return release;
}

function publicAssetUrl(client: SupabaseClient, row: z.infer<typeof assetRowSchema>) {
  if (!row.is_published) return null;
  return client.storage.from(row.bucket_name).getPublicUrl(row.object_path).data.publicUrl ?? null;
}

function mapAsset(
  client: SupabaseClient,
  value: unknown,
): { asset: DocumentAsset; bucketName: string; objectPath: string } | null {
  const result = assetRowSchema.safeParse(value);
  if (!result.success) return null;
  const row = result.data;
  return {
    asset: {
      id: row.id,
      kind: row.kind,
      title: row.title,
      language: row.language,
      bucketName: row.bucket_name,
      objectPath: row.object_path,
      fileUrl: publicAssetUrl(client, row),
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      checksumSha256: row.checksum_sha256,
      isPublished: row.is_published,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    bucketName: row.bucket_name,
    objectPath: row.object_path,
  };
}

function releaseValues(input: AdoptionGuideDraftInput | AdoptionGuideMutationInput) {
  return {
    topic: input.topic,
    species: input.species,
    zh_hk_asset_id: input.zhHkAssetId,
    en_asset_id: input.enAssetId,
    knowledge_title: input.knowledgeTitle,
    knowledge_topic: input.knowledgeTopic,
    knowledge_short_intro: input.knowledgeShortIntro,
    knowledge_source_name: input.knowledgeSourceName,
    sort_order: input.sortOrder,
  };
}

function postgrestLikeOperand(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll(",", "\\,")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  return `"%${escaped}%"`;
}

export function createSupabaseAdoptionGuideReleaseRepository(
  client: SupabaseClient,
): AdoptionGuideReleaseRepository {
  async function runMutation(input: {
    operation: "create" | "update" | "submit" | "withdraw" | "return_to_draft";
    id: string | null;
    expectedVersion: number | null;
    values: Record<string, unknown>;
    actorUserId: string;
  }) {
    const { data, error } = await client.rpc("mutate_adoption_guide_release_with_audit", {
      p_actor_user_id: input.actorUserId,
      p_operation: input.operation,
      p_release_id: input.id,
      p_expected_version: input.expectedVersion,
      p_values: input.values,
    });
    if (error) throwRepositoryError(error);
    return requireRelease(data);
  }

  return {
    async list(query) {
      const page = Math.max(1, Math.trunc(query.page));
      const pageSize = Math.min(50, Math.max(1, Math.trunc(query.pageSize)));
      const from = (page - 1) * pageSize;
      let request = client
        .from("adoption_guide_releases")
        .select(RELEASE_COLUMNS, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);

      if (query.species) request = request.eq("species", query.species);
      if (query.state) request = request.eq("state", query.state);
      if (query.q?.trim()) {
        const operand = postgrestLikeOperand(query.q.trim());
        request = request.or(
          `topic.ilike.${operand},knowledge_title.ilike.${operand},knowledge_topic.ilike.${operand}`,
        );
      }

      const { data, error, count } = await request;
      if (error) throwRepositoryError(error);
      return {
        items: ((data ?? []) as unknown[]).map(mapRelease).filter((item) => item !== null),
        total: count ?? 0,
        page,
        pageSize,
      };
    },

    async getById(id) {
      const { data, error } = await client
        .from("adoption_guide_releases")
        .select(RELEASE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throwRepositoryError(error);
      if (!data) return null;
      return requireRelease(data);
    },

    async getAssets(zhHkAssetId, enAssetId) {
      const ids = [...new Set([zhHkAssetId, enAssetId].filter((id): id is string => Boolean(id)))];
      if (ids.length === 0) return { zhHk: null, en: null };

      const { data, error } = await client
        .from("document_assets")
        .select(ASSET_COLUMNS)
        .in("id", ids);
      if (error) throwRepositoryError(error);

      const mapped = new Map(
        ((data ?? []) as unknown[])
          .map((row) => mapAsset(client, row))
          .filter((item) => item !== null)
          .map((item) => [item.asset.id, item] as const),
      );

      async function verify(id: string | null) {
        if (!id) return null;
        const item = mapped.get(id);
        if (!item) return null;
        const storage = client.storage.from(item.bucketName);
        const { data: exists, error: storageError } = await storage.exists(item.objectPath);
        if (storageError) throwRepositoryError(storageError);
        return { asset: item.asset, objectVerified: exists === true };
      }

      const [zhHk, en] = await Promise.all([verify(zhHkAssetId), verify(enAssetId)]);
      return { zhHk, en };
    },

    create(input, actorUserId) {
      return runMutation({
        operation: "create",
        id: null,
        expectedVersion: null,
        values: releaseValues(input),
        actorUserId,
      });
    },

    update(id, input, actorUserId) {
      return runMutation({
        operation: "update",
        id,
        expectedVersion: input.expectedVersion,
        values: releaseValues(input),
        actorUserId,
      });
    },

    transition(input) {
      return runMutation({
        operation: input.operation,
        id: input.id,
        expectedVersion: input.expectedVersion,
        values: {},
        actorUserId: input.actorUserId,
      });
    },

    async previewAssetUrl(asset) {
      const { data, error } = await client.storage
        .from(asset.bucketName)
        .createSignedUrl(asset.objectPath, PREVIEW_URL_TTL_SECONDS);
      if (error) throwRepositoryError(error);
      if (!data?.signedUrl) throw new AdoptionGuideReleaseError("internal", 500);
      return data.signedUrl;
    },

    async publish(input) {
      const { data, error } = await client.rpc("publish_adoption_guide_release", {
        p_release_id: input.id,
        p_expected_version: input.expectedVersion,
        p_actor_user_id: input.actorUserId,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throwRepositoryError(error);
      const parsed = publishResultSchema.safeParse(data);
      if (!parsed.success) throw new AdoptionGuideReleaseError("internal", 500);
      return {
        releaseId: parsed.data.release_id,
        releaseVersion: parsed.data.release_version,
        knowledgePostId: parsed.data.knowledge_post_id,
        zhHkAssetId: parsed.data.zh_hk_asset_id,
        enAssetId: parsed.data.en_asset_id,
        slotKey: parsed.data.slot_key,
      };
    },
  };
}
