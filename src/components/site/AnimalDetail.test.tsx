import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShortlistProvider } from "./ShortlistProvider";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const animal = {
  id: "animal-1",
  type: "cat" as const,
  name: "小白",
  name_en: "Snowy",
  gender: "female" as const,
  age: "2歲",
  age_en: null,
  description: "親人，喜歡曬太陽",
  description_en: null,
  notes: "需要安靜家庭",
  notes_en: null,
  status: "available" as const,
  image_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-03-15T00:00:00.000Z",
};

describe("AnimalDetail", () => {
  test("renders the breadcrumb, fact list, and shortlist action inside the detail panel", async () => {
    const { AnimalDetail } = await import("./AnimalDetail");
    const markup = renderToStaticMarkup(
      <ShortlistProvider>
        <AnimalDetail animal={animal} backHref="/animals/cat" backLabel="返回貓貓列表" />
      </ShortlistProvider>,
    );

    expect(markup).toContain("detail-page");
    expect(markup).toContain('href="/animals/cat"');
    expect(markup).toContain("返回貓貓列表");
    expect(markup).toContain("小白");
    expect(markup).toContain("Snowy");
    expect(markup).toContain("fact-list");
    expect(markup).toContain("母");
    expect(markup).toContain("2歲");
    expect(markup).toContain("成年");
    expect(markup).toContain("加入領養清單");
    expect(markup).toContain("親人，喜歡曬太陽");
    expect(markup).toContain("需要安靜家庭");
  });

  test("shows the icon fallback instead of an <img> when the animal has no photo", async () => {
    const { AnimalDetail } = await import("./AnimalDetail");
    const markup = renderToStaticMarkup(
      <ShortlistProvider>
        <AnimalDetail animal={animal} backHref="/animals/cat" backLabel="返回貓貓列表" />
      </ShortlistProvider>,
    );

    expect(markup).toContain("detail-image-fallback");
    expect(markup).not.toContain("<img");
  });
});
