import { describe, expect, test } from "bun:test";
import { renderAdminInChinese } from "../i18n/testing";

import type { DocumentAsset } from "../../../lib/documents/types";
import {
  KnowledgeManagementView,
  buildKnowledgeSearchParams,
  filterPublishedPdfAssets,
  invalidateKnowledgeQueries,
} from "./KnowledgeManagement";

const post = {
  id: "post-1",
  title: "After adoption guide",
  topic: "adoption",
  shortIntro: "What adopters should know.",
  sourceName: "HKSCDA",
  destination: { kind: "external" as const, url: "https://example.test/guide" },
  isPublished: true,
  sortOrder: 2,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

const documentAsset: DocumentAsset = {
  id: "asset-1",
  kind: "adoption_guide",
  title: "What you need to know after adoption",
  language: "zh-HK",
  bucketName: "site-documents",
  objectPath: "adoption/guide.pdf",
  mimeType: "application/pdf",
  byteSize: 1234,
  checksumSha256: "abc",
  isPublished: true,
  sortOrder: 1,
  fileUrl: "https://cdn.example.test/guide.pdf",
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

describe("KnowledgeManagement", () => {
  test("builds capped search params for the admin knowledge API", () => {
    expect(
      buildKnowledgeSearchParams({
        q: "  cat  ",
        status: "published",
        page: 0,
        pageSize: 99,
      }).toString(),
    ).toBe("page=1&pageSize=50&status=published&q=cat");
  });

  test("restricts document picker choices to published PDFs", () => {
    expect(
      filterPublishedPdfAssets([
        documentAsset,
        { ...documentAsset, id: "draft", isPublished: false },
        { ...documentAsset, id: "image", mimeType: "image/png" } as unknown as DocumentAsset,
      ]).map((asset) => asset.id),
    ).toEqual(["asset-1"]);
  });

  test("renders external and document modes, HTTPS warning, publish toggle, ordering, and states", () => {
    const markup = renderAdminInChinese(
      <KnowledgeManagementView
        data={{
          posts: [
            post,
            {
              ...post,
              id: "post-2",
              destination: {
                kind: "document",
                assetId: "asset-1",
                url: "https://cdn.example.test/guide.pdf",
              },
              isPublished: false,
              sortOrder: 3,
            },
          ],
          total: 2,
          page: 1,
          pageSize: 50,
        }}
        documents={[documentAsset]}
        query="cat"
        loading={false}
        error="Could not load"
      />,
    );

    expect(markup).toContain("知識專區");
    expect(markup).toContain("外部網址");
    expect(markup).toContain("PDF 文件");
    expect(markup).toContain("只接受 HTTPS 網址");
    expect(markup).toContain("Published");
    expect(markup).toContain("Draft");
    expect(markup).toContain("排序");
    expect(markup).toContain("Could not load");
    expect(markup).toContain("What you need to know after adoption");
  });

  test("renders release-managed bilingual posts read-only with both asset IDs", () => {
    const zhHkAssetId = "11111111-2222-4333-8444-555555555555";
    const enAssetId = "66666666-7777-4888-8999-000000000000";
    const markup = renderAdminInChinese(
      <KnowledgeManagementView
        data={{
          posts: [
            {
              ...post,
              id: "paired-post",
              destination: {
                kind: "document_pair",
                zhHkAssetId,
                enAssetId,
              },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }}
        documents={[documentAsset]}
        query=""
        ownerReleaseIds={{ "paired-post": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }}
      />,
    );

    const marker = 'data-release-managed-knowledge="paired-post"';
    expect(markup).toContain(marker);
    const sectionStart = markup.indexOf(marker);
    const sectionEnd = markup.indexOf("</section>", sectionStart);
    const pairedSection = markup.slice(sectionStart, sectionEnd);

    expect(pairedSection).toContain("\u7531\u9818\u990a\u6307\u5357\u7248\u672c\u7ba1\u7406");
    expect(pairedSection).toContain(
      'href="/admin/content/adoption-guides?releaseId=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"',
    );
    expect(pairedSection).toContain(zhHkAssetId);
    expect(pairedSection).toContain(enAssetId);
    expect(pairedSection).not.toContain("連結方式");
    expect(pairedSection).not.toContain("<input");
    expect(pairedSection).not.toContain("<select");
    expect(pairedSection).not.toContain("<button");
    expect(pairedSection).not.toContain("Save");
    expect(pairedSection).not.toContain("Delete");
  });

  test("keeps unrelated Knowledge controls and fails closed while ownership is unknown", () => {
    const unrelated = renderAdminInChinese(
      <KnowledgeManagementView
        data={{ posts: [post], total: 1, page: 1, pageSize: 50 }}
        documents={[documentAsset]}
        query=""
        ownershipReady
        onSave={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(unrelated).toContain("Save");
    expect(unrelated).toContain("Delete");
    expect(unrelated).not.toContain("/admin/content/adoption-guides?releaseId=");

    const unknown = renderAdminInChinese(
      <KnowledgeManagementView
        data={{ posts: [post], total: 1, page: 1, pageSize: 50 }}
        documents={[documentAsset]}
        query=""
        ownershipReady={false}
        onSave={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(unknown).not.toContain("Save");
    expect(unknown).not.toContain("Delete");
  });

  test("renders loading and empty states", () => {
    expect(
      renderAdminInChinese(
        <KnowledgeManagementView loading data={undefined} documents={[]} query="" />,
      ),
    ).toContain("Loading knowledge posts");
    expect(
      renderAdminInChinese(
        <KnowledgeManagementView
          data={{ posts: [], total: 0, page: 1, pageSize: 50 }}
          documents={[]}
          query=""
        />,
      ),
    ).toContain("尚未有知識庫文章");
  });

  test("does not claim there are no posts underneath a load error", () => {
    // posts defaulted to [] on a rejected query, so the empty-state text
    // rendered directly alongside the error banner -- a failure asserted as a
    // confirmed empty knowledge base.
    const markup = renderAdminInChinese(
      <KnowledgeManagementView
        data={{ posts: [], total: 0, page: 1, pageSize: 50 }}
        documents={[]}
        query=""
        error="boom"
      />,
    );
    expect(markup).toContain("boom");
    expect(markup).not.toContain("尚未有知識庫文章");
  });

  test("invalidates knowledge queries after mutations", async () => {
    const invalidations: unknown[] = [];
    await invalidateKnowledgeQueries({
      invalidateQueries: async (input) => invalidations.push(input),
    });
    expect(invalidations).toEqual([{ queryKey: ["admin-knowledge"] }]);
  });
});
