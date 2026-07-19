import type { SupabaseClient } from "@supabase/supabase-js";

import { documentAssetInputSchema, documentIdSchema } from "./schemas";
import type { DocumentAssetInput, DocumentListSearch } from "./schemas";
import type { AnnualReport, DocumentAsset, DocumentSlot } from "./types";

const SITE_DOCUMENTS_BUCKET = "site-documents";

const ASSET_COLUMNS =
  "id,kind,title,language,bucket_name,object_path,mime_type,byte_size,checksum_sha256,is_published,sort_order,created_at,updated_at";
const ANNUAL_REPORT_COLUMNS = `id,title,year_label,is_published,sort_order,created_at,updated_at,document_assets!inner(${ASSET_COLUMNS})`;
const SLOT_COLUMNS = `id,slot_key,language,is_published,document_assets!inner(${ASSET_COLUMNS})`;

type Row = Record<string, unknown>;

function postgrestLikeOperand(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `"%${escaped}%"`;
}

function relatedRow(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? null;
  return value && typeof value === "object" ? (value as Row) : null;
}

function publicUrl(client: SupabaseClient, asset: DocumentAssetInput) {
  if (!asset.isPublished) return null;
  return (
    client.storage.from(asset.bucketName).getPublicUrl(asset.objectPath).data.publicUrl ?? null
  );
}

function mapAsset(client: SupabaseClient, row: Row): DocumentAsset | null {
  const id = documentIdSchema.safeParse(row.id);
  const asset = documentAssetInputSchema.safeParse({
    kind: row.kind,
    title: row.title,
    language: row.language,
    bucketName: row.bucket_name,
    objectPath: row.object_path,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    checksumSha256: row.checksum_sha256,
    isPublished: row.is_published,
    sortOrder: row.sort_order,
  });
  const createdAt = row.created_at;
  const updatedAt = row.updated_at;
  const hasRequiredStorageFields =
    row.bucket_name === SITE_DOCUMENTS_BUCKET &&
    row.mime_type === "application/pdf" &&
    typeof row.is_published === "boolean" &&
    row.sort_order !== undefined;
  if (
    !hasRequiredStorageFields ||
    !id.success ||
    !asset.success ||
    typeof createdAt !== "string" ||
    createdAt.length === 0 ||
    typeof updatedAt !== "string" ||
    updatedAt.length === 0
  ) {
    return null;
  }

  return {
    id: id.data,
    ...asset.data,
    fileUrl: publicUrl(client, asset.data),
    createdAt,
    updatedAt,
  };
}

function mapPublishedAsset(client: SupabaseClient, value: unknown) {
  const row = relatedRow(value);
  if (!row || row.is_published !== true) return null;
  const asset = mapAsset(client, row);
  return asset?.isPublished === true && asset.fileUrl ? asset : null;
}

function mapAnnualReport(client: SupabaseClient, row: Row): AnnualReport | null {
  if (row.is_published !== true) return null;
  const document = mapPublishedAsset(client, row.document_assets);
  if (!document?.fileUrl) return null;

  return {
    id: String(row.id),
    title: String(row.title),
    yearLabel: String(row.year_label),
    document,
    isPublished: true,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapSlot(client: SupabaseClient, row: Row): DocumentSlot | null {
  if (row.is_published !== true) return null;
  const document = mapPublishedAsset(client, row.document_assets);
  if (!document?.fileUrl) return null;

  return {
    id: String(row.id),
    slotKey: String(row.slot_key),
    language: row.language as DocumentSlot["language"],
    document,
    isPublished: true,
  };
}

export function createSupabaseDocumentRepository(client: SupabaseClient) {
  return {
    async listPublishedAnnualReports() {
      const { data, error } = await client
        .from("annual_reports")
        .select(ANNUAL_REPORT_COLUMNS)
        .eq("is_published", true)
        .eq("document_assets.is_published", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as Row[])
        .map((row) => mapAnnualReport(client, row))
        .filter((row): row is AnnualReport => row !== null);
    },

    async listPublishedSlots(slotKeys: string[]) {
      if (slotKeys.length === 0) return [];

      const { data, error } = await client
        .from("site_document_slots")
        .select(SLOT_COLUMNS)
        .eq("is_published", true)
        .in("slot_key", slotKeys)
        .eq("document_assets.is_published", true)
        .order("slot_key", { ascending: true });
      if (error) throw error;

      return ((data ?? []) as Row[])
        .map((row) => mapSlot(client, row))
        .filter((row): row is DocumentSlot => row !== null);
    },

    async listAssets(search: DocumentListSearch) {
      const from = (search.page - 1) * search.pageSize;
      let query = client
        .from("document_assets")
        .select(ASSET_COLUMNS, { count: "exact" })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .range(from, from + search.pageSize - 1);

      if (search.kind) query = query.eq("kind", search.kind);
      if (search.language) query = query.eq("language", search.language);
      if (search.q) {
        const like = postgrestLikeOperand(search.q);
        query = query.or(`title.ilike.${like},object_path.ilike.${like}`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        items: ((data ?? []) as Row[])
          .map((row) => mapAsset(client, row))
          .filter((row): row is DocumentAsset => row !== null),
        total: count ?? 0,
      };
    },

    async getAssetById(id: string) {
      const { data, error } = await client
        .from("document_assets")
        .select(ASSET_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapAsset(client, data as Row) : null;
    },

    async createSignedUploadUrl(objectPath: string) {
      const { data, error } = await client.storage
        .from(SITE_DOCUMENTS_BUCKET)
        .createSignedUploadUrl(objectPath);
      if (error) throw error;
      if (!data?.token || !data.path) throw new Error("Storage did not return an upload target");
      return { token: data.token, path: data.path };
    },

    async verifyObject(objectPath: string) {
      const { data, error } = await client.storage.from(SITE_DOCUMENTS_BUCKET).exists(objectPath);
      if (error) throw error;
      return data === true;
    },

    async countAssetReferences(id: string) {
      const [reports, slots] = await Promise.all([
        client
          .from("annual_reports")
          .select("id", { count: "exact", head: true })
          .eq("document_asset_id", id),
        client
          .from("site_document_slots")
          .select("id", { count: "exact", head: true })
          .eq("document_asset_id", id),
      ]);
      if (reports.error) throw reports.error;
      if (slots.error) throw slots.error;
      return (reports.count ?? 0) + (slots.count ?? 0);
    },
  };
}
