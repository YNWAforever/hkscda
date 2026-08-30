import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { PublicAdoptionPageData } from "../../lib/adoptionInformation/publicPage.server";
import { createAdoptionInstructionsLoader } from "../../lib/adoptionInformation/publicPage.loader";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children?: unknown; to: string }) => (
    <a href={to} {...props}>
      {children as never}
    </a>
  ),
}));

mock.module("../../lib/adoptionInformation/publicPage.functions", () => ({
  getPublicAdoptionPage: async () => data,
}));

const dogRows = [
  ["Typical Species 一般品種", "1,000"],
  ["Mongrel 唐狗", "0"],
  ["PROHEART Injection", "300–600"],
  ["5-in-1 Vaccine", "250"],
  ["Desex (Female)", "1,500–2,000"],
  ["Desex (Male)", "1,000–1,500"],
] as const;
const catRows = [
  ["Typical Species 一般品種", "1,000"],
  ["DSH 唐貓", "500"],
  ["4-in-1 Vaccine", "250"],
  ["Desex (Female)", "1,500–2,000"],
  ["Desex (Male)", "1,000–1,500"],
  ["Bath", "400"],
  ["Small Cage", "150"],
  ["Big Cage Rental", "400"],
] as const;

const fee = (animalType: "dog" | "cat", row: readonly [string, string], index: number) => ({
  id: animalType + "-" + index,
  animalType,
  itemName: row[0],
  priceHkd: row[1],
  sortOrder: index,
  isPublished: true,
});

const data = {
  feesBySpecies: {
    dog: dogRows.map((row, index) => fee("dog", row, index)),
    cat: catRows.map((row, index) => fee("cat", row, index)),
  },
  estates: [
    {
      id: "estate-1",
      estateName: "海怡半島",
      district: "南區",
      notes: null,
      sortOrder: 0,
      isPublished: true,
    },
  ],
  guideGroups: [],
  rules: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      content: { "zh-HK": "申請人須年滿18歲。", en: "Applicants must be 18 years or older." },
      sortOrder: 0,
      isPublished: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      content: {
        "zh-HK": "須確保動物生活在安全、舒適的室內環境。",
        en: "Animals must live in a safe, comfortable indoor environment.",
      },
      sortOrder: 1,
      isPublished: true,
    },
  ],
  careTopics: {
    cat: [
      {
        id: "cat-topic-home",
        animalType: "cat",
        label: { "zh-HK": "家居", en: "Home" },
        content: {
          "zh-HK": "為貓貓提供安全的室內環境。",
          en: "Provide a safe indoor space for your cat.",
        },
        sortOrder: 0,
        isPublished: true,
      },
    ],
    dog: [
      {
        id: "dog-topic-home",
        animalType: "dog",
        label: { "zh-HK": "家居", en: "Home" },
        content: { "zh-HK": "為狗狗提供安全的空間。", en: "Provide a safe space for your dog." },
        sortOrder: 0,
        isPublished: true,
      },
    ],
  },
  guides: [
    {
      id: "slot-zh",
      slotKey: "post_adoption_guide",
      language: "zh-HK",
      isPublished: true,
      document: {
        id: "guide-zh",
        kind: "adoption_guide",
        title: "領養後須知",
        language: "zh-HK",
        bucketName: "site-documents",
        objectPath: "adoption/guides/zh.pdf",
        fileUrl: "https://cdn.test/zh.pdf",
        mimeType: "application/pdf",
        byteSize: 1024,
        checksumSha256: null,
        isPublished: true,
        sortOrder: 0,
        createdAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
    },
    {
      id: "slot-en",
      slotKey: "post_adoption_guide",
      language: "en",
      isPublished: true,
      document: {
        id: "guide-en",
        kind: "adoption_guide",
        title: "What to know after adopting a cat",
        language: "en",
        bucketName: "site-documents",
        objectPath: "adoption/guides/en.pdf",
        fileUrl: "https://cdn.test/en.pdf",
        mimeType: "application/pdf",
        byteSize: 1024,
        checksumSha256: null,
        isPublished: true,
        sortOrder: 1,
        createdAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
    },
  ],
} as unknown as PublicAdoptionPageData;

describe("adoption instructions route", () => {
  test("delegates SSR loading once", async () => {
    let calls = 0;
    const loader = createAdoptionInstructionsLoader(async () => {
      calls += 1;
      return data;
    });
    expect(await loader()).toBe(data);
    expect(calls).toBe(1);
  });

  test("renders accessible exact fee tables and estates", async () => {
    const { AdoptionInstructionsContent } = await import("./instructions");
    const markup = renderToStaticMarkup(<AdoptionInstructionsContent data={data} />);

    for (const [item, price] of [...dogRows, ...catRows]) {
      expect(markup).toContain(item);
      expect(markup).toContain(price);
    }
    expect(markup.match(/aria-label="(?:狗隻|貓隻)領養費用"/g)).toHaveLength(2);
    expect(markup).toContain('scope="col"');
    // Was an English-only disclaimer on an otherwise all-Chinese page (plan
    // section 10); this is what it now reads.
    expect(markup).toContain("以上費用如有調整，恕不另行通知；香港拯救貓狗協會保留最終決定權。");
    expect(markup).toContain("可養狗屋苑參考名單");
    expect(markup).toContain("以下名單僅供參考，請向屋苑管理處查詢最新規定。");
    expect(markup).toContain("海怡半島");
  });

  test("renders each released species guide with bilingual actions", async () => {
    const { AdoptionInstructionsContent } = await import("./instructions");
    const guideSlots = (
      data as unknown as {
        guides: [
          PublicAdoptionPageData["guideGroups"][number]["zhHk"],
          PublicAdoptionPageData["guideGroups"][number]["en"],
        ];
      }
    ).guides;
    const markup = renderToStaticMarkup(
      <AdoptionInstructionsContent
        data={{
          ...data,
          guideGroups: [
            { species: "cat", zhHk: guideSlots[0], en: guideSlots[1] },
            {
              species: "dog",
              zhHk: { ...guideSlots[0], id: "slot-dog-zh" },
              en: { ...guideSlots[1], id: "slot-dog-en" },
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("貓隻領養後指南");
    expect(markup).toContain("狗隻領養後指南");
    expect(markup).toContain(">中文版<");
    expect(markup).toContain(">English<");
  });

  test("keeps an empty-estate contact path", async () => {
    const { AdoptionInstructionsContent } = await import("./instructions");
    const markup = renderToStaticMarkup(
      <AdoptionInstructionsContent data={{ ...data, estates: [] }} />,
    );
    expect(markup).toContain("暫時未有屋苑資料");
    expect(markup).toContain('href="/help#contact"');
  });

  test("renders zh-HK bilingual rule and care topic content by default", async () => {
    const { AdoptionInstructionsContent } = await import("./instructions");
    const markup = renderToStaticMarkup(<AdoptionInstructionsContent data={data} />);

    expect(markup).toContain("申請人須年滿18歲。");
    expect(markup).not.toContain("Applicants must be 18 years or older.");
    expect(markup).toContain("為貓貓提供安全的室內環境。");
    expect(markup).not.toContain("Provide a safe indoor space for your cat.");
    expect(markup).toContain("為狗狗提供安全的空間。");
    expect(markup).not.toContain("Provide a safe space for your dog.");
    // Static section headings default to zh-HK too.
    expect(markup).toContain("領養規則");
    expect(markup).toContain("養貓需知");
    expect(markup).toContain("養狗需知");
  });
});
