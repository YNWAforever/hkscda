import { describe, expect, test } from "bun:test";

import { createSupabaseKnowledgeRepository } from "./repository.server";

const row = {
  id: "post-1",
  title: "Care guide",
  topic: "adoption",
  short_intro: "A short public intro.",
  external_url: "https://example.test/care",
  document_asset_id: null,
  zh_hk_document_asset_id: null,
  en_document_asset_id: null,
  source_name: "HKSCDA",
  is_published: true,
  sort_order: 1,
  created_at: "2026-07-22T00:00:00.000Z",
  updated_at: "2026-07-22T00:00:00.000Z",
  document_assets: null,
  zh_hk_document_assets: null,
  en_document_assets: null,
};

const zhId = "11111111-2222-4333-8444-555555555555";
const enId = "66666666-7777-4888-8999-000000000000";
const pairedRow = {
  ...row,
  id: "paired-post",
  external_url: null,
  zh_hk_document_asset_id: zhId,
  en_document_asset_id: enId,
  zh_hk_document_assets: {
    id: zhId,
    bucket_name: "site-documents",
    object_path: "knowledge/guide-zh.pdf",
    mime_type: "application/pdf",
    is_published: true,
  },
  en_document_assets: {
    id: enId,
    bucket_name: "site-documents",
    object_path: "knowledge/guide-en.pdf",
    mime_type: "application/pdf",
    is_published: true,
  },
};

function createBuilder(calls: unknown[], data: unknown[] = [row], count = data.length) {
  const builder: Record<string, unknown> = {
    select(columns: string, options?: unknown) {
      calls.push({ name: "select", columns, options });
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push({ name: "eq", column, value });
      return builder;
    },
    or(filter: string) {
      calls.push({ name: "or", filter });
      return builder;
    },
    order(column: string, options?: unknown) {
      calls.push({ name: "order", column, options });
      return builder;
    },
    range(from: number, to: number) {
      calls.push({ name: "range", from, to });
      return Promise.resolve({ data, error: null, count });
    },
    upsert(payload: unknown) {
      calls.push({ name: "upsert", payload });
      return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
    },
    delete() {
      calls.push({ name: "delete" });
      return { eq: async (column: string, value: unknown) => ({ column, value, error: null }) };
    },
    insert(payload: unknown) {
      calls.push({ name: "insert", payload });
      return Promise.resolve({ error: null });
    },
  };
  return builder;
}

function createClient(data?: unknown[]) {
  const calls: unknown[] = [];
  return {
    calls,
    from(table: string) {
      calls.push({ name: "from", table });
      return createBuilder(calls, data);
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(objectPath: string) {
            if (objectPath === "knowledge/unsafe-url.pdf") {
              return { data: { publicUrl: "javascript:alert(1)" } };
            }
            return { data: { publicUrl: `https://cdn.test/${bucket}/${objectPath}` } };
          },
        };
      },
    },
  };
}

describe("Supabase knowledge repository", () => {
  test("lists published posts with SQL filter, stable sort, and mapper defense", async () => {
    const client = createClient([
      row,
      { ...row, id: "draft", is_published: false },
      { ...row, id: "unsafe", external_url: "http://bad.test" },
    ]);
    const repo = createSupabaseKnowledgeRepository(client as never);

    await expect(repo.listPublished()).resolves.toEqual([
      {
        id: "post-1",
        title: "Care guide",
        topic: "adoption",
        shortIntro: "A short public intro.",
        sourceName: "HKSCDA",
        destination: { kind: "external", url: "https://example.test/care" },
        isPublished: true,
        sortOrder: 1,
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
    ]);
    expect(client.calls).toContainEqual({ name: "eq", column: "is_published", value: true });
    expect(client.calls).toContainEqual({
      name: "order",
      column: "sort_order",
      options: { ascending: true },
    });
    expect(client.calls).toContainEqual({
      name: "order",
      column: "created_at",
      options: { ascending: false },
    });
  });

  test("selects both pair assets and maps a public pair only when both assets are safe", async () => {
    const client = createClient([
      pairedRow,
      {
        ...pairedRow,
        id: "unsafe-pair",
        en_document_assets: { ...pairedRow.en_document_assets, is_published: false },
      },
      {
        ...pairedRow,
        id: "missing-pair",
        zh_hk_document_assets: null,
      },
      {
        ...pairedRow,
        id: "malformed-url-pair",
        en_document_assets: {
          ...pairedRow.en_document_assets,
          object_path: "knowledge/unsafe-url.pdf",
        },
      },
    ]);
    const repo = createSupabaseKnowledgeRepository(client as never);

    await expect(repo.listPublished()).resolves.toEqual([
      expect.objectContaining({
        id: "paired-post",
        destination: {
          kind: "document_pair",
          zhHkAssetId: zhId,
          enAssetId: enId,
          zhHkUrl: "https://cdn.test/site-documents/knowledge/guide-zh.pdf",
          enUrl: "https://cdn.test/site-documents/knowledge/guide-en.pdf",
        },
      }),
    ]);

    const selectCall = client.calls.find(
      (call) => (call as { name?: unknown }).name === "select",
    ) as { columns: string } | undefined;
    expect(selectCall?.columns).toContain("zh_hk_document_asset_id");
    expect(selectCall?.columns).toContain("en_document_asset_id");
    expect(selectCall?.columns).toContain("zh_hk_document_assets");
    expect(selectCall?.columns).toContain("en_document_assets");
  });

  test("caps admin pages and escapes search filters", async () => {
    const client = createClient();
    const repo = createSupabaseKnowledgeRepository(client as never);
    await repo.listAdmin({ q: 'cat_%"', page: 1, pageSize: 50, status: "all" });
    expect(client.calls).toContainEqual({ name: "range", from: 0, to: 49 });
    const orCall = client.calls.find((call) => (call as { name?: unknown }).name === "or") as
      | { filter: string }
      | undefined;
    const escapedQuote = "\\" + '"';
    expect(orCall?.filter).toContain(`cat\\_\\%${escapedQuote}`);
  });

  test("upserts document destinations and writes audit rows", async () => {
    const client = createClient();
    const repo = createSupabaseKnowledgeRepository(client as never);
    await repo.upsert({
      title: "Doc",
      topic: "adoption",
      shortIntro: "Intro",
      sourceName: null,
      destination: { kind: "document", assetId: "11111111-2222-4333-8444-555555555555" },
      isPublished: false,
      sortOrder: 3,
    });
    await repo.insertAuditLog({
      actor_user_id: "admin-1",
      action: "knowledge_post.create",
      entity: "knowledge_post",
      entity_id: "post-1",
      detail: {},
      timestamp: "2026-07-22T00:00:00.000Z",
    });
    expect(client.calls).toContainEqual({
      name: "upsert",
      payload: {
        title: "Doc",
        topic: "adoption",
        short_intro: "Intro",
        source_name: null,
        external_url: null,
        document_asset_id: "11111111-2222-4333-8444-555555555555",
        zh_hk_document_asset_id: null,
        en_document_asset_id: null,
        is_published: false,
        sort_order: 3,
      },
    });
    expect(client.calls).toContainEqual({
      name: "insert",
      payload: {
        actor_user_id: "admin-1",
        action: "knowledge_post.create",
        entity: "knowledge_post",
        entity_id: "post-1",
        detail: {},
        timestamp: "2026-07-22T00:00:00.000Z",
      },
    });
  });

  test("upserts bilingual document pair destinations", async () => {
    const client = createClient();
    const repo = createSupabaseKnowledgeRepository(client as never);

    await repo.upsert({
      title: "Guide",
      topic: "adoption",
      shortIntro: "Intro",
      sourceName: null,
      destination: {
        kind: "document_pair",
        zhHkAssetId: zhId,
        enAssetId: enId,
      },
      isPublished: false,
      sortOrder: 4,
    });

    expect(client.calls).toContainEqual({
      name: "upsert",
      payload: {
        title: "Guide",
        topic: "adoption",
        short_intro: "Intro",
        source_name: null,
        external_url: null,
        document_asset_id: null,
        zh_hk_document_asset_id: zhId,
        en_document_asset_id: enId,
        is_published: false,
        sort_order: 4,
      },
    });
  });
});
