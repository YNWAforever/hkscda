import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  AdminKnowledgeQuery,
  KnowledgeAuditLog,
  KnowledgePost,
  KnowledgePostInput,
  KnowledgeRepository,
} from "./types";

const SITE_DOCUMENTS_BUCKET = "site-documents";
const ASSET_COLUMNS = "id,bucket_name,object_path,mime_type,is_published";
const POST_BASE_COLUMNS =
  "id,title,topic,short_intro,external_url,document_asset_id,zh_hk_document_asset_id,en_document_asset_id,source_name,is_published,sort_order,created_at,updated_at";
const ZH_HK_ASSET_RELATION = `zh_hk_document_assets:document_assets!knowledge_posts_zh_hk_document_asset_id_fkey(${ASSET_COLUMNS})`;
const EN_ASSET_RELATION = `en_document_assets:document_assets!knowledge_posts_en_document_asset_id_fkey(${ASSET_COLUMNS})`;
const POST_COLUMNS = `${POST_BASE_COLUMNS},document_assets(${ASSET_COLUMNS}),${ZH_HK_ASSET_RELATION},${EN_ASSET_RELATION}`;
const PUBLIC_PAIR_COLUMNS = `${POST_BASE_COLUMNS},zh_hk_document_assets:document_assets!knowledge_posts_zh_hk_document_asset_id_fkey!inner(${ASSET_COLUMNS}),en_document_assets:document_assets!knowledge_posts_en_document_asset_id_fkey!inner(${ASSET_COLUMNS})`;

type Row = Record<string, unknown>;

const postRowSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  topic: z.string().min(1),
  short_intro: z.string().min(1),
  external_url: z.string().nullable(),
  zh_hk_document_asset_id: z.string().nullable(),
  en_document_asset_id: z.string().nullable(),
  document_asset_id: z.string().nullable(),
  source_name: z.string().nullable(),
  is_published: z.boolean(),
  sort_order: z.number().int().min(0),
  created_at: z.string(),
  updated_at: z.string(),
});

function relatedRow(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? null;
  return value && typeof value === "object" ? (value as Row) : null;
}

function safeExternal(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isSafeObjectPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.startsWith("/") ||
    value.includes("\\")
  ) {
    return false;
  }
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function publicAssetUrl(client: SupabaseClient, value: unknown) {
  const row = relatedRow(value);
  if (
    !row ||
    row.is_published !== true ||
    row.bucket_name !== SITE_DOCUMENTS_BUCKET ||
    row.mime_type !== "application/pdf" ||
    !isSafeObjectPath(row.object_path)
  ) {
    return null;
  }
  const publicUrl =
    client.storage?.from(String(row.bucket_name)).getPublicUrl(row.object_path).data.publicUrl ??
    null;
  return safeExternal(publicUrl);
}

function mapPost(client: SupabaseClient, raw: Row, publicOnly = false): KnowledgePost | null {
  const parsed = postRowSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (publicOnly && parsed.data.is_published !== true) return null;

  const externalUrl = safeExternal(parsed.data.external_url);
  const assetUrl = publicAssetUrl(client, raw.document_assets);
  const zhHkAssetUrl = publicAssetUrl(client, raw.zh_hk_document_assets);
  const enAssetUrl = publicAssetUrl(client, raw.en_document_assets);
  const hasZhHkAssetId = Boolean(parsed.data.zh_hk_document_asset_id);
  const hasEnAssetId = Boolean(parsed.data.en_document_asset_id);
  if (hasZhHkAssetId !== hasEnAssetId) return null;

  const hasExternal = Boolean(externalUrl);
  const hasDocument = Boolean(parsed.data.document_asset_id && (!publicOnly || assetUrl));
  const hasPair = hasZhHkAssetId && (!publicOnly || Boolean(zhHkAssetUrl && enAssetUrl));
  if (Number(hasExternal) + Number(hasDocument) + Number(hasPair) !== 1) return null;

  return {
    id: parsed.data.id,
    title: parsed.data.title,
    topic: parsed.data.topic,
    shortIntro: parsed.data.short_intro,
    sourceName: parsed.data.source_name,
    destination: hasExternal
      ? { kind: "external", url: externalUrl! }
      : hasDocument
        ? { kind: "document", assetId: parsed.data.document_asset_id!, url: assetUrl ?? undefined }
        : {
            kind: "document_pair",
            zhHkAssetId: parsed.data.zh_hk_document_asset_id!,
            enAssetId: parsed.data.en_document_asset_id!,
            zhHkUrl: zhHkAssetUrl ?? undefined,
            enUrl: enAssetUrl ?? undefined,
          },
    isPublished: parsed.data.is_published,
    sortOrder: parsed.data.sort_order,
    createdAt: parsed.data.created_at,
    updatedAt: parsed.data.updated_at,
  };
}

function postgrestLikeOperand(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `"%${escaped}%"`;
}

function toRow(input: KnowledgePostInput) {
  return {
    ...(input.id ? { id: input.id } : {}),
    title: input.title,
    topic: input.topic,
    short_intro: input.shortIntro,
    source_name: input.sourceName,
    external_url: input.destination.kind === "external" ? input.destination.url : null,
    document_asset_id: input.destination.kind === "document" ? input.destination.assetId : null,
    zh_hk_document_asset_id:
      input.destination.kind === "document_pair" ? input.destination.zhHkAssetId : null,
    en_document_asset_id:
      input.destination.kind === "document_pair" ? input.destination.enAssetId : null,
    is_published: input.isPublished,
    sort_order: input.sortOrder,
  };
}

function requirePost(client: SupabaseClient, data: unknown) {
  const mapped = data && typeof data === "object" ? mapPost(client, data as Row) : null;
  if (!mapped) throw new Error("Knowledge mutation returned an invalid row");
  return mapped;
}

export function createSupabaseKnowledgeRepository(client: SupabaseClient): KnowledgeRepository {
  return {
    async listPublished() {
      const [pairResult, legacyResult] = await Promise.all([
        client
          .from("knowledge_posts")
          .select(PUBLIC_PAIR_COLUMNS)
          .eq("is_published", true)
          .eq("zh_hk_document_assets.is_published", true)
          .eq("en_document_assets.is_published", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false })
          .range(0, 999),
        client
          .from("knowledge_posts")
          .select(POST_COLUMNS)
          .eq("is_published", true)
          .eq("document_assets.is_published", true)
          .or("external_url.not.is.null,document_asset_id.not.is.null")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false })
          .range(0, 999),
      ]);
      if (pairResult.error) throw pairResult.error;
      if (legacyResult.error) throw legacyResult.error;

      const posts = [...((pairResult.data ?? []) as Row[]), ...((legacyResult.data ?? []) as Row[])]
        .map((row) => mapPost(client, row, true))
        .filter((row): row is KnowledgePost => row !== null);
      const uniquePostsById = new Map<string, KnowledgePost>();
      for (const post of posts) {
        if (!uniquePostsById.has(post.id)) uniquePostsById.set(post.id, post);
      }
      const uniquePosts = [...uniquePostsById.values()];
      return uniquePosts.sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || right.createdAt.localeCompare(left.createdAt),
      );
    },

    async listAdmin(input: AdminKnowledgeQuery) {
      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("knowledge_posts")
        .select(POST_COLUMNS, { count: "exact" })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (input.status === "published") query = query.eq("is_published", true);
      if (input.status === "draft") query = query.eq("is_published", false);
      if (input.q) {
        const like = postgrestLikeOperand(input.q);
        query = query.or(
          `title.ilike.${like},topic.ilike.${like},short_intro.ilike.${like},source_name.ilike.${like}`,
        );
      }
      const { data, error, count } = await query.range(from, from + input.pageSize - 1);
      if (error) throw error;
      return {
        posts: ((data ?? []) as Row[])
          .map((row) => mapPost(client, row))
          .filter((row): row is KnowledgePost => row !== null),
        total: count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    },

    async upsert(input: KnowledgePostInput) {
      const query = input.id
        ? client.from("knowledge_posts").update(toRow(input)).eq("id", input.id)
        : client.from("knowledge_posts").upsert(toRow(input));
      const { data, error } = await query.select(POST_COLUMNS).single();
      if (error) throw error;
      return requirePost(client, data);
    },

    async remove(id: string) {
      const { error } = await client.from("knowledge_posts").delete().eq("id", id);
      if (error) throw error;
    },

    async insertAuditLog(input: KnowledgeAuditLog) {
      const { error } = await client.from("audit_log").insert(input);
      if (error) throw error;
    },
  };
}
