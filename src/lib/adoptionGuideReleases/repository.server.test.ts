import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentAsset } from "../documents/types";

import {
  AdoptionGuideReleaseError,
  createSupabaseAdoptionGuideReleaseRepository,
} from "./repository.server";

const releaseId = "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae";
const zhAssetId = "c3644738-7ea4-4a38-8e6e-46b5b6a44a4b";
const enAssetId = "21e42e2a-5d0e-4778-97ba-4e2c3ac3b594";
const actorUserId = "7d3ec361-f0a0-4300-8808-c34ed4e86542";

const releaseRow = {
  id: releaseId,
  topic: "post_adoption",
  species: "cat",
  zh_hk_asset_id: zhAssetId,
  en_asset_id: enAssetId,
  knowledge_post_id: null,
  knowledge_title: "Caring for your cat after adoption",
  knowledge_topic: "Post adoption care",
  knowledge_short_intro: "A practical guide for the first weeks at home.",
  knowledge_source_name: null,
  sort_order: 0,
  state: "draft",
  version: 2,
  created_by: actorUserId,
  updated_by: actorUserId,
  submitted_by: null,
  submitted_at: null,
  published_by: null,
  published_at: null,
  archived_by: null,
  archived_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T01:00:00.000Z",
};

const assetRows = [
  {
    id: zhAssetId,
    kind: "adoption_guide",
    title: "Cat adoption guide",
    language: "zh-HK",
    bucket_name: "site-documents",
    object_path: "adoption-guides/cat-zh.pdf",
    mime_type: "application/pdf",
    byte_size: 10,
    checksum_sha256: null,
    is_published: true,
    sort_order: 0,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  },
  {
    id: enAssetId,
    kind: "adoption_guide",
    title: "Cat adoption guide",
    language: "en",
    bucket_name: "site-documents",
    object_path: "adoption-guides/cat-en.pdf",
    mime_type: "application/pdf",
    byte_size: 10,
    checksum_sha256: null,
    is_published: false,
    sort_order: 0,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  },
];

function createClient(options: {
  queryResult?: { data: unknown; error: unknown; count?: number | null };
  rpcResult?: { data: unknown; error: unknown };
  existsByPath?: Record<string, boolean>;
  signedUrlResult?: { data: { signedUrl?: string } | null; error: unknown };
} = {}) {
  const queryResult = options.queryResult ?? { data: [releaseRow], error: null, count: 1 };
  const query: Record<string, unknown> = {};
  const select = mock(() => query);
  const order = mock(() => query);
  const range = mock(() => query);
  const eq = mock(() => query);
  const or = mock(() => query);
  const inFilter = mock(() => query);
  const maybeSingle = mock(async () => queryResult);
  Object.assign(query, {
    select,
    order,
    range,
    eq,
    or,
    in: inFilter,
    maybeSingle,
    then: (
      resolve: (value: typeof queryResult) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(queryResult).then(resolve, reject),
  });

  const exists = mock(async (objectPath: string) => ({
    data: options.existsByPath?.[objectPath] ?? true,
    error: null,
  }));
  const createSignedUrl = mock(
    async (objectPath: string) =>
      options.signedUrlResult ?? {
        data: { signedUrl: `https://private.example/${objectPath}` },
        error: null,
      },
  );
  const getPublicUrl = mock((objectPath: string) => ({
    data: { publicUrl: `https://public.example/${objectPath}` },
  }));
  const storageFrom = mock(() => ({ exists, createSignedUrl, getPublicUrl }));
  const from = mock(() => query);
  const rpc = mock(
    async () => options.rpcResult ?? { data: releaseRow, error: null },
  );
  const client = {
    from,
    rpc,
    storage: { from: storageFrom },
  } as unknown as SupabaseClient;

  return {
    client,
    from,
    select,
    order,
    range,
    eq,
    or,
    inFilter,
    maybeSingle,
    rpc,
    storageFrom,
    exists,
    createSignedUrl,
  };
}

describe("createSupabaseAdoptionGuideReleaseRepository", () => {
  test("lists releases with explicit columns and stable pagination", async () => {
    const { client, select, order, range, eq, or } = createClient();
    const repository = createSupabaseAdoptionGuideReleaseRepository(client);

    const result = await repository.list({
      page: 1,
      pageSize: 25,
      q: "cat%,_()",
      species: "cat",
      state: "draft",
    });

    expect(select).toHaveBeenCalledWith(expect.stringContaining("knowledge_post_id"), {
      count: "exact",
    });
    expect(order).toHaveBeenNthCalledWith(1, "updated_at", { ascending: false });
    expect(order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(range).toHaveBeenCalledWith(0, 24);
    expect(eq).toHaveBeenCalledWith("species", "cat");
    expect(eq).toHaveBeenCalledWith("state", "draft");
    expect(or).toHaveBeenCalledWith(expect.not.stringContaining("cat%,_()"));
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 25 });
    expect(result.items[0]).toMatchObject({
      id: releaseId,
      knowledgePostId: null,
      zhHkAssetId: zhAssetId,
    });
  });

  test("caps oversized pages at fifty rows", async () => {
    const { client, range } = createClient({ queryResult: { data: [], error: null, count: 0 } });
    const repository = createSupabaseAdoptionGuideReleaseRepository(client);

    const result = await repository.list({ page: 2, pageSize: 500 });

    expect(range).toHaveBeenCalledWith(50, 99);
    expect(result.pageSize).toBe(50);
  });

  test("passes publish identity and idempotency to one RPC", async () => {
    const publishRow = {
      release_id: releaseId,
      release_version: 3,
      knowledge_post_id: enAssetId,
      zh_hk_asset_id: zhAssetId,
      en_asset_id: enAssetId,
      slot_key: "post_adoption_guide_cat",
    };
    const { client, rpc } = createClient({ rpcResult: { data: publishRow, error: null } });
    const repository = createSupabaseAdoptionGuideReleaseRepository(client);

    await expect(
      repository.publish({
        id: releaseId,
        expectedVersion: 2,
        actorUserId,
        idempotencyKey: "publish-cat-guide-0001",
      }),
    ).resolves.toEqual({
      releaseId,
      releaseVersion: 3,
      knowledgePostId: enAssetId,
      zhHkAssetId: zhAssetId,
      enAssetId,
      slotKey: "post_adoption_guide_cat",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("publish_adoption_guide_release", {
      p_release_id: releaseId,
      p_expected_version: 2,
      p_actor_user_id: actorUserId,
      p_idempotency_key: "publish-cat-guide-0001",
    });
  });

  test("verifies release assets against real Storage objects rather than public URLs", async () => {
    const { client, exists } = createClient({
      queryResult: { data: assetRows, error: null, count: 2 },
      existsByPath: {
        "adoption-guides/cat-zh.pdf": false,
        "adoption-guides/cat-en.pdf": true,
      },
    });
    const repository = createSupabaseAdoptionGuideReleaseRepository(client);

    const assets = await repository.getAssets(zhAssetId, enAssetId);

    expect(assets.zhHk?.asset.fileUrl).toBe(
      "https://public.example/adoption-guides/cat-zh.pdf",
    );
    expect(assets.zhHk?.objectVerified).toBe(false);
    expect(assets.en?.objectVerified).toBe(true);
    expect(exists).toHaveBeenCalledTimes(2);
  });

  test("signs previews from the exact asset bucket and path for five minutes", async () => {
    const { client, storageFrom, createSignedUrl } = createClient();
    const repository = createSupabaseAdoptionGuideReleaseRepository(client);
    const asset: DocumentAsset = {
      id: zhAssetId,
      kind: "adoption_guide",
      title: "Cat adoption guide",
      language: "zh-HK",
      bucketName: "site-documents",
      objectPath: "adoption-guides/cat-zh.pdf",
      fileUrl: null,
      mimeType: "application/pdf",
      byteSize: 10,
      checksumSha256: null,
      isPublished: false,
      sortOrder: 0,
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    };

    await expect(repository.previewAssetUrl(asset)).resolves.toBe(
      "https://private.example/adoption-guides/cat-zh.pdf",
    );
    expect(storageFrom).toHaveBeenCalledWith("site-documents");
    expect(createSignedUrl).toHaveBeenCalledWith("adoption-guides/cat-zh.pdf", 300);
  });

  test("sanitizes signed preview provider failures", async () => {
    const { client } = createClient({
      signedUrlResult: {
        data: null,
        error: { code: "storage_failure", message: "select secret from storage.objects" },
      },
    });
    const repository = createSupabaseAdoptionGuideReleaseRepository(client);
    const asset = {
      id: zhAssetId,
      kind: "adoption_guide",
      title: "Cat adoption guide",
      language: "zh-HK",
      bucketName: "site-documents",
      objectPath: "adoption-guides/cat-zh.pdf",
      fileUrl: null,
      mimeType: "application/pdf",
      byteSize: 10,
      checksumSha256: null,
      isPublished: false,
      sortOrder: 0,
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    } as DocumentAsset;
    const error = await repository.previewAssetUrl(asset).catch((reason) => reason);

    expect(error).toMatchObject({ code: "internal", status: 500 });
    expect(error.message).not.toContain("storage.objects");
  });

  test("maps stale-version provider failures to a sanitized conflict", async () => {
    const { client } = createClient({
      rpcResult: {
        data: null,
        error: {
          code: "40001",
          message: "Stale adoption guide release version",
          details: "update public.adoption_guide_releases set version = version + 1",
        },
      },
    });
    const repository = createSupabaseAdoptionGuideReleaseRepository(client);

    const error = await repository
      .transition({
        id: releaseId,
        expectedVersion: 1,
        operation: "submit",
        actorUserId,
      })
      .catch((reason) => reason);

    expect(error).toBeInstanceOf(AdoptionGuideReleaseError);
    expect(error).toMatchObject({ code: "conflict", status: 409 });
    expect(error.message).not.toContain("update public");
  });

  const providerCases = [
    {
      label: "not-found",
      provider: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
      expected: { code: "not_found", status: 404 },
    },
    {
      label: "readiness invariant",
      provider: { code: "23514", message: "Both adoption guide assets are required" },
      expected: { code: "invalid", status: 422 },
    },
    {
      label: "authorization",
      provider: { code: "42501", message: "Active admin actor required" },
      expected: { code: "forbidden", status: 403 },
    },
    {
      label: "unknown provider",
      provider: {
        code: "XX999",
        message: "select secret from public.adoption_guide_releases",
        details: "sensitive SQL",
      },
      expected: { code: "internal", status: 500 },
    },
  ] as const;

  for (const providerCase of providerCases) {
    test(`maps ${providerCase.label} failures without leaking provider details`, async () => {
      const { client } = createClient({
        rpcResult: { data: null, error: providerCase.provider },
      });
      const repository = createSupabaseAdoptionGuideReleaseRepository(client);

      const error = await repository
        .transition({
          id: releaseId,
          expectedVersion: 2,
          operation: "submit",
          actorUserId,
        })
        .catch((reason) => reason);

      expect(error).toBeInstanceOf(AdoptionGuideReleaseError);
      expect(error).toMatchObject(providerCase.expected);
      expect(error.message).not.toContain(String(providerCase.provider.message));
      if ("details" in providerCase.provider) {
        expect(error.message).not.toContain(providerCase.provider.details);
      }
    });
  }
});
