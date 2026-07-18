import { z } from "zod";

import {
  documentAssetInputSchema,
  documentIdSchema,
  documentListSearchSchema,
  uploadTargetSchema,
  type DocumentAssetInput,
  type DocumentListSearch,
} from "./schemas";
import type { AnnualReport, DocumentAsset, DocumentSlot } from "./types";

export class DocumentConflictError extends Error {
  name = "DocumentConflictError";
}

export type DocumentAuditLogInsert = {
  actor_user_id: string | null;
  action:
    | "document.create"
    | "document.update"
    | "document.publish"
    | "document.unpublish"
    | "document.delete";
  entity: "document_asset";
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp?: string;
};

export type DocumentRepository = {
  listPublishedAnnualReports(): Promise<AnnualReport[]>;
  listPublishedSlots(slotKeys: string[]): Promise<DocumentSlot[]>;
  listAssets(search: DocumentListSearch): Promise<{ items: DocumentAsset[]; total: number }>;
  getAssetById(id: string): Promise<DocumentAsset | null>;
  createAsset(input: DocumentAssetInput): Promise<DocumentAsset>;
  updateAsset(id: string, input: Partial<DocumentAssetInput>): Promise<DocumentAsset>;
  setAssetPublished(id: string, isPublished: boolean): Promise<DocumentAsset>;
  countAssetReferences(id: string): Promise<number>;
  deleteAsset(id: string): Promise<void>;
  createSignedUploadUrl(objectPath: string): Promise<{ token: string; path: string }>;
  verifyObject(objectPath: string): Promise<boolean>;
  insertAuditLog(row: DocumentAuditLogInsert): Promise<void>;
};

type CreateDocumentServiceOptions = {
  repo: DocumentRepository;
  now?: () => Date;
};

type ActorInput = {
  actorUserId: string | null;
};

type AssetActionArgs = ActorInput & {
  assetId: string;
};

const updateAssetInputSchema = documentAssetInputSchema
  .omit({ isPublished: true })
  .partial()
  .strict();
const slotKeysSchema = z.array(
  z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/),
);

function timestamp(now: () => Date) {
  return now().toISOString();
}

export function createDocumentService({
  repo,
  now = () => new Date(),
}: CreateDocumentServiceOptions) {
  async function audit(row: Omit<DocumentAuditLogInsert, "timestamp">) {
    await repo.insertAuditLog({ ...row, timestamp: timestamp(now) });
  }

  async function assetForPublication(assetId: string) {
    const asset = await repo.getAssetById(assetId);
    if (!asset) throw new Error("Document asset not found");
    return asset;
  }

  async function ensureVerifiedObject(objectPath: string) {
    if (!(await repo.verifyObject(objectPath))) {
      throw new Error("Document object is missing");
    }
  }

  return {
    async listPublishedAnnualReports() {
      return repo.listPublishedAnnualReports();
    },

    async listPublishedSlots(rawSlotKeys: unknown) {
      return repo.listPublishedSlots(slotKeysSchema.parse(rawSlotKeys));
    },

    async listAssets(raw: unknown) {
      return repo.listAssets(documentListSearchSchema.parse(raw));
    },

    async createAsset({ actorUserId, input }: ActorInput & { input: unknown }) {
      const parsed = documentAssetInputSchema.parse(input);
      if (parsed.isPublished) await ensureVerifiedObject(parsed.objectPath);

      const asset = await repo.createAsset(parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "document.create",
        entity: "document_asset",
        entity_id: asset.id,
        detail: { kind: asset.kind, title: asset.title, objectPath: asset.objectPath },
      });
      if (asset.isPublished) {
        await audit({
          actor_user_id: actorUserId,
          action: "document.publish",
          entity: "document_asset",
          entity_id: asset.id,
          detail: { objectPath: asset.objectPath },
        });
      }

      return asset;
    },

    async updateAsset({ actorUserId, assetId, input }: AssetActionArgs & { input: unknown }) {
      const parsedAssetId = documentIdSchema.parse(assetId);
      const parsed = updateAssetInputSchema.parse(input);
      if (parsed.objectPath !== undefined) {
        const current = await repo.getAssetById(parsedAssetId);
        if (!current) throw new Error("Document asset not found");
        if (current.isPublished && parsed.objectPath !== current.objectPath) {
          throw new DocumentConflictError("Unpublish the document before changing its object path");
        }
      }

      const asset = await repo.updateAsset(parsedAssetId, parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "document.update",
        entity: "document_asset",
        entity_id: parsedAssetId,
        detail: parsed,
      });

      return asset;
    },

    async publishAsset({ actorUserId, assetId }: AssetActionArgs) {
      const parsedAssetId = documentIdSchema.parse(assetId);
      const asset = await assetForPublication(parsedAssetId);
      await ensureVerifiedObject(asset.objectPath);
      const published = await repo.setAssetPublished(parsedAssetId, true);
      await audit({
        actor_user_id: actorUserId,
        action: "document.publish",
        entity: "document_asset",
        entity_id: parsedAssetId,
        detail: { objectPath: asset.objectPath },
      });

      return published;
    },

    async unpublishAsset({ actorUserId, assetId }: AssetActionArgs) {
      const parsedAssetId = documentIdSchema.parse(assetId);
      const unpublished = await repo.setAssetPublished(parsedAssetId, false);
      await audit({
        actor_user_id: actorUserId,
        action: "document.unpublish",
        entity: "document_asset",
        entity_id: parsedAssetId,
        detail: {},
      });

      return unpublished;
    },

    async deleteAsset({ actorUserId, assetId }: AssetActionArgs) {
      const parsedAssetId = documentIdSchema.parse(assetId);
      if ((await repo.countAssetReferences(parsedAssetId)) > 0) {
        throw new DocumentConflictError("Document asset is still referenced");
      }

      await repo.deleteAsset(parsedAssetId);
      await audit({
        actor_user_id: actorUserId,
        action: "document.delete",
        entity: "document_asset",
        entity_id: parsedAssetId,
        detail: {},
      });
    },

    async createUploadTarget(raw: unknown) {
      const parsed = uploadTargetSchema.parse(raw);
      return repo.createSignedUploadUrl(parsed.objectPath);
    },
  };
}
