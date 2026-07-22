import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { KnowledgeManagementView, buildKnowledgeSearchParams, filterPublishedPdfAssets, invalidateKnowledgeQueries } from "./KnowledgeManagement";

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

const documentAsset = {
  id: "asset-1",
  kind: "adoption_guide",
  title: "What you need to know after adoption",
  language: "zh-Hant",
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
    expect(buildKnowledgeSearchParams({ q: "  cat  ", status: "published", page: 0, pageSize: 99 }).toString()).toBe("page=1&pageSize=50&status=published&q=cat");
  });

  test("restricts document picker choices to published PDFs", () => {
    expect(filterPublishedPdfAssets([
      documentAsset,
      { ...documentAsset, id: "draft", isPublished: false },
      { ...documentAsset, id: "image", mimeType: "image/png" },
    ]).map((asset) => asset.id)).toEqual(["asset-1"]);
  });

  test("renders external and document modes, HTTPS warning, publish toggle, ordering, and states", () => {
    const markup = renderToStaticMarkup(
      <KnowledgeManagementView
        data={{ posts: [post, { ...post, id: "post-2", destination: { kind: "document", assetId: "asset-1", url: "https://cdn.example.test/guide.pdf" }, isPublished: false, sortOrder: 3 }], total: 2, page: 1, pageSize: 50 }}
        documents={[documentAsset]}
        query="cat"
        loading={false}
        error="Could not load"
      />,
    );

    expect(markup).toContain("Knowledge hub");
    expect(markup).toContain("External URL");
    expect(markup).toContain("Document PDF");
    expect(markup).toContain("HTTPS only");
    expect(markup).toContain("Published");
    expect(markup).toContain("Draft");
    expect(markup).toContain("Sort order");
    expect(markup).toContain("Could not load");
    expect(markup).toContain("What you need to know after adoption");
  });

  test("renders loading and empty states", () => {
    expect(renderToStaticMarkup(<KnowledgeManagementView loading data={undefined} documents={[]} query="" />)).toContain("Loading knowledge posts");
    expect(renderToStaticMarkup(<KnowledgeManagementView data={{ posts: [], total: 0, page: 1, pageSize: 50 }} documents={[]} query="" />)).toContain("No knowledge posts yet");
  });

  test("invalidates knowledge queries after mutations", async () => {
    const invalidations: unknown[] = [];
    await invalidateKnowledgeQueries({ invalidateQueries: async (input) => invalidations.push(input) });
    expect(invalidations).toEqual([{ queryKey: ["admin-knowledge"] }]);
  });
});
