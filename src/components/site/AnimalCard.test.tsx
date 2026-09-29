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
  useNavigate: () => () => undefined,
}));

const animal = {
  id: "animal-1",
  type: "cat" as const,
  name: "小白",
  name_en: null,
  gender: "female" as const,
  age: "2歲",
  age_en: null,
  description: "親人",
  description_en: null,
  notes: "需要安靜家庭",
  notes_en: null,
  status: "available" as const,
  image_url: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

describe("AnimalCard", () => {
  test("uses explicit status text and neutral identity treatment", async () => {
    const { AnimalCard } = await import("./AnimalCard");
    const markup = renderToStaticMarkup(
      <ShortlistProvider>
        <AnimalCard animal={animal} />
      </ShortlistProvider>,
    );

    expect(markup).toContain("待領養");
    expect(markup).toContain("小白");
    expect(markup).toContain("public-animal-card");
    expect(markup).toContain("public-animal-media");
    expect(markup).toContain("暫未有相片");
    expect(markup).not.toContain("未有記錄");
    expect(markup).not.toContain(animal.notes);
    expect(markup).not.toContain("--color-cat");
    expect(markup).not.toContain("--color-dog");
  });
});

test("sponsorship card preserves cat identity and routes canonical id to sponsorship", async () => {
  const { AnimalCard } = await import("./AnimalCard");
  const markup = renderToStaticMarkup(
    <ShortlistProvider>
      <AnimalCard animal={animal} intent="sponsorship" />
    </ShortlistProvider>,
  );
  expect(markup).toContain("/sponsors/animal-1");
  expect(markup).toContain("加入助養清單");
  expect(markup).toContain("貓貓");
  expect(markup).not.toContain("待領養");
});

test("empty home animal section preserves the single page heading", async () => {
  const { FeaturedAnimals } = await import("./home/FeaturedAnimals");
  const markup = renderToStaticMarkup(
    <main>
      <h1>Home</h1>
      <FeaturedAnimals animals={[]} />
    </main>,
  );
  expect(markup.match(/<h1(?:\s|>)/g) ?? []).toHaveLength(1);
  expect(markup).toContain("暫未有可顯示的領養資料</h2>");
});

test("renders only approved public facts and escapes profile text", async () => {
  const { AnimalCard } = await import("./AnimalCard");
  const profile = {
    code: "C017",
    birthday: "2020-01-01",
    neutered: false,
    suitability: "experienced" as const,
    personality: "安靜 <b>親人</b>",
    health: null,
    story: null,
    recordDate: "2026-01-01",
  };
  const markup = renderToStaticMarkup(
    <ShortlistProvider>
      <AnimalCard animal={{ ...animal, public_profile: profile, sponsorship_eligible: true }} />
    </ShortlistProvider>,
  );
  for (const value of [
    "C017",
    "未絕育",
    "適合有經驗人士",
    "安靜 &lt;b&gt;親人&lt;/b&gt;",
    "可助養",
    "加入領養清單",
    "/animals/cat/animal-1",
  ])
    expect(markup).toContain(value);
  expect(markup).not.toContain(animal.notes);
  expect(markup).not.toContain("<b>");
});

test("home distinguishes a failed animal read from an empty directory", async () => {
  const { FeaturedAnimals } = await import("./home/FeaturedAnimals");
  const markup = renderToStaticMarkup(<FeaturedAnimals animals={[]} loadFailed />);
  expect(markup).toContain("暫時未能載入領養資料");
  expect(markup).not.toContain("暫未有可顯示的領養資料");
});

test("sponsor card shows approved care, use and progress only when supplied", async () => {
  const { AnimalCard } = await import("./AnimalCard");
  const profile = {
    code: "C017",
    birthday: null,
    neutered: null,
    suitability: null,
    personality: null,
    health: "需要定期覆診",
    story: null,
    recordDate: null,
    sponsorUse: "獸醫及糧食",
    recentProgress: "本月復原穩定",
  };
  const markup = renderToStaticMarkup(
    <ShortlistProvider>
      <AnimalCard animal={{ ...animal, public_profile: profile }} intent="sponsorship" />
    </ShortlistProvider>,
  );
  for (const text of ["照顧需要", "需要定期覆診", "助養用途", "獸醫及糧食", "近況", "本月復原穩定"])
    expect(markup).toContain(text);
  const empty = renderToStaticMarkup(
    <ShortlistProvider>
      <AnimalCard animal={animal} intent="sponsorship" />
    </ShortlistProvider>,
  );
  expect(empty).not.toContain("助養用途");
  expect(empty).not.toContain("近況");
});

test("first visible public card reserves image space and requests its photo eagerly", async () => {
  const { AnimalCard } = await import("./AnimalCard");
  const markup = renderToStaticMarkup(
    <ShortlistProvider>
      <AnimalCard animal={{ ...animal, image_url: "https://example.invalid/cat.jpg" }} priority />
    </ShortlistProvider>,
  );
  expect(markup).toContain('width="800"');
  expect(markup).toContain('height="600"');
  expect(markup).toContain('loading="eager"');
  expect(markup).toContain('sizes="(max-width: 640px) 100vw');
});
