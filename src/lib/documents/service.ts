import { z } from "zod";

import {
  documentAssetInputSchema,
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
    const { items } = await repo.listAssets({ page: 1, pageSize: 1, q: assetId });
    const asset = items.find((item) => item.id === assetId);
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
      const parsed = updateAssetInputSchema.parse(input);
      const asset = await repo.updateAsset(assetId, parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "document.update",
        entity: "document_asset",
        entity_id: assetId,
        detail: parsed,
      });

      return asset;
    },

    async publishAsset({ actorUserId, assetId }: AssetActionArgs) {
      const asset = await assetForPublication(assetId);
      await ensureVerifiedObject(asset.objectPath);
      const published = await repo.setAssetPublished(assetId, true);
      await audit({
        actor_user_id: actorUserId,
        action: "document.publish",
        entity: "document_asset",
        entity_id: assetId,
        detail: { objectPath: asset.objectPath },
      });

      return published;
    },

    async unpublishAsset({ actorUserId, assetId }: AssetActionArgs) {
      const unpublished = await repo.setAssetPublished(assetId, false);
      await audit({
        actor_user_id: actorUserId,
        action: "document.unpublish",
        entity: "document_asset",
        entity_id: assetId,
        detail: {},
      });

      return unpublished;
    },

    async deleteAsset({ actorUserId, assetId }: AssetActionArgs) {
      if ((await repo.countAssetReferences(assetId)) > 0) {
        throw new DocumentConflictError("Document asset is still referenced");
      }

      await repo.deleteAsset(assetId);
      await audit({
        actor_user_id: actorUserId,
        action: "document.delete",
        entity: "document_asset",
        entity_id: assetId,
        detail: {},
      });
    },

    async createUploadTarget(raw: unknown) {
      const parsed = uploadTargetSchema.parse(raw);
      return repo.createSignedUploadUrl(parsed.objectPath);
    },
  };
}
