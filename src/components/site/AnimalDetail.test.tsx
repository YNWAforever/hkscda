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
    expect(markup).not.toContain("需要安靜家庭");
    expect(markup).toContain("絕育");
    expect(markup).toContain("未有記錄");
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

test("shows reviewed profile sections and dated care facts without exposing notes", async () => {
  const { AnimalDetail } = await import("./AnimalDetail");
  const profile = {
    code: "C017",
    birthday: "2020-01-01",
    neutered: true,
    suitability: "newbie" as const,
    personality: "安靜",
    health: "需定期覆診",
    story: "已完成評估 <script>unsafe</script>",
    recordDate: "2026-01-01",
  };
  const markup = renderToStaticMarkup(
    <ShortlistProvider>
      <AnimalDetail
        animal={{ ...animal, public_profile: profile }}
        intent="sponsorship"
        backHref="/sponsors"
        backLabel="返回助養列表"
      />
    </ShortlistProvider>,
  );
  for (const value of [
    "C017",
    "已絕育",
    "適合新手",
    "安靜",
    "需定期覆診",
    "原始記錄日期",
    "2026-01-01",
    "加入助養清單",
  ])
    expect(markup).toContain(value);
  expect(markup).not.toContain(animal.notes);
  expect(markup).not.toContain("<script>");
  expect(markup.match(/<h1(?:\s|>)/g)).toHaveLength(1);
});

test("labels an unrecorded age group as unknown", async () => {
  const { AnimalDetail } = await import("./AnimalDetail");
  const markup = renderToStaticMarkup(
    <ShortlistProvider>
      <AnimalDetail
        animal={{ ...animal, age: "不詳" }}
        backHref="/animals/cat"
        backLabel="返回列表"
      />
    </ShortlistProvider>,
  );
  expect(markup).toContain("年齡組別</dt><dd>未有記錄");
  expect(markup).not.toContain("成年");
});

test("detail preserves hero and renders only approved ordered gallery metadata", async () => {
  const { AnimalDetail } = await import("./AnimalDetail");
  const markup = renderToStaticMarkup(
    <ShortlistProvider>
      <AnimalDetail
        animal={{
          ...animal,
          image_url: "https://example.invalid/original.jpg",
          gallery: [
            {
              id: "pending",
              url: "https://example.invalid/pending.jpg",
              draft_path: null,
              alt_zh: "待審",
              alt_en: null,
              source: "內部",
              focal_x: 50,
              focal_y: 50,
              review_status: "pending",
              sort_order: 0,
            },
            {
              id: "approved",
              url: "https://example.invalid/gallery.jpg",
              draft_path: null,
              alt_zh: "小白在窗邊",
              alt_en: "Snowy by window",
              source: "HKSCDA staff",
              focal_x: 25,
              focal_y: 75,
              review_status: "approved",
              sort_order: 1,
            },
          ],
        }}
        backHref="/animals/cat"
        backLabel="返回列表"
      />
    </ShortlistProvider>,
  );
  expect(markup).toContain("original.jpg");
  expect(markup).toContain("gallery.jpg");
  expect(markup).toContain('alt="小白在窗邊"');
  expect(markup).toContain("object-position:25% 75%");
  expect(markup).toContain("相片來源：HKSCDA staff");
  expect(markup).not.toContain("pending.jpg");
});
