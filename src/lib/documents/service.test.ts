import { describe, expect, mock, test } from "bun:test";

import { createDocumentService, DocumentConflictError, type DocumentRepository } from "./service";
import type { AnnualReport, DocumentAsset } from "./types";

const assetId = "11111111-2222-4333-8444-555555555555";
const reportId = "22222222-3333-4444-8555-666666666666";

const asset: DocumentAsset = {
  id: assetId,
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
const annualReport: AnnualReport = {
  id: reportId,
  title: "Annual Report 2025/26",
  yearLabel: "2025/26",
  document: asset,
  isPublished: false,
  sortOrder: 1,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

function createRepo(overrides: Partial<DocumentRepository> = {}) {
  const auditLogs: Parameters<DocumentRepository["insertAuditLog"]>[0][] = [];
  const repo: DocumentRepository = {
    listPublishedAnnualReports: mock(async () => []),
    listPublishedSlots: mock(async () => []),
    listAssets: mock(async () => ({ items: [asset], total: 1 })),
    getAssetById: mock(async () => asset),
    listAnnualReports: mock(async () => [annualReport]),
    getAnnualReportById: mock(async () => annualReport),
    createAnnualReport: mock(async (input) => ({ ...annualReport, ...input })),
    updateAnnualReport: mock(async (_id, input) => ({ ...annualReport, ...input })),
    setAnnualReportPublished: mock(async (_id, value) => ({ ...annualReport, isPublished: value })),
    deleteAnnualReport: mock(async () => undefined),
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

async function expectInvalidDocumentIdRejected(
  action: (service: ReturnType<typeof createDocumentService>) => Promise<unknown>,
) {
  const { repo } = createRepo();
  const service = createDocumentService({ repo });

  await expect(action(service)).rejects.toThrow();
  for (const repositoryMethod of Object.values(repo)) {
    expect(repositoryMethod).not.toHaveBeenCalled();
  }
}
test("rejects invalid asset IDs before repository work", async () => {
  const invalidId = "not-a-uuid";

  await expectInvalidDocumentIdRejected((service) =>
    service.updateAsset({ actorUserId: "admin", assetId: invalidId, input: { title: "Updated" } }),
  );
  await expectInvalidDocumentIdRejected((service) =>
    service.publishAsset({ actorUserId: "admin", assetId: invalidId }),
  );
  await expectInvalidDocumentIdRejected((service) =>
    service.unpublishAsset({ actorUserId: "admin", assetId: invalidId }),
  );
  await expectInvalidDocumentIdRejected((service) =>
    service.deleteAsset({ actorUserId: "admin", assetId: invalidId }),
  );
});

describe("createDocumentService", () => {
  test("publishing requires a verified Storage object", async () => {
    const { repo } = createRepo();
    repo.verifyObject = mock(async () => false);
    const service = createDocumentService({ repo });

    await expect(service.publishAsset({ actorUserId: "admin", assetId })).rejects.toThrow(
      "Document object is missing",
    );
    expect(repo.setAssetPublished).not.toHaveBeenCalled();
    expect(repo.getAssetById).toHaveBeenCalledWith(assetId);
    expect(repo.listAssets).not.toHaveBeenCalled();
  });

  test("rejects object path changes while an asset is published", async () => {
    const publishedAsset = { ...asset, isPublished: true };
    const { repo } = createRepo({ getAssetById: mock(async () => publishedAsset) });
    const service = createDocumentService({ repo });

    await expect(
      service.updateAsset({
        actorUserId: "admin",
        assetId,
        input: { objectPath: "annual-reports/replacement.pdf" },
      }),
    ).rejects.toThrow("Unpublish the document before changing its object path");
    expect(repo.getAssetById).toHaveBeenCalledWith(assetId);
    expect(repo.listAssets).not.toHaveBeenCalled();
    expect(repo.updateAsset).not.toHaveBeenCalled();
    expect(repo.verifyObject).not.toHaveBeenCalled();
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
      assetId,
      input: { title: "Updated" },
    });
    await service.publishAsset({ actorUserId: "admin", assetId });
    await service.unpublishAsset({ actorUserId: "admin", assetId });
    await service.deleteAsset({ actorUserId: "admin", assetId });

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
      service.updateAsset({ actorUserId: "admin", assetId, input: { byteSize: 0 } }),
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

    await expect(service.deleteAsset({ actorUserId: "admin", assetId })).rejects.toBeInstanceOf(
      DocumentConflictError,
    );
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

test("creates draft annual reports and lists them for admin", async () => {
  const { repo } = createRepo();
  const service = createDocumentService({ repo });

  await expect(service.listAnnualReports()).resolves.toEqual([annualReport]);
  await expect(
    service.createAnnualReport({
      actorUserId: "admin",
      input: {
        title: "Annual Report 2025/26",
        yearLabel: "2025/26",
        documentAssetId: assetId,
        isPublished: false,
        sortOrder: 1,
      },
    }),
  ).resolves.toMatchObject({ id: reportId });
  expect(repo.getAssetById).toHaveBeenCalledWith(assetId);
  expect(repo.createAnnualReport).toHaveBeenCalled();
});

test("rejects annual-report publication until its PDF asset is published", async () => {
  const { repo } = createRepo();
  const service = createDocumentService({ repo });

  await expect(service.publishAnnualReport({ actorUserId: "admin", reportId })).rejects.toThrow(
    "Publish the annual report PDF first",
  );
  expect(repo.setAnnualReportPublished).not.toHaveBeenCalled();
});

test("updates, publishes, unpublishes, and deletes annual reports with audit logs", async () => {
  const publishedReadyReport = {
    ...annualReport,
    document: { ...asset, isPublished: true },
  };
  const { repo, auditLogs } = createRepo({
    getAnnualReportById: mock(async () => publishedReadyReport),
    getAssetById: mock(async () => publishedReadyReport.document),
  });
  const service = createDocumentService({ repo });

  await service.updateAnnualReport({
    actorUserId: "admin",
    reportId,
    input: { title: "Updated report", sortOrder: 2 },
  });
  await service.publishAnnualReport({ actorUserId: "admin", reportId });
  await service.unpublishAnnualReport({ actorUserId: "admin", reportId });
  await service.deleteAnnualReport({ actorUserId: "admin", reportId });

  expect(repo.updateAnnualReport).toHaveBeenCalledWith(reportId, {
    title: "Updated report",
    sortOrder: 2,
  });
  expect(auditLogs.map((row) => row.action)).toEqual([
    "annual_report.update",
    "annual_report.publish",
    "annual_report.unpublish",
    "annual_report.delete",
  ]);
});
