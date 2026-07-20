import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

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

describe("StoryDetail", () => {
  test("renders the exact medical donation action", async () => {
    const { StoryDetail } = await import("./StoryDetail");
    const markup = renderToStaticMarkup(<StoryDetail content={content} />);

    expect(markup).toContain('href="/donate?purpose=medical"');
    expect(markup).toContain("支援醫療費用 ｜ 立即捐助");
    expect(markup).toContain("救援個案");
  });
});
