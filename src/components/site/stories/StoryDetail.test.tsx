import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { PublicStorySummary } from "../../../lib/content/publicStoriesPage.types";
import type { ContentDetail } from "../../../lib/content/types";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const content: ContentDetail = {
  id: "story-1",
  slug: "siu-bak-recovering",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白正在接受照護。",
  body: "小白已完成首次治療。",
  coverMediaId: null,
  coverImageUrl: null,
  status: "published",
  publishedAt: "2026-01-01T00:00:00.000Z",
  ctaLabel: null,
  ctaUrl: null,
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  storyProfile: {
    contentItemId: "story-1",
    animalType: "cat",
    publicStatus: "medical_care",
    rescueRegion: "灣仔",
    rescueDate: null,
    showOnMap: false,
    publicMapLabel: null,
    publicLat: null,
    publicLng: null,
    internalAddress: null,
    internalLocationNotes: null,
    isFeatured: true,
  },
  latestPublicUpdate: null,
  links: [],
  media: [],
  updates: [],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const relatedStory: PublicStorySummary = {
  id: "story-2",
  slug: "mimi-adopted",
  type: "rescue_story",
  title: "咪咪已找到家",
  subtitle: null,
  summary: "咪咪已獲領養。",
  coverMediaId: null,
  coverImageUrl: null,
  status: "published",
  publishedAt: "2026-02-01T00:00:00.000Z",
  ctaLabel: null,
  ctaUrl: null,
  storyProfile: {
    contentItemId: "story-2",
    animalType: "cat",
    publicStatus: "adopted",
    rescueRegion: "沙田",
    rescueDate: null,
    showOnMap: false,
    publicMapLabel: null,
    publicLat: null,
    publicLng: null,
    isFeatured: false,
  },
  latestPublicUpdate: null,
  createdAt: "2026-02-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
};

describe("StoryDetail", () => {
  test("renders the exact medical donation action", async () => {
    const { StoryDetail } = await import("./StoryDetail");
    const markup = renderToStaticMarkup(<StoryDetail content={content} related={[]} />);

    expect(markup).toContain('href="/donate?purpose=medical"');
    expect(markup).toContain("支援醫療費用 ｜ 立即捐助");
    expect(markup).toContain("救援個案");
  });

  test("uses the content CTA and shows the animal type fact", async () => {
    const { StoryDetail } = await import("./StoryDetail");
    const markup = renderToStaticMarkup(
      <StoryDetail
        content={{ ...content, ctaLabel: "了解牠的故事", ctaUrl: "/sponsors" }}
        related={[]}
      />,
    );

    expect(markup).toContain("了解牠的故事");
    expect(markup).toContain('href="/sponsors"');
    expect(markup).toContain("動物類型");
    expect(markup).toContain("貓");
  });

  test("wraps the hero in PublicPageFrame with one h1 and a status/region eyebrow", async () => {
    const { StoryDetail } = await import("./StoryDetail");
    const markup = renderToStaticMarkup(<StoryDetail content={content} related={[]} />);

    expect(markup).toContain("public-page");
    expect(markup.match(/<h1/g) ?? []).toHaveLength(1);
    expect(markup).toContain("小白康復中");
    expect(markup).toContain("醫療照護");
    expect(markup).toContain("灣仔");
    expect(markup).toContain("detail-breadcrumb");
  });

  test("renders a related stories section when there are related stories", async () => {
    const { StoryDetail } = await import("./StoryDetail");
    const markup = renderToStaticMarkup(<StoryDetail content={content} related={[relatedStory]} />);

    expect(markup).toContain("相關故事");
    expect(markup).toContain("咪咪已找到家");
  });

  test("omits the related stories section when there are none", async () => {
    const { StoryDetail } = await import("./StoryDetail");
    const markup = renderToStaticMarkup(<StoryDetail content={content} related={[]} />);

    expect(markup).not.toContain("相關故事");
  });
});
