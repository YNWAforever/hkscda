import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { annualReportInputSchema, documentAssetInputSchema, documentIdSchema } from "./schemas";
import type { AnnualReportInput, DocumentAssetInput, DocumentListSearch } from "./schemas";
import { DocumentConflictError, type DocumentAuditLogInsert } from "./service";
import type { AnnualReport, DocumentAsset, DocumentSlot } from "./types";

const SITE_DOCUMENTS_BUCKET = "site-documents";

const ASSET_COLUMNS =
  "id,kind,title,language,bucket_name,object_path,mime_type,byte_size,checksum_sha256,is_published,sort_order,created_at,updated_at";
const ANNUAL_REPORT_COLUMNS = `id,title,year_label,document_asset_id,is_published,sort_order,created_at,updated_at,document_assets!inner(${ASSET_COLUMNS})`;
const SLOT_COLUMNS = `id,slot_key,language,is_published,document_assets!inner(${ASSET_COLUMNS})`;

type Row = Record<string, unknown>;
const documentTimestampsSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

function throwRepositoryError(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    ["23505", "23514"].includes(String((error as { code?: unknown }).code))
  ) {
    throw new DocumentConflictError("Document record conflicts with existing data");
  }
  throw error;
}

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
  const timestamps = documentTimestampsSchema.safeParse({
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  const hasRequiredStorageFields =
    row.bucket_name === SITE_DOCUMENTS_BUCKET &&
    row.mime_type === "application/pdf" &&
    typeof row.is_published === "boolean" &&
    row.sort_order !== undefined;
  if (!hasRequiredStorageFields || !id.success || !asset.success || !timestamps.success) {
    return null;
  }

  return {
    id: id.data,
    ...asset.data,
    fileUrl: publicUrl(client, asset.data),
    ...timestamps.data,
  };
}

function assetRowInput(input: Partial<DocumentAssetInput>) {
  const row: Row = {};
  if (input.kind !== undefined) row.kind = input.kind;
  if (input.title !== undefined) row.title = input.title;
  if (input.language !== undefined) row.language = input.language;
  if (input.bucketName !== undefined) row.bucket_name = input.bucketName;
  if (input.objectPath !== undefined) row.object_path = input.objectPath;
  if (input.mimeType !== undefined) row.mime_type = input.mimeType;
  if (input.byteSize !== undefined) row.byte_size = input.byteSize;
  if (input.checksumSha256 !== undefined) row.checksum_sha256 = input.checksumSha256;
  if (input.isPublished !== undefined) row.is_published = input.isPublished;
  if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
  return row;
}

function requireMappedAsset(client: SupabaseClient, value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("Document asset mutation returned no row");
  }
  const asset = mapAsset(client, value as Row);
  if (!asset) throw new Error("Document asset mutation returned an invalid row");
  return asset;
}

function mapAdminAnnualReport(client: SupabaseClient, row: Row): AnnualReport | null {
  const id = documentIdSchema.safeParse(row.id);
  const report = annualReportInputSchema.safeParse({
    title: row.title,
    yearLabel: row.year_label,
    documentAssetId: row.document_asset_id,
    isPublished: row.is_published,
    sortOrder: row.sort_order,
  });
  const timestamps = documentTimestampsSchema.safeParse({
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  const document = mapAsset(client, relatedRow(row.document_assets) ?? {});
  if (!id.success || !report.success || !timestamps.success || !document) return null;

  return {
    id: id.data,
    title: report.data.title,
    yearLabel: report.data.yearLabel,
    document,
    isPublished: report.data.isPublished,
    sortOrder: report.data.sortOrder,
    ...timestamps.data,
  };
}

function annualReportRowInput(input: Partial<AnnualReportInput>) {
  const row: Row = {};
  if (input.title !== undefined) row.title = input.title;
  if (input.yearLabel !== undefined) row.year_label = input.yearLabel;
  if (input.documentAssetId !== undefined) row.document_asset_id = input.documentAssetId;
  if (input.isPublished !== undefined) row.is_published = input.isPublished;
  if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
  return row;
}

function requireMappedAnnualReport(client: SupabaseClient, value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("Annual report mutation returned no row");
  }
  const report = mapAdminAnnualReport(client, value as Row);
  if (!report) throw new Error("Annual report mutation returned an invalid row");
  return report;
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
  async function runAtomicMutation(
    name: "mutate_document_asset_with_audit" | "mutate_annual_report_with_audit",
    operation: "create" | "update" | "publish" | "unpublish" | "delete",
    id: string | null,
    values: Row,
    actorUserId: string | null,
  ) {
    const { data, error } = await client.rpc(name, {
      p_actor_user_id: actorUserId,
      p_operation: operation,
      p_id: id,
      p_values: values,
    });
    if (error) throwRepositoryError(error);
    return documentIdSchema.parse(data);
  }

  async function loadAnnualReport(id: string) {
    const { data, error } = await client
      .from("annual_reports")
      .select(ANNUAL_REPORT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throwRepositoryError(error);
    return data ? mapAdminAnnualReport(client, data as Row) : null;
  }

  async function loadAsset(id: string) {
    const { data, error } = await client
      .from("document_assets")
      .select(ASSET_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throwRepositoryError(error);
    return data ? mapAsset(client, data as Row) : null;
  }

  return {
    usesAtomicAudit: true,
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

    async listAnnualReports() {
      const { data, error } = await client
        .from("annual_reports")
        .select(ANNUAL_REPORT_COLUMNS)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Row[])
        .map((row) => mapAdminAnnualReport(client, row))
        .filter((row): row is AnnualReport => row !== null);
    },

    async getAnnualReportById(id: string) {
      const { data, error } = await client
        .from("annual_reports")
        .select(ANNUAL_REPORT_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapAdminAnnualReport(client, data as Row) : null;
    },

    async createAnnualReport(input: AnnualReportInput, actorUserId?: string | null) {
      if (actorUserId !== undefined) {
        const id = await runAtomicMutation(
          "mutate_annual_report_with_audit",
          "create",
          null,
          annualReportRowInput(input),
          actorUserId,
        );
        const report = await loadAnnualReport(id);
        if (!report) throw new Error("Annual report mutation returned no row");
        return report;
      }
      const { data, error } = await client
        .from("annual_reports")
        .insert(annualReportRowInput(input))
        .select(ANNUAL_REPORT_COLUMNS)
        .single();
      if (error) throwRepositoryError(error);
      return requireMappedAnnualReport(client, data);
    },

    async updateAnnualReport(
      id: string,
      input: Partial<AnnualReportInput>,
      actorUserId?: string | null,
    ) {
      if (actorUserId !== undefined) {
        const resultId = await runAtomicMutation(
          "mutate_annual_report_with_audit",
          "update",
          id,
          annualReportRowInput(input),
          actorUserId,
        );
        const report = await loadAnnualReport(resultId);
        if (!report) throw new Error("Annual report mutation returned no row");
        return report;
      }
      const { data, error } = await client
        .from("annual_reports")
        .update(annualReportRowInput(input))
        .eq("id", id)
        .select(ANNUAL_REPORT_COLUMNS)
        .single();
      if (error) throwRepositoryError(error);
      return requireMappedAnnualReport(client, data);
    },

    async setAnnualReportPublished(id: string, isPublished: boolean, actorUserId?: string | null) {
      if (actorUserId !== undefined) {
        const operation = isPublished ? "publish" : "unpublish";
        const resultId = await runAtomicMutation(
          "mutate_annual_report_with_audit",
          operation,
          id,
          {},
          actorUserId,
        );
        const report = await loadAnnualReport(resultId);
        if (!report) throw new Error("Annual report mutation returned no row");
        return report;
      }
      const { data, error } = await client
        .from("annual_reports")
        .update({ is_published: isPublished })
        .eq("id", id)
        .select(ANNUAL_REPORT_COLUMNS)
        .single();
      if (error) throw error;
      return requireMappedAnnualReport(client, data);
    },

    async deleteAnnualReport(id: string, actorUserId?: string | null) {
      if (actorUserId !== undefined) {
        await runAtomicMutation("mutate_annual_report_with_audit", "delete", id, {}, actorUserId);
        return;
      }
      const { error } = await client.from("annual_reports").delete().eq("id", id);
      if (error) throw error;
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

    async createAsset(input: DocumentAssetInput, actorUserId?: string | null) {
      if (actorUserId !== undefined) {
        const id = await runAtomicMutation(
          "mutate_document_asset_with_audit",
          "create",
          null,
          assetRowInput(input),
          actorUserId,
        );
        const asset = await loadAsset(id);
        if (!asset) throw new Error("Document asset mutation returned no row");
        return asset;
      }
      const { data, error } = await client
        .from("document_assets")
        .insert(assetRowInput(input))
        .select(ASSET_COLUMNS)
        .single();
      if (error) throw error;
      return requireMappedAsset(client, data);
    },

    async updateAsset(id: string, input: Partial<DocumentAssetInput>, actorUserId?: string | null) {
      if (actorUserId !== undefined) {
        const resultId = await runAtomicMutation(
          "mutate_document_asset_with_audit",
          "update",
          id,
          assetRowInput(input),
          actorUserId,
        );
        const asset = await loadAsset(resultId);
        if (!asset) throw new Error("Document asset mutation returned no row");
        return asset;
      }
      const { data, error } = await client
        .from("document_assets")
        .update(assetRowInput(input))
        .eq("id", id)
        .select(ASSET_COLUMNS)
        .single();
      if (error) throw error;
      return requireMappedAsset(client, data);
    },

    async setAssetPublished(id: string, isPublished: boolean, actorUserId?: string | null) {
      if (actorUserId !== undefined) {
        const operation = isPublished ? "publish" : "unpublish";
        const resultId = await runAtomicMutation(
          "mutate_document_asset_with_audit",
          operation,
          id,
          {},
          actorUserId,
        );
        const asset = await loadAsset(resultId);
        if (!asset) throw new Error("Document asset mutation returned no row");
        return asset;
      }
      const { data, error } = await client
        .from("document_assets")
        .update({ is_published: isPublished })
        .eq("id", id)
        .select(ASSET_COLUMNS)
        .single();
      if (error) throw error;
      return requireMappedAsset(client, data);
    },

    async deleteAsset(id: string, actorUserId?: string | null) {
      if (actorUserId !== undefined) {
        await runAtomicMutation("mutate_document_asset_with_audit", "delete", id, {}, actorUserId);
        return;
      }
      const { error } = await client.from("document_assets").delete().eq("id", id);
      if (error) throw error;
    },

    async insertAuditLog(row: DocumentAuditLogInsert) {
      const { error } = await client.from("audit_log").insert(row);
      if (error) throw error;
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
