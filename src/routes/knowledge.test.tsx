import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { KnowledgePageView } from "./knowledge";

const post = { id: "post-1", title: "HK01 pet care guide", topic: "pet-care", shortIntro: "External seed.", sourceName: "HK01", destination: { kind: "external" as const, url: "https://example.test/hk01" }, isPublished: true, sortOrder: 0, createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z" };

describe("knowledge route", () => {
  test("renders loader-provided initial data and page title", () => {
    const markup = renderToStaticMarkup(<KnowledgePageView posts={[post]} isPending={false} />);
    expect(markup).toContain("擗??霅??");
    expect(markup).toContain("HK01 pet care guide");
  });

  test("uses loader-first public knowledge data without a client fetch", () => {
    const source = readFileSync(join(process.cwd(), "src/routes/knowledge.tsx"), "utf8");
    expect(source).toContain("loader:");
    expect(source).toContain("loadPublicKnowledgePage");
    expect(source).toContain("useLoaderData");
    expect(source).not.toContain("fetchAdminJson");
    expect(source).not.toContain("useQuery");
  });
});
