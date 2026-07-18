import { describe, expect, mock, test } from "bun:test";

import { createDocumentService, DocumentConflictError, type DocumentRepository } from "./service";
import type { DocumentAsset } from "./types";

const asset: DocumentAsset = {
  id: "asset",
  kind: "annual_report",
  title: "Annual Report 2025/26",
  language: "bilingual",
  bucketName: "site-documents",
  objectPath: "annual-reports/2025-26.pdf",
  fileUrl: null,
  mimeType: "application/pdf",
  byteSize: 1024,
  checksumSha256: null,
  isPublished: false,
  sortOrder: 0,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

function createRepo(overrides: Partial<DocumentRepository> = {}) {
  const auditLogs: Parameters<DocumentRepository["insertAuditLog"]>[0][] = [];
  const repo: DocumentRepository = {
    listPublishedAnnualReports: mock(async () => []),
    listPublishedSlots: mock(async () => []),
    listAssets: mock(async () => ({ items: [asset], total: 1 })),
    createAsset: mock(async (input) => ({ ...asset, ...input })),
    updateAsset: mock(async (_id, input) => ({ ...asset, ...input })),
    setAssetPublished: mock(async (_id, isPublished) => ({ ...asset, isPublished })),
    countAssetReferences: mock(async () => 0),
    deleteAsset: mock(async () => undefined),
    createSignedUploadUrl: mock(async (path) => ({ token: "upload-token", path })),
    verifyObject: mock(async () => true),
    insertAuditLog: mock(async (row) => {
      auditLogs.push(row);
    }),
    ...overrides,
  };
  return { repo, auditLogs };
}

describe("createDocumentService", () => {
  test("publishing requires a verified Storage object", async () => {
    const { repo } = createRepo();
    repo.verifyObject = mock(async () => false);
    const service = createDocumentService({ repo });

    await expect(service.publishAsset({ actorUserId: "admin", assetId: "asset" })).rejects.toThrow(
      "Document object is missing",
    );
    expect(repo.setAssetPublished).not.toHaveBeenCalled();
  });

  test("creates, updates, publishes, unpublishes, and deletes with audit logs", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createDocumentService({
      repo,
      now: () => new Date("2026-07-19T01:02:03.000Z"),
    });

    await service.createAsset({
      actorUserId: "admin",
      input: {
        kind: "annual_report",
        title: " Annual Report 2025/26 ",
        language: "bilingual",
        objectPath: "annual-reports/2025-26.pdf",
        byteSize: 1024,
      },
    });
    await service.updateAsset({
      actorUserId: "admin",
      assetId: "asset",
      input: { title: "Updated" },
    });
    await service.publishAsset({ actorUserId: "admin", assetId: "asset" });
    await service.unpublishAsset({ actorUserId: "admin", assetId: "asset" });
    await service.deleteAsset({ actorUserId: "admin", assetId: "asset" });

    expect(repo.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Annual Report 2025/26" }),
    );
    expect(auditLogs.map((row) => row.action)).toEqual([
      "document.create",
      "document.update",
      "document.publish",
      "document.unpublish",
      "document.delete",
    ]);
    expect(auditLogs.every((row) => row.timestamp === "2026-07-19T01:02:03.000Z")).toBe(true);
  });

  test("rejects invalid list, asset, update, and upload inputs before repository work", async () => {
    const { repo } = createRepo();
    const service = createDocumentService({ repo });

    await expect(service.listAssets({ kind: "spreadsheet" })).rejects.toThrow();
    await expect(service.createAsset({ actorUserId: "admin", input: {} })).rejects.toThrow();
    await expect(
      service.updateAsset({ actorUserId: "admin", assetId: "asset", input: { byteSize: 0 } }),
    ).rejects.toThrow();
    await expect(
      service.createUploadTarget({
        bucketName: "other-bucket",
        objectPath: "annual-reports/report.pdf",
        byteSize: 100,
      }),
    ).rejects.toThrow();

    expect(repo.listAssets).not.toHaveBeenCalled();
    expect(repo.createAsset).not.toHaveBeenCalled();
    expect(repo.updateAsset).not.toHaveBeenCalled();
    expect(repo.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  test("rejects referenced deletion with DocumentConflictError", async () => {
    const { repo } = createRepo({ countAssetReferences: mock(async () => 2) });
    const service = createDocumentService({ repo });

    await expect(
      service.deleteAsset({ actorUserId: "admin", assetId: "asset" }),
    ).rejects.toBeInstanceOf(DocumentConflictError);
    expect(repo.deleteAsset).not.toHaveBeenCalled();
  });

  test("creates a validated signed upload target", async () => {
    const { repo } = createRepo();
    const service = createDocumentService({ repo });

    await expect(
      service.createUploadTarget({
        bucketName: "site-documents",
        objectPath: "annual-reports/report.pdf",
        byteSize: 100,
      }),
    ).resolves.toEqual({ token: "upload-token", path: "annual-reports/report.pdf" });
  });
});
