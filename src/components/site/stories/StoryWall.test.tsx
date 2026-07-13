import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ContentSummary } from "../../../lib/content/types";

mock.module("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: {
    children: React.ReactNode;
    params?: { slug?: string };
    to: string;
  }) => (
    <a href={params?.slug ? to.replace("$slug", params.slug) : to} {...props}>
      {children}
    </a>
  ),
}));

const story: ContentSummary = {
  id: "story-1",
  slug: "siu-bak-recovering",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白正在接受照護，精神一天比一天好。",
  coverMediaId: null,
  coverImageUrl: null,
  status: "published",
  publishedAt: "2026-01-01T00:00:00.000Z",
  ctaLabel: null,
  ctaUrl: null,
  storyProfile: {
    contentItemId: "story-1",
    animalType: "cat",
    publicStatus: "medical_care",
    rescueRegion: "灣仔",
    rescueDate: null,
    showOnMap: true,
    publicMapLabel: "灣仔一帶",
    publicLat: null,
    publicLng: null,
    internalAddress: null,
    internalLocationNotes: null,
    isFeatured: true,
  },
  latestPublicUpdate: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("StoryWall", () => {
  test("renders public rescue stories with status and region", async () => {
    const { StoryWall } = await import("./StoryWall");
    const markup = renderToStaticMarkup(<StoryWall stories={[story]} />);

    expect(markup).toContain("救援故事牆");
    expect(markup).toContain("小白康復中");
    expect(markup).toContain("醫療照護");
    expect(markup).toContain("灣仔");
    expect(markup).not.toContain("card-dashed");
  });
});
