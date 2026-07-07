import { describe, expect, test } from "bun:test";
import { generateSocialCopyVariants } from "./socialCopy";
import type { ContentDetail, StoryUpdate } from "./types";

const latestUpdate: StoryUpdate = {
  id: "update-1",
  contentItemId: "content-1",
  kind: "medical",
  title: "已完成疫苗接種",
  body: "小白現於暫養家庭康復中。",
  occurredAt: "2026-07-05T10:00:00.000Z",
  visibility: "public",
  shouldGenerateAdopterDrafts: true,
  media: [],
  createdAt: "2026-07-05T10:00:00.000Z",
  updatedAt: "2026-07-05T10:00:00.000Z",
};

const content: ContentDetail = {
  id: "content-1",
  slug: "siu-bak-recovery",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白由義工救起，正在接受醫療照護。",
  body: "救援故事正文",
  coverMediaId: "media-1",
  coverImageUrl: "https://example.test/cover.jpg",
  status: "published",
  publishedAt: "2026-07-05T10:00:00.000Z",
  ctaLabel: "支持救援",
  ctaUrl: "/donate",
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  storyProfile: {
    contentItemId: "content-1",
    animalType: "cat",
    publicStatus: "medical_care",
    rescueRegion: "灣仔",
    rescueDate: "2026-07-01",
    showOnMap: true,
    publicMapLabel: "灣仔區救援",
    publicLat: 22.277,
    publicLng: 114.173,
    internalAddress: null,
    internalLocationNotes: null,
    isFeatured: true,
  },
  latestPublicUpdate: latestUpdate,
  links: [],
  media: [],
  updates: [latestUpdate],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-07-05T09:00:00.000Z",
  updatedAt: "2026-07-05T09:00:00.000Z",
};

describe("generateSocialCopyVariants", () => {
  test("builds zh-HK social copy for core story channels", () => {
    const variants = generateSocialCopyVariants({
      content,
      storyUpdate: latestUpdate,
      publicUrl: "https://hkscda.org/stories/siu-bak-recovery",
    });

    expect(variants.map((variant) => variant.platform)).toEqual([
      "facebook",
      "instagram",
      "whatsapp",
    ]);
    expect(variants[0].copyText).toContain("小白康復中");
    expect(variants[0].copyText).toContain("已完成疫苗接種");
    expect(variants[0].copyText).toContain("https://hkscda.org/stories/siu-bak-recovery");
    expect(variants[1].hashtags).toContain("#香港拯救貓狗協會");
    expect(variants[2].copyText).toContain("可按以下連結了解");
  });
});
