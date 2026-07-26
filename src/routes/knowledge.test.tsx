import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { KnowledgePageView } from "./knowledge";

const post = {
  id: "post-1",
  title: "HK01 pet care guide",
  topic: "pet-care",
  shortIntro: "External seed.",
  sourceName: "HK01",
  destination: { kind: "external" as const, url: "https://example.test/hk01" },
  isPublished: true,
  sortOrder: 0,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

describe("knowledge route", () => {
  test("renders loader-provided initial data and page title", () => {
    const markup = renderToStaticMarkup(<KnowledgePageView posts={[post]} isPending={false} />);
    expect(markup).toContain("知識資源");
    expect(markup).not.toContain("擗??霅??");
    expect(markup).toContain("HK01 pet care guide");
  });

  test("keeps the public knowledge loader behind a server function boundary", () => {
    const source = readFileSync(join(process.cwd(), "src/routes/knowledge.tsx"), "utf8");
    expect(source).toContain("loader:");
    expect(source).toContain("getPublicKnowledgePage");
    expect(source).toContain("publicPage.functions");
    expect(source).not.toContain("publicPage.server");
    expect(source).not.toContain("loadPublicKnowledgePage");
    expect(source).toContain("useLoaderData");
    expect(source).not.toContain("fetchAdminJson");
    expect(source).not.toContain("useQuery");
  });
});
