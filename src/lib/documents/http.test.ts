import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { createDocumentHandlers } from "./http.server";
import { DocumentConflictError } from "./service";
import type { DocumentAsset } from "./types";

const admin = { authUserId: "admin-auth" };
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

function createService(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  return {
    calls,
    async listAssets() {
      calls.push("listAssets");
      return { items: [], total: 0 };
    },
    async createAsset() {
      calls.push("createAsset");
      return asset;
    },
    async updateAsset() {
      calls.push("updateAsset");
      return asset;
    },
    async publishAsset() {
      calls.push("publishAsset");
      return { ...asset, isPublished: true };
    },
    async unpublishAsset() {
      calls.push("unpublishAsset");
      return { ...asset, isPublished: false };
    },
    async deleteAsset() {
      calls.push("deleteAsset");
      return { ok: true };
    },
    async createUploadTarget() {
      calls.push("createUploadTarget");
      return { token: "token", path: "forms/wedding.pdf" };
    },
    ...overrides,
    async listAnnualReports() {
      calls.push("listAnnualReports");
      return [];
    },
    async createAnnualReport() {
      calls.push("createAnnualReport");
      return {};
    },
    async updateAnnualReport() {
      calls.push("updateAnnualReport");
      return {};
    },
    async publishAnnualReport() {
      calls.push("publishAnnualReport");
      return {};
    },
    async unpublishAnnualReport() {
      calls.push("unpublishAnnualReport");
      return {};
    },
    async deleteAnnualReport() {
      calls.push("deleteAnnualReport");
    },
  };
}

function jsonRequest(path: string, body: unknown, method = "POST") {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("createDocumentHandlers", () => {
  test("returns 401/403 before service work", async () => {
    for (const status of [401, 403]) {
      const service = createService();
      const handlers = createDocumentHandlers({
        requireDocumentAdmin: async () => {
          throw new Response(status === 401 ? "Unauthorized" : "Forbidden", { status });
        },
        service,
      });

      const response = await handlers.listAssets({
        request: new Request("https://example.test/api/admin/documents"),
      });

      expect(response.status).toBe(status);
      expect(service.calls).toEqual([]);
    }
  });

  test("maps Zod issues to 400", async () => {
    const service = createService({
      async createAsset() {
        throw new z.ZodError([
          { code: "custom", path: ["objectPath"], message: "Invalid document path" },
        ]);
      },
    });
    const handlers = createDocumentHandlers({
      requireDocumentAdmin: async () => admin,
      service,
    });

    const response = await handlers.createAsset({
      request: jsonRequest("/api/admin/documents", {}),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid document request",
      issues: [{ path: "objectPath", message: "Invalid document path" }],
    });
  });

  test("maps referenced deletion to 409", async () => {
    const service = createService({
      async deleteAsset() {
        throw new DocumentConflictError("Document asset is still referenced");
      },
    });
    const handlers = createDocumentHandlers({
      requireDocumentAdmin: async () => admin,
      service,
    });

    const response = await handlers.deleteAsset({
      request: new Request("https://example.test/api/admin/documents/asset", { method: "DELETE" }),
      params: { id: "asset" },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Document asset is still referenced" });
  });

  test("sets cache-control no-store on admin responses", async () => {
    const handlers = createDocumentHandlers({
      requireDocumentAdmin: async () => admin,
      service: createService(),
    });

    const response = await handlers.listAssets({
      request: new Request("https://example.test/api/admin/documents"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("routes upload, update, publish, and unpublish operations", async () => {
    const service = createService();
    const handlers = createDocumentHandlers({
      requireDocumentAdmin: async () => admin,
      service,
    });
    const params = { id: "asset" };

    await handlers.createUploadTarget({
      request: jsonRequest("/api/admin/documents/upload-target", {
        bucketName: "site-documents",
        objectPath: "forms/wedding.pdf",
        byteSize: 100,
      }),
    });
    await handlers.updateAsset({
      request: jsonRequest("/api/admin/documents/asset", { title: "Updated" }, "PATCH"),
      params,
    });
    await handlers.publishAsset({
      request: new Request("https://example.test/api/admin/documents/asset/publish", {
        method: "POST",
      }),
      params,
    });
    await handlers.unpublishAsset({
      request: new Request("https://example.test/api/admin/documents/asset/publish", {
        method: "DELETE",
      }),
      params,
    });

    expect(service.calls).toEqual([
      "createUploadTarget",
      "updateAsset",
      "publishAsset",
      "unpublishAsset",
    ]);
  });

  test("routes authenticated annual-report CRUD and publication operations", async () => {
    const service = createService();
    const handlers = createDocumentHandlers({
      requireDocumentAdmin: async () => admin,
      service,
    });
    const params = { id: "report" };

    await handlers.listAnnualReports({
      request: new Request("https://example.test/api/admin/annual-reports"),
    });
    await handlers.createAnnualReport({
      request: jsonRequest("/api/admin/annual-reports", {}),
    });
    await handlers.updateAnnualReport({
      request: jsonRequest("/api/admin/annual-reports/report", {}, "PATCH"),
      params,
    });
    await handlers.publishAnnualReport({
      request: new Request("https://example.test/api/admin/annual-reports/report/publish", {
        method: "POST",
      }),
      params,
    });
    await handlers.unpublishAnnualReport({
      request: new Request("https://example.test/api/admin/annual-reports/report/publish", {
        method: "DELETE",
      }),
      params,
    });
    await handlers.deleteAnnualReport({
      request: new Request("https://example.test/api/admin/annual-reports/report", {
        method: "DELETE",
      }),
      params,
    });

    expect(service.calls).toEqual([
      "listAnnualReports",
      "createAnnualReport",
      "updateAnnualReport",
      "publishAnnualReport",
      "unpublishAnnualReport",
      "deleteAnnualReport",
    ]);
  });
});
