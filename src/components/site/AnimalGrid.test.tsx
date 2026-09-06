import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
}));

describe("AnimalGrid", () => {
  test("announces filters, totals, and a useful empty state", async () => {
    const { AnimalGrid } = await import("./AnimalGrid");
    const markup = renderToStaticMarkup(
      <AnimalGrid
        animals={[]}
        total={0}
        page={1}
        ageFilter="all"
        genderFilter="all"
        animalLabel="貓"
      />,
    );

    expect(markup).toContain("全部年齡");
    expect(markup).toContain("全部性別");
    expect(markup).toContain("共 0 隻貓");
    expect(markup).toContain("暫時沒有符合條件的貓");
    expect(markup).toContain("public-filter-shell");
    expect(markup).toContain("public-state-shell");
    expect(markup).toContain("min-h-11");
  });
});

test("exposes labelled profile controls, active filters and empty recovery", async () => {
  const { AnimalGrid } = await import("./AnimalGrid");
  const markup = renderToStaticMarkup(
    <AnimalGrid
      animals={[]}
      total={0}
      page={1}
      ageFilter="all"
      genderFilter="all"
      q="C017"
      neutered="unknown"
      suitability="experienced"
    />,
  );
  for (const value of [
    'maxLength="80"',
    'value="C017"',
    "名字或編號",
    "絕育記錄",
    "領養經驗",
    "移除篩選：搜尋：C017",
    "清除全部",
    "清除篩選",
  ])
    expect(markup).toContain(value);
});
