import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test, mock } from "bun:test";
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

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children?: unknown; to: string }) => (
    <a href={to} {...props}>
      {children as never}
    </a>
  ),
  useRouterState: () => false,
}));

describe("knowledge route", () => {
  test("renders loader-provided initial data and page title", () => {
    const markup = renderToStaticMarkup(<KnowledgePageView posts={[post]} isPending={false} />);
    expect(markup).toContain("知識資源");
    // The previous guard here was itself mojibake, so it matched nothing. Assert
    // the property it reached for: no replacement characters, and no CJK
    // mis-decoded into the Latin-1 range, anywhere in the rendered page.
    expect(markup).not.toContain(String.fromCharCode(0xfffd));
    expect(markup).not.toMatch(/[À-ÿ]{3,}/);
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
