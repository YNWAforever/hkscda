import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { KnowledgeGrid, KnowledgeGridSkeleton } from "./KnowledgeGrid";

const external = { id: "external-1", title: "HK01 pet care guide", topic: "pet-care", shortIntro: "External seed.", sourceName: "HK01", destination: { kind: "external" as const, url: "https://example.test/hk01" }, isPublished: true, sortOrder: 0, createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z" };
const pdf = { ...external, id: "pdf-1", title: "What you need to know after adoption", sourceName: "HKSCDA", destination: { kind: "document" as const, assetId: "asset-1", url: "https://cdn.example.test/guide.pdf" }, sortOrder: 2 };

describe("KnowledgeGrid", () => {
  test("renders repeated responsive items with source and safe actions", () => {
    const markup = renderToStaticMarkup(<KnowledgeGrid posts={[external, { ...external, id: "external-2", title: "10Life pet insurance comparison", sourceName: "10Life" }, pdf, { ...pdf, id: "pdf-2", title: "What you need to know after adopting a cat" }]} />);
    expect(markup).toContain("grid");
    expect(markup).toContain("HK01 pet care guide");
    expect(markup).toContain("10Life pet insurance comparison");
    expect(markup).toContain("What you need to know after adoption");
    expect(markup).toContain("Source: HK01");
    expect(markup).toContain("下載 PDF / Download PDF");
    expect(markup).toContain("了解更多 / Read More");
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });

  test("renders stable skeleton for client transitions", () => {
    expect(renderToStaticMarkup(<KnowledgeGridSkeleton />)).toContain("Loading knowledge resources");
  });
});
