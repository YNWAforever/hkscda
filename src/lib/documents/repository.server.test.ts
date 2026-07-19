import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseDocumentRepository } from "./repository.server";
import { DocumentConflictError } from "./service";

type Filter = ["eq" | "in" | "ilike" | "or", string, unknown];
const assetId = "11111111-2222-4333-8444-555555555555";
const reportId = "22222222-3333-4444-8555-666666666666";

class FakeQuery {
  selectedColumns = "";
  filters: Filter[] = [];
  rangeArgs: [number, number] | null = null;
  action: "select" | "insert" | "update" | "delete" = "select";
  payload: unknown;
  private countMode = false;

  constructor(
    readonly table: string,
    private readonly rows: Record<string, unknown>[],
  ) {}

  select(columns: string, options?: { count?: string; head?: boolean }) {
    this.selectedColumns = columns;
    this.countMode = options?.count === "exact";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push(["eq", column, value]);
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push(["in", column, value]);
    return this;
  }
  ilike(column: string, value: string) {
    this.filters.push(["ilike", column, value]);
    return this;
  }
  or(value: string) {
    this.filters.push(["or", "", value]);
    return this;
  }
  order() {
    return this;
  }
  range(from: number, to: number) {
    this.rangeArgs = [from, to];
    return this;
  }
  insert(payload: unknown) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: unknown) {
    this.action = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  async single() {
    return { data: this.mutationRow(), error: null };
  }
  async maybeSingle() {
    return { data: this.rows[0] ?? null, error: null };
  }
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const result =
      this.action === "delete"
        ? { data: null, error: null }
        : { data: this.rows, error: null, count: this.countMode ? this.rows.length : null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }

  private mutationRow() {
    const base = this.rows[0] ?? {};
    return { ...base, ...(this.payload as Record<string, unknown>) };
  }
}

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: assetId,
    kind: "annual_report",
    title: "Annual Report 2025/26",
    language: "bilingual",
    bucket_name: "site-documents",
    object_path: "annual-reports/2025-26.pdf",
    mime_type: "application/pdf",
    byte_size: 1024,
    checksum_sha256: null,
    is_published: true,
    sort_order: 1,
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

function annualReportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: reportId,
    title: "Annual Report 2025/26",
    year_label: "2025/26",
    document_asset_id: assetId,
    is_published: false,
    sort_order: 1,
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
    document_assets: assetRow({ is_published: false }),
    ...overrides,
  };
}

function createFakeClient(rowsByTable: Record<string, Record<string, unknown>[]>) {
  const queries: FakeQuery[] = [];
  const storageCalls: string[] = [];
  const client = {
    from(table: string) {
      const query = new FakeQuery(table, rowsByTable[table] ?? []);
      queries.push(query);
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(path: string) {
            storageCalls.push(`public:${bucket}:${path}`);
            return { data: { publicUrl: `https://cdn.test/${bucket}/${path}` } };
          },
          async createSignedUploadUrl(path: string) {
            return {
              data: { token: "token", path, signedUrl: "https://upload.test" },
              error: null,
            };
          },
          async exists(path: string) {
            storageCalls.push(`exists:${bucket}:${path}`);
            return { data: true, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return {
    client,
    storageCalls,
    queryFor(table: string) {
      const query = queries.find((candidate) => candidate.table === table);
      if (!query) throw new Error(`Missing query for ${table}`);
      return query;
    },
    queriesFor(table: string) {
      return queries.filter((candidate) => candidate.table === table);
    },
  };
}

describe("createSupabaseDocumentRepository", () => {
  test("public annual reports select only published report and asset rows", async () => {
    const fake = createFakeClient({
      annual_reports: [
        {
          id: "report-1",
          title: "Annual Report 2025/26",
          year_label: "2025/26",
          is_published: true,
          sort_order: 1,
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
          document_assets: assetRow(),
        },
      ],
    });
    const repository = createSupabaseDocumentRepository(fake.client);

    const reports = await repository.listPublishedAnnualReports();

    expect(fake.queryFor("annual_reports").selectedColumns).toContain("document_assets!");
    expect(fake.queryFor("annual_reports").selectedColumns).not.toContain("*");
    expect(fake.queryFor("annual_reports").filters).toContainEqual(["eq", "is_published", true]);
    expect(fake.queryFor("annual_reports").filters).toContainEqual([
      "eq",
      "document_assets.is_published",
      true,
    ]);
    expect(reports[0]?.document.fileUrl).toBe(
      "https://cdn.test/site-documents/annual-reports/2025-26.pdf",
    );
  });

  test("public slots use an inner published asset join and requested slot keys", async () => {
    const fake = createFakeClient({
      site_document_slots: [
        {
          id: "slot-1",
          slot_key: "wedding_gift_return_plan",
          language: "zh-HK",
          is_published: true,
          document_assets: assetRow({ kind: "wedding_form" }),
        },
      ],
    });
    const repository = createSupabaseDocumentRepository(fake.client);

    const slots = await repository.listPublishedSlots(["wedding_gift_return_plan"]);

    expect(fake.queryFor("site_document_slots").selectedColumns).toContain("document_assets!inner");
    expect(fake.queryFor("site_document_slots").filters).toContainEqual([
      "in",
      "slot_key",
      ["wedding_gift_return_plan"],
    ]);
    expect(fake.queryFor("site_document_slots").filters).toContainEqual([
      "eq",
      "is_published",
      true,
    ]);
    expect(fake.queryFor("site_document_slots").filters).toContainEqual([
      "eq",
      "document_assets.is_published",
      true,
    ]);
    expect(slots).toHaveLength(1);
  });

  test("never creates public links for missing, unpublished, or malformed joined assets", async () => {
    const fake = createFakeClient({
      annual_reports: [
        { id: "missing", is_published: true, document_assets: null },
        { id: "draft", is_published: true, document_assets: assetRow({ is_published: false }) },
        {
          id: "bucket",
          is_published: true,
          document_assets: assetRow({ bucket_name: "other" }),
        },
        {
          id: "path",
          is_published: true,
          document_assets: assetRow({ object_path: "report.docx" }),
        },
        {
          id: "mime",
          is_published: true,
          document_assets: assetRow({ mime_type: "text/plain" }),
        },
        { id: "title", is_published: true, document_assets: assetRow({ title: "" }) },
        {
          id: "created-at",
          is_published: true,
          document_assets: assetRow({ created_at: "not-a-timestamp" }),
        },
        {
          id: "updated-at",
          is_published: true,
          document_assets: assetRow({ updated_at: "tomorrow" }),
        },
      ],
    });
    const repository = createSupabaseDocumentRepository(fake.client);

    await expect(repository.listPublishedAnnualReports()).resolves.toEqual([]);
    expect(fake.storageCalls).toEqual([]);
  });

  test("lists assets with explicit columns, filters, and exact pagination", async () => {
    const fake = createFakeClient({ document_assets: [assetRow()] });
    const repository = createSupabaseDocumentRepository(fake.client);

    const result = await repository.listAssets({
      kind: "annual_report",
      language: "bilingual",
      q: "board,(draft)%_",
      page: 2,
      pageSize: 10,
    });

    const query = fake.queryFor("document_assets");
    expect(query.selectedColumns).not.toContain("*");
    expect(query.filters).toEqual(
      expect.arrayContaining([
        ["eq", "kind", "annual_report"],
        ["eq", "language", "bilingual"],
        ["or", "", 'title.ilike."%board,(draft)\\%\\_%",object_path.ilike."%board,(draft)\\%\\_%"'],
      ]),
    );
    expect(query.rangeArgs).toEqual([10, 19]);
    expect(result.total).toBe(1);
  });

  test("gets assets by exact id with explicit columns", async () => {
    const fake = createFakeClient({
      document_assets: [assetRow()],
    });
    const repository = createSupabaseDocumentRepository(fake.client);

    await expect(repository.getAssetById(assetId)).resolves.toMatchObject({
      id: assetId,
      objectPath: "annual-reports/2025-26.pdf",
    });
    expect(fake.queryFor("document_assets").selectedColumns).not.toContain("*");
    expect(fake.queryFor("document_assets").filters).toContainEqual(["eq", "id", assetId]);
  });
  test("returns null when an exact asset id is missing", async () => {
    const fake = createFakeClient({ document_assets: [] });
    const repository = createSupabaseDocumentRepository(fake.client);

    await expect(repository.getAssetById("missing")).resolves.toBeNull();
  });

  test("creates assets with explicit columns and snake-case fields", async () => {
    const fake = createFakeClient({ document_assets: [assetRow({ is_published: false })] });
    const repository = createSupabaseDocumentRepository(fake.client);

    await expect(
      repository.createAsset({
        kind: "annual_report",
        title: "Annual Report 2025/26",
        language: "bilingual",
        bucketName: "site-documents",
        objectPath: "annual-reports/2025-26.pdf",
        mimeType: "application/pdf",
        byteSize: 1024,
        checksumSha256: null,
        isPublished: false,
        sortOrder: 1,
      }),
    ).resolves.toMatchObject({ id: assetId, isPublished: false });

    const query = fake.queryFor("document_assets");
    expect(query.action).toBe("insert");
    expect(query.selectedColumns).not.toContain("*");
    expect(query.payload).toEqual({
      kind: "annual_report",
      title: "Annual Report 2025/26",
      language: "bilingual",
      bucket_name: "site-documents",
      object_path: "annual-reports/2025-26.pdf",
      mime_type: "application/pdf",
      byte_size: 1024,
      checksum_sha256: null,
      is_published: false,
      sort_order: 1,
    });
  });

  test("updates publication state and deletes by exact asset id", async () => {
    const fake = createFakeClient({ document_assets: [assetRow({ is_published: false })] });
    const repository = createSupabaseDocumentRepository(fake.client);

    await expect(
      repository.updateAsset(assetId, {
        title: "Updated report",
        objectPath: "annual-reports/updated.pdf",
      }),
    ).resolves.toMatchObject({ title: "Updated report" });
    await expect(repository.setAssetPublished(assetId, true)).resolves.toMatchObject({
      isPublished: true,
    });
    await expect(repository.deleteAsset(assetId)).resolves.toBeUndefined();

    const [update, publish, deletion] = fake.queriesFor("document_assets");
    expect(update?.action).toBe("update");
    expect(update?.payload).toEqual({
      title: "Updated report",
      object_path: "annual-reports/updated.pdf",
    });
    expect(update?.filters).toContainEqual(["eq", "id", assetId]);
    expect(publish?.payload).toEqual({ is_published: true });
    expect(publish?.filters).toContainEqual(["eq", "id", assetId]);
    expect(deletion?.action).toBe("delete");
    expect(deletion?.filters).toContainEqual(["eq", "id", assetId]);
  });

  test("inserts document actions into the existing audit log", async () => {
    const fake = createFakeClient({ audit_log: [] });
    const repository = createSupabaseDocumentRepository(fake.client);
    const row = {
      actor_user_id: assetId,
      action: "document.update" as const,
      entity: "document_asset" as const,
      entity_id: assetId,
      detail: { title: "Updated report" },
      timestamp: "2026-07-19T01:02:03.000Z",
    };

    await expect(repository.insertAuditLog(row)).resolves.toBeUndefined();

    const query = fake.queryFor("audit_log");
    expect(query.action).toBe("insert");
    expect(query.payload).toEqual(row);
  });

  test("uses signed upload and existence APIs without downloading objects", async () => {
    const fake = createFakeClient({});
    const repository = createSupabaseDocumentRepository(fake.client);

    await expect(repository.createSignedUploadUrl("forms/wedding.pdf")).resolves.toEqual({
      token: "token",
      path: "forms/wedding.pdf",
    });
    await expect(repository.verifyObject("forms/wedding.pdf")).resolves.toBe(true);
    expect(fake.storageCalls).toContain("exists:site-documents:forms/wedding.pdf");
  });

  test("counts both reference tables before deletion", async () => {
    const fake = createFakeClient({ annual_reports: [{}], site_document_slots: [{}, {}] });
    const repository = createSupabaseDocumentRepository(fake.client);

    await expect(repository.countAssetReferences("asset-1")).resolves.toBe(3);
    expect(fake.queriesFor("annual_reports")[0]?.filters).toContainEqual([
      "eq",
      "document_asset_id",
      "asset-1",
    ]);
    expect(fake.queriesFor("site_document_slots")[0]?.filters).toContainEqual([
      "eq",
      "document_asset_id",
      "asset-1",
    ]);
  });
});

test("lists draft annual reports with their unpublished PDF assets", async () => {
  const fake = createFakeClient({ annual_reports: [annualReportRow()] });
  const repository = createSupabaseDocumentRepository(fake.client);

  await expect(repository.listAnnualReports()).resolves.toEqual([
    expect.objectContaining({
      id: reportId,
      isPublished: false,
      document: expect.objectContaining({ id: assetId, isPublished: false }),
    }),
  ]);
  expect(fake.queryFor("annual_reports").selectedColumns).not.toContain("*");
});

test("creates, updates, publishes, and deletes annual reports by exact id", async () => {
  const fake = createFakeClient({ annual_reports: [annualReportRow()] });
  const repository = createSupabaseDocumentRepository(fake.client);

  await repository.createAnnualReport({
    title: "Annual Report 2025/26",
    yearLabel: "2025/26",
    documentAssetId: assetId,
    isPublished: false,
    sortOrder: 1,
  });
  await repository.updateAnnualReport(reportId, { title: "Updated report", sortOrder: 2 });
  await repository.setAnnualReportPublished(reportId, true);
  await repository.deleteAnnualReport(reportId);

  const [creation, update, publish, deletion] = fake.queriesFor("annual_reports");
  expect(creation?.payload).toEqual({
    title: "Annual Report 2025/26",
    year_label: "2025/26",
    document_asset_id: assetId,
    is_published: false,
    sort_order: 1,
  });
  expect(update?.payload).toEqual({ title: "Updated report", sort_order: 2 });
  expect(update?.filters).toContainEqual(["eq", "id", reportId]);
  expect(publish?.payload).toEqual({ is_published: true });
  expect(publish?.filters).toContainEqual(["eq", "id", reportId]);
  expect(deletion?.action).toBe("delete");
  expect(deletion?.filters).toContainEqual(["eq", "id", reportId]);
});

test("gets annual reports by exact id", async () => {
  const fake = createFakeClient({ annual_reports: [annualReportRow()] });
  const repository = createSupabaseDocumentRepository(fake.client);

  await expect(repository.getAnnualReportById(reportId)).resolves.toMatchObject({ id: reportId });
  expect(fake.queryFor("annual_reports").filters).toContainEqual(["eq", "id", reportId]);
});

test("maps annual-report unique violations to DocumentConflictError", async () => {
  const query = {
    insert() {
      return this;
    },
    select() {
      return this;
    },
    async single() {
      return {
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      };
    },
  };
  const client = {
    from() {
      return query;
    },
  } as unknown as SupabaseClient;
  const repository = createSupabaseDocumentRepository(client);

  await expect(
    repository.createAnnualReport({
      title: "Annual Report 2025/26",
      yearLabel: "2025/26",
      documentAssetId: assetId,
      isPublished: false,
      sortOrder: 1,
    }),
  ).rejects.toBeInstanceOf(DocumentConflictError);
});
test("uses one RPC for an authenticated mutation and its audit record", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const query = new FakeQuery("document_assets", [assetRow({ title: "Updated atomically" })]);
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: assetId, error: null });
    },
    from() {
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.test/${bucket}/${path}` } };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  const repository = createSupabaseDocumentRepository(client);

  await expect(
    repository.updateAsset(assetId, { title: "Updated atomically" }, assetId),
  ).resolves.toMatchObject({ title: "Updated atomically" });

  expect(rpcCalls).toEqual([
    {
      name: "mutate_document_asset_with_audit",
      args: {
        p_actor_user_id: assetId,
        p_operation: "update",
        p_id: assetId,
        p_values: { title: "Updated atomically" },
      },
    },
  ]);
});

test("maps document invariant violations to DocumentConflictError", async () => {
  const query = {
    insert() {
      return this;
    },
    select() {
      return this;
    },
    async single() {
      return {
        data: null,
        error: { code: "23514", message: "annual report asset invariant" },
      };
    },
  };
  const client = {
    from() {
      return query;
    },
  } as unknown as SupabaseClient;
  const repository = createSupabaseDocumentRepository(client);

  await expect(
    repository.createAnnualReport({
      title: "Annual Report 2025/26",
      yearLabel: "2026/27",
      documentAssetId: assetId,
      isPublished: false,
      sortOrder: 1,
    }),
  ).rejects.toBeInstanceOf(DocumentConflictError);
});
